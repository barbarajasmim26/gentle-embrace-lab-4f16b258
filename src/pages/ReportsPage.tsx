import { useState } from "react";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, DollarSign, TrendingUp, Home, CalendarDays, BarChart3 } from "lucide-react";
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
  const totalProperties = new Set(activeTenants.map(t => t.property_id).filter(Boolean)).size;
  const expectedMonthly = activeTenants.reduce((sum, t) => sum + Number(t.rent_amount), 0);

  // Começar a contar a partir de março (mês 3)
  const START_MONTH = 3; // Março
  const monthlyData = MONTHS_PT.map((m, i) => {
    // Ignorar janeiro e fevereiro
    if (i + 1 < START_MONTH) {
      return { month: m, monthFull: MONTHS_FULL[i], received: 0, paidCount: 0, pending: 0, expected: expectedMonthly };
    }
    const monthPayments = payments?.filter((p) => p.month === i + 1 && (p.status === "paid" || p.status === "paid_late")) || [];
    const received = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const paidCount = monthPayments.length;
    const pending = payments?.filter((p) => p.month === i + 1 && p.status === "pending")?.length || 0;
    return { month: m, monthFull: MONTHS_FULL[i], received, paidCount, pending, expected: expectedMonthly };
  });

  // Calcular apenas a partir de março
  const monthsWithData = monthlyData.filter((_, i) => i + 1 >= START_MONTH);
  const totalReceived = monthsWithData.reduce((sum, m) => sum + m.received, 0);
  const avgMonthly = monthsWithData.length > 0 ? totalReceived / monthsWithData.length : 0;
  const occupancyRate = activeTenants.length > 0 ? Math.round((activeTenants.length / (tenants?.length || 1)) * 100) : 0;
  
  // Contracts expiring within 30 days
  const expiring30 = activeTenants.filter(t => {
    if (!t.exit_date) return false;
    const diff = (new Date(t.exit_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const maxReceived = Math.max(...monthlyData.map(m => m.received), 1);

  const handleGeneratePDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro - ${year}`, pw / 2, y, { align: "center" });
    y += 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Contratos ativos: ${activeTenants.length}`, margin, y); y += 6;
    doc.text(`Receita esperada/mês: R$ ${expectedMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.text(`Total recebido no ano: R$ ${totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 12;

    doc.setFont("helvetica", "bold");
    doc.setFillColor(37, 99, 235);
    doc.setTextColor(255, 255, 255);
    doc.rect(margin, y, pw - margin * 2, 8, "F");
    doc.text("Mês", margin + 4, y + 5.5);
    doc.text("Recebido", margin + 60, y + 5.5);
    doc.text("Pagos", margin + 105, y + 5.5);
    doc.text("Pendentes", margin + 145, y + 5.5);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    monthlyData.forEach((m, i) => {
      // Pular janeiro e fevereiro no PDF
      if (i + 1 < START_MONTH) return;
      if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(margin, y, pw - margin * 2, 7, "F"); }
      doc.text(m.monthFull, margin + 4, y + 5);
      doc.text(`R$ ${m.received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 60, y + 5);
      doc.text(String(m.paidCount), margin + 105, y + 5);
      doc.text(String(m.pending), margin + 145, y + 5);
      y += 7;
    });

    doc.save(`relatorio_${year}.pdf`);
    toast.success("Relatório PDF gerado!");
  };

  const years = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatórios Financeiros</h1>
            <p className="text-sm text-muted-foreground">Análise de desempenho — {year}</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleGeneratePDF}>
          <Download className="mr-2 h-4 w-4" />Imprimir Relatório
        </Button>
      </div>

      {/* Year tabs */}
      <div className="inline-flex items-center border rounded-xl p-1 gap-1">
        {years.map((y) => (
          <Button
            key={y}
            variant={y === year ? "default" : "ghost"}
            size="sm"
            className="rounded-lg px-5"
            onClick={() => setYear(y)}
          >
            {y}
          </Button>
        ))}
      </div>

      {/* KPI Cards - Colorful */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <DollarSign className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Receita Total {year}</p>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <TrendingUp className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {avgMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Média Mensal</p>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <Home className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{occupancyRate}%</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Taxa de Ocupação</p>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <CalendarDays className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{expiring30}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Vencem em 30 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Bar Chart */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-6">Fluxo de Receita Mensal</h3>
          <div className="flex items-end gap-2 h-[250px]">
            {/* Y-axis labels */}
            <div className="flex flex-col justify-between h-full text-[11px] text-muted-foreground pr-2 pb-6">
              {[maxReceived, maxReceived * 0.75, maxReceived * 0.5, maxReceived * 0.25, 0].map((v, i) => (
                <span key={i}>R${Math.round(v).toLocaleString("pt-BR")}</span>
              ))}
            </div>
            {/* Bars */}
            <div className="flex-1 flex items-end gap-1 h-full border-l border-b border-border/30 pb-0">
              {monthlyData.map((m) => {
                const height = maxReceived > 0 ? (m.received / maxReceived) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full max-w-[40px] rounded-t-md bg-gradient-to-t from-violet-600 to-violet-400 transition-all duration-500 min-h-[2px]"
                      style={{ height: `${Math.max(height, 1)}%` }}
                    />
                    <span className="text-[11px] text-muted-foreground mt-2">{m.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Detail Table */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-4">Detalhamento Financeiro</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Mês</th>
                  <th className="text-right py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Receita</th>
                  <th className="text-right py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Pagos</th>
                  <th className="text-right py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.month} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                    <td className="py-3 font-semibold">{m.monthFull}</td>
                    <td className="py-3 text-right font-bold text-emerald-600">R$ {m.received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 text-right font-bold text-primary">{m.paidCount}</td>
                    <td className="py-3 text-right">
                      {m.pending > 0 ? (
                        <Badge variant="destructive" className="text-xs">{m.pending}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
