// Verifica status da conexão Z-API e busca QR code se necessário
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")?.trim();
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")?.trim();
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function updateConfig(patch: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config?select=id&limit=1`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    const list = await res.json();
    if (Array.isArray(list) && list[0]) {
      await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config?id=eq.${list[0].id}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      });
    } else {
      // Cria registro se não existir
      await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ ...patch, provider: "zapi" }),
      });
    }
  } catch (e) {
    console.error("updateConfig error:", e);
  }
}

function zapiHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ZAPI_CLIENT_TOKEN) h["Client-Token"] = ZAPI_CLIENT_TOKEN;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      const msg = "ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados.";
      await updateConfig({ last_error_message: msg, connection_status: "disconnected" });
      return new Response(JSON.stringify({ connectionStatus: "disconnected", error: msg, lastErrorMessage: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
    console.log("Calling Z-API status:", `${baseUrl.replace(ZAPI_TOKEN, "***")}/status`);

    const statusRes = await fetch(`${baseUrl}/status`, { method: "GET", headers: zapiHeaders() });
    const statusText = await statusRes.text();
    let statusData: any = {};
    try { statusData = JSON.parse(statusText); } catch { statusData = { raw: statusText }; }
    console.log("Z-API status response:", statusRes.status, statusText.slice(0, 500));

    if (!statusRes.ok) {
      let msg = `Z-API HTTP ${statusRes.status}`;
      if (statusRes.status === 401) msg = "Não autorizado: confira ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no painel da Z-API (Segurança).";
      else if (statusRes.status === 404) msg = "Instância não encontrada: confira ZAPI_INSTANCE_ID.";
      else msg = statusData?.message || statusData?.error || msg;
      await updateConfig({
        connection_status: "disconnected",
        last_error_message: msg,
        last_status_check: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ connectionStatus: "disconnected", lastErrorMessage: msg, raw: statusData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connected = statusData?.connected === true || statusData?.smartphoneConnected === true;
    let qrCode: string | null = null;
    let errorMsg: string | null = connected ? null : (statusData?.error || statusData?.message || "Aguardando conexão (escaneie o QR Code).");

    if (!connected) {
      try {
        const qrRes = await fetch(`${baseUrl}/qr-code/image`, { headers: zapiHeaders() });
        if (qrRes.ok) {
          const qrJson = await qrRes.json();
          qrCode = qrJson?.value ?? null;
        } else {
          console.log("QR fetch falhou:", qrRes.status, await qrRes.text());
        }
      } catch (e) {
        console.error("QR fetch error:", e);
      }
    }

    await updateConfig({
      connection_status: connected ? "connected" : "disconnected",
      qr_code: qrCode,
      last_status_check: new Date().toISOString(),
      last_error_message: errorMsg,
      webhook_verified: true,
    });

    return new Response(JSON.stringify({
      connectionStatus: connected ? "connected" : "disconnected",
      qrCode,
      lastErrorMessage: errorMsg,
      raw: statusData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("Fatal:", msg);
    await updateConfig({ last_error_message: `Erro: ${msg}`, connection_status: "disconnected" });
    return new Response(JSON.stringify({ connectionStatus: "disconnected", lastErrorMessage: msg, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
