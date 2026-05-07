import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenant, usePayments, useUpdateTenant, useUpsertPayment, useProperties, useAllPayments } from "@/hooks/use-tenants";
import { useDocuments, useUploadDocument, useDeleteDocument } from "@/hooks/use-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Edit, MessageCircle, Receipt, UserX, Upload, FileText, ExternalLink, Phone, DollarSign, Calendar, MapPin, User, TrendingUp, TrendingDown, AlertTriangle, StickyNote, CheckCircle2, Clock, XCircle, Download, Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp, openWhatsAppChat, getMessageTemplates } from "@/lib/whatsapp";
import { generateReceipt } from "@/lib/receipt-generator";
import { isAbsoluteHttpUrl, parseStorageReference } from "@/lib/document-url";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, PAYMENT_CYCLE_LABELS, isPaymentPaid } from "@/lib/payment-status";
import { calculateTenantFees } from "@/lib/fee-utils";
import { useAppSettings, resolveFees } from "@/hooks/use-settings";
import RenewContractDialog from "@/components/contracts/RenewContractDialog";

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
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: payments } = usePayments(id, year);
  const { data: allPayments } = useAllPayments(currentYear);
  const updateTenant = useUpdateTenant();
  const upsertPayment = useUpsertPayment();
  const { data: settings } = useAppSettings();
  
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  // Document upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("contract");

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

  // Renew dialog
  const [renewOpen, setRenewOpen] = useState(false);

  const now = new Date();
  const month = now.getMonth() + 1;

  const handleReloadContractCPF = async () => {
    if (!documents?.length) {
      toast.error("Nenhum contrato anexado.");
      return;
    }

    const contracts = documents.filter((doc: any) => doc.category === "contract");
    if (!contracts.length) {
      toast.error("Nenhum contrato para processar.");
      return;
    }

    toast.loading("Processando contratos...");
    let updated = 0;
    let failed = 0;

    for (const contract of contracts) {
      try {
        // Get the file from storage
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from("contracts")
          .download(contract.file_url);

        if (downloadErr) throw downloadErr;

        // Convert to base64
        const buffer = await fileData.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        // Extract data from contract
        const { data: extractedData, error: extractErr } = await supabase.functions.invoke(
          "extract-contract",
          { body: { pdf_base64: base64 } }
        );

        if (extractErr) throw extractErr;

        // Update tenant with extracted data (CPF and name)
        const updateData: any = {};
        if (extractedData?.cpf) updateData.cpf = extractedData.cpf;
        if (extractedData?.name) updateData.name = extractedData.name;

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase
            .from("tenants")
            .update(updateData)
            .eq("id", id);

          if (!updateErr) {
            updated++;
          } else {
            failed++;
          }
        }
      } catch (err: any) {
        console.error("Erro ao processar contrato:", err);
        failed++;
      }
    }

    // Dismiss loading toast and show result
    toast.dismiss();
    if (updated > 0) {
      toast.success(`Dados atualizados de ${updated} contrato(s)! (CPF e Nome)`);
    }
    if (failed > 0) {
      toast.error(`Falha ao processar ${failed} contrato(s).`);
    }
  };

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
  const totalPendingYear = Array.from({ length: month }, (_, i) => i).filter((i) => {
    const mNum = i + 1;
    const p = payments?.find(pay => pay.month === mNum);
    if (isPaymentPaid(p?.status) || p?.status === "deposit") return false;
    return isOverdue(mNum, year, tenant.payment_day || 10, tenant.payment_cycle, now);
  }).length;

  const paidMonths = payments?.filter((p) => isPaymentPaid(p.status)).length || 0;
  const lastPayment = payments?.filter((p) => isPaymentPaid(p.status)).sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""))[0];

  // Payment pattern
  const getPaymentPattern = () => {
    if (tenant.status === "irregular") return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30", desc: "Pagamento instável" };
    return { label: "Normal", icon: TrendingUp, colorClass: "bg-success/10 text-success border-success/30", desc: "Pagamento regular" };
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
    
    const { totalAmount } = calculateTenantFees(
      base,
      payMonth,
      year,
      tenant.payment_day || 10,
      tenant.payment_cycle || "postecipado",
      new Date(payDate + "T12:00:00"),
      Number(payLateFee),
      Number(payInterest)
    );
    return totalAmount;
  };

  const handlePaymentClick = (m: number) => {
    const existing = getPayment(m);
    const currentStatus = existing?.status || "pending";
    const { lateFee, interest } = resolveFees(tenant, settings);
    setPayMonth(m);
    setPayStatus(currentStatus === "pending" ? "paid" : currentStatus as PaymentStatusType);
    setPayLateFee(String(existing?.late_fee_percent ?? lateFee));
    setPayInterest(String(existing?.interest_percent ?? interest));
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
      default_late_fee_percent: tenant.default_late_fee_percent ?? "",
      default_interest_percent: tenant.default_interest_percent ?? "",
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
        default_late_fee_percent: editForm.default_late_fee_percent === "" || editForm.default_late_fee_percent == null ? null : Number(editForm.default_late_fee_percent),
        default_interest_percent: editForm.default_interest_percent === "" || editForm.default_interest_percent == null ? null : Number(editForm.default_interest_percent),
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

  const buildReceiptPdf = async (m: number) => {
    const p = getPayment(m);
    if (!p) return null;
    return generateReceipt({
      tenantName: tenant.name,
      amount: Number(p.amount || rentAmount),
      paymentMethod: "PIX",
      month: m,
      year: year,
      address: tenant.property?.address || tenant.property?.name || "",
      houseNumber: tenant.house_number || undefined,
      cpf: tenant.cpf || undefined,
      paymentDate: p.paid_at || new Date().toISOString().split("T")[0],
    });
  };

  const handleReceipt = async (m: number) => {
    try {
      const pdf = await buildReceiptPdf(m);
      if (!pdf) return;
      const fileName = `recibo_${tenant.name}_${MONTHS[m - 1]}_${year}.pdf`;
      pdf.save(fileName);
      toast.success("Recibo gerado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar recibo");
    }
  };

  const handleSendReceiptWhatsApp = async (m: number) => {
    if (!tenant?.phone) {
      toast.error("Inquilino sem telefone cadastrado.");
      return;
    }
    try {
      const pdf = await buildReceiptPdf(m);
      if (!pdf) return;
      const fileName = `recibo_${tenant.name}_${MONTHS[m - 1]}_${year}.pdf`;
      pdf.save(fileName);
      const amount = Number(getPayment(m)?.amount || rentAmount);
      const monthLabel = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][m - 1];
      const message = `Olá ${tenant.name}! 😊\n\nSegue em anexo o recibo de aluguel referente ao mês de ${monthLabel}/${year} no valor de R$ ${amount.toFixed(2).replace(".", ",")}.\n\nQualquer dúvida, estamos à disposição!`;
      openWhatsApp({ phone: tenant.phone, message });
      toast.success("Recibo baixado e WhatsApp aberto. Anexe o PDF na conversa.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar recibo");
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle) {
      toast.error("Selecione um arquivo e informe um título.");
      return;
    }
    try {
      await uploadDoc.mutateAsync({
        tenantId: id!,
        file: uploadFile,
        title: uploadTitle,
        category: uploadCategory,
      });
      toast.success("Documento enviado!");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteDoc = async (doc: any) => {
    if (!confirm("Excluir este documento?")) return;
    try {
      await deleteDoc.mutateAsync({
        id: doc.id,
        tenantId: id!,
        filePath: doc.file_url,
      });
      toast.success("Documento excluído!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openDocument = async (fileUrl: string) => {
    const storageRef = parseStorageReference(fileUrl);

    if (!storageRef) {
      if (isAbsoluteHttpUrl(fileUrl)) {
        window.open(fileUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("Documento inválido.");
      return;
    }

    // Baixa o arquivo via SDK (não passa pelo bloqueador) e abre como blob: local
    const tryDownload = async (bucket: string, path: string) => {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) return null;
      return data;
    };

    try {
      const blob =
        (await tryDownload(storageRef.bucket, storageRef.path)) ||
        (storageRef.bucket !== "contracts" ? await tryDownload("contracts", storageRef.path) : null);

      if (!blob) {
        toast.error("Não foi possível abrir o documento.");
        return;
      }

      // Garante MIME correto para inline preview no navegador
      const typedBlob = blob.type ? blob : new Blob([blob], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(typedBlob);
      const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        // Pop-up bloqueado: força download
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = storageRef.path.split("/").pop() || "documento.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.info("Pop-up bloqueado — documento baixado.");
      }
      // Libera o blob após alguns minutos
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
    } catch (e: any) {
      toast.error("Erro ao abrir documento: " + (e?.message || "tente novamente"));
    }
  };

  const detailPayment = getPayment(detailMonth);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="rounded-lg gap-1" onClick={() => navigate("/tenants")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-lg gap-1" onClick={handleEdit}>
            <Edit className="h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:bg-destructive/10 gap-1" onClick={moveToFormer}>
            <UserX className="h-4 w-4" /> Encerrar
          </Button>
        </div>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary shrink-0">
          <User className="h-12 w-12" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{tenant.name}</h1>
            {pattern && (
              <Badge className={`rounded-full px-3 py-0.5 border-0 ${pattern.colorClass}`}>
                <pattern.icon className="mr-1 h-3 w-3" /> {pattern.label}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
            <div className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4" /> {tenant.property?.name || tenant.property?.address}, Casa {tenant.house_number}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Phone className="h-4 w-4" /> {tenant.phone || "Não informado"}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <FileText className="h-4 w-4" /> CPF: {tenant.cpf || "Não informado"}
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button className="flex-1 md:flex-none rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white gap-2" onClick={() => openWhatsAppChat(tenant.phone)}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Stats & Info */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className="rounded-2xl border-0 shadow-sm bg-muted/30">
            <CardContent className="p-5 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Pago ({year})</p>
                <p className="text-lg font-bold text-primary">R$ {totalPaidYear.toLocaleString("pt-BR")}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Meses Pendentes</p>
                <p className="text-lg font-bold text-destructive">{totalPendingYear}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Meses Pagos</p>
                <p className="text-lg font-bold text-emerald-600">{paidMonths}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Último Pagamento</p>
                <p className="text-sm font-bold">{lastPayment ? new Date(lastPayment.paid_at || "").toLocaleDateString("pt-BR") : "Nenhum"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Contract Details */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Detalhes do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Aluguel</Label>
                  <p className="font-bold text-lg">R$ {rentAmount.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Dia Vencimento</Label>
                  <p className="font-bold text-lg">Todo dia {tenant.payment_day}</p>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase">Ciclo de Pagamento</Label>
                <p className="font-medium text-sm">{PAYMENT_CYCLE_LABELS[tenant.payment_cycle || "postecipado"]}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Data Entrada</Label>
                  <p className="text-sm font-medium">{tenant.entry_date ? new Date(tenant.entry_date).toLocaleDateString("pt-BR") : "—"}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Data Saída</Label>
                  {(() => {
                    const exit = tenant.exit_date ? new Date(tenant.exit_date + "T12:00:00") : null;
                    const days = exit ? Math.ceil((exit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const isExpired = days !== null && days < 0;
                    const isExpiring = days !== null && days >= 0 && days <= 30;
                    return (
                      <>
                        <p className={`text-sm font-medium ${isExpired ? "text-destructive" : isExpiring ? "text-warning" : ""}`}>
                          {tenant.exit_date ? new Date(tenant.exit_date).toLocaleDateString("pt-BR") : "—"}
                        </p>
                        {isExpired && (
                          <p className="text-[10px] text-destructive font-semibold mt-0.5">⚠ Vencido há {Math.abs(days!)} dia(s)</p>
                        )}
                        {isExpiring && (
                          <p className="text-[10px] text-warning font-semibold mt-0.5">Vence em {days} dia(s)</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              {tenant.deposit && (
                <div className="pt-2 border-t">
                  <Label className="text-[10px] text-muted-foreground uppercase">Caução</Label>
                  <p className="text-sm font-bold text-primary">R$ {Number(tenant.deposit).toFixed(2)}</p>
                </div>
              )}
              <Button
                onClick={() => setRenewOpen(true)}
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white gap-2 mt-2"
              >
                <RefreshCw className="h-4 w-4" /> Renovar contrato
              </Button>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" /> Observações
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openNotesDialog}>
                <Edit className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">
                {tenant.notes || "Nenhuma observação cadastrada."}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Payment Calendar & Documents */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payment Calendar */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-lg font-bold">Calendário de Pagamentos</CardTitle>
                <p className="text-xs text-muted-foreground">Clique em um mês para registrar ou ver detalhes</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(year - 1)}><ArrowLeft className="h-4 w-4" /></Button>
                <span className="font-bold text-sm w-12 text-center">{year}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(year + 1)} disabled={year >= currentYear + 1}><ArrowLeft className="h-4 w-4 rotate-180" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {MONTHS.map((m, i) => {
                  const mNum = i + 1;
                  const status = getPaymentStatus(mNum);
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                  const isFuture = year > currentYear || (year === currentYear && mNum > month);
                  
                  return (
                    <button
                      key={m}
                      disabled={isFuture}
                      onClick={() => status === "pending" || status === "overdue" ? handlePaymentClick(mNum) : openPayDetail(mNum)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${isFuture ? "opacity-30 cursor-not-allowed" : "hover:shadow-md active:scale-95"} ${config.colorClass}`}
                    >
                      <span className="text-[10px] font-bold uppercase mb-1">{m}</span>
                      <config.icon className="h-5 w-5 mb-1" />
                      <span className="text-[10px] font-medium">{config.label}</span>
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-6 flex flex-wrap gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider justify-center border-t pt-4">
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-success" /> Em dia</div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-warning" /> Atrasado</div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-destructive" /> Vencido</div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-muted" /> Pendente</div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-primary" /> Caução</div>
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold">Documentos e Contratos</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-lg gap-1" onClick={() => handleReloadContractCPF()} title="Recarregar e extrair CPF e Nome dos contratos">
                  <RefreshCw className="h-4 w-4" /> Atualizar Dados
                </Button>
                <Button variant="outline" size="sm" className="rounded-lg gap-1" onClick={() => setUploadOpen(true)}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!documents?.length ? (
                <div className="text-center py-8 border-2 border-dashed rounded-2xl">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors group">
                      <button
                        type="button"
                        onClick={() => openDocument(doc.file_url)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{doc.title || doc.file_name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{doc.category || "Documento"}</p>
                        </div>
                      </button>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteDoc(doc)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDocument(doc.file_url)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Documento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Ex: Contrato de Aluguel" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contrato</SelectItem>
                  <SelectItem value="id">Identidade / CPF</SelectItem>
                  <SelectItem value="receipt">Comprovante</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Arquivo (PDF ou Imagem)</Label>
              <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <Button className="w-full rounded-xl" onClick={handleUpload} disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? "Enviando..." : "Enviar Documento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" /> Registrar Pagamento — {MONTHS[payMonth - 1]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">Status</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={payStatus === "paid" ? "default" : "outline"} className={`rounded-lg ${payStatus === "paid" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`} onClick={() => setPayStatus("paid")}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />Pago em dia
                </Button>
                <Button variant={payStatus === "paid_late" ? "default" : "outline"} className={`rounded-lg ${payStatus === "paid_late" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`} onClick={() => setPayStatus("paid_late")}>
                  <Clock className="mr-1 h-4 w-4" />Pago em atraso
                </Button>
                <Button variant={payStatus === "deposit" ? "default" : "outline"} className={`rounded-lg ${payStatus === "deposit" ? "bg-primary hover:bg-primary/90 text-white" : ""}`} onClick={() => setPayStatus("deposit")}>
                  <DollarSign className="mr-1 h-4 w-4" />Usar Caução
                </Button>
                <Button variant={payStatus === "pending" ? "default" : "outline"} className="rounded-lg" onClick={() => setPayStatus("pending")}>
                  <XCircle className="mr-1 h-4 w-4" />Pendente
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
              <div className="space-y-3 p-3 rounded-lg border border-orange-300/30 bg-orange-50 dark:bg-orange-500/10">
                <p className="text-sm font-semibold text-orange-600">Multa e Juros (Cálculo Diário)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Multa (%)</Label>
                    <Input type="number" step="0.1" value={payLateFee} onChange={(e) => setPayLateFee(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Juros Mensal (%)</Label>
                    <Input type="number" step="0.1" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} />
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  {(() => {
                    const base = payCustomAmount ? Number(payCustomAmount) : rentAmount;
                    const { lateFeeAmount, interestAmount, totalAmount, daysOverdue } = calculateTenantFees(
                      base,
                      payMonth,
                      year,
                      tenant.payment_day || 10,
                      tenant.payment_cycle || "postecipado",
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

            <div>
              <Label>Valor pago (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={calcFinalAmount().toFixed(2)}
                value={payCustomAmount}
                onChange={(e) => setPayCustomAmount(e.target.value)}
              />
            </div>

            <Button className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white" onClick={confirmPayment} disabled={upsertPayment.isPending}>
              {upsertPayment.isPending ? "Salvando..." : `Confirmar — R$ ${calcFinalAmount().toFixed(2)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Pagamento — {MONTHS[detailMonth - 1]}</DialogTitle>
          </DialogHeader>
          {detailPayment ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const config = STATUS_CONFIG[detailPayment.status] || STATUS_CONFIG.pending;
                      return (
                        <Badge className={`rounded-full border-0 ${config.colorClass}`}>
                          <config.icon className="mr-1 h-3 w-3" /> {config.label}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Valor Total</p>
                  <p className="text-xl font-bold text-primary">R$ {Number(detailPayment.amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Data do pagamento:</span>
                  <span className="font-medium">{detailPayment.paid_at ? new Date(detailPayment.paid_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
                {detailPayment.status === "paid_late" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Multa aplicada:</span>
                      <span className="font-medium text-warning">{detailPayment.late_fee_percent}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Juros aplicados:</span>
                      <span className="font-medium text-warning">{detailPayment.interest_percent}%</span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 rounded-lg" onClick={() => {
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
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => handleSendReceiptWhatsApp(detailMonth)}
                  disabled={!tenant?.phone}
                  title={!tenant?.phone ? "Inquilino sem telefone" : "Enviar recibo via WhatsApp"}
                >
                  <MessageCircle className="mr-1 h-3 w-3" />Enviar WhatsApp
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
                  <SelectItem value="active">Normal</SelectItem>
                  <SelectItem value="irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entrada</Label><Input type="date" value={editForm.entry_date || ""} onChange={(e) => setEditForm({ ...editForm, entry_date: e.target.value })} /></div>
              <div><Label>Saída</Label><Input type="date" value={editForm.exit_date || ""} onChange={(e) => setEditForm({ ...editForm, exit_date: e.target.value })} /></div>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground">Multa e Juros (deixe vazio para usar o padrão global)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Multa (%)</Label>
                  <Input type="number" step="0.1" placeholder={`Padrão: ${settings?.default_late_fee_percent ?? 10}`} value={editForm.default_late_fee_percent ?? ""} onChange={(e) => setEditForm({ ...editForm, default_late_fee_percent: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Juros mensal (%)</Label>
                  <Input type="number" step="0.1" placeholder={`Padrão: ${settings?.default_interest_percent ?? 1}`} value={editForm.default_interest_percent ?? ""} onChange={(e) => setEditForm({ ...editForm, default_interest_percent: e.target.value })} />
                </div>
              </div>
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
      {/* Renew Contract Dialog */}
      <RenewContractDialog
        open={renewOpen}
        onOpenChange={setRenewOpen}
        tenant={tenant}
      />
    </div>
  );
}
