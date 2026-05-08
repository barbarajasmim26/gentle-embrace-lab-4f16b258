import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProperties, useCreateTenant } from "@/hooks/use-tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PAYMENT_CYCLE_OPTIONS = [
  { value: "antecipado", label: "Antecipado (paga antes de morar)" },
  { value: "postecipado", label: "Pós (paga depois de morar)" },
  { value: "personalizado", label: "Personalizado" },
];

interface ExtractedData {
  name: string;
  cpf: string;
  rg: string;
  address: string;
  house_number: string;
  rent_amount: string;
  deposit: string;
  payment_day: string;
  entry_date: string;
  exit_date: string;
}

export default function ContractImportPage() {
  const navigate = useNavigate();
  const { data: properties } = useProperties();
  const createTenant = useCreateTenant();

  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);

  const [form, setForm] = useState({
    name: "", cpf: "", rg: "", phone: "", house_number: "",
    rent_amount: "", deposit: "", payment_day: "10",
    entry_date: "", exit_date: "", property_id: "",
    payment_cycle: "postecipado", notes: "",
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") {
      setFile(f);
      setExtracted(false);
    } else {
      toast.error("Selecione um arquivo PDF válido.");
    }
  };

  const extractFromPdf = useCallback(async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const { data, error } = await supabase.functions.invoke("extract-contract", {
        body: { pdf_base64: base64 },
      });

      if (error) throw error;

      const d = data as ExtractedData;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        cpf: d.cpf || prev.cpf,
        rg: d.rg || prev.rg,
        house_number: d.house_number || prev.house_number,
        rent_amount: d.rent_amount || prev.rent_amount,
        deposit: d.deposit || prev.deposit,
        payment_day: d.payment_day || prev.payment_day,
        entry_date: d.entry_date || prev.entry_date,
        exit_date: d.exit_date || prev.exit_date,
      }));
      setExtracted(true);
      toast.success("Dados extraídos do contrato com sucesso! Revise antes de salvar.");
    } catch (err: any) {
      console.error("Extraction error:", err);
      toast.error("Erro ao extrair dados do PDF. Verifique se a Edge Function está ativa.");
      setExtracted(true);
    } finally {
      setExtracting(false);
    }
  }, [file]);

  const handleSave = async () => {
    if (!form.name || !form.rent_amount) {
      toast.error("Nome e valor do aluguel são obrigatórios.");
      return;
    }

    try {
      const tenantData = {
        name: form.name,
        cpf: form.cpf || null,
        phone: form.phone || null,
        house_number: form.house_number || null,
        rent_amount: parseFloat(form.rent_amount),
        deposit: form.deposit ? parseFloat(form.deposit) : null,
        payment_day: parseInt(form.payment_day) || 10,
        entry_date: form.entry_date || null,
        exit_date: form.exit_date || null,
        property_id: form.property_id || null,
        payment_cycle: form.payment_cycle,
        notes: form.notes || null,
        status: "active" as const,
      };

      const result = await createTenant.mutateAsync(tenantData);

      if (file && result?.id) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${result.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from("contracts").upload(filePath, file);
        
        if (!uploadError) {
          await supabase.from("documents").insert({
            tenant_id: result.id,
            title: "Contrato Original",
            category: "contract",
            file_name: file.name,
            file_url: filePath,
            file_type: file.type,
          });
        }
      }

      toast.success("Inquilino cadastrado com sucesso!");
      navigate(`/tenants/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar.");
    }
  };

  const u = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Contrato</h1>
          <p className="text-sm text-muted-foreground">Faça upload do PDF e os dados serão extraídos automaticamente</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 gap-4">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              {file ? (
                <span className="flex items-center gap-2 text-foreground font-medium">
                  <FileText className="h-4 w-4" /> {file.name}
                </span>
              ) : (
                "Arraste um contrato PDF ou clique para selecionar"
              )}
            </p>
            <Input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="max-w-xs"
            />
            {file && !extracted && (
              <Button onClick={extractFromPdf} disabled={extracting} className="mt-2">
                {extracting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extraindo dados...</>
                ) : (
                  <><FileText className="mr-2 h-4 w-4" />Extrair dados do PDF</>
                )}
              </Button>
            )}
            {extracted && (
              <p className="text-sm text-success flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Dados extraídos — revise abaixo
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados do Inquilino</CardTitle>
          <CardDescription>Revise e complete as informações antes de salvar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={form.name} onChange={(e) => u("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => u("cpf", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>RG</Label>
              <Input value={form.rg} onChange={(e) => u("rg", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input value={form.phone} onChange={(e) => u("phone", e.target.value)} placeholder="Ex: 85999999999" />
            </div>
            <div className="space-y-2">
              <Label>Imóvel / Condomínio</Label>
              <Select value={form.property_id} onValueChange={(v) => u("property_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nº da Casa</Label>
              <Input value={form.house_number} onChange={(e) => u("house_number", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Aluguel (R$) *</Label>
              <Input type="number" step="0.01" value={form.rent_amount} onChange={(e) => u("rent_amount", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Caução (R$)</Label>
              <Input type="number" step="0.01" value={form.deposit} onChange={(e) => u("deposit", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dia do Pagamento</Label>
              <Input type="number" min={1} max={31} value={form.payment_day} onChange={(e) => u("payment_day", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ciclo de Pagamento</Label>
              <Select value={form.payment_cycle} onValueChange={(v) => u("payment_cycle", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_CYCLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data de Entrada</Label>
              <Input type="date" value={form.entry_date} onChange={(e) => u("entry_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de Saída</Label>
              <Input type="date" value={form.exit_date} onChange={(e) => u("exit_date", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => u("notes", e.target.value)} rows={3} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={createTenant.isPending}>
            {createTenant.isPending ? "Salvando..." : "Salvar Inquilino e Anexar Contrato"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
