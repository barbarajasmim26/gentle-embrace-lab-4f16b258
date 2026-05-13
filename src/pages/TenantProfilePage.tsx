import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenant, usePayments, useUpdateTenant, useUpsertPayment, useProperties } from "@/hooks/use-tenants";
import { useDocuments, useUploadDocument, useDeleteDocument } from "@/hooks/use-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Edit, MessageCircle, Receipt, Upload, FileText, ExternalLink, Phone, DollarSign, MapPin, User, CheckCircle2, Clock, XCircle, Trash2, Plus, RefreshCw, MinusCircle, Cloud, UserMinus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { parseStorageReference, isAbsoluteHttpUrl } from "@/lib/document-url";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, isPaymentPaid, isNotApplicable } from "@/lib/payment-status";
import { calculateTenantFees } from "@/lib/fee-utils";
import { useAppSettings, resolveFees } from "@/hooks/use-settings";
import RenewContractDialog from "@/components/contracts/RenewContractDialog";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type PaymentStatusType = "paid" | "paid_late" | "pending" | "deposit" | "not_applicable" | "overdue";

const STATUS_CONFIG: Record<string, { label: string; colorClass: string; icon: any }> = {
  paid: { label: "Em dia", colorClass: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  paid_late: { label: "Atrasado", colorClass: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  pending: { label: "Pend.", colorClass: "bg-muted text-muted-foreground border-border", icon: Clock },
  overdue: { label: "Atrasado", colorClass: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  deposit: { label: "Caução", colorClass: "bg-primary/10 text-primary border-primary/30", icon: DollarSign },
  not_applicable: { label: "N/A", colorClass: "bg-slate-100 text-slate-400 border-slate-200 opacity-60", icon: MinusCircle },
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
  const updateTenant = useUpdateTenant();
  const upsertPayment = useUpsertPayment();
  const { data: settings } = useAppSettings();
  
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

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

  // Renew dialog
  const [renewOpen, setRenewOpen] = useState(false);

  const now = new Date();

  // Extrair link do iCloud das notas se existir
  const extractICloudLink = (notes: string | null) => {
    if (!notes) return "";
    const match = notes.match(/\[Link iCloud\/Pages\]: (https:\/\/\S+)/);
    return match ? match[1] : "";
  };

  useEffect(() => {
    if (tenant) {
      const icloudLink = extractICloudLink(tenant.notes);
      // Limpar o link das notas para o formulário de edição
      const cleanNotes = tenant.notes?.replace(/\n\n\[Link iCloud\/Pages\]: https:\/\/\S+/, "").trim() || "";
      
      setEditForm({
        name: tenant.name,
        phone: tenant.phone || "",
        cpf: tenant.cpf || "",
        house_number: tenant.house_number || "",
        rent_amount: String(tenant.rent_amount),
        payment_day: String(tenant.payment_day || 10),
        payment_cycle: tenant.payment_cycle || "postecipado",
        entry_date: tenant.entry_date || "",
        notes: cleanNotes,
        property_id: tenant.property_id || "",
        icloud_link: icloudLink
      });
    }
  }, [tenant]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!tenant) return <p className="p-6">Inquilino não encontrado.</p>;

  const icloudLink = extractICloudLink(tenant.notes);
  const rentAmount = Number(tenant.rent_amount);

  const getPayment = (m: number) => payments?.find((p) => p.month === m);
  const getPaymentStatus = (m: number): PaymentStatusType => {
    const p = getPayment(m);
    if (p) return p.status as PaymentStatusType;
    
    if (isNotApplicable(m, year, tenant.entry_date)) {
      return "not_applicable";
    }

    if (isOverdue(m, year, tenant.payment_day || 10, tenant.payment_cycle, now)) {
      return "overdue";
    }
    
    return "pending";
  };

  const calcFinalAmount = () => {
    const base = payCustomAmount ? Number(payCustomAmount) : rentAmount;
    if (payStatus === "paid" || payStatus === "pending" || payStatus === "deposit" || payStatus === "not_applicable") return base;
    
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
    const status = getPaymentStatus(m);
    if (status === "not_applicable") {
      toast.info("Este mês é anterior à data de entrada do inquilino.");
      return;
    }

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

  const confirmPayment = async () => {
    const finalAmount = calcFinalAmount();
    try {
      await upsertPayment.mutateAsync({
        tenant_id: id!, month: payMonth, year,
        status: (payStatus === "overdue" ? "pending" : payStatus) as any,
        amount: (payStatus === "pending" || payStatus === "not_applicable" || payStatus === "overdue") ? rentAmount : finalAmount,
        paid_at: (payStatus === "pending" || payStatus === "not_applicable" || payStatus === "overdue") ? null : payDate,
        late_fee_percent: payStatus === "paid_late" ? Number(payLateFee) : 0,
        interest_percent: payStatus === "paid_late" ? Number(payInterest) : 0,
      });
      toast.success("Pagamento atualizado!");
      setPayDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateTenant = async () => {
    try {
      const finalNotes = editForm.icloud_link 
        ? `${editForm.notes || ""}\n\n[Link iCloud/Pages]: ${editForm.icloud_link}`.trim()
        : editForm.notes;

      await updateTenant.mutateAsync({
        id: id!,
        ...editForm,
        notes: finalNotes,
        rent_amount: Number(editForm.rent_amount),
        payment_day: Number(editForm.payment_day)
      });
      toast.success("Perfil atualizado!");
      setEditOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle) {
      toast.error("Selecione um arquivo e dê um título.");
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
      toast.error(e.message || "Erro ao enviar documento");
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
      toast.success("Documento excluído.");
    } catch (e: any) { toast.error(e.message); }
  };

  const openDocument = async (fileUrl: string) => {
    try {
      if (isAbsoluteHttpUrl(fileUrl)) {
        window.open(fileUrl, "_blank");
        return;
      }
      const storageRef = parseStorageReference(fileUrl);
      const { data, error } = await supabase.storage
        .from("contracts")
        .createSignedUrl(storageRef.path, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error("Erro ao abrir documento: " + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {tenant.house_number ? `Casa ${tenant.house_number}` : "Sem número"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {icloudLink && (
            <Button 
              variant="outline" 
              className="rounded-xl bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" 
              onClick={() => window.open(icloudLink, "_blank")}
            >
              <Cloud className="mr-2 h-4 w-4" /> Abrir no Pages
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Enviar Documento
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => setRenewOpen(true)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Renovar Contrato
          </Button>
          <Button className="rounded-xl" onClick={() => setEditOpen(true)}>
            <Edit className="mr-2 h-4 w-4" /> Editar Perfil
          </Button>
          {tenant.status === "active" ? (
            <Button
              variant="outline"
              className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm(`Marcar ${tenant.name} como ex-inquilino?`)) return;
                try {
                  await updateTenant.mutateAsync({ id: id!, status: "former", exit_date: new Date().toISOString().split("T")[0] } as any);
                  toast.success("Movido para ex-inquilinos.");
                  navigate("/former-tenants");
                } catch (e: any) { toast.error(e.message); }
              }}
            >
              <UserMinus className="mr-2 h-4 w-4" /> Marcar como Ex-Inquilino
            </Button>
          ) : (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={async () => {
                try {
                  await updateTenant.mutateAsync({ id: id!, status: "active" } as any);
                  toast.success("Reativado como inquilino ativo.");
                } catch (e: any) { toast.error(e.message); }
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Reativar Inquilino
            </Button>
          )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-sm bg-gradient-to-br from-card to-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">CPF</span>
                  <span className="text-sm font-medium">{tenant.cpf || "—"}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Telefone</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{tenant.phone || "—"}</span>
                    {tenant.phone && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-500" onClick={() => openWhatsAppChat(tenant.phone!)}>
                        <Phone className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Aluguel</span>
                  <span className="text-sm font-bold text-primary">R$ {rentAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Dia Venc.</span>
                  <Badge variant="secondary" className="rounded-full">{tenant.payment_day} de cada mês</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Documentos
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="text-center py-8 px-4 border-2 border-dashed border-muted rounded-2xl">
                  <FileText className="h-8 w-8 text-muted/50 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum documento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                      <button className="flex-1 flex items-center gap-3 text-left overflow-hidden" onClick={() => openDocument(doc.file_url)}>
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{doc.title || doc.file_name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{doc.category || "Documento"}</p>
                        </div>
                      </button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleDeleteDoc(doc)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
           <Card className="border-none shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle>Histórico de Pagamentos</CardTitle>
               <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                 <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   {[currentYear, currentYear-1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                 </SelectContent>
               </Select>
             </CardHeader>
             <CardContent>
               <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                 {MONTHS.map((m, i) => {
                   const mNum = i + 1;
                   const status = getPaymentStatus(mNum);
                   const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                   return (
                     <button
                       key={m}
                       onClick={() => handlePaymentClick(mNum)}
                       className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${status !== 'not_applicable' ? 'hover:scale-105' : 'cursor-default'} ${config.colorClass}`}
                     >
                       <span className="text-xs font-bold uppercase">{m}</span>
                       <config.icon className="h-5 w-5" />
                     </button>
                   );
                 })}
               </div>
             </CardContent>
           </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Perfil do Inquilino</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Nome Completo</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={editForm.cpf} onChange={(e) => setEditForm({...editForm, cpf: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Imóvel</Label>
              <Select value={editForm.property_id} onValueChange={(v) => setEditForm({...editForm, property_id: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {properties?.map(p => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Casa Nº</Label>
              <Input value={editForm.house_number} onChange={(e) => setEditForm({...editForm, house_number: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Valor Aluguel</Label>
              <Input type="number" value={editForm.rent_amount} onChange={(e) => setEditForm({...editForm, rent_amount: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Dia Vencimento</Label>
              <Input type="number" value={editForm.payment_day} onChange={(e) => setEditForm({...editForm, payment_day: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Ciclo de Pagamento</Label>
              <Select value={editForm.payment_cycle} onValueChange={(v) => setEditForm({...editForm, payment_cycle: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="antecipado">Antecipado (Paga e Mora)</SelectItem>
                  <SelectItem value="postecipado">Postecipado (Mora e Paga)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data de Entrada</Label>
              <Input type="date" value={editForm.entry_date} onChange={(e) => setEditForm({...editForm, entry_date: e.target.value})} />
            </div>
            
            <div className="col-span-2 p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
              <Label className="text-blue-700 flex items-center gap-2"><Cloud className="h-4 w-4" /> Link do Contrato (iCloud/Pages)</Label>
              <Input 
                placeholder="https://www.icloud.com/pages/..." 
                value={editForm.icloud_link} 
                onChange={(e) => setEditForm({...editForm, icloud_link: e.target.value})}
                className="bg-white border-blue-200"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Notas / Observações</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateTenant} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label>Arquivo</Label>
              <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <Button className="w-full rounded-xl" onClick={handleUpload} disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? "Enviando..." : "Enviar Documento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RenewContractDialog
        open={renewOpen}
        onOpenChange={setRenewOpen}
        tenantId={id!}
        onSuccess={() => refetchDocs()}
      />
    </div>
  );
}
