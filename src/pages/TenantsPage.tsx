import { useState } from "react";
import { useTenants, useCreateTenant, useProperties, useAllPayments } from "@/hooks/use-tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Phone, Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Building, ChevronDown, Users, RefreshCw, FileText, Upload, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isOverdue as checkOverdue, isPaymentPaid } from "@/lib/payment-status";
import { supabase } from "@/integrations/supabase/client";

import TenantCreateDialog from "@/components/tenants/TenantCreateDialog";
import TenantCard from "@/components/tenants/TenantCard";

export default function TenantsPage() {
  const { data: tenants, isLoading, refetch } = useTenants("active");
  const { data: properties } = useProperties();
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const createTenant = useCreateTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [updateData, setUpdateData] = useState<Record<string, { name: string; cpf: string }>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [tenantsWithoutContract, setTenantsWithoutContract] = useState<any[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<Array<{ file: string; status: "ok" | "fail"; message: string }>>([]);

  const loadTenantsWithoutContract = async () => {
    if (!tenants) return;
    const ids = tenants.map((t) => t.id);
    const { data: docs } = await supabase
      .from("documents")
      .select("tenant_id")
      .in("tenant_id", ids)
      .or("category.eq.contract,file_type.eq.contract");
    const withContract = new Set((docs || []).map((d: any) => d.tenant_id));
    setTenantsWithoutContract(tenants.filter((t) => !withContract.has(t.id)));
  };

  const openBulkDialog = async () => {
    await loadTenantsWithoutContract();
    setBulkResults([]);
    setBulkOpen(true);
  };

  const normalize = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

  const matchTenant = (extracted: { name: string; cpf: string }, candidates: any[]) => {
    const cpfDigits = (extracted.cpf || "").replace(/\D/g, "");
    if (cpfDigits.length === 11) {
      const byCpf = candidates.find((t) => (t.cpf || "").replace(/\D/g, "") === cpfDigits);
      if (byCpf) return byCpf;
    }
    const exName = normalize(extracted.name);
    if (!exName) return null;
    // exact normalized match
    const exact = candidates.find((t) => normalize(t.name) === exName);
    if (exact) return exact;
    // token overlap >= 2 tokens (first+last name)
    const exTokens = exName.split(/\s+/).filter((w) => w.length > 2);
    let best: { t: any; score: number } | null = null;
    for (const t of candidates) {
      const tTokens = normalize(t.name).split(/\s+/);
      const overlap = exTokens.filter((w) => tTokens.includes(w)).length;
      if (overlap >= 2 && (!best || overlap > best.score)) best = { t, score: overlap };
    }
    return best?.t || null;
  };

  const handleBulkUpload = async (files: FileList) => {
    setBulkProcessing(true);
    const results: typeof bulkResults = [];
    let pool = [...tenantsWithoutContract];

    for (const file of Array.from(files)) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(((r.result as string).split(",")[1]) || "");
          r.onerror = reject;
          r.readAsDataURL(file);
        });

        const { data, error } = await supabase.functions.invoke("extract-contract", {
          body: { pdf_base64: base64 },
        });
        if (error || data?.error) throw new Error(error?.message || data?.error || "Falha na extração");

        const matched = matchTenant({ name: data?.name || "", cpf: data?.cpf || "" }, pool);
        if (!matched) {
          results.push({ file: file.name, status: "fail", message: `Sem correspondência (${data?.name || "?"})` });
          continue;
        }

        const filePath = `${matched.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("contracts").upload(filePath, file);
        if (upErr) throw upErr;

        await supabase.from("documents").insert({
          tenant_id: matched.id,
          file_name: file.name,
          file_url: filePath,
          file_type: "contract",
          category: "contract",
          title: `Contrato - ${matched.name}`,
        });

        const updates: any = {};
        if (data?.name && !matched.name) updates.name = data.name;
        if (data?.cpf && !matched.cpf) updates.cpf = data.cpf;
        if (Object.keys(updates).length) {
          await supabase.from("tenants").update(updates).eq("id", matched.id);
        }

        pool = pool.filter((t) => t.id !== matched.id);
        results.push({ file: file.name, status: "ok", message: `→ ${matched.name}` });
      } catch (err: any) {
        results.push({ file: file.name, status: "fail", message: err.message || "Erro" });
      }
      setBulkResults([...results]);
    }

    setBulkProcessing(false);
    await loadTenantsWithoutContract();
    refetch?.();
    toast.success(`${results.filter((r) => r.status === "ok").length}/${results.length} contratos vinculados`);
  };

  const handleExtractFromContract = async (tenantId: string, file: File) => {
    setExtractingId(tenantId);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-contract", {
        body: { pdf_base64: base64 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const name = (data?.name || "").trim();
      const cpf = (data?.cpf || "").trim();

      if (!name && !cpf) {
        toast.warning("Não foi possível extrair nome ou CPF deste contrato.");
        return;
      }

      setSelectedTenants((prev) => (prev.includes(tenantId) ? prev : [...prev, tenantId]));
      setUpdateData((prev) => ({
        ...prev,
        [tenantId]: {
          name: name || prev[tenantId]?.name || tenants?.find((t) => t.id === tenantId)?.name || "",
          cpf: cpf || prev[tenantId]?.cpf || tenants?.find((t) => t.id === tenantId)?.cpf || "",
        },
      }));
      toast.success(`Dados extraídos: ${name || "(sem nome)"} ${cpf ? `- ${cpf}` : ""}`);
    } catch (err: any) {
      toast.error("Erro ao extrair contrato: " + (err.message || "desconhecido"));
    } finally {
      setExtractingId(null);
    }
  };

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const filtered = tenants?.filter((t) => {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.house_number?.toLowerCase().includes(q) || t.property?.address?.toLowerCase().includes(q);
  });

  const grouped: Record<string, any[]> = (filtered || []).reduce((acc: Record<string, any[]>, t: any) => {
    const key = t.property_id || "sem-imovel";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const getPropertyName = (propertyId: string) => {
    if (propertyId === "sem-imovel") return "Sem Condomínio";
    const prop = properties?.find(p => p.id === propertyId);
    return prop?.name || prop?.address || "Condomínio";
  };

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getPaymentPattern = (tenantId: string) => {
    const tenant = tenants?.find((t) => t.id === tenantId);
    if (!tenant) return null;

    if (tenant.status === "irregular") {
      return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30" };
    }

    return { label: "Normal", icon: TrendingUp, colorClass: "bg-success/10 text-success border-success/30" };
  };

  const isOverdue = (tenantId: string) => {
    const tenant = tenants?.find((t) => t.id === tenantId);
    if (!tenant) return false;
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    if (isPaymentPaid(payment?.status) || payment?.status === "deposit") return false;
    return checkOverdue(month, year, tenant.payment_day || 10, tenant.payment_cycle, now);
  };

  const isPaid = (tenantId: string) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    return isPaymentPaid(payment?.status);
  };

  const handleSelectTenant = (tenantId: string) => {
    setSelectedTenants(prev => 
      prev.includes(tenantId) ? prev.filter(id => id !== tenantId) : [...prev, tenantId]
    );
    
    const tenant = tenants?.find(t => t.id === tenantId);
    if (tenant && !updateData[tenantId]) {
      setUpdateData(prev => ({
        ...prev,
        [tenantId]: { name: tenant.name || "", cpf: tenant.cpf || "" }
      }));
    }
  };

  const handleUpdateData = (tenantId: string, field: "name" | "cpf", value: string) => {
    setUpdateData(prev => ({
      ...prev,
      [tenantId]: { ...prev[tenantId], [field]: value }
    }));
  };

  const handleBulkUpdate = async () => {
    if (selectedTenants.length === 0) {
      toast.error("Selecione pelo menos um inquilino");
      return;
    }

    setIsUpdating(true);
    try {
      for (const tenantId of selectedTenants) {
        const data = updateData[tenantId];
        if (!data) continue;

        const { error } = await supabase
          .from("tenants")
          .update({
            name: data.name,
            cpf: data.cpf
          })
          .eq("id", tenantId);

        if (error) {
          toast.error(`Erro ao atualizar ${data.name}: ${error.message}`);
          continue;
        }
      }

      toast.success(`${selectedTenants.length} inquilino(s) atualizado(s) com sucesso!`);
      setSelectedTenants([]);
      setUpdateData({});
      setUpdateDialogOpen(false);
      refetch?.();
    } catch (err: any) {
      toast.error("Erro ao processar atualização: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos Ativos</h1>
          <p className="text-sm text-muted-foreground">{filtered?.length || 0} inquilinos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={bulkOpen} onOpenChange={(o) => (o ? openBulkDialog() : setBulkOpen(false))}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Contratos (IA)
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Upload em Massa de Contratos
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium mb-2">
                    {tenantsWithoutContract.length} inquilino(s) ativo(s) sem contrato:
                  </p>
                  {tenantsWithoutContract.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Todos os inquilinos já têm contrato anexado. 🎉</p>
                  ) : (
                    <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                      {tenantsWithoutContract.map((t) => (
                        <li key={t.id}>
                          • {t.name} {t.house_number ? `- Casa ${t.house_number}` : ""} ({t.property?.address || "sem endereço"})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <label className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition ${bulkProcessing ? "opacity-50 pointer-events-none" : ""}`}>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    disabled={bulkProcessing || tenantsWithoutContract.length === 0}
                    onChange={(e) => {
                      if (e.target.files?.length) handleBulkUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {bulkProcessing ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Processando contratos com IA...
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">Clique para selecionar vários PDFs</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        A IA vai ler cada contrato, identificar o inquilino e anexar no perfil correto.
                      </p>
                    </>
                  )}
                </label>

                {bulkResults.length > 0 && (
                  <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-3">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="text-xs flex gap-2">
                        <span className={r.status === "ok" ? "text-success" : "text-destructive"}>
                          {r.status === "ok" ? "✓" : "✗"}
                        </span>
                        <span className="font-mono truncate flex-1">{r.file}</span>
                        <span className="text-muted-foreground">{r.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Atualizar Dados
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Atualizar Dados de Inquilinos
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Selecione os inquilinos e edite Nome e CPF, ou use <strong>Extrair do contrato</strong> para preencher automaticamente via IA a partir de um PDF.
                </p>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto border rounded-lg p-4">
                  {tenants?.map((tenant) => (
                    <div key={tenant.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={selectedTenants.includes(tenant.id)}
                        onCheckedChange={() => handleSelectTenant(tenant.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground">Nome Completo</Label>
                            <Input
                              value={updateData[tenant.id]?.name || tenant.name || ""}
                              onChange={(e) => handleUpdateData(tenant.id, "name", e.target.value)}
                              disabled={!selectedTenants.includes(tenant.id)}
                              className="text-sm"
                              placeholder="Nome completo"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground">CPF</Label>
                            <Input
                              value={updateData[tenant.id]?.cpf || tenant.cpf || ""}
                              onChange={(e) => handleUpdateData(tenant.id, "cpf", e.target.value)}
                              disabled={!selectedTenants.includes(tenant.id)}
                              className="text-sm"
                              placeholder="000.000.000-00"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{tenant.property?.address} {tenant.house_number ? `- Casa ${tenant.house_number}` : ""}</p>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="hidden"
                              disabled={extractingId === tenant.id}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleExtractFromContract(tenant.id, f);
                                e.target.value = "";
                              }}
                            />
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-background hover:bg-accent transition-colors">
                              {extractingId === tenant.id ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Lendo contrato...</>
                              ) : (
                                <><Upload className="h-3 w-3" /> Extrair do contrato</>
                              )}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm font-medium">
                    {selectedTenants.length} inquilino(s) selecionado(s)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleBulkUpdate} 
                      disabled={selectedTenants.length === 0 || isUpdating}
                      className="gap-2"
                    >
                      {isUpdating ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Atualizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Atualizar Selecionados
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <TenantCreateDialog
            open={open}
            onOpenChange={setOpen}
            properties={properties}
            createTenant={createTenant}
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, casa ou endereço..." className="pl-10 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([propertyId, groupTenants]) => {
            const isOpen = openGroups[propertyId] ?? false;
            const overdueCount = groupTenants.filter(t => isOverdue(t.id)).length;
            return (
              <Collapsible key={propertyId} open={isOpen} onOpenChange={() => toggleGroup(propertyId)}>
                <CollapsibleTrigger asChild>
                  <Card className="cursor-pointer hover:shadow-md transition-all">
                    <CardContent className="flex items-center justify-between py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{getPropertyName(propertyId)}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {groupTenants.length} morador{groupTenants.length !== 1 ? "es" : ""}
                            {overdueCount > 0 && (
                              <Badge variant="destructive" className="text-[10px] ml-2">{overdueCount} atrasado{overdueCount !== 1 ? "s" : ""}</Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </CardContent>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 pl-2">
                    {groupTenants.map((t) => (
                      <TenantCard
                        key={t.id}
                        tenant={t}
                        overdue={isOverdue(t.id)}
                        paid={isPaid(t.id)}
                        pattern={getPaymentPattern(t.id)}
                        onClick={() => navigate(`/tenants/${t.id}`)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
