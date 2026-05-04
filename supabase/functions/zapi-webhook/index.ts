// Webhook público recebe mensagens da Z-API
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
  try {
    const norm = normalizePhone(phone);
    const res = await sb(`tenants?select=id,name,rent_amount,phone&status=eq.active`);
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list)) return null;
    return list.find((t: any) => normalizePhone(t.phone ?? "") === norm) ?? null;
  } catch (e) {
    console.error("Error finding tenant:", e);
    return null;
  }
}

async function extractWithAI(opts: { text?: string; imageUrl?: string; mimeType?: string }) {
  if (!LOVABLE_API_KEY) return null;
  
  const userContent: any[] = [];
  if (opts.text) userContent.push({ type: "text", text: opts.text });
  if (opts.imageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: opts.imageUrl },
    });
  }
  if (userContent.length === 0) return null;

  try {
    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "Você analisa comprovantes de pagamento (PIX, TED, boleto). Extraia os dados em JSON. Se não for um comprovante, retorne is_payment=false.",
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

    if (!res.ok) return null;
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch (e) {
    console.error("AI error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  // Resposta rápida para GET (Z-API pode usar para validar)
  if (req.method === "GET") {
    return new Response("OK", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Payload recebido:", JSON.stringify(payload));

    if (payload.fromMe === true) {
      return new Response(JSON.stringify({ ok: true, msg: "Ignored fromMe" }), { headers: corsHeaders });
    }

    const fromPhone = payload.phone ?? payload.from ?? "";
    const text = payload.text?.message ?? payload.message ?? payload.body ?? payload.caption ?? "";
    const imageUrl = payload.image?.imageUrl ?? payload.image?.url ?? null;
    const documentUrl = payload.document?.documentUrl ?? payload.document?.url ?? null;
    const mimeType = payload.image?.mimeType ?? payload.document?.mimeType ?? null;
    const waId = payload.messageId ?? payload.id ?? null;

    const tenant = await findTenantByPhone(fromPhone);

    // 1. Salvar a mensagem
    const msgRes = await sb("whatsapp_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        direction: "inbound",
        from_phone: fromPhone,
        message_type: imageUrl ? "image" : (documentUrl ? "document" : "text"),
        body: text,
        media_url: imageUrl ?? documentUrl,
        media_mime_type: mimeType,
        tenant_id: tenant?.id ?? null,
        wa_message_id: waId,
        raw_payload: payload,
        processed: false
      })
    });

    let messageId = null;
    if (msgRes.ok) {
      const inserted = await msgRes.json();
      messageId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    }

    // 2. Atualizar config de "último contato"
    await sb("whatsapp_config?select=id&limit=1").then(r => r.json()).then(async (list) => {
      if (Array.isArray(list) && list[0]) {
        await sb(`whatsapp_config?id=eq.${list[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({ 
            last_webhook_at: new Date().toISOString(), 
            webhook_verified: true,
            last_error_message: null 
          })
        });
      }
    }).catch(() => {});

    // 3. Processar com IA se necessário
    const looksLikeProof = imageUrl || documentUrl || (text && /pix|comprovante|pago|r\$/i.test(text));
    
    if (tenant && looksLikeProof) {
      const extracted = await extractWithAI({
        text: text || undefined,
        imageUrl: imageUrl ?? documentUrl ?? undefined,
        mimeType: mimeType ?? undefined
      });

      if (extracted) {
        if (messageId) {
          await sb(`whatsapp_messages?id=eq.${messageId}`, {
            method: "PATCH",
            body: JSON.stringify({ ai_extracted: extracted, ai_confidence: extracted.confidence, processed: true })
          });
        }

        // Criar pendência
        await sb("whatsapp_pending_actions", {
          method: "POST",
          body: JSON.stringify({
            message_id: messageId,
            tenant_id: tenant.id,
            action_type: extracted.is_payment ? "payment" : "unclear_message",
            proposed_data: extracted,
            confidence: extracted.confidence,
            status: "pending"
          })
        });
      }
    } else if (!tenant) {
      // Número desconhecido
      await sb("whatsapp_pending_actions", {
        method: "POST",
        body: JSON.stringify({
          message_id: messageId,
          action_type: "unknown_sender",
          proposed_data: { from_phone: fromPhone, body: text },
          status: "pending"
        })
      });
    }

    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (e) {
    console.error("Fatal webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
