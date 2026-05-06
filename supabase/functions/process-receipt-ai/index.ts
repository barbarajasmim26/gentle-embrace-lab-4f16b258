import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchAsDataUri(bucket: string, path: string): Promise<{ dataUri: string; mime: string }> {
  // Use signed URL via storage API (works for private buckets)
  const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!signRes.ok) throw new Error(`sign url failed: ${signRes.status} ${await signRes.text()}`);
  const { signedURL } = await signRes.json();
  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1${signedURL}`);
  if (!fileRes.ok) throw new Error(`download failed: ${fileRes.status}`);
  const mime = fileRes.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("Arquivo muito grande (máx 15MB)");
  return { dataUri: `data:${mime};base64,${bytesToBase64(buf)}`, mime };
}

async function extractWithAI(dataUri: string) {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content: "Você analisa comprovantes de pagamento (PIX, TED, boleto). Extraia os dados em JSON. Se não for um comprovante, retorne is_payment=false.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Extraia os dados deste comprovante." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
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
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("IA não retornou dados estruturados");
  return JSON.parse(args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl, filePath } = await req.json();

    // Aceita filePath (preferido) ou imageUrl legado (extrai bucket/path)
    let bucket = "contracts", path = "";
    if (filePath) {
      path = filePath;
    } else if (imageUrl) {
      const m = imageUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(\?|$)/);
      if (!m) throw new Error("URL inválida");
      bucket = m[1]; path = m[2];
    } else {
      throw new Error("filePath ou imageUrl é obrigatório");
    }

    const { dataUri, mime } = await fetchAsDataUri(bucket, path);
    console.log(`[process-receipt-ai] mime=${mime} path=${path}`);

    const extracted = await extractWithAI(dataUri);

    let tenantId = null;
    if (extracted.payer_name) {
      const res = await sb(`tenants?select=id,name&status=eq.active`);
      if (res.ok) {
        const tenants = await res.json();
        const found = tenants.find((t: any) =>
          extracted.payer_name.toLowerCase().includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(extracted.payer_name.toLowerCase())
        );
        tenantId = found?.id || null;
      }
    }

    const pendingRes = await sb("whatsapp_pending_actions", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        action_type: extracted.is_payment ? "payment" : "unclear_message",
        proposed_data: extracted,
        confidence: extracted.confidence,
        status: "pending",
      }),
    });

    if (!pendingRes.ok) throw new Error(`Falha ao salvar pendência: ${await pendingRes.text()}`);

    return new Response(JSON.stringify({ ok: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("process-receipt-ai error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
