import { useState, useMemo } from "react";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, DollarSign, Home, AlertTriangle, CalendarDays, CheckCircle2, Clock, FileText } from "lucide-react";
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

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };
  const goToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

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

  // Monthly summary
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

  const selectedInfo = selectedDay ? getDayInfo(selectedDay) : null;
  const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">Vencimentos e eventos do mês</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday} disabled={isCurrentMonth}>
            <CalendarDays className="h-4 w-4 mr-1" />Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold min-w-[180px] text-center text-lg">{MONTHS_PT[currentMonth]} {currentYear}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Total Esperado</p>
              <p className="font-bold text-sm">R$ {monthlySummary.totalDue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Recebido ({monthlySummary.paidCount})</p>
              <p className="font-bold text-sm text-success">R$ {monthlySummary.totalPaid.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <Clock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Pendente ({monthlySummary.pendingCount})</p>
              <p className="font-bold text-sm text-destructive">R$ {monthlySummary.totalPending.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
              <FileText className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Contratos Ativos</p>
              <p className="font-bold text-sm">{tenants?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-full bg-success" /> Pago</div>
        <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-full bg-destructive" /> Pendente</div>
        <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-full bg-warning" /> Contrato</div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const info = getDayInfo(day);
              const isToday = day === today.getDate() && isCurrentMonth;
              const hasEvents = info.dueTenants.length > 0 || info.contractEvents.length > 0;
              const allPaid = info.dueTenants.length > 0 && info.pendingTenants.length === 0;
              const hasPending = info.pendingTenants.length > 0;
              const isPast = isCurrentMonth && day < today.getDate();

              return (
                <div
                  key={day}
                  onClick={() => hasEvents && setSelectedDay(day)}
                  className={`min-h-[76px] p-1.5 border rounded-lg text-xs transition-all relative ${
                    isToday ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-sm" : "border-border/50"
                  } ${hasEvents ? "cursor-pointer hover:shadow-md hover:border-primary/30" : ""} ${
                    selectedDay === day ? "ring-2 ring-primary" : ""
                  } ${isPast && !hasEvents ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-sm ${isToday ? "text-primary" : ""}`}>{day}</span>
                    {isToday && <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 rounded">HOJE</span>}
                  </div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {allPaid && (
                      <div className="flex items-center gap-0.5 text-[9px] text-success font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        {info.paidTenants.length} pago{info.paidTenants.length > 1 ? "s" : ""}
                      </div>
                    )}
                    {hasPending && info.paidTenants.length > 0 && (
                      <>
                        <div className="flex items-center gap-0.5 text-[9px] text-success font-medium">
                          <CheckCircle2 className="h-3 w-3" />{info.paidTenants.length}
                        </div>
                        <div className="flex items-center gap-0.5 text-[9px] text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3" />{info.pendingTenants.length}
                        </div>
                      </>
                    )}
                    {hasPending && info.paidTenants.length === 0 && (
                      <div className="flex items-center gap-0.5 text-[9px] text-destructive font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {info.pendingTenants.length} pend.
                      </div>
                    )}
                    {info.contractEvents.length > 0 && (
                      <div className="flex items-center gap-0.5 text-[9px] text-warning font-medium">
                        📄 contrato
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDay} de {MONTHS_PT[currentMonth]} de {currentYear}
            </DialogTitle>
          </DialogHeader>
          {selectedInfo && (
            <div className="space-y-4">
              {selectedInfo.paidTenants.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-success flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="h-4 w-4" /> Pagos ({selectedInfo.paidTenants.length})
                  </h3>
                  {selectedInfo.paidTenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-success/5 mb-1 cursor-pointer hover:bg-success/10 transition-colors" onClick={() => { setSelectedDay(null); navigate(`/tenants/${t.id}`); }}>
                      <div>
                        <span className="text-sm font-medium">{t.name}</span>
                        <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                      </div>
                      <span className="text-sm font-semibold text-success">R$ {Number(t.rent_amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedInfo.pendingTenants.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-4 w-4" /> Pendentes ({selectedInfo.pendingTenants.length})
                  </h3>
                  {selectedInfo.pendingTenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5 mb-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => { setSelectedDay(null); navigate(`/tenants/${t.id}`); }}>
                      <div>
                        <span className="text-sm font-medium">{t.name}</span>
                        <p className="text-[11px] text-muted-foreground">Casa {t.house_number}</p>
                      </div>
                      <span className="text-sm font-semibold text-destructive">R$ {Number(t.rent_amount).toFixed(2)}</span>
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
