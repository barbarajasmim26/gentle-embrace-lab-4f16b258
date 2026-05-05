import { useState } from "react";
import { useTenants, useAllPayments, useUpsertPayment } from "@/hooks/use-tenants";
import { useAppSettings, resolveFees } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, MessageCircle, Eye, CheckCircle2, Clock, DollarSign, Home, CalendarDays, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { openWhatsApp, getMessageTemplates } from "@/lib/whatsapp";
import { isOverdue, isPaymentPaid } from "@/lib/payment-status";
import { calculateTenantFees } from "@/lib/fee-utils";
import { supabase } from "@/integrations/supabase/client";

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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
  const [payTenantOverdueMonths, setPayTenantOverdueMonths] = useState<number[]>([]);
  const [payMonth, setPayMonth] = useState<number>(month);
  const [payStatus, setPayStatus] = useState<"paid" | "paid_late">("paid_late");
  const [payLateFee, setPayLateFee] = useState("10");
  const [payInterest, setPayInterest] = useState("1");
  const [payCustomAmount, setPayCustomAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [sendingZapi, setSendingZapi] = useState<string | null>(null);

  // Para cada inquilino, calcular TODOS os meses atrasados (não apenas o atual).
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
    
    let message = templates.overdue;
    if (daysOverdue > 0) {
      message = message.replace("está em atraso.", `está em atraso há ${daysOverdue} dias.`);
    }
    
    openWhatsApp({ phone: t.phone, message });
  };

  const sendZapiBilling = async (t: any) => {
    if (!t.phone) { toast.error("Telefone não cadastrado."); return; }
    setSendingZapi(t.id);
    try {
      const message = `Olá ${t.name}, seu aluguel está vencido. Por favor, regularizar.`;
      const { error } = await supabase.functions.invoke("zapi-send", {
        body: { 
          phone: t.phone, 
          message: message,
          tenantId: t.id 
        }
      });
      if (error) throw error;
      toast.success(`Cobrança enviada para ${t.name} via Z-API!`);
    } catch (e: any) {
      console.error("Erro ao enviar cobrança Z-API:", e);
      toast.error(e?.message || "Erro ao enviar cobrança via Z-API");
    } finally {
      setSendingZapi(null);
    }
  };

  const openPayDialog = (t: any, overdueMonths: number[]) => {
    const { lateFee, interest } = resolveFees(t, settings);
    setPayTenant(t);
    setPayTenantOverdueMonths(overdueMonths);
    setPayMonth(overdueMonths[0] ?? month);
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
      payMonth,
      year,
      payTenant.payment_day || 10,
      payTenant.payment_cycle || "postecipado",
      new Date(payDate + "T12:00:00"),
      Number(payLateFee),
      Number(payInterest)
    );
    return totalAmount;
  };

  const confirmPayment = async () => {
    if (!payTenant) return;
    try {
      await upsertPayment.mutateAsync({
        tenant_id: payTenant.id, month: payMonth, year,
        status: payStatus, amount: calcPayAmount(), paid_at: payDate,
        late_fee_percent: payStatus === "paid_late" ? Number(payLateFee) : 0,
        interest_percent: payStatus === "paid_late" ? Number(payInterest) : 0,
      });
      toast.success(`${payTenant.name} — ${MONTHS_PT[payMonth - 1]}/${year} marcado como pago!`);
      setPayDialogOpen(false);
    } catch (e: any) {
      console.error("Erro ao registrar pagamento:", e);
      toast.error(e?.message || "Erro ao registrar pagamento");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inquilinos em Atraso</h1>
          <p className="text-sm text-muted-foreground">Lista de pagamentos pendentes com multa e juros</p>
        </div>
      </div>

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

      {!overdue.length ? (
        <Card className="rounded-2xl"><CardContent className="py-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-muted-foreground font-medium">Nenhum inquilino em atraso!</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {overdueList.map(({ tenant: t, overdueMonths }) => {
            const rent = Number(t.rent_amount);
            const perMonth = overdueMonths.map((m) => ({ m, ...getFees(t, m) }));
            const totalLate = perMonth.reduce((s, x) => s + x.lateFeeAmount, 0);
            const totalInterest = perMonth.reduce((s, x) => s + x.interestAmount, 0);
            const totalAll = perMonth.reduce((s, x) => s + x.totalAmount, 0);
            const maxDays = Math.max(...perMonth.map((x) => x.daysOverdue));
            return (
              <Card key={t.id} className="rounded-2xl hover:shadow-lg transition-all">
                <CardContent className="py-5 px-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted shrink-0">
                        <Home className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-bold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.property?.address} — Casa {t.house_number}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">Vence dia {t.payment_day}</Badge>
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                            {overdueMonths.length} {overdueMonths.length === 1 ? "mês" : "meses"} atrasado{overdueMonths.length === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                            até {maxDays} dias
                          </Badge>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {overdueMonths.map((m) => (
                            <Badge key={m} variant="secondary" className="text-[10px]">
                              {MONTHS_PT[m - 1]}/{year}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Aluguel</p>
                        <p className="font-bold text-sm">R$ {rent.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-destructive uppercase">Multa/Juros</p>
                        <p className="font-bold text-sm text-destructive">R$ {(totalLate + totalInterest).toFixed(2)}</p>
                      </div>
                      <div className="text-center bg-destructive/5 px-3 py-1 rounded-xl border border-destructive/10">
                        <p className="text-[10px] font-semibold text-destructive uppercase">Total</p>
                        <p className="font-bold text-lg text-destructive">R$ {totalAll.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2" onClick={() => navigate(`/tenants/${t.id}`)}>
                        <Eye className="h-4 w-4" /> Perfil
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => sendOverdueWhatsApp(t)}>
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="rounded-xl h-10 gap-2 bg-emerald-600 hover:bg-emerald-700" 
                        onClick={() => sendZapiBilling(t)}
                        disabled={sendingZapi === t.id}
                      >
                        <Send className={`h-4 w-4 ${sendingZapi === t.id ? "animate-pulse" : ""}`} /> 
                        Cobrança Auto
                      </Button>
                      <Button variant="default" size="sm" className="rounded-xl h-10 gap-2 shadow-md" onClick={() => openPayDialog(t, overdueMonths)}>
                        <DollarSign className="h-4 w-4" /> Baixar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Confirmar Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 bg-muted/50 rounded-2xl border border-muted-foreground/10">
              <p className="text-sm font-bold">{payTenant?.name}</p>
              <p className="text-xs text-muted-foreground">{payTenant?.property?.address}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Mês de Referência</Label>
                <select className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm" value={payMonth} onChange={(e) => setPayMonth(Number(e.target.value))}>
                  {payTenantOverdueMonths.map((m) => (
                    <option key={m} value={m}>{MONTHS_PT[m - 1]}/{year}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data do Pagamento</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="rounded-xl h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Status do Recebimento</Label>
              <div className="flex gap-2 p-1 bg-muted rounded-xl">
                <Button variant={payStatus === "paid" ? "default" : "ghost"} size="sm" className="flex-1 rounded-lg text-xs h-8" onClick={() => setPayStatus("paid")}>No Prazo</Button>
                <Button variant={payStatus === "paid_late" ? "default" : "ghost"} size="sm" className="flex-1 rounded-lg text-xs h-8" onClick={() => setPayStatus("paid_late")}>Com Atraso</Button>
              </div>
            </div>

            {payStatus === "paid_late" && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Multa (%)</Label>
                  <Input type="number" value={payLateFee} onChange={(e) => setPayLateFee(e.target.value)} className="rounded-xl h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Juros p/ dia (%)</Label>
                  <Input type="number" step="0.1" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} className="rounded-xl h-10" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Valor Base (Opcional)</Label>
              <Input type="number" placeholder={`Original: R$ ${payTenant?.rent_amount}`} value={payCustomAmount} onChange={(e) => setPayCustomAmount(e.target.value)} className="rounded-xl h-10" />
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-700">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-wider">Total a Receber</span>
              </div>
              <p className="text-2xl font-black text-emerald-700">
                R$ {calcPayAmount().toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <Button className="w-full h-12 rounded-2xl font-bold text-lg shadow-lg" onClick={confirmPayment}>
              Confirmar Recebimento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
