// Gera recibo PDF via jsPDF e envia pelo WhatsApp via Z-API
import jsPDF from "npm:jspdf@2.5.2";

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

const MONTHS_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

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

function buildReceiptPDF(opts: {
  tenantName: string;
  amount: number;
  month: number;
  year: number;
  paymentDate: string;
  address: string;
  houseNumber?: string;
}): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 25;
  const monthName = MONTHS_PT[opts.month - 1] ?? "";
  const amountStr = `R$ ${opts.amount.toFixed(2).replace(".", ",")}`;
  const date = new Date(opts.paymentDate);
  const dateText = `Fortaleza, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;

  let y = 30;
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("MESQUITA IMÓVEIS", pageW / 2, y, { align: "center" });
  y += 15;
  doc.setFontSize(13);
  doc.text("RECIBO DE PAGAMENTO", pageW / 2, y, { align: "center" });
  y += 18;

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const body =
    `Recebi de ${opts.tenantName.toUpperCase()} o valor de ${amountStr}, referente ao aluguel do mês de ${monthName}/${opts.year}, do imóvel localizado na ${opts.address}${opts.houseNumber ? `, casa ${opts.houseNumber}` : ""} - Cascavel - CE.`;
  const lines = doc.splitTextToSize(body, pageW - margin * 2);
  doc.text(lines, margin, y);
  y += lines.length * 7 + 25;

  doc.text(dateText, pageW / 2, y, { align: "center" });
  y += 25;
  doc.line(pageW / 2 - 60, y, pageW / 2 + 60, y);
  y += 7;
  doc.text("Maria Eneide da Silva - LOCADORA", pageW / 2, y, { align: "center" });

  // dataURI base64
  const dataUri = doc.output("datauristring");
  return dataUri; // "data:application/pdf;base64,...."
}

async function sendText(phone: string, message: string) {
  return fetch(`${baseUrl()}/send-text`, {
    method: "POST",
    headers: zapiHeaders(),
    body: JSON.stringify({ phone, message }),
  });
}

async function sendDocument(phone: string, dataUri: string, fileName: string) {
  return fetch(`${baseUrl()}/send-document/pdf`, {
    method: "POST",
    headers: zapiHeaders(),
    body: JSON.stringify({ phone, document: dataUri, fileName }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { tenantId, paymentId, customMessage } = await req.json();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenantId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // tenant
    const tRes = await sb(`tenants?id=eq.${tenantId}&select=*,property:properties(name,address)`);
    const tenants = await tRes.json();
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Inquilino não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // payment (último pago se não passar id)
    let payment: any = null;
    if (paymentId) {
      const pRes = await sb(`payments?id=eq.${paymentId}&select=*`);
      payment = (await pRes.json())[0];
    } else {
      const pRes = await sb(`payments?tenant_id=eq.${tenantId}&status=eq.paid&order=paid_at.desc&limit=1`);
      payment = (await pRes.json())[0];
    }
    if (!payment) {
      return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(tenant.phone ?? "");
    if (!phone || phone.length < 10) {
      return new Response(JSON.stringify({ error: "Telefone do inquilino inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const address = tenant.property?.address ?? "—";
    const dataUri = buildReceiptPDF({
      tenantName: tenant.name,
      amount: Number(payment.amount ?? tenant.rent_amount),
      month: payment.month,
      year: payment.year,
      paymentDate: payment.paid_at ?? new Date().toISOString().slice(0, 10),
      address,
      houseNumber: tenant.house_number ?? undefined,
    });

    const monthName = MONTHS_PT[payment.month - 1];
    const amountStr = Number(payment.amount ?? tenant.rent_amount).toFixed(2).replace(".", ",");
    const message = customMessage ?? 
      `Olá, ${tenant.name}! ✅\nPagamento recebido referente ao aluguel de ${monthName}/${payment.year}.\nValor: R$ ${amountStr}\n\nSegue seu recibo em PDF.\nObrigado!`;

    // 1. texto
    const txtRes = await sendText(phone, message);
    const txtData = await txtRes.json();

    // 2. pdf
    const docRes = await sendDocument(phone, dataUri, `recibo-${monthName}-${payment.year}.pdf`);
    const docData = await docRes.json();

    // log
    await sb(`whatsapp_messages`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        direction: "outbound", from_phone: "system", to_phone: phone,
        message_type: "text", body: message, tenant_id: tenantId,
        wa_message_id: txtData?.messageId ?? null, raw_payload: txtData, processed: true,
      }),
    });
    await sb(`whatsapp_messages`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        direction: "outbound", from_phone: "system", to_phone: phone,
        message_type: "document", body: `[recibo PDF] ${monthName}/${payment.year}`,
        tenant_id: tenantId, wa_message_id: docData?.messageId ?? null,
        raw_payload: docData, processed: true,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("zapi-send-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
