// Envia mensagens (texto e documento) via Evolution API
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const evoHeaders = () => ({ "Content-Type": "application/json", apikey: EVOLUTION_API_KEY ?? "" });
function normalizePhone(p: string) {
  let d = (p ?? "").replace(/\D/g, "");
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

async function logMessage(payload: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type = "text", phone, message, documentBase64, documentName, mimeType, tenantId } = body;
    if (!phone) {
      return new Response(JSON.stringify({ error: "phone obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const number = normalizePhone(phone);
    let endpoint = "";
    let payload: Record<string, unknown> = {};

    if (type === "text") {
      endpoint = `/message/sendText/${EVOLUTION_INSTANCE}`;
      payload = { number, text: message };
    } else if (type === "document") {
      endpoint = `/message/sendMedia/${EVOLUTION_INSTANCE}`;
      payload = {
        number,
        mediatype: "document",
        mimetype: mimeType ?? "application/pdf",
        media: documentBase64,
        fileName: documentName ?? "documento.pdf",
        caption: message ?? "",
      };
    } else {
      return new Response(JSON.stringify({ error: "type inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${EVOLUTION_API_URL}${endpoint}`, {
      method: "POST", headers: evoHeaders(), body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    await logMessage({
      direction: "outbound",
      from_phone: "system",
      to_phone: number,
      message_type: type,
      body: type === "text" ? message : `[${type}] ${documentName ?? ""}`,
      tenant_id: tenantId ?? null,
      wa_message_id: data?.key?.id ?? data?.messageId ?? null,
      raw_payload: data,
      processed: true,
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Falha no envio", details: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evolution-send error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
