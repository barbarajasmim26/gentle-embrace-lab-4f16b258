import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, AlertTriangle, Home, TrendingUp, Clock, ChevronRight as ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data: tenants } = useTenants("active");
  const { data: payments } = useAllPayments(currentYear);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };
  const goToday = () => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); };

  const getDayInfo = (day: number) => {
    const dueTenants = tenants?.filter((t) => t.payment_day === day) || [];
    const month = currentMonth + 1;
    const paidTenants = dueTenants.filter((t) => {
      const p = payments?.find((p: any) => p.tenant_id === t.id && p.month === month);
      return p?.status === "paid" || p?.status === "paid_late";
    });
    const pendingTenants = dueTenants.filter((t) => {
      const p = payments?.find((p: any) => p.tenant_id === t.id && p.month === month);
      return !p || (p.status !== "paid" && p.status !== "paid_late");
    });
    const contractEvents = tenants?.filter((t) => {
      if (t.entry_date) {
        const d = new Date(t.entry_date);
        if (d.getDate() === day && d.getMonth() === currentMonth && d.getFullYear() === currentYear) return true;
      }
      if (t.exit_date) {
        const d = new Date(t.exit_date);
        if (d.getDate() === day && d.getMonth() === currentMonth && d.getFullYear() === currentYear) return true;
      }
      return false;
    }) || [];
    return { dueTenants, paidTenants, pendingTenants, contractEvents };
  };

  const monthlySummary = useMemo(() => {
    if (!tenants || !payments) return { totalDue: 0, totalPaid: 0, totalPending: 0, paidCount: 0, pendingCount: 0 };
    const month = currentMonth + 1;
    let totalPaid = 0, totalPending = 0, paidCount = 0, pendingCount = 0;
    tenants.forEach((t) => {
      const p = payments.find((p: any) => p.tenant_id === t.id && p.month === month);
      if (p?.status === "paid" || p?.status === "paid_late") {
        totalPaid += Number(p.amount || t.rent_amount);
        paidCount++;
      } else {
        totalPending += Number(t.rent_amount);
        pendingCount++;
      }
    });
    return { totalDue: totalPaid + totalPending, totalPaid, totalPending, paidCount, pendingCount };
  }, [tenants, payments, currentMonth]);

  // Upcoming due dates (from today forward in current month)
  const upcomingDue = useMemo(() => {
    if (!tenants) return [];
    const startDay = isCurrentMonth ? today.getDate() : 1;
    const results: { day: number; tenant: typeof tenants[0] }[] = [];
    tenants.forEach((t) => {
      if (t.payment_day && t.payment_day >= startDay && t.payment_day <= daysInMonth) {
        const month = currentMonth + 1;
        const p = payments?.find((p: any) => p.tenant_id === t.id && p.month === month);
        if (!p || (p.status !== "paid" && p.status !== "paid_late")) {
          results.push({ day: t.payment_day, tenant: t });
        }
      }
    });
    return results.sort((a, b) => a.day - b.day).slice(0, 10);
  }, [tenants, payments, currentMonth, isCurrentMonth, daysInMonth]);

  const selectedInfo = selectedDay ? getDayInfo(selectedDay) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário de Recebimentos</h1>
            <p className="text-sm text-muted-foreground">Acompanhe os vencimentos de {MONTHS_PT[currentMonth]} de {currentYear}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border rounded-xl px-1 py-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant={isCurrentMonth ? "default" : "ghost"} size="sm" className="rounded-lg px-4" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Calendar */}
        <Card className="rounded-2xl">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{MONTHS_PT[currentMonth]} {currentYear}</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Pago</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Pendente</span>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 border-t border-l">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e-${i}`} className="min-h-[100px] border-b border-r" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const info = getDayInfo(day);
                const isToday = day === today.getDate() && isCurrentMonth;
                const hasEvents = info.dueTenants.length > 0 || info.contractEvents.length > 0;
                const totalEvents = info.dueTenants.length;

                return (
                  <div
                    key={day}
                    onClick={() => hasEvents && setSelectedDay(day)}
                    className={`min-h-[100px] border-b border-r p-1.5 transition-all relative ${
                      hasEvents ? "cursor-pointer hover:bg-accent/50" : ""
                    } ${isToday ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`text-sm font-semibold ${isToday ? "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}>
                        {day}
                      </span>
                      {totalEvents > 0 && (
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded px-1">{totalEvents}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1 overflow-hidden" style={{ maxHeight: "60px" }}>
                      {info.paidTenants.slice(0, 3).map((t) => (
                        <div key={t.id} className="flex items-center gap-1 text-[10px] leading-tight truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-emerald-600 font-medium truncate">{t.name.split(" ")[0]}</span>
                          <span className="text-muted-foreground truncate">C{t.house_number}</span>
                        </div>
                      ))}
                      {info.pendingTenants.slice(0, 3 - info.paidTenants.slice(0, 3).length).map((t) => (
                        <div key={t.id} className="flex items-center gap-1 text-[10px] leading-tight truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                          <span className="text-orange-600 font-medium truncate">{t.name.split(" ")[0]}</span>
                          <span className="text-muted-foreground truncate">C{t.house_number}</span>
                        </div>
                      ))}
                      {totalEvents > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{totalEvents - 3} mais...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Monthly Summary Card */}
          <Card className="rounded-2xl overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 opacity-80" />
                <h3 className="font-bold">Resumo do Mês</h3>
              </div>
              <p className="text-xs opacity-70 uppercase tracking-wider">Total Previsto</p>
              <p className="text-3xl font-bold mt-1">R$ {monthlySummary.totalDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-white/15 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider opacity-70">Recebido</p>
                  <p className="font-bold text-lg">R$ {monthlySummary.totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider opacity-70">Pendente</p>
                  <p className="font-bold text-lg text-orange-200">{monthlySummary.pendingCount} contr.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Due Dates */}
          <Card className="rounded-2xl">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-bold">Próximos Vencimentos</h3>
              </div>
              {upcomingDue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum vencimento próximo.</p>
              ) : (
                <div className="space-y-1">
                  {upcomingDue.map(({ day, tenant: t }) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/tenants/${t.id}`)}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                        {day}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.name.split(" ").slice(0, 2).join(" ")}</p>
                        <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDay} de {MONTHS_PT[currentMonth]} de {currentYear}
            </DialogTitle>
          </DialogHeader>
          {selectedInfo && (
            <ScrollArea className="flex-1 overflow-auto pr-3" style={{ maxHeight: "calc(85vh - 120px)" }}>
              <div className="space-y-4">
                {selectedInfo.paidTenants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="h-4 w-4" /> Pagos ({selectedInfo.paidTenants.length})
                    </h3>
                    {selectedInfo.paidTenants.map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 mb-1 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors" onClick={() => { setSelectedDay(null); navigate(`/tenants/${t.id}`); }}>
                        <div>
                          <span className="text-sm font-medium">{t.name}</span>
                          <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-600">R$ {Number(t.rent_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedInfo.pendingTenants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-orange-500 flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-4 w-4" /> Pendentes ({selectedInfo.pendingTenants.length})
                    </h3>
                    {selectedInfo.pendingTenants.map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-orange-50 dark:bg-orange-500/10 mb-1 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors" onClick={() => { setSelectedDay(null); navigate(`/tenants/${t.id}`); }}>
                        <div>
                          <span className="text-sm font-medium">{t.name}</span>
                          <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                        </div>
                        <span className="text-sm font-semibold text-orange-500">R$ {Number(t.rent_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedInfo.contractEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-warning flex items-center gap-1.5 mb-2">
                      <Home className="h-4 w-4" /> Contratos
                    </h3>
                    {selectedInfo.contractEvents.map((t) => {
                      const isEntry = t.entry_date && new Date(t.entry_date).getDate() === selectedDay;
                      return (
                        <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-warning/5 mb-1 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => { setSelectedDay(null); navigate(`/tenants/${t.id}`); }}>
                          <div>
                            <span className="text-sm font-medium">{t.name}</span>
                            <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${isEntry ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                            {isEntry ? "📥 Entrada" : "📤 Saída"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
