import { useState } from "react";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: tenants } = useTenants();
  const { data: payments } = useAllPayments(year);

  const activeTenants = tenants?.filter((t) => t.status === "active") || [];
  const expectedMonthly = activeTenants.reduce((sum, t) => sum + Number(t.rent_amount), 0);

  const monthlyData = MONTHS_PT.map((m, i) => {
    const monthPayments = payments?.filter((p) => p.month === i + 1 && (p.status === "paid" || p.status === "paid_late")) || [];
    const received = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const pending = payments?.filter((p) => p.month === i + 1 && p.status === "pending")?.length || 0;
    return { month: m, monthFull: MONTHS_FULL[i], received, pending, expected: expectedMonthly };
  });

  const totalReceived = monthlyData.reduce((sum, m) => sum + m.received, 0);
  const totalPending = payments?.filter((p) => p.status === "pending")?.length || 0;

  const handleGeneratePDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro - ${year}`, pw / 2, y, { align: "center" });
    y += 12;

    // Summary
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Contratos ativos: ${activeTenants.length}`, margin, y);
    y += 6;
    doc.text(`Receita esperada/mês: R$ ${expectedMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y);
    y += 6;
    doc.text(`Total recebido no ano: R$ ${totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y);
    y += 6;
    doc.text(`Pagamentos pendentes: ${totalPending}`, margin, y);
    y += 12;

    // Table header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setFillColor(37, 99, 235);
    doc.setTextColor(255, 255, 255);
    doc.rect(margin, y, pw - margin * 2, 8, "F");
    doc.text("Mês", margin + 4, y + 5.5);
    doc.text("Recebido", margin + 60, y + 5.5);
    doc.text("Esperado", margin + 105, y + 5.5);
    doc.text("Pendentes", margin + 145, y + 5.5);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    monthlyData.forEach((m, i) => {
      const bg = i % 2 === 0;
      if (bg) {
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, y, pw - margin * 2, 7, "F");
      }
      doc.text(m.monthFull, margin + 4, y + 5);
      doc.text(`R$ ${m.received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 60, y + 5);
      doc.text(`R$ ${m.expected.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 105, y + 5);
      doc.text(String(m.pending), margin + 145, y + 5);
      y += 7;
    });

    // Total row
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(37, 99, 235);
    doc.setTextColor(255, 255, 255);
    doc.rect(margin, y, pw - margin * 2, 8, "F");
    doc.text("TOTAL", margin + 4, y + 5.5);
    doc.text(`R$ ${totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 60, y + 5.5);
    doc.text(`R$ ${(expectedMonthly * 12).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 105, y + 5.5);
    doc.text(String(totalPending), margin + 145, y + 5.5);

    doc.save(`relatorio_${year}.pdf`);
    toast.success("Relatório PDF gerado com sucesso!");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>← {year - 1}</Button>
          <span className="text-sm font-bold">{year}</span>
          <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>{year + 1} →</Button>
          <Button size="sm" onClick={handleGeneratePDF}>
            <Download className="mr-2 h-4 w-4" />Gerar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Receita Total ({year})</p><p className="text-2xl font-bold text-success">R$ {totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Receita Esperada / Mês</p><p className="text-2xl font-bold">R$ {expectedMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Pagamentos Pendentes</p><p className="text-2xl font-bold text-destructive">{totalPending}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Receita Mensal</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {monthlyData.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-sm font-medium w-8">{m.month}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full transition-all" style={{ width: m.expected > 0 ? `${Math.min(100, (m.received / m.expected) * 100)}%` : "0%" }} />
                </div>
                <span className="text-xs font-medium w-28 text-right">R$ {m.received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                {m.pending > 0 && <Badge variant="destructive" className="text-xs">{m.pending} pend.</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
