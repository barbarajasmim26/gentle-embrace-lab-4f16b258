import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenant, usePayments, useUpdateTenant, useUpsertPayment, useProperties, useAllPayments } from "@/hooks/use-tenants";
import { useDocuments } from "@/hooks/use-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Edit, MessageCircle, Receipt, UserX, Upload, FileText, ExternalLink, Phone, DollarSign, Calendar, MapPin, User, TrendingUp, TrendingDown, AlertTriangle, StickyNote, CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp, openWhatsAppChat, getMessageTemplates } from "@/lib/whatsapp";
import { generateReceipt } from "@/lib/receipt-generator";
import { extractSupabaseStoragePath, isAbsoluteHttpUrl } from "@/lib/document-url";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, PAYMENT_CYCLE_LABELS, isPaymentPaid } from "@/lib/payment-status";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type PaymentStatusType = "paid" | "paid_late" | "pending" | "deposit";

const STATUS_CONFIG: Record<string, { label: string; colorClass: string; icon: any }> = {
  paid: { label: "Em dia", colorClass: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  paid_late: { label: "Atrasado", colorClass: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  pending: { label: "Pend.", colorClass: "bg-muted text-muted-foreground border-border", icon: Clock },
  overdue: { label: "Atrasado", colorClass: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  deposit: { label: "Caução", colorClass: "bg-primary/10 text-primary border-primary/30", icon: DollarSign },
};

export default function TenantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant, isLoading } = useTenant(id!);
  const { data: properties } = useProperties();
  const { data: documents, refetch: refetchDocs } = useDocuments(id);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: payments } = usePayments(id, year);
  const { data: allPayments } = useAllPayments(currentYear);
  const updateTenant = useUpdateTenant();
  const upsertPayment = useUpsertPayment();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payMonth, setPayMonth] = useState(0);
  const [payStatus, setPayStatus] = useState<PaymentStatusType>("paid");
  const [payLateFee, setPayLateFee] = useState("10");
  const [payInterest, setPayInterest] = useState("1");
  const [payCustomAmount, setPayCustomAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  // Payment detail view
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMonth, setDetailMonth] = useState(0);

  const now = new Date();
  const month = now.getMonth() + 1;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!tenant) return <p className="p-6">Inquilino não encontrado.</p>;

  const rentAmount = Number(tenant.rent_amount);

  // Summary stats
  const totalPaidYear = payments?.filter((p) => isPaymentPaid(p.status)).reduce((sum, p) => sum + Number(p.amount || rentAmount), 0) || 0;
  
  // Meses pendentes: conta apenas meses que já deveriam ter sido pagos e não estão marcados como pagos
  const totalPendingYear = Array.from({ length: month }).filter(m => {
    const mNum = m + 1;
    const p = payments?.find(pay => pay.month === mNum);
    if (isPaymentPaid(p?.status) || p?.status === "deposit") return false;
    return isOverdue(mNum, year, tenant.payment_day || 10, tenant.payment_cycle, now);
  }).length;

  const paidMonths = payments?.filter((p) => isPaymentPaid(p.status)).length || 0;
  const lastPayment = payments?.filter((p) => isPaymentPaid(p.status)).sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""))[0];

  // Payment pattern
  const getPaymentPattern = () => {
    if (tenant.status === "irregular") return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30", desc: "Pagamento instável" };
    
    if (!allPayments) return null;
    const recentPayments: string[] = [];
    for (let m = month - 1; m >= Math.max(1, month - 6); m--) {
      const p = allPayments.find((pay: any) => pay.tenant_id === id && pay.month === m);
      if (p) recentPayments.push(p.status);
    }
    const paidOnTime = recentPayments.filter((s) => s === "paid").length;
    const paidLate = recentPayments.filter((s) => s === "paid_late").length;
    const total = recentPayments.length;
    if (total === 0) return null;
    const ratio = (paidOnTime + paidLate) / total;
    if (ratio >= 0.8 && paidLate <= 1) return { label: "Bom pagador", icon: TrendingUp, colorClass: "bg-success/10 text-success border-success/30", desc: "Costuma pagar em dia" };
    if (paidLate > paidOnTime) return { label: "Paga com atraso", icon: TrendingDown, colorClass: "bg-warning/10 text-warning border-warning/30", desc: "Paga, mas frequentemente atrasado" };
    if (ratio <= 0.3) return { label: "Inadimplente", icon: AlertTriangle, colorClass: "bg-destructive/10 text-destructive border-destructive/30", desc: "Atrasos frequentes" };
    return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30", desc: "Pagamento instável" };
  };

  const pattern = getPaymentPattern();

  const getPayment = (m: number) => payments?.find((p) => p.month === m);
  const getPaymentStatus = (m: number) => {
    const p = getPayment(m);
    if (p) return p.status;
    if (year !== currentYear) return "pending";
    if (isOverdue(m, year, tenant.payment_day || 10, tenant.payment_cycle, now)) return "overdue";
    return "pending";
  };

  const calcFinalAmount = () => {
    const base = payCustomAmount ? Number(payCustomAmount) : rentAmount;
    if (payStatus === "paid" || payStatus === "pending" || payStatus === "deposit") return base;
    const feePercent = Number(payLateFee) || 0;
    const intPercent = Number(payInterest) || 0;
    return base + base * (feePercent / 100) + base * (intPercent / 100);
  };

  const handlePaymentClick = (m: number) => {
    const existing = getPayment(m);
    const currentStatus = existing?.status || "pending";
    setPayMonth(m);
    setPayStatus(currentStatus === "pending" ? "paid" : currentStatus as PaymentStatusType);
    setPayLateFee("10");
    setPayInterest("1");
    setPayCustomAmount("");
    setPayDate(existing?.paid_at || new Date().toISOString().split("T")[0]);
    setPayDialogOpen(true);
  };

  const openPayDetail = (m: number) => {
    setDetailMonth(m);
    setDetailOpen(true);
  };

  const confirmPayment = async () => {
    const finalAmount = calcFinalAmount();
    try {
      await upsertPayment.mutateAsync({
        tenant_id: id!, month: payMonth, year,
        status: payStatus,
        amount: payStatus === "pending" ? rentAmount : finalAmount,
        paid_at: payStatus === "pending" ? null : payDate,
        late_fee_percent: payStatus === "paid_late" ? Number(payLateFee) : 0,
        interest_percent: payStatus === "paid_late" ? Number(payInterest) : 0,
      });
      const statusLabels: Record<string, string> = { paid: "pago em dia", paid_late: "pago com atraso", pending: "pendente", deposit: "caução" };
      toast.success(`${MONTHS[payMonth - 1]} marcado como ${statusLabels[payStatus]}!`);
      setPayDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = () => {
    setEditForm({
      name: tenant.name, phone: tenant.phone || "", house_number: tenant.house_number || "",
      rent_amount: tenant.rent_amount, deposit: tenant.deposit || "", payment_day: tenant.payment_day || 10,
      entry_date: tenant.entry_date || "", exit_date: tenant.exit_date || "", cpf: tenant.cpf || "",
      property_id: tenant.property_id || "", notes: tenant.notes || "",
      payment_cycle: tenant.payment_cycle || "postecipado",
      status: tenant.status || "active",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      await updateTenant.mutateAsync({
        id: id!, name: editForm.name, phone: editForm.phone || null,
        house_number: editForm.house_number || null, rent_amount: parseFloat(editForm.rent_amount),
        deposit: editForm.deposit ? parseFloat(editForm.deposit) : null,
        payment_day: parseInt(editForm.payment_day) || 10,
        entry_date: editForm.entry_date || null, exit_date: editForm.exit_date || null,
        cpf: editForm.cpf || null, property_id: editForm.property_id || null,
        notes: editForm.notes || null,
        payment_cycle: editForm.payment_cycle || "postecipado",
        status: editForm.status || "active",
      });
      toast.success("Salvo!");
      setEditOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const openNotesDialog = () => {
    setNotesValue(tenant.notes || "");
    setNotesOpen(true);
  };

  const saveNotes = async () => {
    try {
      await updateTenant.mutateAsync({ id: id!, notes: notesValue || null });
      toast.success("Observações salvas!");
      setNotesOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const moveToFormer = async () => {
    if (!confirm("Mover para ex-inquilino?")) return;
    try {
      await updateTenant.mutateAsync({ id: id!, status: "former" });
      toast.success("Movido para ex-inquilinos.");
      navigate("/tenants");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReceipt = (m: number) => {
    const p = getPayment(m);
    if (!p) return;
    generateReceipt({
      tenantName: tenant.name,
      amount: Number(p.amount || rentAmount),
      month: m,
      year: year,
      propertyAddress: tenant.property?.address || "",
      houseNumber: tenant.house_number || "",
      paymentDate: p.paid_at || new Date().toISOString().split("T")[0],
    });
  };

  const detailPayment = getPayment(detailMonth);
  const detailConfig = detailPayment ? STATUS_CONFIG[detailPayment.status] || STATUS_CONFIG.pending : STATUS_CONFIG.pending;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header & Quick Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/tenants")} className="rounded-xl hover:bg-muted/50">
            <ArrowLeft className="mr-1 h-4 w-4" />Voltar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl border-primary/20 hover:bg-primary/5" onClick={handleEdit}>
              <Edit className="mr-1 h-4 w-4" />Editar
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5" onClick={moveToFormer}>
              <UserX className="mr-1 h-4 w-4" />Finalizar
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold shadow-lg shadow-primary/20">
            {tenant.name.charAt(0)}
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{tenant.name}</h1>
            <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-lg text-xs">
                <MapPin className="h-3.5 w-3.5" />{tenant.property?.name || tenant.property?.address} · Casa {tenant.house_number}
              </span>
              {tenant.phone && (
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-lg text-xs">
                  <Phone className="h-3.5 w-3.5" />{tenant.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-0 bg-primary/5 shadow-none">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Total Pago {year}</p>
                <p className="text-lg font-bold text-primary">R$ {totalPaidYear.toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 bg-destructive/5 shadow-none">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Meses pendentes</p>
                <p className="text-lg font-bold text-destructive">{totalPendingYear}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 bg-success/5 shadow-none">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Meses pagos</p>
                <p className="text-lg font-bold text-success">{paidMonths}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 bg-accent/5 shadow-none">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Status</p>
                <div className="flex justify-center mt-1">
                  {pattern && (
                    <Badge variant="outline" className={`text-[10px] ${pattern.colorClass}`}>
                      <pattern.icon className="h-3 w-3 mr-1" />{pattern.label}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Calendar */}
          <Card className="rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />Pagamentos {year}
              </CardTitle>
              <div className="flex items-center gap-1 border rounded-lg p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear(year - 1)}><ArrowLeft className="h-3 w-3" /></Button>
                <span className="text-xs font-bold px-2">{year}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear(year + 1)} disabled={year >= currentYear}><Edit className="h-3 w-3 rotate-180" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {MONTHS.map((m, i) => {
                  const mNum = i + 1;
                  const status = getPaymentStatus(mNum);
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                  const isCurrent = year === currentYear && mNum === month;

                  return (
                    <div
                      key={m}
                      onClick={() => handlePaymentClick(mNum)}
                      onDoubleClick={() => openPayDetail(mNum)}
                      className={`group relative flex flex-col items-center p-3 rounded-2xl border transition-all cursor-pointer select-none hover:shadow-md ${isCurrent ? "border-primary/50 ring-1 ring-primary/20" : ""} ${config.colorClass}`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">{m}</span>
                      <config.icon className="h-5 w-5 mb-2" />
                      <span className="text-[10px] font-semibold">{config.label}</span>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit className="h-2.5 w-2.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 p-4 rounded-xl bg-muted/30 border border-dashed flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Dica de Gestão</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">Clique em um mês para registrar pagamento. Clique duas vezes para ver detalhes e gerar recibo.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Info Card */}
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Informações Gerais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { icon: DollarSign, label: "Aluguel", value: `R$ ${rentAmount.toFixed(2)}`, colorClass: "text-emerald-600" },
                  { icon: DollarSign, label: "Caução", value: tenant.deposit ? `R$ ${Number(tenant.deposit).toFixed(2)}` : "Não informado", colorClass: "text-primary" },
                  { icon: Calendar, label: "Dia de Pagamento", value: `Todo dia ${tenant.payment_day}`, colorClass: "text-blue-600" },
                  { icon: Clock, label: "Ciclo", value: tenant.payment_cycle === "antecipado" ? "Paga e mora" : "Mora e paga", colorClass: "text-accent" },
                  { icon: User, label: "CPF", value: tenant.cpf || "Não informado", colorClass: "text-muted-foreground" },
                  { icon: MapPin, label: "Entrada", value: tenant.entry_date ? new Date(tenant.entry_date + "T12:00:00").toLocaleDateString("pt-BR") : "Não informada", colorClass: "text-muted-foreground" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-muted last:border-0">
                    <span className="flex items-center gap-2 text-muted-foreground"><item.icon className="h-4 w-4" />{item.label}</span>
                    <span className={`font-semibold ${item.colorClass}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full rounded-xl gap-2" onClick={openNotesDialog}>
                <StickyNote className="h-4 w-4" />Observações
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Registrar Pagamento — {MONTHS[payMonth - 1]}/{year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold text-sm">{tenant.name}</p>
              <p className="text-xs text-muted-foreground">Aluguel: R$ {rentAmount.toFixed(2)} · Vencimento: Dia {tenant.payment_day}</p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Status do pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={payStatus === "paid" ? "default" : "outline"}
                  className={`rounded-lg ${payStatus === "paid" ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
                  onClick={() => setPayStatus("paid")}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />Pago em dia
                </Button>
                <Button
                  variant={payStatus === "paid_late" ? "default" : "outline"}
                  className={`rounded-lg ${payStatus === "paid_late" ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}`}
                  onClick={() => setPayStatus("paid_late")}
                >
                  <Clock className="mr-1 h-4 w-4" />Pago em atraso
                </Button>
                <Button
                  variant={payStatus === "pending" ? "default" : "outline"}
                  className={`rounded-lg ${payStatus === "pending" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
                  onClick={() => setPayStatus("pending")}
                >
                  <XCircle className="mr-1 h-4 w-4" />Pendente
                </Button>
                <Button
                  variant={payStatus === "deposit" ? "default" : "outline"}
                  className={`rounded-lg ${payStatus === "deposit" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
                  onClick={() => setPayStatus("deposit")}
                >
                  <DollarSign className="mr-1 h-4 w-4" />Caução
                </Button>
              </div>
            </div>

            {payStatus !== "pending" && (
              <div>
                <Label>Data do pagamento</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            )}

            {payStatus === "paid_late" && (
              <div className="space-y-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
                <p className="text-sm font-semibold text-warning">Multa e Juros</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Multa (%)</Label>
                    <Input type="number" step="0.1" value={payLateFee} onChange={(e) => setPayLateFee(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Juros (%)</Label>
                    <Input type="number" step="0.1" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} />
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Original:</span><span>R$ {rentAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between text-warning"><span>Multa ({payLateFee}%):</span><span>R$ {(rentAmount * (Number(payLateFee) / 100)).toFixed(2)}</span></div>
                  <div className="flex justify-between text-warning"><span>Juros ({payInterest}%):</span><span>R$ {(rentAmount * (Number(payInterest) / 100)).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total:</span><span>R$ {calcFinalAmount().toFixed(2)}</span></div>
                </div>
              </div>
            )}

            {payStatus !== "pending" && (
              <div>
                <Label>Valor pago (opcional, se diferente)</Label>
                <Input type="number" step="0.01" placeholder={calcFinalAmount().toFixed(2)} value={payCustomAmount} onChange={(e) => setPayCustomAmount(e.target.value)} />
              </div>
            )}

            <Button className={`w-full rounded-xl ${payStatus === "pending" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-success hover:bg-success/90 text-success-foreground"}`} onClick={confirmPayment} disabled={upsertPayment.isPending}>
              {upsertPayment.isPending ? "Salvando..." : payStatus === "pending" ? "Confirmar — Pendente" : `Confirmar — R$ ${calcFinalAmount().toFixed(2)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes — {MONTHS[detailMonth - 1]}/{year}</DialogTitle>
          </DialogHeader>
          {detailPayment ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={detailConfig.colorClass}>
                  <detailConfig.icon className="h-3 w-3 mr-1" />{detailConfig.label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Valor pago:</span><p className="font-semibold">R$ {Number(detailPayment.amount || rentAmount).toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">Data:</span><p className="font-semibold">{detailPayment.paid_at ? new Date(detailPayment.paid_at + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                {detailPayment.status === "paid_late" && (
                  <>
                    <div><span className="text-muted-foreground">Multa:</span><p className="font-semibold text-warning">{detailPayment.late_fee_percent}%</p></div>
                    <div><span className="text-muted-foreground">Juros:</span><p className="font-semibold text-warning">{detailPayment.interest_percent}%</p></div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => {
                  setDetailOpen(false);
                  setPayMonth(detailMonth);
                  setPayStatus(detailPayment?.status === "paid_late" ? "paid_late" : "paid");
                  setPayLateFee(String(detailPayment?.late_fee_percent ?? 10));
                  setPayInterest(String(detailPayment?.interest_percent ?? 1));
                  setPayCustomAmount("");
                  setPayDate(detailPayment?.paid_at || new Date().toISOString().split("T")[0]);
                  setPayDialogOpen(true);
                }}>
                  <Edit className="mr-1 h-3 w-3" />Editar pagamento
                </Button>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => handleReceipt(detailMonth)}>
                  <Receipt className="mr-1 h-3 w-3" />Gerar recibo
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Inquilino</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><Label>CPF</Label><Input value={editForm.cpf || ""} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} /></div>
            <div><Label>Telefone / WhatsApp</Label><Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div>
              <Label>Condomínio / Propriedade</Label>
              <Select value={editForm.property_id || ""} onValueChange={(v) => setEditForm({ ...editForm, property_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
                <SelectContent>{properties?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name || p.address}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label>Casa</Label><Input value={editForm.house_number || ""} onChange={(e) => setEditForm({ ...editForm, house_number: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Aluguel</Label><Input type="number" value={editForm.rent_amount || ""} onChange={(e) => setEditForm({ ...editForm, rent_amount: e.target.value })} /></div>
              <div><Label>Caução</Label><Input type="number" value={editForm.deposit || ""} onChange={(e) => setEditForm({ ...editForm, deposit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dia Pagamento</Label><Input type="number" value={editForm.payment_day || ""} onChange={(e) => setEditForm({ ...editForm, payment_day: e.target.value })} /></div>
              <div>
                <Label>Ciclo de Pagamento</Label>
                <Select value={editForm.payment_cycle || "postecipado"} onValueChange={(v) => setEditForm({ ...editForm, payment_cycle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="antecipado">Paga e mora (antecipado)</SelectItem>
                    <SelectItem value="postecipado">Mora e paga (postecipado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Comportamento de Pagamento</Label>
              <Select value={editForm.status || "active"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Normal (Automático)</SelectItem>
                  <SelectItem value="irregular">Irregular - Pagamento instável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entrada</Label><Input type="date" value={editForm.entry_date || ""} onChange={(e) => setEditForm({ ...editForm, entry_date: e.target.value })} /></div>
              <div><Label>Saída</Label><Input type="date" value={editForm.exit_date || ""} onChange={(e) => setEditForm({ ...editForm, exit_date: e.target.value })} /></div>
            </div>
            <div><Label>Observações</Label><Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Anotações importantes..." rows={3} /></div>
            <Button className="w-full rounded-xl" onClick={saveEdit} disabled={updateTenant.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><StickyNote className="h-5 w-5 text-primary" />Observações</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Anotações sobre o inquilino, imóvel ou contrato..." rows={6} />
            <Button className="w-full rounded-xl" onClick={saveNotes} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Salvando..." : "Salvar Observações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
