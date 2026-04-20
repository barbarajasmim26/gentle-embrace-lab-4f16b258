import { useState } from "react";
import { useTenants, useUpdateTenant } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, RefreshCw, XCircle, Bell, ChevronRight, Upload, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO, isToday } from "date-fns";
import { toast } from "sonner";
import { useDocuments, useUploadDocument } from "@/hooks/use-documents";
import { parseStorageReference } from "@/lib/document-url";
import { supabase } from "@/integrations/supabase/client";

export default function AlertsPage() {
  const { data: activeTenants } = useTenants("active");
  const updateTenant = useUpdateTenant();
  const uploadDoc = useUploadDocument();
  const navigate = useNavigate();
  const today = new Date();

  const [renewOpen, setRenewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [renewTenant, setRenewTenant] = useState<any>(null);
  const [renewForm, setRenewForm] = useState({ entry_date: "", exit_date: "" });
  const [renewedFile, setRenewedFile] = useState<File | null>(null);

  // Fetch documents of the tenant being renewed (to allow downloading the original contract)
  const { data: renewTenantDocs } = useDocuments(renewTenant?.id);
  const originalContract = (renewTenantDocs || []).find(
    (d: any) => (d.category || d.file_type) === "contract",
  );

  const activeOnly = (activeTenants || []).filter((t) => t.status === "active");
  const expiredContracts = activeOnly.filter((t) => t.exit_date && parseISO(t.exit_date) < today && !isToday(parseISO(t.exit_date)));
  const expiringSoon = activeOnly.filter((t) => {
    if (!t.exit_date) return false;
    const d = differenceInDays(parseISO(t.exit_date), today);
    return d >= 0 && d <= 30;
  });
  const noPhone = activeOnly.filter((t) => !t.phone);
  const noContractDates = activeOnly.filter((t) => !t.entry_date || !t.exit_date);

  const openRenew = (tenant: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenewTenant(tenant);
    setRenewedFile(null);
    setRenewForm({
      entry_date: new Date().toISOString().split("T")[0],
      exit_date: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().split("T")[0],
    });
    setRenewOpen(true);
  };

  /** Baixa o contrato ORIGINAL do inquilino para o usuário editar e depois reanexar. */
  const handleDownloadOriginal = async () => {
    if (!originalContract) {
      toast.error("Nenhum contrato original encontrado no perfil deste inquilino.");
      return;
    }
    try {
      const ref = parseStorageReference(originalContract.file_url);
      if (!ref) throw new Error("Caminho inválido do arquivo.");
      const { data, error } = await supabase.storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, 60, { download: originalContract.file_name });
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
      toast.success("Contrato original baixado. Atualize as datas e reanexe abaixo.");
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao baixar o contrato original: " + e.message);
    }
  };

  /** Confirma renovação: atualiza datas e (opcionalmente) anexa o contrato renovado. */
  const handleConfirmRenew = async () => {
    if (!renewTenant) return;
    if (!renewForm.entry_date || !renewForm.exit_date) {
      toast.error("Preencha as datas de início e vencimento.");
      return;
    }

    setIsSaving(true);
    try {
      await updateTenant.mutateAsync({
        id: renewTenant.id,
        status: "active",
        entry_date: renewForm.entry_date,
        exit_date: renewForm.exit_date,
      });

      if (renewedFile) {
        await uploadDoc.mutateAsync({
          tenantId: renewTenant.id,
          file: renewedFile,
          title: `Contrato Renovado - ${new Date().getFullYear()}`,
          category: "contract",
        });
      }

      toast.success(
        renewedFile
          ? `Contrato de ${renewTenant.name} renovado e arquivado!`
          : `Datas de ${renewTenant.name} atualizadas. Você pode anexar o contrato renovado depois pelo perfil.`,
      );
      setRenewOpen(false);
      setRenewedFile(null);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao renovar contrato: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotRenew = async (tenant: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const ok = window.confirm(`Não renovar contrato de ${tenant.name}? Ele será movido para ex-inquilinos.`);
    if (!ok) return;
    try {
      await updateTenant.mutateAsync({ id: tenant.id, status: "former" });
      toast.success(`${tenant.name} movido para ex-inquilinos.`);
    } catch (err: any) {
      console.error("Erro ao não renovar:", err);
      toast.error(err.message || "Erro ao mover inquilino");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">Contratos vencidos e vencendo nos próximos 30 dias</p>
        </div>
      </div>

      {/* Expired Contracts */}
      {expiredContracts.length > 0 && (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Contratos Vencidos — Precisam de Renovação
              </h3>
              <Badge variant="destructive" className="rounded-full">{expiredContracts.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Estes contratos já passaram da data de saída. Clique em <strong>Renovar</strong> para definir uma nova data de vencimento.
            </p>
            <div className="space-y-3">
              {expiredContracts.map((t) => {
                const days = differenceInDays(today, parseISO(t.exit_date!));
                return (
                  <Card key={t.id} className="border-destructive/15 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{t.name}</span>
                            <Badge variant="outline" className="text-[10px]">Casa {t.house_number}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t.property?.address} &nbsp;·&nbsp; Venceu em: <span className="text-destructive font-medium">{new Date(t.exit_date!).toLocaleDateString("pt-BR")}</span> &nbsp;·&nbsp; <span className="text-destructive font-medium">Há {days} dia(s)</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white gap-1" onClick={(e) => openRenew(t, e)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Renovar
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 gap-1" onClick={(e) => handleNotRenew(t, e)}>
                          <XCircle className="h-3.5 w-3.5" /> Não Renovar
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring Soon */}
      {expiringSoon.length > 0 && (
        <Card className="rounded-2xl border-warning/30 bg-warning/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-warning flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Vencem nos Próximos 30 Dias
              </h3>
              <Badge className="rounded-full bg-warning text-warning-foreground">{expiringSoon.length}</Badge>
            </div>
            <div className="space-y-3">
              {expiringSoon.map((t) => {
                const days = differenceInDays(parseISO(t.exit_date!), today);
                return (
                  <Card key={t.id} className="hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 text-warning font-bold text-sm shrink-0">{t.name.charAt(0)}</div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{t.name}</span>
                            <Badge variant="outline" className="text-[10px]">Casa {t.house_number}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t.property?.address} &nbsp;·&nbsp; Vence em: <span className="text-warning font-medium">{new Date(t.exit_date!).toLocaleDateString("pt-BR")}</span> &nbsp;·&nbsp; <span className="font-medium">{days} dia(s)</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white gap-1" onClick={(e) => openRenew(t, e)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Renovar
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 gap-1" onClick={(e) => handleNotRenew(t, e)}>
                          <XCircle className="h-3.5 w-3.5" /> Não Renovar
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin Warnings */}
      {(noPhone.length > 0 || noContractDates.length > 0) && (
        <Card className="rounded-2xl">
          <CardContent className="pt-5 pb-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-primary" /> Avisos Administrativos
            </h3>
            {noPhone.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium mb-2">📱 Sem telefone cadastrado:</p>
                <div className="flex flex-wrap gap-2">{noPhone.map((t) => (
                  <Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => navigate(`/tenants/${t.id}`)}>{t.name}</Badge>
                ))}</div>
              </div>
            )}
            {noContractDates.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">📋 Sem datas de contrato:</p>
                <div className="flex flex-wrap gap-2">{noContractDates.map((t) => (
                  <Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-warning/10" onClick={() => navigate(`/tenants/${t.id}`)}>{t.name}</Badge>
                ))}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {expiredContracts.length === 0 && expiringSoon.length === 0 && noPhone.length === 0 && noContractDates.length === 0 && (
        <Card className="rounded-2xl"><CardContent className="py-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-muted-foreground font-medium">Nenhum alerta no momento!</p>
        </CardContent></Card>
      )}

      {/* Renew Dialog */}
      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-emerald-500" />Renovar Contrato</DialogTitle></DialogHeader>
          {renewTenant && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold">{renewTenant.name}</p>
                <p className="text-sm text-muted-foreground">{renewTenant.property?.address} - Casa {renewTenant.house_number}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Início</Label><Input type="date" value={renewForm.entry_date} onChange={(e) => setRenewForm({ ...renewForm, entry_date: e.target.value })} /></div>
                <div><Label>Vencimento</Label><Input type="date" value={renewForm.exit_date} onChange={(e) => setRenewForm({ ...renewForm, exit_date: e.target.value })} /></div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Use o contrato original do inquilino
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  1) Baixe o contrato original abaixo &nbsp;·&nbsp; 2) Edite as datas no Word/PDF &nbsp;·&nbsp; 3) Reanexe a versão renovada
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-lg gap-2"
                  onClick={handleDownloadOriginal}
                  disabled={!originalContract}
                >
                  <FileText className="h-4 w-4" />
                  {originalContract ? `Baixar contrato original (${originalContract.file_name})` : "Nenhum contrato original no perfil"}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Anexar contrato renovado (opcional)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => setRenewedFile(e.target.files?.[0] || null)}
                />
                {renewedFile && (
                  <p className="text-xs text-muted-foreground">📎 {renewedFile.name}</p>
                )}
              </div>

              <div className="rounded-lg border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
                ✅ Ao confirmar: as novas datas serão salvas no sistema {renewedFile ? "e o contrato renovado será arquivado no perfil." : "(você pode anexar o contrato depois pelo perfil)."}
              </div>

              <Button
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                onClick={handleConfirmRenew}
                disabled={updateTenant.isPending || isSaving}
              >
                {isSaving ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Renovando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4" /> Confirmar renovação</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
