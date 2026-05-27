import jsPDF from "jspdf";
import QRCode from "qrcode";
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

export interface ReceiptDataEnhanced {
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
  pixKey?: string; // Chave PIX para QR Code
  pixQrCode?: string; // QR Code já gerado em base64
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

type Segment = { text: string; bold?: boolean };

function buildReceiptSegments(data: ReceiptDataEnhanced): Segment[] {
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

export function buildReceiptBody(data: ReceiptDataEnhanced): string {
  return buildReceiptSegments(data).map((s) => s.text).join("");
}

function renderJustifiedSegments(
  doc: jsPDF,
  segments: Segment[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
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

  const lines: Token[][] = [];
  let current: Token[] = [];
  let currentWidth = 0;

  tokens.forEach((tok) => {
    const w = widthOf(tok);
    if (tok.isSpace) {
      if (current.length === 0) return;
      current.push(tok);
      currentWidth += w;
      return;
    }
    if (currentWidth + w > maxWidth && current.length > 0) {
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

/**
 * Gera QR Code para PIX
 */
export async function generatePixQrCode(pixKey: string, amount: number, tenantName: string): Promise<string> {
  try {
    // Formato simplificado para QR Code PIX
    // Em produção, usar biblioteca específica para Brcode
    const pixData = `00020126580014br.gov.bcb.pix0136${pixKey}520400005303986540${amount.toFixed(2).replace(".", "")}5802BR5913${tenantName}6009FORTALEZA62410503***63041D3D`;
    const qrCodeDataUrl = await QRCode.toDataURL(pixData);
    return qrCodeDataUrl;
  } catch (err) {
    console.error("Erro ao gerar QR Code PIX:", err);
    return "";
  }
}

export async function generateReceiptEnhanced(data: ReceiptDataEnhanced): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  const signatureName = data.signatureName || "Maria Eneide da Silva";

  let y = 18;

  // --- Logo ---
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

  // --- QR Code PIX (if available) ---
  if (data.pixQrCode) {
    const qrSize = 40;
    const qrX = pageWidth / 2 - qrSize / 2;
    doc.addImage(data.pixQrCode, "PNG", qrX, y, qrSize, qrSize);
    y += qrSize + 5;
    
    doc.setFontSize(9);
    doc.setFont("times", "normal");
    doc.text("Escaneie para pagar via PIX", pageWidth / 2, y, { align: "center" });
    y += 8;
  }

  // --- Signature line ---
  const lineHalfWidth = 65;
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth / 2 - lineHalfWidth, y, pageWidth / 2 + lineHalfWidth, y);

  // --- Signature image ---
  try {
    const signatureImg = await loadImage(signatureSrc);
    const sigWidth = 50;
    const sigHeight = (signatureImg.height / signatureImg.width) * sigWidth;
    const sigX = (pageWidth - sigWidth) / 2;
    const sigY = y - sigHeight + 2;
    doc.addImage(signatureImg, "PNG", sigX, sigY, sigWidth, sigHeight);
  } catch {
    // ignore
  }

  y += 7;

  // --- Signature name ---
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(`${signatureName} - LOCADORA`, pageWidth / 2, y, { align: "center" });

  return doc;
}
