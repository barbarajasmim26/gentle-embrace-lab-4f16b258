// Verifica status da conexão Z-API e retorna QR code se desconectado
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

async function updateConfig(patch: Record<string, unknown>) {
  // upsert single-row config
  const url = `${SUPABASE_URL}/rest/v1/whatsapp_config?select=id`;
  const existing = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  }).then((r) => r.json());

  if (Array.isArray(existing) && existing.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config?id=eq.${existing[0].id}`, {
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

    // 1. Status
    const statusRes = await fetch(`${baseUrl()}/status`, { headers: zapiHeaders() });
    const status = await statusRes.json();

    let connectionStatus = "disconnected";
    let qrCode: string | null = null;

    if (status.connected === true) {
      connectionStatus = "connected";
    } else if (status.smartphoneConnected === false || status.error) {
      connectionStatus = "disconnected";
      // tenta pegar QR
      try {
        const qrRes = await fetch(`${baseUrl()}/qr-code/image`, { headers: zapiHeaders() });
        const qr = await qrRes.json();
        if (qr.value) qrCode = qr.value;
      } catch (_) { /* ignore */ }
    }

    await updateConfig({
      connection_status: connectionStatus,
      qr_code: qrCode,
      last_status_check: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ connectionStatus, qrCode, raw: status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("zapi-status error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
