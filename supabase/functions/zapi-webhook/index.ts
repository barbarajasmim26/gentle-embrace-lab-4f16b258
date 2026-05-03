// Webhook público recebe mensagens da Z-API, identifica inquilino,
// chama IA multimodal pra ler comprovantes e cria pendência ou pagamento.
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

function normalizePhone(p: string): string {
  return (p ?? "").replace(/\D/g, "").replace(/^55/, "");
}

async function findTenantByPhone(phone: string) {
  const norm = normalizePhone(phone);
  const res = await sb(`tenants?select=id,name,rent_amount,phone&status=eq.active`);
  const list = await res.json();
  if (!Array.isArray(list)) return null;
  return list.find((t: any) => normalizePhone(t.phone ?? "") === norm) ?? null;
}

async function extractWithAI(opts: { text?: string; imageUrl?: string; mimeType?: string }) {
  const userContent: any[] = [];
  if (opts.text) userContent.push({ type: "text", text: opts.text });
  if (opts.imageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: opts.imageUrl },
    });
  }
  if (userContent.length === 0) return null;

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content:
          "Você analisa comprovantes de pagamento (PIX, TED, boleto). Extraia os dados em JSON. Se não for um comprovante, retorne is_payment=false.",
      },
      { role: "user", content: userContent },
    ],
    tools: [{
      type: "function",
      function: {
        name: "extract_payment",
        description: "Extrai dados de comprovante de pagamento",
        parameters: {
          type: "object",
          properties: {
            is_payment: { type: "boolean" },
            amount: { type: "number", description: "Valor em reais" },
            date: { type: "string", description: "Data ISO YYYY-MM-DD" },
            payer_name: { type: "string" },
            bank: { type: "string" },
            transaction_id: { type: "string" },
            confidence: { type: "number", description: "0 a 1" },
          },
          required: ["is_payment", "confidence"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "extract_payment" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("AI error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try { return JSON.parse(args); } catch { return null; }
}

async function getConfig() {
  const res = await sb(`whatsapp_config?select=*&limit=1`);
  const list = await res.json();
  return Array.isArray(list) && list[0] ? list[0] : null;
}

async function autoApprovePayment(tenant: any, extracted: any, messageId: string) {
  if (!extracted?.amount || !extracted?.date) return false;
  const tolerance = Number(tenant.rent_amount) * 0.02; // 2%
  if (Math.abs(Number(extracted.amount) - Number(tenant.rent_amount)) > tolerance) return false;

  const d = new Date(extracted.date);
  if (isNaN(d.getTime())) return false;

  await sb(`payments`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenant.id,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      amount: extracted.amount,
      paid_at: extracted.date,
      status: "paid",
    }),
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response("Z-API webhook ativo", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("zapi webhook:", JSON.stringify(payload).slice(0, 500));

    // Z-API payload comum: { phone, fromMe, type, text:{message}, image:{imageUrl,mimeType,caption}, document:{...} }
    if (payload.fromMe === true) {
      return new Response(JSON.stringify({ ok: true, ignored: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromPhone = payload.phone ?? payload.from ?? "";
    const text = payload.text?.message ?? payload.message ?? payload.body ?? null;
    const imageUrl = payload.image?.imageUrl ?? payload.image?.url ?? null;
    const documentUrl = payload.document?.documentUrl ?? payload.document?.url ?? null;
    const mimeType = payload.image?.mimeType ?? payload.document?.mimeType ?? null;

    let messageType = "text";
    if (imageUrl) messageType = "image";
    else if (documentUrl) messageType = "document";

    // identifica inquilino
    const tenant = await findTenantByPhone(fromPhone);

    // salva mensagem
    const insertRes = await sb(`whatsapp_messages?select=id`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        direction: "inbound",
        from_phone: fromPhone,
        message_type: messageType,
        body: text,
        media_url: imageUrl ?? documentUrl,
        media_mime_type: mimeType,
        tenant_id: tenant?.id ?? null,
        wa_message_id: payload.messageId ?? payload.id ?? null,
        raw_payload: payload,
        processed: false,
      }),
    });
    const inserted = await insertRes.json();
    const messageId = Array.isArray(inserted) ? inserted[0]?.id : null;

    // atualiza last_webhook_at
    const cfg = await getConfig();
    if (cfg) {
      await sb(`whatsapp_config?id=eq.${cfg.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_webhook_at: new Date().toISOString(), webhook_verified: true }),
      });
    }

    // se não achou inquilino, cria pendência de identificação
    if (!tenant) {
      await sb(`whatsapp_pending_actions`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          action_type: "unknown_sender",
          message_id: messageId,
          proposed_data: { from_phone: fromPhone, body: text },
          status: "pending",
        }),
      });
      return new Response(JSON.stringify({ ok: true, pending: "unknown_sender" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // se tem mídia ou texto que parece comprovante, chama IA
    const looksLikeProof = imageUrl || documentUrl ||
      (text && /pix|comprovante|transfer|pago|pagamento|r\$/i.test(text));

    if (looksLikeProof) {
      const extracted = await extractWithAI({
        text: text ?? undefined,
        imageUrl: imageUrl ?? documentUrl ?? undefined,
        mimeType: mimeType ?? undefined,
      });

      if (extracted) {
        await sb(`whatsapp_messages?id=eq.${messageId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            ai_extracted: extracted,
            ai_confidence: extracted.confidence ?? null,
            processed: true,
          }),
        });

        if (extracted.is_payment && cfg?.auto_approve_payments && (extracted.confidence ?? 0) >= 0.85) {
          const ok = await autoApprovePayment(tenant, extracted, messageId);
          if (ok) {
            return new Response(JSON.stringify({ ok: true, auto_approved: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // cria pendência pra revisão
        await sb(`whatsapp_pending_actions`, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            action_type: extracted.is_payment ? "payment" : "unclear_message",
            message_id: messageId,
            tenant_id: tenant.id,
            proposed_data: extracted,
            confidence: extracted.confidence ?? null,
            status: "pending",
          }),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
