import { useState } from "react";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, TrendingDown, PieChart, BarChart3,
  Plus, Download, Filter, Calendar, Wallet, CreditCard
} from "lucide-react";
import jsPDF from "jspdf";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

interface Commission {
  id: string;
  month: number;
  year: number;
  amount: number;
  percentage: number;
}

export default function FinancialCenterPage() {
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "", category: "maintenance" });

  const activeTenants = tenants?.filter((t) => t.status === "active") || [];
  const expectedMonthly = activeTenants.reduce((sum, t) => sum + Number(t.rent_amount), 0);

  // Calcular receitas do mês
  const monthPayments = allPayments?.filter((p) => p.month === selectedMonth && p.year === selectedYear) || [];
  const totalReceived = monthPayments
    .filter((p) => p.status === "paid" || p.status === "paid_late")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalPending = monthPayments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Calcular despesas
  const monthExpenses = expenses.filter((e) => {
    const date = new Date(e.date);
    return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear;
  });
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Calcular comissões
  const monthCommissions = commissions.filter((c) => c.month === selectedMonth && c.year === selectedYear);
  const totalCommissions = monthCommissions.reduce((sum, c) => sum + c.amount, 0);

  // Fluxo de caixa
  const cashFlow = totalReceived - totalExpenses - totalCommissions;
  const profitMargin = totalReceived > 0 ? Math.round((cashFlow / totalReceived) * 100) : 0;

  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount) {
      toast.error("Preencha descrição e valor");
      return;
    }

    const expense: Expense = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      description: newExpense.description,
      amount: Number(newExpense.amount),
      category: newExpense.category,
    };

    setExpenses([...expenses, expense]);
    setNewExpense({ description: "", amount: "", category: "maintenance" });
    toast.success("Despesa adicionada");
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
    toast.success("Despesa removida");
  };

  const handleGenerateFinancialReport = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro - ${MONTHS_FULL[selectedMonth - 1]}/${selectedYear}`, pw / 2, y, { align: "center" });
    y += 15;

    // Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("RESUMO FINANCEIRO", margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Receita Esperada: R$ ${expectedMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.text(`Receita Recebida: R$ ${totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.text(`Receita Pendente: R$ ${totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.text(`Total de Despesas: R$ ${totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.text(`Total de Comissões: R$ ${totalCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`Fluxo de Caixa: R$ ${cashFlow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, y); y += 10;

    // Expenses
    if (monthExpenses.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DESPESAS", margin, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      monthExpenses.forEach((e) => {
        doc.text(`${e.description}: R$ ${e.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin + 5, y);
        y += 5;
      });
      y += 5;
    }

    doc.save(`relatorio_financeiro_${selectedMonth}_${selectedYear}.pdf`);
    toast.success("Relatório gerado!");
  };

  const years = [selectedYear - 2, selectedYear - 1, selectedYear];
  const categoryColors: Record<string, string> = {
    maintenance: "bg-blue-100 text-blue-800",
    utilities: "bg-green-100 text-green-800",
    repairs: "bg-orange-100 text-orange-800",
    insurance: "bg-red-100 text-red-800",
    other: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central Financeira</h1>
            <p className="text-sm text-muted-foreground">Fluxo de caixa, despesas e comissões</p>
          </div>
        </div>
        <Button onClick={handleGenerateFinancialReport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar Relatório
        </Button>
      </div>

      {/* Month/Year Selector */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-2">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_FULL.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <TrendingUp className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Receita Recebida</p>
          </CardContent>
        </Card>

        <Card className="border-0 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <TrendingDown className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Total Despesas</p>
          </CardContent>
        </Card>

        <Card className="border-0 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <CreditCard className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {totalCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Comissões</p>
          </CardContent>
        </Card>

        <Card className={`border-0 rounded-2xl text-white shadow-lg ${cashFlow >= 0 ? "bg-gradient-to-br from-green-500 to-green-600" : "bg-gradient-to-br from-red-500 to-red-600"}`}>
          <CardContent className="pt-5 pb-5">
            <DollarSign className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">R$ {cashFlow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Fluxo de Caixa ({profitMargin}%)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="forecast">Previsão</TabsTrigger>
        </TabsList>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Gerenciar Despesas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Expense Form */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg">
                <div>
                  <Label className="text-xs mb-1 block">Descrição</Label>
                  <Input
                    placeholder="Ex: Manutenção"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Categoria</Label>
                  <Select value={newExpense.category} onValueChange={(v) => setNewExpense({ ...newExpense, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maintenance">Manutenção</SelectItem>
                      <SelectItem value="utilities">Utilidades</SelectItem>
                      <SelectItem value="repairs">Reparos</SelectItem>
                      <SelectItem value="insurance">Seguro</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddExpense} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Expenses List */}
              {monthExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhuma despesa registrada para este mês</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {monthExpenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className={categoryColors[expense.category] || categoryColors.other}>
                            {expense.category}
                          </Badge>
                          <p className="font-medium">{expense.description}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(expense.date).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-bold">R$ {expense.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteExpense(expense.id)}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Gerenciamento de comissões em desenvolvimento</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="mt-4">
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Previsão de fluxo de caixa em desenvolvimento</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
