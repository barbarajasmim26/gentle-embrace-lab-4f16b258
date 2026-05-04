// Verifica status da conexão Z-API
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
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
    }
  } catch (e) {
    console.error("Error updating config:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("Checking Z-API status...");
    
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      const msg = "Secrets ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados no Supabase.";
      await updateConfig({ last_error_message: msg, connection_status: "disconnected" });
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders });
    }

    const headers = {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN ?? "",
    };

    const baseUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
    
    // 1. Tentar Status
    const statusRes = await fetch(`${baseUrl}/status`, { headers });
    
    if (!statusRes.ok) {
      const text = await statusRes.text();
      let msg = `Z-API Error ${statusRes.status}: ${text}`;
      try {
        const json = JSON.parse(text);
        msg = json.message || json.error || msg;
      } catch {}
      
      await updateConfig({ last_error_message: msg, connection_status: "disconnected" });
      return new Response(JSON.stringify({ error: msg }), { status: statusRes.status, headers: corsHeaders });
    }

    const status = await statusRes.json();
    console.log("Z-API Status Response:", JSON.stringify(status));

    let connectionStatus = status.connected ? "connected" : "disconnected";
    let qrCode = null;
    let error = status.error || (status.connected ? null : "Desconectado");

    if (!status.connected) {
      try {
        const qrRes = await fetch(`${baseUrl}/qr-code/image`, { headers });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          qrCode = qrData.value;
        }
      } catch (e) {
        console.error("QR Error:", e);
      }
    }

    await updateConfig({
      connection_status: connectionStatus,
      qr_code: qrCode,
      last_status_check: new Date().toISOString(),
      last_error_message: error
    });

    return new Response(JSON.stringify({ connectionStatus, qrCode, error }), { headers: corsHeaders });

  } catch (e) {
    console.error("Fatal status error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
