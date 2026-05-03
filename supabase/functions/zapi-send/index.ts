// Envia mensagens via Z-API (texto, documento, imagem)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const baseUrl = () => `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
const zapiHeaders = () => ({
  "Content-Type": "application/json",
  "Client-Token": ZAPI_CLIENT_TOKEN ?? "",
});

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) digits = "55" + digits;
  return digits;
}

async function logMessage(payload: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "Z-API não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type = "text", phone, message, documentBase64, documentName, tenantId } = body;

    if (!phone) {
      return new Response(JSON.stringify({ error: "phone obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizePhone(phone);
    let endpoint = "";
    let payload: Record<string, unknown> = {};

    if (type === "text") {
      endpoint = "/send-text";
      payload = { phone: to, message };
    } else if (type === "document") {
      endpoint = "/send-document/pdf";
      payload = { phone: to, document: documentBase64, fileName: documentName ?? "documento.pdf" };
    } else {
      return new Response(JSON.stringify({ error: "type inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${baseUrl()}${endpoint}`, {
      method: "POST",
      headers: zapiHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    await logMessage({
      direction: "outbound",
      from_phone: "system",
      to_phone: to,
      message_type: type,
      body: type === "text" ? message : `[${type}] ${documentName ?? ""}`,
      tenant_id: tenantId ?? null,
      wa_message_id: data?.messageId ?? data?.id ?? null,
      raw_payload: data,
      processed: true,
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Falha no envio", details: data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("zapi-send error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
