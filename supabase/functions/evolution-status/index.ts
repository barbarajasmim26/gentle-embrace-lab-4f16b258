// Consulta status da instância Evolution API + retorna QR Code quando desconectado
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

async function upsertConfig(patch: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config?select=id&limit=1`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const list = await res.json();
  const body = JSON.stringify({ ...patch, instance_name: EVOLUTION_INSTANCE, updated_at: new Date().toISOString() });
  if (Array.isArray(list) && list[0]) {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config?id=eq.${list[0].id}`, {
      method: "PATCH",
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body,
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_config`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
      const msg = "Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.";
      await upsertConfig({ connection_status: "disconnected", last_error_message: msg, last_status_check: new Date().toISOString() });
      return new Response(JSON.stringify({ connectionStatus: "disconnected", lastErrorMessage: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateRes = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, { headers: evoHeaders() });
    const stateText = await stateRes.text();
    let stateData: any = {};
    try { stateData = JSON.parse(stateText); } catch { stateData = { raw: stateText }; }

    const state = stateData?.instance?.state ?? stateData?.state ?? "close";
    const connected = state === "open";
    let qrCode: string | null = null;
    let errorMsg: string | null = connected ? null : (stateData?.message || `Estado: ${state}`);

    if (!connected) {
      try {
        const qrRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${EVOLUTION_INSTANCE}`, { headers: evoHeaders() });
        if (qrRes.ok) {
          const qrJson = await qrRes.json();
          qrCode = qrJson?.base64 ?? qrJson?.qrcode?.base64 ?? qrJson?.code ?? null;
        }
      } catch (e) { console.error("QR fetch error:", e); }
    }

    await upsertConfig({
      connection_status: connected ? "connected" : "disconnected",
      qr_code: qrCode,
      last_status_check: new Date().toISOString(),
      last_error_message: errorMsg,
    });

    return new Response(JSON.stringify({ connectionStatus: connected ? "connected" : "disconnected", qrCode, lastErrorMessage: errorMsg, raw: stateData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    await upsertConfig({ connection_status: "disconnected", last_error_message: msg });
    return new Response(JSON.stringify({ connectionStatus: "disconnected", lastErrorMessage: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
