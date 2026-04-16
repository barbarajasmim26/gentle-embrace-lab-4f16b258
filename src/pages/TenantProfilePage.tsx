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

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type PaymentStatusType = "paid" | "paid_late" | "pending" | "deposit";

const STATUS_CONFIG: Record<string, { label: string; colorClass: string; icon: any }> = {
  paid: { label: "Em dia", colorClass: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  paid_late: { label: "Atrasado", colorClass: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  pending: { label: "Pend.", colorClass: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
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

  // Single click timeout ref (must be before early returns)
  

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
  const totalPaidYear = payments?.filter((p) => p.status === "paid" || p.status === "paid_late").reduce((sum, p) => sum + Number(p.amount || rentAmount), 0) || 0;
  const totalPendingYear = payments?.filter((p) => p.status === "pending").length || 0;
  const paidMonths = payments?.filter((p) => p.status === "paid" || p.status === "paid_late").length || 0;
  const lastPayment = payments?.filter((p) => p.status === "paid" || p.status === "paid_late").sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""))[0];

  // Payment pattern
  const getPaymentPattern = () => {
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
  const getPaymentStatus = (m: number) => getPayment(m)?.status || "pending";

  // Calculate late fee amount
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

    // Always open dialog with all status options
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

  const sendWhatsApp = () => {
    if (!tenant.phone) { toast.error("Telefone não cadastrado."); return; }
    const templates = getMessageTemplates({
      name: tenant.name, amount: rentAmount,
      month: month, year: currentYear,
      property: tenant.property?.address || "", houseNumber: tenant.house_number || "",
      dueDay: tenant.payment_day || 10,
    });
    openWhatsApp({ phone: tenant.phone, message: templates.reminder });
  };

  const sendOverdueWhatsApp = () => {
    if (!tenant.phone) { toast.error("Telefone não cadastrado."); return; }
    const fee = rentAmount * 0.10;
    const interest = rentAmount * 0.01;
    const total = rentAmount + fee + interest;
    const templates = getMessageTemplates({
      name: tenant.name, amount: rentAmount,
      month, year: currentYear,
      property: tenant.property?.address || "", houseNumber: tenant.house_number || "",
      dueDay: tenant.payment_day || 10,
      lateFee: 10, interest: 1, totalWithFees: total,
    });
    openWhatsApp({ phone: tenant.phone, message: templates.overdue });
  };

  const openWhatsAppDirect = () => {
    if (!tenant.phone) { toast.error("Telefone não cadastrado."); return; }
    openWhatsAppChat(tenant.phone);
  };

  const handleReceipt = async (m: number) => {
    const payment = getPayment(m);
    const isDeposit = payment?.status === "deposit";
    const doc = await generateReceipt({
      tenantName: tenant.name,
      cpf: tenant.cpf || undefined,
      address: tenant.property?.address || "",
      houseNumber: tenant.house_number || undefined,
      amount: Number(payment?.amount || rentAmount),
      month: m, year,
      paymentDate: payment?.paid_at || new Date().toISOString().split("T")[0],
      paymentMethod: "Pix",
      paymentType: isDeposit ? "caução" : "aluguel",
      receiptNumber: `REC-${year}-${String(m).padStart(2, "0")}-${tenant.id.slice(0, 6).toUpperCase()}`,
      signatureName: "LOCADOR",
    });
    doc.save(`recibo_${tenant.name}_${isDeposit ? "caucao" : m}_${year}.pdf`);
    toast.success(`Recibo de ${isDeposit ? "caução" : "pagamento"} gerado!`);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("contracts").upload(path, file);
    if (error) { toast.error("Erro ao enviar arquivo."); return; }
    await supabase.from("documents").insert({ tenant_id: id!, file_name: file.name, file_url: path, file_type: "contract" });
    toast.success("Contrato enviado!");
    refetchDocs();
  };

  const downloadDocument = async (doc: any) => {
    const storagePath = extractSupabaseStoragePath(doc.file_url || "");
    if (storagePath) {
      const { data, error } = await supabase.storage.from("contracts").createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank", "noopener,noreferrer"); return; }
      if (error) console.error("Erro ao gerar URL assinada:", error);
    }
    if (isAbsoluteHttpUrl(doc.file_url || "")) { window.open(doc.file_url, "_blank", "noopener,noreferrer"); return; }
    toast.error("Erro ao abrir documento.");
  };

  const detailPayment = getPayment(detailMonth);
  const detailConfig = STATUS_CONFIG[detailPayment?.status || "pending"];

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-lg">
        <ArrowLeft className="mr-2 h-4 w-4" />Voltar
      </Button>

      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl">
                {tenant.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{tenant.name}</h1>
                <p className="text-sm text-muted-foreground">{tenant.property?.address} - Casa {tenant.house_number}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant={tenant.status === "active" ? "default" : "secondary"} className="rounded-lg">
                    {tenant.status === "active" ? "✓ Ativo" : "Encerrado"}
                  </Badge>
                  {pattern && (
                    <Badge variant="outline" className={`rounded-lg ${pattern.colorClass}`}>
                      <pattern.icon className="h-3 w-3 mr-1" />{pattern.label}
                    </Badge>
                  )}
                </div>
                {pattern?.desc && <p className="text-xs text-muted-foreground mt-1 italic">{pattern.desc}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleEdit} className="rounded-lg"><Edit className="mr-1 h-4 w-4" />Editar</Button>
              <Button variant="outline" size="sm" onClick={openNotesDialog} className="rounded-lg"><StickyNote className="mr-1 h-4 w-4" />OBS</Button>
              <Button variant="outline" size="sm" onClick={sendWhatsApp} className="rounded-lg"><MessageCircle className="mr-1 h-4 w-4" />Lembrete</Button>
              <Button variant="outline" size="sm" onClick={sendOverdueWhatsApp} className="rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"><MessageCircle className="mr-1 h-4 w-4" />Cobrar</Button>
              {tenant.phone && (
                <Button variant="outline" size="sm" onClick={openWhatsAppDirect} className="rounded-lg"><Phone className="mr-1 h-4 w-4" />Chat</Button>
              )}
              <Button variant="outline" size="sm" onClick={moveToFormer} className="rounded-lg text-destructive hover:bg-destructive/10"><UserX className="mr-1 h-4 w-4" />Ex-inquilino</Button>
              <label>
                <Button variant="outline" size="sm" asChild className="rounded-lg"><span><Upload className="mr-1 h-4 w-4" />Contrato</span></Button>
                <input type="file" accept=".pdf,.jpg,.png,.doc,.docx" className="hidden" onChange={handleUpload} />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-success/20">
          <CardContent className="pt-4 pb-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-success" />
            <p className="text-lg font-bold text-success">R$ {totalPaidYear.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Pago em {year}</p>
          </CardContent>
        </Card>
        <Card className={totalPendingYear > 0 ? "border-destructive/20" : ""}>
          <CardContent className="pt-4 pb-3 text-center">
            <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${totalPendingYear > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className="text-lg font-bold">{totalPendingYear}</p>
            <p className="text-[10px] text-muted-foreground">Meses pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">{paidMonths}/{12}</p>
            <p className="text-[10px] text-muted-foreground">Meses pagos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{lastPayment?.paid_at ? new Date(lastPayment.paid_at + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
            <p className="text-[10px] text-muted-foreground">Último pagamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: DollarSign, label: "Aluguel", value: `R$ ${rentAmount.toFixed(2)}`, colorClass: "text-success" },
          { icon: DollarSign, label: "Caução", value: `R$ ${Number(tenant.deposit || 0).toFixed(2)}`, colorClass: "text-primary" },
          { icon: Calendar, label: "Vencimento", value: `Dia ${tenant.payment_day}`, colorClass: "text-primary" },
          { icon: Calendar, label: "Entrada", value: tenant.entry_date ? new Date(tenant.entry_date).toLocaleDateString("pt-BR") : "—", colorClass: "text-muted-foreground" },
          { icon: Calendar, label: "Saída", value: tenant.exit_date ? new Date(tenant.exit_date).toLocaleDateString("pt-BR") : "—", colorClass: "text-muted-foreground" },
          { icon: User, label: "CPF", value: tenant.cpf || "—", colorClass: "text-muted-foreground" },
        ].map((item, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 text-center">
              <item.icon className={`h-4 w-4 mx-auto mb-1 ${item.colorClass}`} />
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-semibold mt-0.5">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Phone & Property */}
      {(tenant.phone || tenant.property) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tenant.phone && (
            <Card className="cursor-pointer hover:shadow-md transition-all" onClick={openWhatsAppDirect}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success"><Phone className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefone / WhatsApp</p>
                  <p className="text-sm font-semibold text-primary">{tenant.phone} <ExternalLink className="inline h-3 w-3" /></p>
                </div>
              </CardContent>
            </Card>
          )}
          {tenant.property && (
            <Card>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Condomínio</p>
                  <p className="text-sm font-semibold">{tenant.property.name || tenant.property.address}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Notes */}
      {tenant.notes && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><StickyNote className="h-4 w-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Observações</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{tenant.notes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {documents && documents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Documentos / Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => downloadDocument(doc)} className="rounded-lg"><ExternalLink className="mr-1 h-3 w-3" />Abrir</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Histórico de Pagamentos</CardTitle>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => setYear(year - 1)} className="rounded-lg">← {year - 1}</Button>
            <span className="text-sm font-bold">{year}</span>
            <Button variant="outline" size="sm" onClick={() => setYear(year + 1)} className="rounded-lg">{year + 1} →</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {MONTHS.map((m, i) => {
              const status = getPaymentStatus(i + 1);
              const payment = getPayment(i + 1);
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
              const StatusIcon = config.icon;
              const isPaid = status === "paid" || status === "paid_late";
              return (
                <div key={m} className="text-center space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{m}</p>
                  <Button
                    variant="outline" size="sm"
                    className={`w-full text-[10px] rounded-lg ${config.colorClass} hover:opacity-80`}
                    onClick={() => handlePaymentClick(i + 1)}
                    title={isPaid ? "Clique para detalhes · Duplo clique para reverter" : "Clique para marcar como pago"}
                  >
                    <StatusIcon className="h-3 w-3 mr-0.5" />
                    {config.label}
                  </Button>
                  {isPaid && payment && (
                    <div className="space-y-0.5">
                      <p className="text-[9px] text-muted-foreground">
                        R$ {Number(payment.amount || rentAmount).toFixed(2)}
                      </p>
                      <Button variant="ghost" size="sm" className="w-full text-[10px] p-0 h-6 rounded-lg text-primary hover:text-primary" onClick={() => handleReceipt(i + 1)}>
                        <Download className="h-3 w-3 mr-0.5" />Recibo
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 text-center italic">
            Clique no mês para alterar o status do pagamento
          </p>
        </CardContent>
      </Card>
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
            <div><Label>Dia Pagamento</Label><Input type="number" value={editForm.payment_day || ""} onChange={(e) => setEditForm({ ...editForm, payment_day: e.target.value })} /></div>
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
