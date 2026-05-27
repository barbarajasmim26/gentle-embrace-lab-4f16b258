import { useDashboardStats, useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, DollarSign, AlertTriangle, FileText, Bell, Calendar,
  BarChart3, Receipt, Search, ChevronRight, Home,
  TrendingUp, Plus, Bot, TrendingDown, AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO, isToday } from "date-fns";
import { isOverdue, isPaymentPaid, getPaymentStatusInfo } from "@/lib/payment-status";

export default function DashboardPageEnhanced() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const navigate = useNavigate();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Conta alertas reais (vencidos + vencendo em 30 dias)
  const activeOnly = (tenants || []).filter((t) => t.status === "active");
  const expired = activeOnly.filter((t) => t.exit_date && parseISO(t.exit_date) < now && !isToday(parseISO(t.exit_date)));
  const expiringSoon = activeOnly.filter((t) => {
    if (!t.exit_date) return false;
    const d = differenceInDays(parseISO(t.exit_date), now);
    return d >= 0 && d <= 30;
  });
  const alertsCount = expired.length + expiringSoon.length;

  // Calcular inadimplência em tempo real
  const paymentStats = {
    paid: 0,
    pending: 0,
    overdue: 0,
    dueToday: 0,
    totalExpected: 0,
    totalReceived: 0,
    totalPending: 0,
    totalOverdue: 0,
  };

  activeOnly.forEach((tenant) => {
    for (let m = 1; m <= month; m++) {
      const payment = allPayments?.find(p => p.tenant_id === tenant.id && p.month === m && p.year === year);
      const statusInfo = getPaymentStatusInfo(
        payment?.status,
        m,
        year,
        tenant.payment_day || 10,
        tenant.payment_cycle,
        tenant.entry_date,
        now
      );

      const amount = payment?.amount || tenant.rent_amount || 0;
      paymentStats.totalExpected += amount;

      if (statusInfo.status === "paid" || statusInfo.status === "paid_late" || statusInfo.status === "deposit") {
        paymentStats.paid++;
        paymentStats.totalReceived += amount;
      } else if (statusInfo.status === "overdue") {
        paymentStats.overdue++;
        paymentStats.totalPending += amount;
      } else if (statusInfo.status === "due_today") {
        paymentStats.dueToday++;
        paymentStats.totalPending += amount;
      } else if (statusInfo.status === "pending") {
        paymentStats.pending++;
        paymentStats.totalPending += amount;
      }
    }
  });

  const inadimplenciaRate = paymentStats.totalExpected > 0
    ? Math.round((paymentStats.totalOverdue / paymentStats.totalExpected) * 100)
    : 0;

  const recebimentoRate = paymentStats.totalExpected > 0
    ? Math.round((paymentStats.totalReceived / paymentStats.totalExpected) * 100)
    : 0;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const totalContracts = tenants?.length || 0;
  const activeContracts = stats?.activeContracts || 0;
  const monthlyRevenue = stats?.monthlyRevenue || 0;

  const kpis = [
    {
      label: "Total de Contratos",
      value: totalContracts,
      icon: FileText,
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
      borderColor: "border-l-primary",
    },
    {
      label: "Contratos Ativos",
      value: activeContracts,
      icon: TrendingUp,
      iconBg: "bg-success/15",
      iconColor: "text-success",
      borderColor: "border-l-success",
    },
    {
      label: "Receita Mensal",
      value: `R$ ${monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      iconBg: "bg-accent/15",
      iconColor: "text-accent",
      borderColor: "border-l-accent",
    },
  ];

  const financialMetrics = [
    {
      label: "Taxa de Recebimento",
      value: `${recebimentoRate}%`,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Taxa de Inadimplência",
      value: `${inadimplenciaRate}%`,
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Recebido este Mês",
      value: `R$ ${paymentStats.totalReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      label: "Pendente",
      value: `R$ ${paymentStats.totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: AlertCircle,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  ];

  const features = [
    {
      title: "Contratos",
      desc: "Gerencie todos os contratos de aluguel",
      icon: FileText,
      iconBg: "bg-primary",
      badge: `${activeContracts} ativos`,
      badgeColor: "bg-primary/10 text-primary",
      url: "/tenants",
    },
    {
      title: "Alertas",
      desc: "Contratos vencendo e vencidos",
      icon: Bell,
      iconBg: "bg-destructive",
      badge: `${alertsCount} avisos`,
      badgeColor: "bg-destructive/10 text-destructive",
      url: "/alerts",
    },
    {
      title: "Calendário",
      desc: "Visualize datas de vencimento",
      icon: Calendar,
      iconBg: "bg-info",
      badge: "Próximos 30 dias",
      badgeColor: "bg-info/10 text-info",
      url: "/calendar",
    },
    {
      title: "Relatórios",
      desc: "Análise de receitas e inadimplência",
      icon: BarChart3,
      iconBg: "bg-accent",
      badge: `${recebimentoRate}% recebido`,
      badgeColor: "bg-accent/10 text-accent",
      url: "/reports",
    },
    {
      title: "Recibo",
      desc: "Gerar recibos de aluguel",
      icon: Receipt,
      iconBg: "bg-primary",
      badge: "Novo recibo",
      badgeColor: "bg-primary/10 text-primary",
      url: "/receipts",
    },
    {
      title: "Inquilinos",
      desc: "Gerencie dados dos inquilinos",
      icon: Users,
      iconBg: "bg-warning",
      badge: `${totalContracts} inquilinos`,
      badgeColor: "bg-warning/10 text-warning",
      url: "/tenants",
    },
    {
      title: "Busca Rápida",
      desc: "Encontre contratos rapidamente",
      icon: Search,
      iconBg: "bg-success",
      badge: "Pesquisar",
      badgeColor: "bg-success/10 text-success",
      url: "/search",
    },
    {
      title: "Assistente de IA",
      desc: "Processar comprovantes e avisos",
      icon: Bot,
      iconBg: "bg-emerald-500",
      badge: "Inteligente",
      badgeColor: "bg-emerald-500/10 text-emerald-600",
      url: "/whatsapp-auto",
    },
  ];

  const shortcuts = [
    { label: "Gerar Novo Recibo", icon: Receipt, url: "/receipts", color: "bg-warning hover:bg-warning/90 text-warning-foreground" },
    { label: "Ver Alertas", icon: Bell, url: "/alerts", color: "bg-destructive hover:bg-destructive/90 text-destructive-foreground" },
    { label: "Ver Atrasados", icon: AlertTriangle, url: "/overdue", color: "bg-primary hover:bg-primary/90 text-primary-foreground" },
    { label: "Assistente de IA", icon: Bot, url: "/whatsapp-auto", color: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Home className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo ao Sistema de Gestão de Imóveis</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border-l-4 ${kpi.borderColor}`}>
            <CardContent className="pt-5 pb-4 flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${kpi.iconBg} ${kpi.iconColor} shrink-0`}>
                <kpi.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Metrics */}
      <div>
        <h2 className="text-lg font-bold mb-4">Métricas Financeiras</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {financialMetrics.map((metric) => (
            <Card key={metric.label} className="rounded-xl">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{metric.label}</p>
                    <p className={`text-2xl font-bold ${metric.color}`}>{metric.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.bgColor}`}>
                    <metric.icon className={`h-5 w-5 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Funcionalidades */}
      <div>
        <h2 className="text-lg font-bold mb-4">Funcionalidades do Sistema</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <Card
              key={f.title}
              className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
              onClick={() => navigate(f.url)}
            >
              <CardContent className="pt-5 pb-4 flex flex-col justify-between h-full">
                <div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${f.iconBg} text-white mb-3`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <Badge variant="outline" className={`text-[10px] ${f.badgeColor} border-transparent`}>
                    {f.badge}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Atalhos Rápidos */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Atalhos Rápidos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {shortcuts.map((s) => (
              <Button
                key={s.label}
                className={`h-12 rounded-xl ${s.color} font-semibold text-sm`}
                onClick={() => navigate(s.url)}
              >
                <s.icon className="mr-2 h-5 w-5" />
                {s.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
