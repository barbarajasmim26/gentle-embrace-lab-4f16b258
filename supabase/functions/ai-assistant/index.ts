// AI Assistant - Lovable AI Gateway with autonomous executor tools
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SYSTEM_PROMPT = `Você é a IA executiva da imobiliária "Mesquita Imóveis" — uma SECRETÁRIA VIRTUAL AUTÔNOMA, não um chatbot.

REGRA DE OURO: AJA, NÃO PERGUNTE.
- Quando o usuário pedir algo, EXECUTE imediatamente usando suas ferramentas.
- NÃO pergunte "deseja que eu faça?" — faça e mostre o resultado.
- Só peça confirmação para ações destrutivas (apagar contrato, marcar como ex-inquilino).

VOCÊ PODE:
- Marcar aluguel como pago (mark_payment_paid) e gerar/enviar recibo automaticamente
- Cobrar atrasados via WhatsApp (send_charge_to_overdue, charge_all_overdue)
- Listar inquilinos, atrasos, vencimentos, contratos vencendo
- Vincular comprovantes pendentes a inquilinos (assign_tenant_to_pending) e aprovar (approve_pending_receipt)
- Gerar e enviar recibos por WhatsApp (send_receipt)
- Resumir contratos, ver dashboard, listar recibos salvos
- Atualizar telefone, valor de aluguel, observações de inquilinos (update_tenant)

FLUXO INTELIGENTE:
- "Fulano pagou" → busca inquilino → mark_payment_paid (mês atual) → recibo já enviado.
- "Cobra os atrasados" → charge_all_overdue, sem perguntar.
- "Esse comprovante é da Maria" → assign_tenant_to_pending + approve_pending_receipt.
- "Quanto entrou esse mês?" → get_dashboard_summary.

ESTILO: português brasileiro, direto, profissional e amigável. Use emojis com moderação. Sempre mostre um resumo curto do que foi feito (✅ ação, valores, próximos passos).`;

const tools = [
  { type: "function", function: { name: "list_tenants", description: "Lista inquilinos.", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "inactive", "all"] }, search: { type: "string", description: "Busca por nome/cpf" } } } } },
  { type: "function", function: { name: "get_tenant_details", description: "Detalhes completos de um inquilino pelo nome ou cpf.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "update_tenant", description: "Atualiza dados de um inquilino (telefone, aluguel, observações, dia de pagamento).", parameters: { type: "object", properties: { tenant_name: { type: "string" }, phone: { type: "string" }, rent_amount: { type: "number" }, payment_day: { type: "number" }, notes: { type: "string" }, cpf: { type: "string" } }, required: ["tenant_name"] } } },
  { type: "function", function: { name: "list_overdue_payments", description: "Lista todos os pagamentos atrasados.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_due_today", description: "Vencimentos hoje ou nos próximos N dias.", parameters: { type: "object", properties: { days_ahead: { type: "number" } } } } },
  { type: "function", function: { name: "get_dashboard_summary", description: "Resumo financeiro do mês: total recebido, pendente, atrasado, contratos ativos.", parameters: { type: "object", properties: { month: { type: "number" }, year: { type: "number" } } } } },
  { type: "function", function: { name: "mark_payment_paid", description: "Marca o aluguel de um inquilino como pago (cria/atualiza payment) e ENVIA recibo por WhatsApp automaticamente.", parameters: { type: "object", properties: { tenant_name: { type: "string" }, month: { type: "number", description: "1-12, default mês atual" }, year: { type: "number" }, amount: { type: "number", description: "default = rent_amount do inquilino" }, paid_at: { type: "string", description: "YYYY-MM-DD, default hoje" }, send_receipt: { type: "boolean", description: "default true" } }, required: ["tenant_name"] } } },
  { type: "function", function: { name: "send_receipt", description: "Gera PDF do recibo e envia por WhatsApp para o inquilino.", parameters: { type: "object", properties: { tenant_name: { type: "string" }, payment_id: { type: "string" } }, required: ["tenant_name"] } } },
  { type: "function", function: { name: "send_whatsapp_message", description: "Envia mensagem livre por WhatsApp.", parameters: { type: "object", properties: { tenant_name: { type: "string" }, phone: { type: "string" }, message: { type: "string" } }, required: ["message"] } } },
  { type: "function", function: { name: "send_charge_to_tenant", description: "Envia mensagem de cobrança humanizada por WhatsApp para um inquilino atrasado.", parameters: { type: "object", properties: { tenant_name: { type: "string" } }, required: ["tenant_name"] } } },
  { type: "function", function: { name: "charge_all_overdue", description: "Envia cobranças por WhatsApp para TODOS os inquilinos atrasados.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "summarize_contract", description: "Resumo do contrato de um inquilino.", parameters: { type: "object", properties: { tenant_name: { type: "string" } }, required: ["tenant_name"] } } },
  { type: "function", function: { name: "list_pending_receipts", description: "Comprovantes recebidos por WhatsApp pendentes de revisão (com payer_name, valor, status).", parameters: { type: "object", properties: { include_resolved: { type: "boolean" } } } } },
  { type: "function", function: { name: "assign_tenant_to_pending", description: "Vincula inquilino a um comprovante pendente.", parameters: { type: "object", properties: { pending_id: { type: "string" }, tenant_name: { type: "string" } }, required: ["pending_id", "tenant_name"] } } },
  { type: "function", function: { name: "approve_pending_receipt", description: "Aprova um comprovante pendente: marca pago, gera recibo, envia ao inquilino.", parameters: { type: "object", properties: { pending_id: { type: "string" } }, required: ["pending_id"] } } },
  { type: "function", function: { name: "list_saved_receipts", description: "Lista recibos PDF já gerados/armazenados.", parameters: { type: "object", properties: { tenant_name: { type: "string" } } } } },
  { type: "function", function: { name: "list_expiring_contracts", description: "Contratos vencendo nos próximos N dias (default 60).", parameters: { type: "object", properties: { days_ahead: { type: "number" } } } } },
];

async function findTenant(query: string) {
  const q = (query || "").trim();
  if (!q) return null;
  const digits = q.replace(/\D/g, "");
  if (digits.length === 11) {
    const { data } = await supabase.from("tenants").select("*").eq("cpf", digits).limit(1).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase.from("tenants").select("*").ilike("name", `%${q}%`).order("status").limit(1).maybeSingle();
  return data;
}

async function execTool(name: string, args: any): Promise<any> {
  try {
    if (name === "list_tenants") {
      let q = supabase.from("tenants").select("id,name,phone,rent_amount,payment_day,status,house_number,cpf");
      if (args.status && args.status !== "all") q = q.eq("status", args.status);
      else if (!args.search) q = q.eq("status", "active");
      if (args.search) q = q.ilike("name", `%${args.search}%`);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return { count: data?.length ?? 0, tenants: data };
    }

    if (name === "get_tenant_details") {
      const t = await findTenant(args.name);
      if (!t) return { error: "Inquilino não encontrado" };
      const { data: prop } = t.property_id ? await supabase.from("properties").select("name,address").eq("id", t.property_id).maybeSingle() : { data: null };
      const { data: pays } = await supabase.from("payments").select("year,month,status,amount,paid_at").eq("tenant_id", t.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(12);
      return { tenant: { ...t, property: prop }, recent_payments: pays };
    }

    if (name === "update_tenant") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      const patch: any = {};
      for (const k of ["phone", "rent_amount", "payment_day", "notes", "cpf"]) {
        if (args[k] !== undefined && args[k] !== null) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return { error: "Nada para atualizar" };
      const { error } = await supabase.from("tenants").update(patch).eq("id", t.id);
      if (error) throw error;
      return { success: true, tenant: t.name, updated: patch };
    }

    if (name === "list_overdue_payments") {
      const today = new Date();
      const { data: tenants } = await supabase.from("tenants").select("id,name,phone,rent_amount,payment_day").eq("status", "active");
      const { data: payments } = await supabase.from("payments").select("tenant_id,year,month,status").eq("status", "paid");
      const overdue: any[] = [];
      for (const t of tenants ?? []) {
        const day = t.payment_day ?? 10;
        const dueDate = new Date(today.getFullYear(), today.getMonth(), day);
        if (dueDate < today) {
          const paid = payments?.find((p: any) => p.tenant_id === t.id && p.year === today.getFullYear() && p.month === today.getMonth() + 1);
          if (!paid) {
            const daysLate = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
            overdue.push({ id: t.id, name: t.name, phone: t.phone, amount: t.rent_amount, days_late: daysLate });
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

    if (name === "get_dashboard_summary") {
      const now = new Date();
      const month = args.month ?? now.getMonth() + 1;
      const year = args.year ?? now.getFullYear();
      const { data: tenants } = await supabase.from("tenants").select("id,rent_amount,status,payment_day");
      const active = (tenants ?? []).filter((t: any) => t.status === "active");
      const expectedTotal = active.reduce((s: number, t: any) => s + Number(t.rent_amount || 0), 0);
      const { data: pays } = await supabase.from("payments").select("tenant_id,amount,status").eq("year", year).eq("month", month);
      const paidList = (pays ?? []).filter((p: any) => p.status === "paid");
      const received = paidList.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const paidIds = new Set(paidList.map((p: any) => p.tenant_id));
      const today = now.getDate();
      let overdueCount = 0, pendingCount = 0;
      for (const t of active) {
        if (paidIds.has(t.id)) continue;
        if ((t.payment_day ?? 10) < today) overdueCount++; else pendingCount++;
      }
      return { month, year, active_tenants: active.length, expected_total: expectedTotal, received, missing: expectedTotal - received, overdue_count: overdueCount, pending_count: pendingCount, paid_count: paidList.length };
    }

    if (name === "mark_payment_paid") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      const now = new Date();
      const month = args.month ?? now.getMonth() + 1;
      const year = args.year ?? now.getFullYear();
      const amount = args.amount ?? Number(t.rent_amount);
      const paid_at = args.paid_at ?? now.toISOString().slice(0, 10);
      const { data: existing } = await supabase.from("payments").select("id").eq("tenant_id", t.id).eq("year", year).eq("month", month).maybeSingle();
      let paymentId: string;
      if (existing) {
        const { error } = await supabase.from("payments").update({ status: "paid", amount, paid_at }).eq("id", existing.id);
        if (error) throw error;
        paymentId = existing.id;
      } else {
        const { data, error } = await supabase.from("payments").insert({ tenant_id: t.id, year, month, status: "paid", amount, paid_at }).select("id").single();
        if (error) throw error;
        paymentId = data.id;
      }
      let receiptResult: any = null;
      if (args.send_receipt !== false) {
        const { data: rd, error: re } = await supabase.functions.invoke("zapi-send-receipt", { body: { tenantId: t.id, paymentId } });
        receiptResult = re ? { error: re.message } : rd;
      }
      return { success: true, tenant: t.name, month, year, amount, paid_at, payment_id: paymentId, receipt: receiptResult };
    }

    if (name === "send_receipt") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      const { data, error } = await supabase.functions.invoke("zapi-send-receipt", { body: { tenantId: t.id, paymentId: args.payment_id } });
      if (error) throw error;
      return { success: true, tenant: t.name, result: data };
    }

    if (name === "send_whatsapp_message") {
      let phone = args.phone;
      let tenantName = args.tenant_name;
      if (!phone && tenantName) {
        const t = await findTenant(tenantName);
        if (!t) return { error: "Inquilino não encontrado" };
        phone = t.phone;
        tenantName = t.name;
      }
      if (!phone) return { error: "Telefone necessário" };
      const { data, error } = await supabase.functions.invoke("zapi-send", { body: { phone, message: args.message } });
      if (error) throw error;
      return { success: true, tenant: tenantName, phone, result: data };
    }

    if (name === "send_charge_to_tenant") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      if (!t.phone) return { error: "Inquilino sem telefone" };
      const today = new Date();
      const day = t.payment_day ?? 10;
      const dueDate = new Date(today.getFullYear(), today.getMonth(), day);
      const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
      const msg = `Olá ${t.name}! 👋\n\nPassando pra lembrar do aluguel no valor de R$ ${Number(t.rent_amount).toFixed(2).replace(".", ",")}${daysLate ? ` (${daysLate} dias em atraso)` : ""}.\n\nQualquer dúvida me avisa! 🙏\n\n— Mesquita Imóveis`;
      const { data, error } = await supabase.functions.invoke("zapi-send", { body: { phone: t.phone, message: msg } });
      if (error) throw error;
      return { success: true, tenant: t.name, days_late: daysLate, message: msg, result: data };
    }

    if (name === "charge_all_overdue") {
      const overdue = await execTool("list_overdue_payments", {});
      const results: any[] = [];
      for (const o of overdue.overdue ?? []) {
        if (!o.phone) { results.push({ tenant: o.name, error: "sem telefone" }); continue; }
        const msg = `Olá ${o.name}! 👋\n\nPassando pra lembrar do aluguel no valor de R$ ${Number(o.amount).toFixed(2).replace(".", ",")} (${o.days_late} dias em atraso).\n\nQualquer dúvida me avisa! 🙏\n\n— Mesquita Imóveis`;
        const { error } = await supabase.functions.invoke("zapi-send", { body: { phone: o.phone, message: msg } });
        results.push({ tenant: o.name, sent: !error, error: error?.message });
      }
      return { count: results.length, sent: results.filter(r => r.sent).length, results };
    }

    if (name === "summarize_contract") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      const { data: prop } = t.property_id ? await supabase.from("properties").select("name,address").eq("id", t.property_id).maybeSingle() : { data: null };
      return { nome: t.name, telefone: t.phone, cpf: t.cpf, imovel: prop?.address ?? "—", casa: t.house_number, aluguel: t.rent_amount, deposito: t.deposit, dia_pagamento: t.payment_day, entrada: t.entry_date, ciclo: t.payment_cycle, observacoes: t.notes };
    }

    if (name === "list_pending_receipts") {
      let q = supabase.from("whatsapp_pending_actions").select("id,action_type,status,tenant_id,proposed_data,confidence,created_at").order("created_at", { ascending: false }).limit(50);
      if (!args.include_resolved) q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      const tenantIds = [...new Set((data ?? []).map((d: any) => d.tenant_id).filter(Boolean))];
      let tenantsMap: Record<string, string> = {};
      if (tenantIds.length) {
        const { data: ts } = await supabase.from("tenants").select("id,name").in("id", tenantIds);
        tenantsMap = Object.fromEntries((ts ?? []).map((t: any) => [t.id, t.name]));
      }
      return { count: data?.length ?? 0, pending: (data ?? []).map((d: any) => ({ id: d.id, status: d.status, tenant: d.tenant_id ? tenantsMap[d.tenant_id] : null, payer_name: d.proposed_data?.payer_name, amount: d.proposed_data?.amount, date: d.proposed_data?.date, created_at: d.created_at })) };
    }

    if (name === "assign_tenant_to_pending") {
      const t = await findTenant(args.tenant_name);
      if (!t) return { error: "Inquilino não encontrado" };
      const { error } = await supabase.from("whatsapp_pending_actions").update({ tenant_id: t.id }).eq("id", args.pending_id);
      if (error) throw error;
      return { success: true, tenant: t.name, pending_id: args.pending_id };
    }

    if (name === "approve_pending_receipt") {
      const { data: pa, error: pe } = await supabase.from("whatsapp_pending_actions").select("*").eq("id", args.pending_id).maybeSingle();
      if (pe || !pa) return { error: "Pendente não encontrado" };
      if (!pa.tenant_id) return { error: "Vincule um inquilino primeiro (assign_tenant_to_pending)" };
      const now = new Date();
      const dateStr: string = pa.proposed_data?.date || now.toISOString().slice(0, 10);
      const d = new Date(dateStr);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const amount = Number(pa.proposed_data?.amount ?? 0);
      const result = await execTool("mark_payment_paid", { tenant_name: (await supabase.from("tenants").select("name").eq("id", pa.tenant_id).single()).data?.name, month, year, amount: amount || undefined, paid_at: dateStr, send_receipt: true });
      await supabase.from("whatsapp_pending_actions").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", args.pending_id);
      return { success: true, ...result };
    }

    if (name === "list_saved_receipts") {
      let q = supabase.from("documents").select("id,title,file_name,file_url,tenant_id,created_at").eq("category", "receipt").order("created_at", { ascending: false }).limit(50);
      const { data } = await q;
      let filtered = data ?? [];
      if (args.tenant_name) {
        const { data: ts } = await supabase.from("tenants").select("id,name").ilike("name", `%${args.tenant_name}%`);
        const ids = new Set((ts ?? []).map((t: any) => t.id));
        filtered = filtered.filter((d: any) => ids.has(d.tenant_id));
      }
      return { count: filtered.length, receipts: filtered };
    }

    if (name === "list_expiring_contracts") {
      const days = args.days_ahead ?? 60;
      const today = new Date();
      const limit = new Date(today.getTime() + days * 86400000);
      const { data } = await supabase.from("tenants").select("id,name,phone,entry_date,exit_date").eq("status", "active");
      const list = (data ?? []).filter((t: any) => t.exit_date && new Date(t.exit_date) <= limit && new Date(t.exit_date) >= today);
      return { count: list.length, expiring: list };
    }

    return { error: "Tool não encontrada" };
  } catch (e: any) {
    console.error("execTool error", name, e);
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

    await supabase.from("ai_messages").insert({ conversation_id, role: "user", content: message });

    const { data: history } = await supabase.from("ai_messages").select("role,content,tool_calls,tool_call_id").eq("conversation_id", conversation_id).order("created_at", { ascending: true }).limit(80);

    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of history ?? []) {
      const msg: any = { role: m.role, content: m.content };
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      messages.push(msg);
    }

    for (let i = 0; i < 10; i++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-pro", messages, tools, stream: false }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI gateway: ${resp.status} ${t}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("Resposta vazia");

      if (choice.tool_calls && choice.tool_calls.length > 0) {
        messages.push(choice);
        await supabase.from("ai_messages").insert({ conversation_id, role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const tc of choice.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
          const result = await execTool(tc.function.name, args);
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          await supabase.from("ai_messages").insert({ conversation_id, role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
        }
        continue;
      }

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
