import { useState } from "react";
import { useTenants, useAllPayments, useUpsertPayment } from "@/hooks/use-tenants";
import { useAppSettings, resolveFees } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, MessageCircle, Eye, CheckCircle2, Clock, DollarSign, Home, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { openWhatsApp, getMessageTemplates } from "@/lib/whatsapp";
import { isOverdue, isPaymentPaid } from "@/lib/payment-status";
import { calculateTenantFees } from "@/lib/fee-utils";

export default function OverduePage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(year);
  const upsertPayment = useUpsertPayment();
  const { data: settings } = useAppSettings();
  const navigate = useNavigate();

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payTenant, setPayTenant] = useState<any>(null);
  const [payStatus, setPayStatus] = useState<"paid" | "paid_late">("paid_late");
  const [payLateFee, setPayLateFee] = useState("10");
  const [payInterest, setPayInterest] = useState("1");
  const [payCustomAmount, setPayCustomAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  // Para cada inquilino, calcular TODOS os meses atrasados (não apenas o atual).
  // Verifica de janeiro até o mês atual: se não pago E vencido → atrasado.
  type OverdueItem = { tenant: any; overdueMonths: number[] };
  const overdueList: OverdueItem[] = (tenants || [])
    .map((t) => {
      const months: number[] = [];
      for (let m = 1; m <= month; m++) {
        const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === m);
        if (isPaymentPaid(payment?.status) || payment?.status === "deposit") continue;
        if (isOverdue(m, year, t.payment_day || 10, t.payment_cycle, now)) {
          months.push(m);
        }
      }
      return { tenant: t, overdueMonths: months };
    })
    .filter((x) => x.overdueMonths.length > 0);

  // Lista plana usada em vários pontos da UI já existente
  const overdue = overdueList.map((x) => x.tenant);

  const getFees = (t: any, refMonth: number = month, date: Date = now) => {
    const { lateFee, interest } = resolveFees(t, settings);
    return calculateTenantFees(
      Number(t.rent_amount),
      refMonth,
      year,
      t.payment_day || 10,
      t.payment_cycle || "postecipado",
      date,
      lateFee,
      interest,
    );
  };

  // Receita pendente = soma de TODOS os meses atrasados de todos
  const pendingRevenue = overdueList.reduce((sum, item) => {
    return sum + item.overdueMonths.reduce((s, m) => s + getFees(item.tenant, m).totalAmount, 0);
  }, 0);

  const sendOverdueWhatsApp = (t: any) => {
    if (!t.phone) { toast.error("Telefone não cadastrado."); return; }
    const { totalAmount, daysOverdue } = getFees(t);
    const templates = getMessageTemplates({
      name: t.name, amount: Number(t.rent_amount), month, year,
      property: t.property?.address || "", houseNumber: t.house_number || "",
      dueDay: t.payment_day || 10, lateFee: 10, interest: 1, totalWithFees: totalAmount,
    });
    
    // Adiciona informação de dias de atraso se for relevante
    let message = templates.overdue;
    if (daysOverdue > 0) {
      message = message.replace("está em atraso.", `está em atraso há ${daysOverdue} dias.`);
    }
    
    openWhatsApp({ phone: t.phone, message });
  };

  const openPayDialog = (t: any) => {
    const { lateFee, interest } = resolveFees(t, settings);
    setPayTenant(t);
    setPayStatus("paid_late");
    setPayLateFee(String(lateFee));
    setPayInterest(String(interest));
    setPayCustomAmount("");
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayDialogOpen(true);
  };

  const calcPayAmount = () => {
    if (!payTenant) return 0;
    const base = payCustomAmount ? Number(payCustomAmount) : Number(payTenant.rent_amount);
    if (payStatus === "paid") return base;
    
    const { totalAmount } = calculateTenantFees(
      base,
      month,
      year,
      payTenant.payment_day || 10,
      payTenant.payment_cycle || "postecipado",
      new Date(payDate + "T12:00:00"), // Evita problemas de fuso horário
      Number(payLateFee),
      Number(payInterest)
    );
    return totalAmount;
  };

  const confirmPayment = async () => {
    if (!payTenant) return;
    try {
      await upsertPayment.mutateAsync({
        tenant_id: payTenant.id, month, year,
        status: payStatus, amount: calcPayAmount(), paid_at: payDate,
        late_fee_percent: payStatus === "paid_late" ? Number(payLateFee) : 0,
        interest_percent: payStatus === "paid_late" ? Number(payInterest) : 0,
      });
      toast.success(`${payTenant.name} marcado como pago!`);
      setPayDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inquilinos em Atraso</h1>
          <p className="text-sm text-muted-foreground">Lista de pagamentos pendentes com multa e juros</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-0 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider opacity-70">Total em Atraso</p>
              <p className="text-3xl font-bold mt-1">{overdue.length}</p>
            </div>
            <AlertTriangle className="h-10 w-10 opacity-30" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-lg">
          <CardContent className="pt-5 pb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider opacity-70">Receita Pendente</p>
              <p className="text-3xl font-bold mt-1">R$ {pendingRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
            <DollarSign className="h-10 w-10 opacity-30" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider opacity-70">Mês de Referência</p>
              <p className="text-3xl font-bold mt-1">{month}/{year}</p>
            </div>
            <CalendarDays className="h-10 w-10 opacity-30" />
          </CardContent>
        </Card>
      </div>

      {/* Tenant Cards */}
      {!overdue.length ? (
        <Card className="rounded-2xl"><CardContent className="py-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-muted-foreground font-medium">Nenhum inquilino em atraso!</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {overdue.map((t) => {
            const rent = Number(t.rent_amount);
            const { lateFeeAmount, interestAmount, totalAmount, daysOverdue } = getFees(t);
            return (
              <Card key={t.id} className="rounded-2xl hover:shadow-lg transition-all">
                <CardContent className="py-5 px-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Tenant Info */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted shrink-0">
                        <Home className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-bold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.property?.address} — Casa {t.house_number}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">Venceu dia {t.payment_day}</Badge>
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">{daysOverdue} dias de atraso</Badge>
                        </div>
                      </div>
                    </div>

                    {/* Fee Breakdown */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Original</p>
                        <p className="font-bold text-sm">R$ {rent.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-destructive uppercase">Multa (10%)</p>
                        <p className="font-bold text-sm text-destructive">R$ {lateFeeAmount.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-destructive uppercase">Juros (1%/mês)</p>
                        <p className="font-bold text-sm text-destructive">R$ {interestAmount.toFixed(2)}</p>
                      </div>
                      <div className="text-center bg-destructive/10 rounded-xl px-3 py-1.5">
                        <p className="text-[10px] font-semibold text-destructive uppercase">Total</p>
                        <p className="font-bold text-lg text-destructive">R$ {totalAmount.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white gap-1" onClick={() => openPayDialog(t)}>
                        <CheckCircle2 className="h-4 w-4" /> Marcar Pago
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg bg-blue-500 hover:bg-blue-600 text-white border-0 gap-1" onClick={() => sendOverdueWhatsApp(t)}>
                        <MessageCircle className="h-4 w-4" /> Cobrar
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => navigate(`/tenants/${t.id}`)}>
                        Ver Perfil
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" /> Registrar Pagamento
            </DialogTitle>
          </DialogHeader>
          {payTenant && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold text-sm">{payTenant.name}</p>
                <p className="text-xs text-muted-foreground">Aluguel: R$ {Number(payTenant.rent_amount).toFixed(2)} · Vencimento: Dia {payTenant.payment_day}</p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={payStatus === "paid" ? "default" : "outline"} className={`rounded-lg ${payStatus === "paid" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`} onClick={() => setPayStatus("paid")}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Pago em dia
                  </Button>
                  <Button variant={payStatus === "paid_late" ? "default" : "outline"} className={`rounded-lg ${payStatus === "paid_late" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`} onClick={() => setPayStatus("paid_late")}>
                    <Clock className="mr-1 h-4 w-4" />Pago em atraso
                  </Button>
                </div>
              </div>
              <div><Label>Data do pagamento</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
              {payStatus === "paid_late" && (
                <div className="space-y-3 p-3 rounded-lg border border-orange-300/30 bg-orange-50 dark:bg-orange-500/10">
                  <p className="text-sm font-semibold text-orange-600">Multa e Juros (Cálculo Diário)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Multa (%)</Label><Input type="number" step="0.1" value={payLateFee} onChange={(e) => setPayLateFee(e.target.value)} /></div>
                    <div><Label className="text-xs">Juros Mensal (%)</Label><Input type="number" step="0.1" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} /></div>
                  </div>
                  <div className="text-sm space-y-1">
                    {(() => {
                      const base = payCustomAmount ? Number(payCustomAmount) : Number(payTenant.rent_amount);
                      const { lateFeeAmount, interestAmount, totalAmount, daysOverdue } = calculateTenantFees(
                        base,
                        month,
                        year,
                        payTenant.payment_day || 10,
                        payTenant.payment_cycle || "postecipado",
                        new Date(payDate + "T12:00:00"),
                        Number(payLateFee),
                        Number(payInterest)
                      );
                      return (
                        <>
                          <div className="flex justify-between"><span className="text-muted-foreground">Atraso:</span><span className="font-semibold">{daysOverdue} dias</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Original:</span><span>R$ {base.toFixed(2)}</span></div>
                          <div className="flex justify-between text-orange-600"><span>Multa ({payLateFee}%):</span><span>R$ {lateFeeAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between text-orange-600"><span>Juros ({payInterest}%/mês):</span><span>R$ {interestAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total:</span><span>R$ {totalAmount.toFixed(2)}</span></div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
              <div><Label>Valor pago (opcional)</Label><Input type="number" step="0.01" placeholder={calcPayAmount().toFixed(2)} value={payCustomAmount} onChange={(e) => setPayCustomAmount(e.target.value)} /></div>
              <Button className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white" onClick={confirmPayment} disabled={upsertPayment.isPending}>
                {upsertPayment.isPending ? "Salvando..." : `Confirmar — R$ ${calcPayAmount().toFixed(2)}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
