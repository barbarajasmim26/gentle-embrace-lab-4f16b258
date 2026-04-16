const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "extract_contract_data",
    description: "Extract structured data from a Brazilian rental contract",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the tenant (locatário/inquilino). Empty string if not found." },
        cpf: { type: "string", description: "CPF number (format: XXX.XXX.XXX-XX or just digits). Empty string if not found." },
        rg: { type: "string", description: "RG number. Empty string if not found." },
        address: { type: "string", description: "Property address (condomínio/endereço do imóvel). Empty string if not found." },
        house_number: { type: "string", description: "House or unit number within the property/condominium. Empty string if not found." },
        rent_amount: { type: "string", description: "Monthly rent amount as a number (no R$ symbol, use dot for decimals). Empty string if not found." },
        deposit: { type: "string", description: "Security deposit / caução amount as a number. Empty string if not found or not mentioned." },
        payment_day: { type: "string", description: "Day of the month for rent payment (just the number 1-31). Empty string if not found." },
        entry_date: { type: "string", description: "Contract start date in YYYY-MM-DD format. Empty string if not found." },
        exit_date: { type: "string", description: "Contract end date in YYYY-MM-DD format. Empty string if not found." },
      },
      required: ["name", "cpf", "rg", "address", "house_number", "rent_amount", "deposit", "payment_day", "entry_date", "exit_date"],
    },
  },
};

const SYSTEM_PROMPT = `You are an expert at reading Brazilian rental contracts (contratos de locação/aluguel).

CRITICAL RULES:
- Only extract information you can clearly identify in the text. 
- If a field is ambiguous or you're not confident, return an empty string "".
- NEVER guess or invent data.
- The LOCATÁRIO/INQUILINO is the tenant (the person renting). The LOCADOR is the landlord.
- CPF format: XXX.XXX.XXX-XX (11 digits). RG is a separate document.
- "Aluguel" or "valor mensal" = monthly rent. "Caução" or "depósito caução" = security deposit. Do NOT confuse them.
- For dates, convert to YYYY-MM-DD format.
- For monetary values, return just the number with dot decimal separator (e.g. 550.00), no R$ or thousands separator.
- The house_number is the unit/house number within the property, not a street number.
- payment_day is typically stated as "dia X de cada mês" or "todo dia X".

IMPORTANT: Prefer leaving a field empty over filling it with wrong data.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdf_base64 } = await req.json();

    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "pdf_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send the PDF as inline_data to Gemini Vision for direct reading
    // This is much more accurate than sending base64 text
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the tenant data from this rental contract PDF. Only extract what you can clearly read. Leave fields empty if uncertain.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdf_base64}`,
                },
              },
            ],
          },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_contract_data" } },
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to process PDF" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    
    // Extract from tool call response
    let extracted: Record<string, string> = {};
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
      }
    } else {
      // Fallback: try to parse from content
      const content = aiResult.choices?.[0]?.message?.content || "{}";
      try {
        const jsonMatch = content.match(/```json?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        extracted = JSON.parse(jsonStr);
      } catch {
        console.error("Failed to parse AI response:", content);
      }
    }

    // Post-process: clean up values
    for (const key of Object.keys(extracted)) {
      if (extracted[key] === null || extracted[key] === undefined) {
        extracted[key] = "";
      }
      // Trim whitespace
      if (typeof extracted[key] === "string") {
        extracted[key] = extracted[key].trim();
      }
      // Clean monetary values
      if (key === "rent_amount" || key === "deposit") {
        const val = String(extracted[key]).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
        extracted[key] = val && !isNaN(Number(val)) ? val : "";
      }
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
