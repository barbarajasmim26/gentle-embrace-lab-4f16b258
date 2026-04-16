import jsPDF from "jspdf";
import logoSrc from "@/assets/logo-mesquita.png";
import signatureSrc from "@/assets/signature.png";

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function numberToWords(n: number): string {
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (n === 0) return "zero";
  if (n === 100) return "cem";

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (h > 0) parts.push(hundreds[h]);
  if (t === 1) parts.push(teens[u]);
  else {
    if (t > 0) parts.push(tens[t]);
    if (u > 0) parts.push(units[u]);
  }

  return parts.join(" e ");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function amountInWords(value: number): string {
  const intPart = Math.floor(value);
  const cents = Math.round((value - intPart) * 100);
  let result = `${capitalize(numberToWords(intPart))} reais`;
  if (cents > 0) result += ` e ${numberToWords(cents)} centavos`;
  return result;
}

export function formatCPF(cpf: string | undefined | null): string {
  if (!cpf) return "____________________";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export interface ReceiptData {
  tenantName: string;
  cpf?: string;
  address: string;
  houseNumber?: string;
  amount: number;
  month: number;
  year: number;
  paymentDate: string;
  paymentMethod: string;
  paymentType?: string;
  receiptNumber?: string;
  signatureName?: string;
  paidBy?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function parseReceiptDate(paymentDate: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return new Date(`${paymentDate}T12:00:00`);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) {
    const [day, month, year] = paymentDate.split("/").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  const fallback = new Date(paymentDate);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function formatReceiptDate(paymentDate: string) {
  const d = parseReceiptDate(paymentDate);
  return `Fortaleza, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

export async function generateReceipt(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;
  const monthName = MONTHS_PT[data.month - 1] || "";
  const paymentType = (data.paymentType || "aluguel").toLowerCase();
  const signatureName = data.signatureName || "Maria Eneide da Silva";
  const address = `${data.address}${data.houseNumber ? `, casa ${data.houseNumber}` : ""}`;

  let y = 20;

  // --- Logo ---
  try {
    const logoImg = await loadImage(logoSrc);
    const logoWidth = 65;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 18;
  } catch {
    y += 30;
  }

  // --- Title ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("RECIBO DE PAGAMENTO", pageWidth / 2, y, { align: "center" });
  // underline
  const titleWidth = doc.getTextWidth("RECIBO DE PAGAMENTO");
  doc.setDrawColor(0, 0, 0);
  doc.line((pageWidth - titleWidth) / 2, y + 1.5, (pageWidth + titleWidth) / 2, y + 1.5);
  y += 20;

  // --- Body ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const displayName = data.paidBy || data.tenantName;
  const formattedCPF = formatCPF(data.cpf);
  const bodyText = `Recebi de ${displayName.toUpperCase()}, brasileiro(a), CPF n° ${formattedCPF}, o valor de R$ ${data.amount.toFixed(2)} (${amountInWords(data.amount)}) via ${data.paymentMethod.toLowerCase()}, valor este referente ao ${paymentType} do mês de ${monthName} de ${data.year}, do imóvel localizado ${address} - Cascavel - CE.`;

  const bodyLines = doc.splitTextToSize(bodyText, contentWidth);
  doc.text(bodyLines, margin, y);
  y += bodyLines.length * 6 + 20;

  // --- Date ---
  doc.text(formatReceiptDate(data.paymentDate), pageWidth / 2, y, { align: "center" });
  y += 28;

  // --- Signature image ---
  try {
    const signatureImg = await loadImage(signatureSrc);
    const sigWidth = 55;
    const sigHeight = (signatureImg.height / signatureImg.width) * sigWidth;
    doc.addImage(signatureImg, "PNG", (pageWidth - sigWidth) / 2, y, sigWidth, sigHeight);
    y += sigHeight + 3;
  } catch {
    y += 20;
  }

  // --- Line ---
  doc.line(pageWidth / 2 - 42, y, pageWidth / 2 + 42, y);
  y += 6;

  // --- Signature name ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(signatureName, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("LOCADORA", pageWidth / 2, y, { align: "center" });

  return doc;
}
