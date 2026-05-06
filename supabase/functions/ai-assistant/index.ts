// AI Assistant - Lovable AI Gateway with tool calling
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SYSTEM_PROMPT = `Você é a assistente IA da imobiliária "Mesquita Imóveis", especialista em gestão de aluguéis.

Sua função é ajudar o administrador com:
- Consultas sobre inquilinos, contratos, pagamentos e vencimentos
- Geração de mensagens informais e humanas para WhatsApp
- Cobranças automáticas de aluguéis atrasados
- Resumos de contratos
- Sugestões inteligentes
- Comandos rápidos: "cobrar atrasados", "listar vencimentos de hoje", "resumir contrato de X", etc.

Use as ferramentas disponíveis para buscar dados reais do sistema antes de responder. Seja direta, simpática e profissional. Use emojis com moderação. Sempre responda em português brasileiro.`;

const tools = [
  {
    type: "function",
    function: {
      name: "list_tenants",
      description: "Lista todos os inquilinos ativos com nome, telefone, valor do aluguel e dia de pagamento.",
      parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "inactive", "all"], description: "Filtro de status" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tenant_details",
      description: "Busca detalhes completos de um inquilino pelo nome (busca parcial).",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_overdue_payments",
      description: "Lista pagamentos atrasados (vencidos e não pagos).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_due_today",
      description: "Lista inquilinos com vencimento hoje ou nos próximos N dias.",
      parameters: { type: "object", properties: { days_ahead: { type: "number", description: "Dias à frente (0=hoje)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Envia mensagem via WhatsApp (Z-API) para um número. Use quando o usuário pedir para enviar/cobrar algo.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Telefone do destinatário (com DDD, ex: 5513988312733)" },
          message: { type: "string", description: "Mensagem a enviar (tom humano e informal)" },
        },
        required: ["phone", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_charge_message",
      description: "Gera (não envia) uma mensagem de cobrança humanizada para um inquilino com base nos dados.",
      parameters: {
        type: "object",
        properties: {
          tenant_name: { type: "string" },
          amount: { type: "number" },
          month: { type: "string", description: "Mês de referência" },
          days_late: { type: "number" },
        },
        required: ["tenant_name", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_contract",
      description: "Busca dados do contrato de um inquilino e retorna um resumo estruturado.",
      parameters: { type: "object", properties: { tenant_name: { type: "string" } }, required: ["tenant_name"] },
    },
  },
];

async function execTool(name: string, args: any): Promise<any> {
  try {
    if (name === "list_tenants") {
      let q = supabase.from("tenants").select("id,name,phone,rent_amount,payment_day,status,house_number");
      if (args.status && args.status !== "all") q = q.eq("status", args.status);
      else q = q.eq("status", "active");
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return { count: data?.length ?? 0, tenants: data };
    }
    if (name === "get_tenant_details") {
      const { data, error } = await supabase
        .from("tenants").select("*, properties(name,address)")
        .ilike("name", `%${args.name}%`).limit(5);
      if (error) throw error;
      return { tenants: data };
    }
    if (name === "list_overdue_payments") {
      const today = new Date();
      const { data: tenants } = await supabase.from("tenants").select("id,name,phone,rent_amount,payment_day").eq("status", "active");
      const { data: payments } = await supabase.from("payments").select("tenant_id,year,month,status,amount").eq("status", "paid");
      const overdue: any[] = [];
      for (const t of tenants ?? []) {
        const day = t.payment_day ?? 10;
        const dueDate = new Date(today.getFullYear(), today.getMonth(), day);
        if (dueDate < today) {
          const paid = payments?.find((p: any) => p.tenant_id === t.id && p.year === today.getFullYear() && p.month === today.getMonth() + 1);
          if (!paid) {
            const daysLate = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
            overdue.push({ name: t.name, phone: t.phone, amount: t.rent_amount, days_late: daysLate });
          }
        }
      }
      return { count: overdue.length, overdue };
    }
    if (name === "list_due_today") {
      const days = args.days_ahead ?? 0;
      const today = new Date();
      const targetDay = today.getDate() + days;
      const { data } = await supabase.from("tenants").select("name,phone,rent_amount,payment_day").eq("status", "active");
      const due = (data ?? []).filter((t: any) => t.payment_day === targetDay);
      return { count: due.length, tenants: due };
    }
    if (name === "send_whatsapp_message") {
      const { data, error } = await supabase.functions.invoke("zapi-send", {
        body: { phone: args.phone, message: args.message },
      });
      if (error) throw error;
      return { success: true, result: data };
    }
    if (name === "generate_charge_message") {
      const msg = `Olá ${args.tenant_name}! 👋\n\nPassando aqui pra lembrar do aluguel${args.month ? ` de ${args.month}` : ""} no valor de R$ ${args.amount?.toFixed(2)}${args.days_late ? ` (${args.days_late} dias em atraso)` : ""}.\n\nQualquer dúvida me avisa! 🙏`;
      return { message: msg };
    }
    if (name === "summarize_contract") {
      const { data } = await supabase.from("tenants").select("*, properties(name,address)").ilike("name", `%${args.tenant_name}%`).limit(1).maybeSingle();
      if (!data) return { error: "Inquilino não encontrado" };
      return {
        nome: data.name, telefone: data.phone, cpf: data.cpf,
        imovel: data.properties?.address ?? "—", casa: data.house_number,
        aluguel: data.rent_amount, deposito: data.deposit, dia_pagamento: data.payment_day,
        entrada: data.entry_date, ciclo: data.payment_cycle, observacoes: data.notes,
      };
    }
    return { error: "Tool não encontrada" };
  } catch (e: any) {
    return { error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: "conversation_id e message são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Salva mensagem do usuário
    await supabase.from("ai_messages").insert({ conversation_id, role: "user", content: message });

    // Carrega histórico
    const { data: history } = await supabase
      .from("ai_messages").select("role,content,tool_calls,tool_call_id")
      .eq("conversation_id", conversation_id).order("created_at", { ascending: true }).limit(50);

    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of history ?? []) {
      const msg: any = { role: m.role, content: m.content };
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      messages.push(msg);
    }

    // Loop de tool calling (até 5 iterações)
    for (let i = 0; i < 5; i++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools, stream: false }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI gateway: ${resp.status} ${t}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("Resposta vazia");

      if (choice.tool_calls && choice.tool_calls.length > 0) {
        messages.push(choice);
        await supabase.from("ai_messages").insert({ conversation_id, role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const tc of choice.tool_calls) {
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = await execTool(tc.function.name, args);
          const toolMsg = { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
          messages.push(toolMsg);
          await supabase.from("ai_messages").insert({ conversation_id, role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
        }
        continue;
      }

      // Resposta final
      await supabase.from("ai_messages").insert({ conversation_id, role: "assistant", content: choice.content ?? "" });
      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation_id);
      return new Response(JSON.stringify({ reply: choice.content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Limite de iterações atingido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
