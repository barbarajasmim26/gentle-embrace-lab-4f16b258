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
  return `Fortaleza ${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Segments of the receipt body — bold pieces are highlighted in the PDF */
type Segment = { text: string; bold?: boolean };

function buildReceiptSegments(data: ReceiptData): Segment[] {
  const monthName = MONTHS_PT[data.month - 1] || "";
  const paymentType = (data.paymentType || "aluguel").toLowerCase();
  const formattedCPF = formatCPF(data.cpf);
  const paidByText = data.paidBy && data.paidBy !== data.tenantName
    ? ` por ${data.paidBy.toUpperCase()}`
    : "";
  const amountStr = data.amount.toFixed(2).replace(".", ",");
  const amountText = `R$ ${amountStr} (${amountInWords(data.amount)})`;
  const houseNumber = data.houseNumber || "___";

  return [
    { text: "Recebi de " },
    { text: data.tenantName.toUpperCase(), bold: true },
    { text: `, brasileiro(a), CPF n° ${formattedCPF}, o valor de ` },
    { text: amountText, bold: true },
    { text: ` via ${data.paymentMethod.toLowerCase()}${paidByText}, valor este referente ao ${paymentType} do mês de ${monthName}, do imóvel localizado na ${data.address}, casa ${houseNumber} - Cascavel - CE` },
  ];
}

export function buildReceiptBody(data: ReceiptData): string {
  return buildReceiptSegments(data).map((s) => s.text).join("");
}

/**
 * Render text segments as wrapped, centered lines preserving bold formatting.
 * Returns the new y position after rendering.
 */
function renderJustifiedSegments(
  doc: jsPDF,
  segments: Segment[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  // Tokenize into words preserving bold flag
  type Token = { text: string; bold: boolean; isSpace: boolean };
  const tokens: Token[] = [];
  segments.forEach((seg) => {
    const parts = seg.text.split(/(\s+)/);
    parts.forEach((p) => {
      if (!p) return;
      tokens.push({ text: p, bold: !!seg.bold, isSpace: /^\s+$/.test(p) });
    });
  });

  const setFont = (bold: boolean) => doc.setFont("times", bold ? "bold" : "normal");
  const widthOf = (t: Token) => {
    setFont(t.bold);
    return doc.getTextWidth(t.text);
  };

  // Build lines that fit maxWidth
  const lines: Token[][] = [];
  let current: Token[] = [];
  let currentWidth = 0;

  tokens.forEach((tok) => {
    const w = widthOf(tok);
    if (tok.isSpace) {
      if (current.length === 0) return; // skip leading space
      current.push(tok);
      currentWidth += w;
      return;
    }
    if (currentWidth + w > maxWidth && current.length > 0) {
      // trim trailing spaces
      while (current.length && current[current.length - 1].isSpace) {
        currentWidth -= widthOf(current[current.length - 1]);
        current.pop();
      }
      lines.push(current);
      current = [tok];
      currentWidth = w;
    } else {
      current.push(tok);
      currentWidth += w;
    }
  });
  if (current.length) {
    while (current.length && current[current.length - 1].isSpace) {
      current.pop();
    }
    lines.push(current);
  }

  // Render each line centered
  lines.forEach((line, idx) => {
    const lineWidth = line.reduce((acc, t) => acc + widthOf(t), 0);
    let cursor = x + (maxWidth - lineWidth) / 2;
    const lineY = y + idx * lineHeight;
    line.forEach((t) => {
      setFont(t.bold);
      doc.text(t.text, cursor, lineY);
      cursor += widthOf(t);
    });
  });

  return y + lines.length * lineHeight;
}

export async function generateReceipt(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  const signatureName = data.signatureName || "Maria Eneide da Silva";

  let y = 18;

  // --- Logo (large, centered like the original) ---
  try {
    const logoImg = await loadImage(logoSrc);
    const logoWidth = 95;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 28;
  } catch {
    y += 40;
  }

  // --- Title ---
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("RECIBO DE PAGAMENTO", pageWidth / 2, y, { align: "center" });
  y += 18;

  // --- Body with bold segments ---
  doc.setFontSize(12);
  const segments = buildReceiptSegments(data);
  y = renderJustifiedSegments(doc, segments, margin, y, contentWidth, 7);

  y += 22;

  // --- Date ---
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(formatReceiptDate(data.paymentDate), pageWidth / 2, y, { align: "center" });
  y += 28;

  // --- Signature image (overlapping the line, like original) ---
  try {
    const signatureImg = await loadImage(signatureSrc);
    const sigWidth = 55;
    const sigHeight = (signatureImg.height / signatureImg.width) * sigWidth;
    doc.addImage(signatureImg, "PNG", (pageWidth - sigWidth) / 2, y - sigHeight + 4, sigWidth, sigHeight);
  } catch {
    // ignore
  }

  // --- Signature line ---
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth / 2 - 65, y, pageWidth / 2 + 65, y);
  y += 7;

  // --- Signature name (single line, like original) ---
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(`${signatureName} - LOCADORA`, pageWidth / 2, y, { align: "center" });

  return doc;
}
