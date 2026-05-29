import { generateReceipt, type ReceiptData } from "@/lib/receipt-generator";
import { openWhatsApp } from "@/lib/whatsapp";

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface QuickConfirmInput {
  tenant: {
    name: string;
    cpf?: string | null;
    phone?: string | null;
    house_number?: string | null;
    property?: { address?: string | null } | null;
  };
  amount: number;
  month: number;
  year: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod?: string;
  paymentType?: string;
  signatureName?: string;
}

/**
 * Gera o recibo em PDF, baixa o arquivo e abre o WhatsApp com mensagem pré-preenchida.
 * Usado após confirmar pagamento (fluxo 1 clique).
 */
export async function generateAndSendReceipt(input: QuickConfirmInput): Promise<void> {
  const {
    tenant,
    amount,
    month,
    year,
    paymentDate,
    paymentMethod = "Pix",
    paymentType = "aluguel",
    signatureName = "Maria Eneide da Silva",
  } = input;

  const monthName = MONTHS_PT[month - 1] || "";

  const data: ReceiptData = {
    tenantName: tenant.name,
    cpf: tenant.cpf || undefined,
    address: tenant.property?.address || "____________________________",
    houseNumber: tenant.house_number || undefined,
    amount,
    month,
    year,
    paymentDate,
    paymentMethod,
    paymentType,
    signatureName,
  };

  const pdf = await generateReceipt(data);
  const fileName = `recibo_${tenant.name.replace(/\s+/g, "_")}_${monthName}_${year}.pdf`;
  pdf.save(fileName);

  if (tenant.phone) {
    const message = `Olá ${tenant.name}! ✅\n\nConfirmamos o recebimento do ${paymentType} referente a ${monthName}/${year} no valor de R$ ${amount.toFixed(2).replace(".", ",")}.\n\nSegue em anexo o recibo (acabei de baixar — basta anexar nesta conversa).\n\nObrigado pela pontualidade! 🏠`;
    openWhatsApp({ phone: tenant.phone, message });
  }
}
