import { useDashboardStats, useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Users, DollarSign, AlertTriangle, TrendingUp, ArrowRight, Clock, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const navigate = useNavigate();
  const now = new Date();
  const month = now.getMonth() + 1;

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

  // Expiring contracts
  const expiringContracts = (tenants || []).filter((t) => {
    if (!t.exit_date) return false;
    const d = differenceInDays(parseISO(t.exit_date), now);
    return d >= 0 && d <= 30;
  });

  // Expired contracts (past exit_date)
  const expiredContracts = (tenants || []).filter((t) => {
    if (!t.exit_date) return false;
    return differenceInDays(parseISO(t.exit_date), now) < 0;
  });

  const overdueAmount = overdue.reduce((sum, t) => sum + Number(t.rent_amount), 0);
  const pendingAmount = pending.reduce((sum, t) => sum + Number(t.rent_amount), 0);

  const cards = [
    { label: "Contratos Ativos", value: stats?.activeContracts || 0, icon: Users, colorClass: "bg-primary/10 text-primary", link: "/tenants" },
    { label: "Receita Mensal", value: `R$ ${(stats?.monthlyRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, colorClass: "bg-success/10 text-success", link: "/reports" },
    { label: "Atrasados", value: `${overdue.length} (R$ ${overdueAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, icon: AlertTriangle, colorClass: "bg-destructive/10 text-destructive", link: "/overdue" },
    { label: "Pendentes", value: `${pending.length} (R$ ${pendingAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, icon: Clock, colorClass: "bg-warning/10 text-warning", link: "/overdue" },
  ];

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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group" onClick={() => navigate(card.link)}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.colorClass}`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div className="text-xl font-bold tracking-tight">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Alert */}
        {overdue.length > 0 && (
          <Card className="border-destructive/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  Inadimplentes ({overdue.length})
                </CardTitle>
                <Badge variant="destructive" className="cursor-pointer" onClick={() => navigate("/overdue")}>Ver todos</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdue.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-destructive/5 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">Casa {t.house_number} · Venc. dia {t.payment_day}</p>
                    </div>
                    <span className="text-sm font-semibold text-destructive">R$ {Number(t.rent_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expired Contracts */}
        {expiredContracts.length > 0 && (
          <Card className="border-destructive/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <XCircle className="h-4 w-4" />
                  </div>
                  Contratos Vencidos ({expiredContracts.length})
                </CardTitle>
                <Badge variant="destructive" className="cursor-pointer" onClick={() => navigate("/alerts")}>Ver alertas</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiredContracts.slice(0, 5).map((t) => {
                  const days = Math.abs(differenceInDays(parseISO(t.exit_date!), now));
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-destructive/5 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">Casa {t.house_number}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">Vencido há {days}d</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expiring Contracts */}
        {expiringContracts.length > 0 && (
          <Card className="border-warning/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                    <Clock className="h-4 w-4" />
                  </div>
                  Contratos Vencendo ({expiringContracts.length})
                </CardTitle>
                <Badge className="bg-warning text-warning-foreground cursor-pointer" onClick={() => navigate("/alerts")}>Ver alertas</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringContracts.slice(0, 5).map((t) => {
                  const days = differenceInDays(parseISO(t.exit_date!), now);
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-warning/5 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">Casa {t.house_number}</p>
                      </div>
                      <Badge variant="outline" className="text-warning border-warning/30 text-xs">{days}d</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Tenants */}
        <Card className={overdue.length === 0 && expiringContracts.length === 0 && expiredContracts.length === 0 ? "lg:col-span-2" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                Inquilinos Ativos
              </CardTitle>
              <Badge variant="outline" className="cursor-pointer" onClick={() => navigate("/tenants")}>Ver todos</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!tenants?.length ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Nenhum inquilino ativo.</p>
            ) : (
              <div className="space-y-1">
                {tenants.slice(0, 8).map((t) => {
                  const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
                  const paid = payment?.status === "paid" || payment?.status === "paid_late";
                  const isOvd = !paid && (t.payment_day || 10) < now.getDate();
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors group" onClick={() => navigate(`/tenants/${t.id}`)}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${isOvd ? "bg-destructive/10 text-destructive" : paid ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.property?.address} - Casa {t.house_number}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        {paid && <Badge className="bg-success/10 text-success border-success/30 text-[10px]" variant="outline">Pago</Badge>}
                        {isOvd && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                        <div>
                          <span className="text-sm font-semibold">R$ {Number(t.rent_amount).toFixed(2)}</span>
                          <p className="text-[10px] text-muted-foreground">Dia {t.payment_day}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
