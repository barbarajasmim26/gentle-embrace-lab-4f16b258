import { Tenant, Payment } from "@/hooks/use-tenants";

export interface WhatsAppMessageTemplate {
  type: "charge" | "payment_confirm" | "overdue" | "due_today" | "payment_reminder" | "contract_expiring";
  title: string;
  message: string;
  emoji: string;
}

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function generateChargeMessage(tenant: Tenant, month: number, year: number, amount: number): WhatsAppMessageTemplate {
  const monthName = MONTHS_PT[month - 1] || "";
  const dueDate = tenant.payment_day || 10;
  
  return {
    type: "charge",
    title: "Cobrança",
    emoji: "💰",
    message: `Olá ${tenant.name}! 😊\n\nSeu aluguel referente a ${monthName}/${year} vence em ${dueDate.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}.\n\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n\n📱 PIX: [Adicionar chave PIX]\n\nQualquer dúvida estou à disposição! 🙏`,
  };
}

export function generatePaymentConfirmationMessage(tenant: Tenant, month: number, year: number, amount: number): WhatsAppMessageTemplate {
  const monthName = MONTHS_PT[month - 1] || "";
  
  return {
    type: "payment_confirm",
    title: "Confirmação de Pagamento",
    emoji: "✅",
    message: `Pagamento recebido com sucesso! ✅\n\nOlá ${tenant.name},\n\nConfirmamos o recebimento do seu aluguel referente a ${monthName}/${year} no valor de R$ ${amount.toFixed(2).replace(".", ",")}\n\nSeu recibo está em anexo. Qualquer dúvida, nos contacte! 😊`,
  };
}

export function generateOverdueMessage(tenant: Tenant, month: number, year: number, daysOverdue: number): WhatsAppMessageTemplate {
  const monthName = MONTHS_PT[month - 1] || "";
  
  return {
    type: "overdue",
    title: "Aviso de Atraso",
    emoji: "🔴",
    message: `Olá ${tenant.name}! 🔴\n\nIdentificamos que o aluguel referente a ${monthName}/${year} está ${daysOverdue} dias em atraso.\n\nPor favor, regularize o pagamento o quanto antes para evitar multa por atraso.\n\nCaso já tenha realizado o pagamento, desconsidere esta mensagem.\n\nQualquer dúvida, estamos à disposição! 📞`,
  };
}

export function generateDueTodayMessage(tenant: Tenant, month: number, year: number, amount: number): WhatsAppMessageTemplate {
  const monthName = MONTHS_PT[month - 1] || "";
  
  return {
    type: "due_today",
    title: "Vence Hoje",
    emoji: "🔵",
    message: `Olá ${tenant.name}! 🔵\n\nLembrando que o aluguel referente a ${monthName}/${year} vence HOJE!\n\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n\n📱 PIX: [Adicionar chave PIX]\n\nAgradeço a atenção! 😊`,
  };
}

export function generatePaymentReminderMessage(tenant: Tenant, month: number, year: number, amount: number, daysUntilDue: number): WhatsAppMessageTemplate {
  const monthName = MONTHS_PT[month - 1] || "";
  
  return {
    type: "payment_reminder",
    title: "Lembrete de Pagamento",
    emoji: "⏰",
    message: `Olá ${tenant.name}! ⏰\n\nLembrando que o aluguel referente a ${monthName}/${year} vence em ${daysUntilDue} dias.\n\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n\n📱 PIX: [Adicionar chave PIX]\n\nQualquer dúvida, estamos à disposição! 😊`,
  };
}

export function generateContractExpiringMessage(tenant: Tenant, daysUntilExpiry: number): WhatsAppMessageTemplate {
  return {
    type: "contract_expiring",
    title: "Contrato Vencendo",
    emoji: "📋",
    message: `Olá ${tenant.name}! 📋\n\nInformamos que seu contrato de aluguel vence em ${daysUntilExpiry} dias.\n\nPor favor, entre em contato para discutirmos sobre renovação ou encerramento do contrato.\n\nQualquer dúvida, estamos à disposição! 😊`,
  };
}

export function generateCustomMessage(tenant: Tenant, customText: string): WhatsAppMessageTemplate {
  return {
    type: "charge",
    title: "Mensagem Personalizada",
    emoji: "💬",
    message: customText.replace("{tenant_name}", tenant.name),
  };
}

/**
 * Gera uma mensagem pronta para copiar para a área de transferência
 */
export function formatMessageForClipboard(message: string): string {
  return message;
}

/**
 * Abre WhatsApp Web com a mensagem pré-preenchida
 */
export function openWhatsAppWithMessage(phone: string, message: string): void {
  const encodedMessage = encodeURIComponent(message);
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`;
  window.open(url, "_blank");
}

/**
 * Copia a mensagem para a área de transferência
 */
export async function copyMessageToClipboard(message: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch (err) {
    console.error("Erro ao copiar para área de transferência:", err);
    return false;
  }
}
