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
  const dateObj = parseReceiptDate(paymentDate);
  return `Fortaleza ${dateObj.getDate()} de ${MONTHS_PT[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
}

export async function generateReceipt(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;
  const monthName = MONTHS_PT[data.month - 1] || "";
  const paymentType = (data.paymentType || "aluguel").toLowerCase();
  const signatureName = data.signatureName || "Maria Eneide da Silva - LOCADORA";
  const address = `${data.address}${data.houseNumber ? `, casa ${data.houseNumber}` : ""}`;

  // --- Logo ---
  let y = 20;
  try {
    const logoImg = await loadImage(logoSrc);
    const logoWidth = 62;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 16;
  } catch {
    y += 30;
  }

  // --- Title: RECIBO DE PAGAMENTO (centered, bold) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("RECIBO DE PAGAMENTO", pageWidth / 2, y, { align: "center" });
  y += 16;

  // --- Body: single paragraph, centered, matching the original ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  const bodyText = `Recebi de ${data.tenantName.toUpperCase()}${data.cpf ? `, inscrito no CPF nº ${data.cpf}` : ""}, o valor de R$ ${data.amount.toFixed(2)} (${amountInWords(data.amount)}) via ${data.paymentMethod.toLowerCase()}, valor este referente ao ${paymentType} do mês de ${monthName}, do imóvel localizado na ${address}.`;

  const bodyLines = doc.splitTextToSize(bodyText, contentWidth);
  doc.text(bodyLines, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
  y += bodyLines.length * 6 + 18;

  // --- Date (centered) ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(formatReceiptDate(data.paymentDate), pageWidth / 2, y, { align: "center" });
  y += 22;

  // --- Signature image ---
  try {
    const signatureImg = await loadImage(signatureSrc);
    const signatureWidth = 44;
    const signatureHeight = (signatureImg.height / signatureImg.width) * signatureWidth;
    doc.addImage(signatureImg, "PNG", (pageWidth - signatureWidth) / 2, y, signatureWidth, signatureHeight);
    y += signatureHeight + 2;
  } catch {
    y += 18;
  }

  // --- Line ---
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
  y += 6;

  // --- Signature name (centered) ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(signatureName, pageWidth / 2, y, { align: "center" });

  return doc;
}
