import jsPDF from "jspdf";
import logoSrc from "@/assets/logo-mesquita.png";
import signatureSrc from "@/assets/signature.png";

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface ContractData {
  tenantName: string;
  cpf?: string;
  address: string;
  houseNumber?: string;
  rentAmount: number;
  entryDate: string;
  exitDate: string;
}

export async function generateContractPDF(data: ContractData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // --- Logo ---
  try {
    const logoImg = await loadImage(logoSrc);
    const logoWidth = 50;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 15;
  } catch {
    y += 20;
  }

  // --- Title ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CONTRATO DE LOCAÇÃO RESIDENCIAL", pageWidth / 2, y, { align: "center" });
  y += 15;

  // --- Content ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  
  const entry = new Date(data.entryDate + "T12:00:00");
  const exit = new Date(data.exitDate + "T12:00:00");
  const entryStr = `${entry.getDate()} de ${MONTHS_PT[entry.getMonth()]} de ${entry.getFullYear()}`;
  const exitStr = `${exit.getDate()} de ${MONTHS_PT[exit.getMonth()]} de ${exit.getFullYear()}`;

  const text = `Pelo presente instrumento particular, de um lado Maria Eneide da Silva, doravante denominada LOCADORA, e de outro lado ${data.tenantName.toUpperCase()}, portador(a) do CPF nº ${data.cpf || "____________________"}, doravante denominado(a) LOCATÁRIO(A), celebram o presente contrato de locação do imóvel situado na ${data.address}, casa ${data.houseNumber || "___"}, Cascavel - CE.

1. O prazo de locação é de 12 meses, com início em ${entryStr} e término em ${exitStr}.

2. O valor do aluguel mensal é de R$ ${data.rentAmount.toFixed(2)}, a ser pago até o dia acordado de cada mês.

3. O(A) LOCATÁRIO(A) declara receber o imóvel em perfeitas condições de conservação e limpeza, obrigando-se a devolvê-lo no mesmo estado.

4. As despesas de energia elétrica e água são de responsabilidade do(a) LOCATÁRIO(A).

5. É vedada a sublocação ou cessão do imóvel a terceiros sem autorização prévia da LOCADORA.

Cascavel - CE, ${new Date().getDate()} de ${MONTHS_PT[new Date().getMonth()]} de ${new Date().getFullYear()}.`;

  const lines = doc.splitTextToSize(text, contentWidth);
  doc.text(lines, margin, y, { align: "justify" });
  y += lines.length * 6 + 30;

  // --- Signatures ---
  doc.line(margin, y, margin + 70, y);
  doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
  y += 5;
  doc.text("LOCADORA", margin + 35, y, { align: "center" });
  doc.text("LOCATÁRIO(A)", pageWidth - margin - 35, y, { align: "center" });
  
  // Add signature image over LOCADORA line
  try {
    const sigImg = await loadImage(signatureSrc);
    const sigWidth = 40;
    const sigHeight = (sigImg.height / sigImg.width) * sigWidth;
    doc.addImage(sigImg, "PNG", margin + 15, y - 25, sigWidth, sigHeight);
  } catch {}

  return doc;
}
