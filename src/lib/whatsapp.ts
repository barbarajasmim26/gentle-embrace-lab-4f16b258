export interface WhatsAppMessage {
  phone: string;
  message?: string;
}

export function normalizeBrazilPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppUrl({ phone, message }: WhatsAppMessage) {
  const normalizedPhone = normalizeBrazilPhone(phone);
  const url = new URL("https://api.whatsapp.com/send");

  url.searchParams.set("phone", normalizedPhone);

  if (message?.trim()) {
    url.searchParams.set("text", message);
  }

  url.searchParams.set("type", "phone_number");
  url.searchParams.set("app_absent", "0");

  return url.toString();
}

export function openWhatsApp({ phone, message }: WhatsAppMessage) {
  const url = buildWhatsAppUrl({ phone, message });
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openWhatsAppChat(phone: string) {
  openWhatsApp({ phone });
}

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface MessageTemplateData {
  name: string;
  amount: number;
  month: number;
  year: number;
  property: string;
  houseNumber?: string;
  dueDay?: number;
  lateFee?: number;
  interest?: number;
  totalWithFees?: number;
}

export function getMessageTemplates(data: MessageTemplateData) {
  const monthName = MONTHS_PT[data.month - 1] || "";
  return {
    reminder: `Olá ${data.name}! 😊\n\nLembramos que o aluguel de ${monthName}/${data.year} no valor de R$ ${data.amount.toFixed(2)} vence dia ${data.dueDay}.\n\nImóvel: ${data.property}${data.houseNumber ? `, Casa ${data.houseNumber}` : ""}\n\nQualquer dúvida, estamos à disposição!`,

    overdue: `Olá ${data.name},\n\nIdentificamos que o aluguel de ${monthName}/${data.year} está em atraso.\n\nValor original: R$ ${data.amount.toFixed(2)}\nMulta: ${data.lateFee || 10}%\nJuros: ${data.interest || 1}%\nTotal atualizado: R$ ${(data.totalWithFees || data.amount).toFixed(2)}\n\nImóvel: ${data.property}${data.houseNumber ? `, Casa ${data.houseNumber}` : ""}\n\nPor favor, regularize o quanto antes. Estamos à disposição!`,

    expiring: `Olá ${data.name}!\n\nInformamos que seu contrato de aluguel está próximo do vencimento.\n\nImóvel: ${data.property}${data.houseNumber ? `, Casa ${data.houseNumber}` : ""}\n\nEntre em contato para renovação. Obrigado!`,

    confirmation: `Olá ${data.name}! ✅\n\nConfirmamos o recebimento do aluguel de ${monthName}/${data.year} no valor de R$ ${data.amount.toFixed(2)}.\n\nObrigado pela pontualidade!`,

    welcome: `Olá ${data.name}! 🏠\n\nSeja bem-vindo(a) ao nosso imóvel!\n\nEndereço: ${data.property}${data.houseNumber ? `, Casa ${data.houseNumber}` : ""}\nAluguel: R$ ${data.amount.toFixed(2)}\nVencimento: todo dia ${data.dueDay}\n\nQualquer dúvida, estamos à disposição!`,
  };
}
