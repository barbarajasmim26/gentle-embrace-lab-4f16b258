// Webhook público da Evolution API: recebe mensagens, identifica inquilino,
// processa comprovantes com IA e cria pendências para revisão.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function normalizePhone(p: string) {
  return (p ?? "").replace(/\D/g, "").replace(/^55/, "");
}

async function findTenantByPhone(phone: string) {
  const norm = normalizePhone(phone);
  const res = await sb(`tenants?select=id,name,phone,rent_amount&status=eq.active`);
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list)) return null;
  return list.find((t: any) => normalizePhone(t.phone ?? "") === norm) ?? null;
}

async function extractWithAI(opts: { text?: string; imageBase64?: string; mimeType?: string }) {
  if (!LOVABLE_API_KEY) return null;
  const userContent: any[] = [];
  if (opts.text) userContent.push({ type: "text", text: opts.text });
  if (opts.imageBase64) {
    const url = `data:${opts.mimeType ?? "image/jpeg"};base64,${opts.imageBase64}`;
    userContent.push({ type: "image_url", image_url: { url } });
  }
  if (!userContent.length) return null;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você analisa comprovantes de pagamento (PIX, TED, boleto). Extraia dados em JSON. Se não for comprovante, is_payment=false." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_payment",
            parameters: {
              type: "object",
              properties: {
                is_payment: { type: "boolean" },
                amount: { type: "number" },
                date: { type: "string" },
                payer_name: { type: "string" },
                bank: { type: "string" },
                transaction_id: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["is_payment", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_payment" } },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } catch (e) { console.error("AI error:", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("OK", { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("Evolution webhook event:", payload?.event);

    // Aceitar somente messages.upsert
    if (payload?.event && payload.event !== "messages.upsert") {
      return new Response(JSON.stringify({ ok: true, ignored: payload.event }), { headers: corsHeaders });
    }

    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    if (key.fromMe === true) {
      return new Response(JSON.stringify({ ok: true, msg: "fromMe" }), { headers: corsHeaders });
    }

    const remoteJid: string = key.remoteJid ?? "";
    const fromPhone = remoteJid.split("@")[0] ?? "";
    const msg = data?.message ?? {};
    const text = msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? msg?.documentMessage?.caption ?? "";
    const messageType = data?.messageType ?? (msg?.imageMessage ? "image" : msg?.documentMessage ? "document" : "text");
    const mimeType = msg?.imageMessage?.mimetype ?? msg?.documentMessage?.mimetype ?? null;
    const base64 = data?.base64 ?? null; // Evolution pode mandar a mídia em base64 se webhook_base64=true
    const waId = key?.id ?? null;

    const tenant = await findTenantByPhone(fromPhone);

    const msgRes = await sb("whatsapp_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        direction: "inbound",
        from_phone: fromPhone,
        message_type: messageType,
        body: text,
        media_mime_type: mimeType,
        tenant_id: tenant?.id ?? null,
        wa_message_id: waId,
        raw_payload: payload,
        processed: false,
      }),
    });
    const inserted = msgRes.ok ? await msgRes.json() : null;
    const messageId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;

    // marca webhook verificado
    await sb("whatsapp_config?select=id&limit=1").then(r => r.json()).then(async (list) => {
      if (Array.isArray(list) && list[0]) {
        await sb(`whatsapp_config?id=eq.${list[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({ last_webhook_at: new Date().toISOString(), webhook_verified: true, last_error_message: null }),
        });
      }
    }).catch(() => {});

    const looksLikeProof = base64 || (text && /pix|comprovante|pago|r\$/i.test(text));
    if (tenant && looksLikeProof) {
      const extracted = await extractWithAI({ text: text || undefined, imageBase64: base64 ?? undefined, mimeType: mimeType ?? undefined });
      if (extracted) {
        if (messageId) {
          await sb(`whatsapp_messages?id=eq.${messageId}`, {
            method: "PATCH",
            body: JSON.stringify({ ai_extracted: extracted, ai_confidence: extracted.confidence, processed: true }),
          });
        }
        await sb("whatsapp_pending_actions", {
          method: "POST",
          body: JSON.stringify({
            message_id: messageId,
            tenant_id: tenant.id,
            action_type: extracted.is_payment ? "payment" : "unclear_message",
            proposed_data: extracted,
            confidence: extracted.confidence,
            status: "pending",
          }),
        });
      }
    } else if (!tenant) {
      await sb("whatsapp_pending_actions", {
        method: "POST",
        body: JSON.stringify({
          message_id: messageId,
          action_type: "unknown_sender",
          proposed_data: { from_phone: fromPhone, body: text },
          status: "pending",
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("evolution-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
