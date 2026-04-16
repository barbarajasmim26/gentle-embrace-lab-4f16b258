import { useDashboardStats, useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, AlertTriangle, TrendingUp, ArrowRight, Clock, XCircle, CheckCircle2, CalendarDays, Home, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const navigate = useNavigate();
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Overdue tenants
  const overdue = tenants?.filter((t) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
    if (payment?.status === "paid" || payment?.status === "paid_late" || payment?.status === "deposit") return false;
    return (t.payment_day || 10) < now.getDate();
  }) || [];

  // Pending (not yet due) tenants
  const pending = tenants?.filter((t) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
    if (payment?.status === "paid" || payment?.status === "paid_late" || payment?.status === "deposit") return false;
    return (t.payment_day || 10) >= now.getDate();
  }) || [];

  // Paid this month
  const paidThisMonth = tenants?.filter((t) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
    return payment?.status === "paid" || payment?.status === "paid_late";
  }) || [];

  // Expiring contracts
  const expiringContracts = (tenants || []).filter((t) => {
    if (!t.exit_date) return false;
    const d = differenceInDays(parseISO(t.exit_date), now);
    return d >= 0 && d <= 30;
  });

  // Expired contracts
  const expiredContracts = (tenants || []).filter((t) => {
    if (!t.exit_date) return false;
    return differenceInDays(parseISO(t.exit_date), now) < 0;
  });

  const overdueAmount = overdue.reduce((sum, t) => sum + Number(t.rent_amount), 0);
  const totalTenants = tenants?.length || 0;
  const paidPercent = totalTenants > 0 ? Math.round((paidThisMonth.length / totalTenants) * 100) : 0;

  // Monthly collection chart data (mini bar chart)
  const monthlyData = MONTHS_SHORT.map((_, i) => {
    const m = i + 1;
    const paid = allPayments?.filter((p: any) => p.month === m && (p.status === "paid" || p.status === "paid_late")) || [];
    const total = paid.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    return total;
  });
  const maxMonthly = Math.max(...monthlyData, 1);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm">Carregando...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Badge variant="outline" className="text-xs px-3 py-1">
          <Home className="h-3 w-3 mr-1" />
          {totalTenants} inquilinos
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-primary" onClick={() => navigate("/tenants")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-2xl font-bold">{stats?.activeContracts || 0}</p>
            <p className="text-[11px] text-muted-foreground">Contratos Ativos</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-success" onClick={() => navigate("/reports")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
                <DollarSign className="h-4 w-4" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-success transition-colors" />
            </div>
            <p className="text-2xl font-bold">R$ {(stats?.monthlyRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p className="text-[11px] text-muted-foreground">Receita Mensal</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-destructive" onClick={() => navigate("/overdue")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-destructive transition-colors" />
            </div>
            <p className="text-2xl font-bold">{overdue.length}</p>
            <p className="text-[11px] text-muted-foreground">Atrasados · R$ {overdueAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-warning" onClick={() => navigate("/overdue")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <Clock className="h-4 w-4" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-warning transition-colors" />
            </div>
            <p className="text-2xl font-bold">{pending.length}</p>
            <p className="text-[11px] text-muted-foreground">Pendentes este mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress + Mini Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Collection Progress */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold">Cobrança do Mês</span>
              </div>
              <span className="text-lg font-bold text-success">{paidPercent}%</span>
            </div>
            <Progress value={paidPercent} className="h-2.5 mb-3" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success inline-block" />
                {paidThisMonth.length} pagos
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                {overdue.length} atrasados
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-warning inline-block" />
                {pending.length} pendentes
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Mini Bar Chart */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Arrecadação {currentYear}</span>
            </div>
            <div className="flex items-end gap-1 h-16">
              {monthlyData.map((val, i) => {
                const height = Math.max((val / maxMonthly) * 100, 4);
                const isCurrentMonth = i === month - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-t transition-all ${isCurrentMonth ? "bg-primary" : i < month - 1 ? "bg-primary/30" : "bg-muted"}`}
                      style={{ height: `${height}%` }}
                      title={`${MONTHS_SHORT[i]}: R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                    />
                    <span className={`text-[8px] ${isCurrentMonth ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {MONTHS_SHORT[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Overdue Alert */}
        {overdue.length > 0 && (
          <Card className="border-destructive/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                  Inadimplentes
                </CardTitle>
                <Badge variant="destructive" className="cursor-pointer text-[10px]" onClick={() => navigate("/overdue")}>Ver todos</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {overdue.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-destructive/5 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive text-[10px] font-bold">{t.name.charAt(0)}</div>
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">Casa {t.house_number} · Dia {t.payment_day}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-destructive">R$ {Number(t.rent_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expiring / Expired Contracts */}
        {(expiringContracts.length > 0 || expiredContracts.length > 0) && (
          <Card className={expiredContracts.length > 0 ? "border-destructive/20" : "border-warning/20"}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${expiredContracts.length > 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                  </div>
                  Contratos
                </CardTitle>
                <Badge variant="outline" className="cursor-pointer text-[10px]" onClick={() => navigate("/alerts")}>Alertas</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {expiredContracts.slice(0, 3).map((t) => {
                  const days = Math.abs(differenceInDays(parseISO(t.exit_date!), now));
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                        <p className="text-sm font-medium">{t.name}</p>
                      </div>
                      <Badge variant="destructive" className="text-[10px]">Vencido há {days}d</Badge>
                    </div>
                  );
                })}
                {expiringContracts.slice(0, 3).map((t) => {
                  const days = differenceInDays(parseISO(t.exit_date!), now);
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-warning" />
                        <p className="text-sm font-medium">{t.name}</p>
                      </div>
                      <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">{days}d restantes</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Active Tenants */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-3.5 w-3.5" />
              </div>
              Inquilinos Ativos
            </CardTitle>
            <Badge variant="outline" className="cursor-pointer text-[10px]" onClick={() => navigate("/tenants")}>Ver todos <ArrowRight className="ml-1 h-3 w-3" /></Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!tenants?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Nenhum inquilino ativo.</p>
          ) : (
            <div className="space-y-0.5">
              {tenants.slice(0, 10).map((t) => {
                const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
                const paid = payment?.status === "paid" || payment?.status === "paid_late";
                const isOvd = !paid && (t.payment_day || 10) < now.getDate();
                return (
                  <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors group" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${isOvd ? "bg-destructive/10 text-destructive" : paid ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">{t.property?.address}{t.house_number ? ` · Casa ${t.house_number}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {paid && <Badge className="bg-success/10 text-success border-success/30 text-[10px]" variant="outline">Pago</Badge>}
                      {isOvd && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                      {!paid && !isOvd && <Badge variant="outline" className="text-[10px] text-muted-foreground">Dia {t.payment_day}</Badge>}
                      <span className="text-sm font-semibold min-w-[80px] text-right">R$ {Number(t.rent_amount).toFixed(2)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
