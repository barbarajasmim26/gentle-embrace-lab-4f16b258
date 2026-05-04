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
      headers: { 
        apikey: SERVICE_ROLE, 
        Authorization: `Bearer ${SERVICE_ROLE}` 
      },
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
    console.error("Error updating config table:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("Checking Z-API status with Instance:", ZAPI_INSTANCE_ID);
    
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      const msg = "Erro: ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados no Supabase.";
      await updateConfig({ last_error_message: msg, connection_status: "disconnected" });
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders });
    }

    // A Z-API exige Client-Token se configurado, e o Token da instância na URL
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (ZAPI_CLIENT_TOKEN) {
      headers["Client-Token"] = ZAPI_CLIENT_TOKEN;
    }

    const baseUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
    
    // 1. Consultar Status
    console.log("Fetching status from Z-API...");
    const statusRes = await fetch(`${baseUrl}/status`, { headers });
    
    if (!statusRes.ok) {
      const text = await statusRes.text();
      let msg = `Z-API Retornou Erro ${statusRes.status}`;
      try {
        const json = JSON.parse(text);
        msg = json.message || json.error || msg;
      } catch {
        msg = text || msg;
      }
      
      // Se for 401 ou 404, o problema é certamente o Token ou Instance ID
      if (statusRes.status === 401) msg = "Não autorizado: Verifique se o ZAPI_TOKEN e ZAPI_CLIENT_TOKEN estão corretos.";
      if (statusRes.status === 404) msg = "Instância não encontrada: Verifique o ZAPI_INSTANCE_ID.";

      await updateConfig({ last_error_message: msg, connection_status: "disconnected" });
      return new Response(JSON.stringify({ error: msg }), { status: statusRes.status, headers: corsHeaders });
    }

    const status = await statusRes.json();
    console.log("Z-API Status Response:", JSON.stringify(status));

    let connectionStatus = status.connected ? "connected" : "disconnected";
    let qrCode = null;
    let errorMsg = null;

    if (!status.connected) {
      errorMsg = status.error || "WhatsApp Desconectado (Aguardando QR Code)";
      
      // Tentar buscar QR Code se estiver desconectado
      try {
        const qrRes = await fetch(`${baseUrl}/qr-code/image`, { headers });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          qrCode = qrData.value;
        }
      } catch (e) {
        console.error("Failed to fetch QR Code:", e);
      }
    }

    // Atualizar banco de dados com o status real
    await updateConfig({
      connection_status: connectionStatus,
      qr_code: qrCode,
      last_status_check: new Date().toISOString(),
      last_error_message: errorMsg,
      webhook_verified: true // Se chegamos aqui, a comunicação com a API está ok
    });

    return new Response(JSON.stringify({ 
      connectionStatus, 
      qrCode, 
      lastErrorMessage: errorMsg,
      success: true 
    }), { headers: corsHeaders });

  } catch (e) {
    console.error("Fatal status error:", e);
    const fatalMsg = `Erro Fatal: ${e.message}`;
    await updateConfig({ last_error_message: fatalMsg });
    return new Response(JSON.stringify({ error: fatalMsg }), { status: 500, headers: corsHeaders });
  }
});
