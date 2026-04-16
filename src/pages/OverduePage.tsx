import { useState } from "react";
import { useTenants, useAllPayments, useUpsertPayment } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, MessageCircle, Eye, TrendingUp, TrendingDown, DollarSign, CheckCircle2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { openWhatsApp, getMessageTemplates } from "@/lib/whatsapp";

export default function OverduePage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(year);
  const upsertPayment = useUpsertPayment();
  const navigate = useNavigate();

  // Pay dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payTenant, setPayTenant] = useState<any>(null);
  const [payStatus, setPayStatus] = useState<"paid" | "paid_late">("paid_late");
  const [payLateFee, setPayLateFee] = useState("2");
  const [payInterest, setPayInterest] = useState("1");
  const [payCustomAmount, setPayCustomAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  const getPaymentPattern = (tenantId: string) => {
    const recentPayments: string[] = [];
    for (let m = month - 1; m >= Math.max(1, month - 6); m--) {
      const p = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === m);
      if (p) recentPayments.push(p.status);
    }
    const paidOnTime = recentPayments.filter((s) => s === "paid").length;
    const paidLate = recentPayments.filter((s) => s === "paid_late").length;
    const total = recentPayments.length;
    if (total === 0) return { label: "Novo", color: "secondary" as const, icon: null };
    const ratio = (paidOnTime + paidLate) / total;
    if (ratio >= 0.8 && paidLate <= 1) return { label: "Bom pagador", color: "secondary" as const, icon: TrendingUp, description: "Atraso pontual" };
    if (paidLate > paidOnTime) return { label: "Paga com atraso", color: "warning" as const, icon: TrendingDown, description: "Frequentemente atrasado" };
    if (ratio <= 0.3) return { label: "Inadimplente", color: "destructive" as const, icon: AlertTriangle, description: "Atrasos frequentes" };
    return { label: "Irregular", color: "secondary" as const, icon: AlertTriangle, description: "Pagamento instável" };
  };

  const overdue = tenants?.filter((t) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === month);
    if (payment?.status === "paid" || payment?.status === "paid_late" || payment?.status === "deposit") return false;
    return (t.payment_day || 10) < now.getDate();
  }) || [];

  const calcFees = (amount: number, lateFee = 2, interest = 1) => {
    const fee = amount * (lateFee / 100);
    const int = amount * (interest / 100);
    return { fee, interest: int, total: amount + fee + int };
  };

  const sendOverdueWhatsApp = (t: any) => {
    if (!t.phone) { toast.error("Telefone não cadastrado."); return; }
    const { total } = calcFees(Number(t.rent_amount));
    const templates = getMessageTemplates({
      name: t.name, amount: Number(t.rent_amount), month, year,
      property: t.property?.address || "", houseNumber: t.house_number || "",
      dueDay: t.payment_day || 10, lateFee: 2, interest: 1, totalWithFees: total,
    });
    openWhatsApp({ phone: t.phone, message: templates.overdue });
  };

  const pendingRevenue = overdue.reduce((sum, t) => {
    const { total } = calcFees(Number(t.rent_amount));
    return sum + total;
  }, 0);

  const openPayDialog = (t: any) => {
    setPayTenant(t);
    setPayStatus("paid_late");
    setPayLateFee("2");
    setPayInterest("1");
    setPayCustomAmount("");
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayDialogOpen(true);
  };

  const calcPayAmount = () => {
    if (!payTenant) return 0;
    const base = payCustomAmount ? Number(payCustomAmount) : Number(payTenant.rent_amount);
    if (payStatus === "paid") return base;
    return base + base * (Number(payLateFee) / 100) + base * (Number(payInterest) / 100);
  };

  const confirmPayment = async () => {
    if (!payTenant) return;
    try {
      await upsertPayment.mutateAsync({
        tenant_id: payTenant.id, month, year,
        status: payStatus,
        amount: calcPayAmount(),
        paid_at: payDate,
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inadimplentes</h1>
        <p className="text-sm text-muted-foreground">{MONTHS_PT[month - 1]}/{year}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Inadimplentes</p>
            <p className="text-2xl font-bold text-destructive">{overdue.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Receita Pendente (c/ multa)</p>
            <p className="text-2xl font-bold text-warning">R$ {pendingRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Ativos</p>
            <p className="text-2xl font-bold">{tenants?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {!overdue.length ? (
        <Card><CardContent className="py-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-muted-foreground font-medium">Nenhum inquilino em atraso!</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {overdue.map((t) => {
            const { fee, interest, total } = calcFees(Number(t.rent_amount));
            const pattern = getPaymentPattern(t.id);
            const PatternIcon = pattern.icon;
            const daysLate = now.getDate() - (t.payment_day || 10);
            return (
              <Card key={t.id} className="hover:shadow-md transition-all">
                <CardContent className="pt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive font-bold text-sm shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{t.name}</p>
                          {PatternIcon && (
                            <Badge variant={pattern.color === "warning" ? "outline" : pattern.color} className={`text-[10px] flex items-center gap-1 ${pattern.color === "warning" ? "bg-warning/10 text-warning border-warning/30" : ""}`}>
                              <PatternIcon className="h-3 w-3" />{pattern.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t.property?.address} - Casa {t.house_number}</p>
                        <div className="flex gap-2 mt-2 text-xs flex-wrap">
                          <Badge variant="destructive" className="text-[10px]">{daysLate} dias de atraso</Badge>
                          <span className="px-2 py-0.5 rounded bg-muted text-[10px]">Original: R$ {Number(t.rent_amount).toFixed(2)}</span>
                          <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">+Multa: R$ {fee.toFixed(2)}</span>
                          <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">+Juros: R$ {interest.toFixed(2)}</span>
                          <Badge variant="destructive" className="text-[10px]">Total: R$ {total.toFixed(2)}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => sendOverdueWhatsApp(t)} className="rounded-lg">
                        <MessageCircle className="mr-1 h-3 w-3" />Cobrar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/tenants/${t.id}`)} className="rounded-lg">
                        <Eye className="mr-1 h-3 w-3" />Perfil
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
