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

async function extractWithAI(imageUrl: string) {
  if (!LOVABLE_API_KEY) return null;
  
  try {
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
            { type: "image_url", image_url: { url: imageUrl } }
          ] 
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    const extracted = await extractWithAI(imageUrl);
    if (!extracted) throw new Error("Failed to extract data with AI");

    // Tentar encontrar o inquilino pelo nome do pagador (aproximação)
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

    // Criar pendência no banco
    const pendingRes = await sb("whatsapp_pending_actions", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        action_type: extracted.is_payment ? "payment" : "unclear_message",
        proposed_data: extracted,
        confidence: extracted.confidence,
        status: "pending"
      })
    });

    if (!pendingRes.ok) throw new Error("Failed to create pending action");

    return new Response(JSON.stringify({ ok: true, extracted }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
})
