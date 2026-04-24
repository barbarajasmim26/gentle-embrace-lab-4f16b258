import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { useUpdateTenant } from "@/hooks/use-tenants";
import { useDocuments, useUploadDocument } from "@/hooks/use-documents";
import { parseStorageReference } from "@/lib/document-url";
import { supabase } from "@/integrations/supabase/client";

interface RenewContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: any | null;
  /** Anos de prorrogação padrão (default 3 — pedido pela usuária) */
  defaultYears?: number;
}

/**
 * Dialog reutilizável de renovação de contrato.
 * - Pré-preenche datas (entrada = hoje, saída = hoje + N anos)
 * - Permite baixar o contrato original
 * - Permite anexar o contrato renovado
 * - Salva tudo de uma vez quando confirmar
 */
export default function RenewContractDialog({
  open,
  onOpenChange,
  tenant,
  defaultYears = 3,
}: RenewContractDialogProps) {
  const updateTenant = useUpdateTenant();
  const uploadDoc = useUploadDocument();
  const { data: tenantDocs } = useDocuments(tenant?.id);

  const originalContract = (tenantDocs || []).find(
    (d: any) => (d.category || d.file_type) === "contract",
  );

  const [form, setForm] = useState({ entry_date: "", exit_date: "" });
  const [renewedFile, setRenewedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Quando abrir, pré-preenche com hoje + N anos
  useEffect(() => {
    if (!open || !tenant) return;
    const today = new Date();
    const endDate = new Date(today.getFullYear() + defaultYears, today.getMonth(), today.getDate());
    setForm({
      entry_date: today.toISOString().split("T")[0],
      exit_date: endDate.toISOString().split("T")[0],
    });
    setRenewedFile(null);
  }, [open, tenant, defaultYears]);

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

  const handleConfirm = async () => {
    if (!tenant) return;
    if (!form.entry_date || !form.exit_date) {
      toast.error("Preencha as datas de início e vencimento.");
      return;
    }

    setIsSaving(true);
    try {
      await updateTenant.mutateAsync({
        id: tenant.id,
        status: "active",
        entry_date: form.entry_date,
        exit_date: form.exit_date,
      });

      if (renewedFile) {
        await uploadDoc.mutateAsync({
          tenantId: tenant.id,
          file: renewedFile,
          title: `Contrato Renovado - ${new Date().getFullYear()}`,
          category: "contract",
        });
      }

      toast.success(
        renewedFile
          ? `Contrato de ${tenant.name} renovado e arquivado!`
          : `Datas de ${tenant.name} atualizadas. Você pode anexar o contrato depois.`,
      );
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao renovar contrato: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-500" />
            Renovar Contrato
          </DialogTitle>
        </DialogHeader>
        {tenant && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold">{tenant.name}</p>
              <p className="text-sm text-muted-foreground">
                {tenant.property?.address} - Casa {tenant.house_number}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.exit_date}
                  onChange={(e) => setForm({ ...form, exit_date: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Use o contrato original do inquilino
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                1) Baixe o contrato original abaixo &nbsp;·&nbsp; 2) Edite as datas no
                Word/PDF &nbsp;·&nbsp; 3) Reanexe a versão renovada
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
                {originalContract
                  ? `Baixar contrato original (${originalContract.file_name})`
                  : "Nenhum contrato original no perfil"}
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Anexar contrato renovado (opcional)
              </Label>
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
              ✅ Ao confirmar: as novas datas serão salvas no sistema{" "}
              {renewedFile
                ? "e o contrato renovado será arquivado no perfil."
                : "(você pode anexar o contrato depois pelo perfil)."}
            </div>

            <Button
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
              onClick={handleConfirm}
              disabled={updateTenant.isPending || isSaving}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Renovando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" /> Confirmar renovação
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
