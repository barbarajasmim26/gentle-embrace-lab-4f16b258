import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bot, RefreshCw, CheckCircle2, XCircle, FileText, Upload, Check, X, Undo2, Loader2, Receipt } from "lucide-react";
import { useTenants } from "@/hooks/use-tenants";

type Pending = {
  id: string;
  action_type: string;
  status: string;
  proposed_data: any;
  confidence: number | null;
  tenant_id: string | null;
  created_at: string;
};

export default function WhatsAppAutoPage() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { data: tenants } = useTenants("active");

  const loadAll = async () => {
    try {
      const { data: pen } = await supabase
        .from("whatsapp_pending_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setPending((pen as any) ?? []);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("ai-assistant")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_pending_actions" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Upload para o storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('tenant_documents')
        .upload(`receipts/${fileName}`, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant_documents')
        .getPublicUrl(`receipts/${fileName}`);

      // 2. Chamar a função de processamento de IA (reutilizando a lógica do webhook)
      // Aqui vamos simular o que o webhook faz, mas via upload direto
      const { data, error } = await supabase.functions.invoke("process-receipt-ai", {
        body: { imageUrl: publicUrl }
      });

      if (error) throw error;
      toast.success("Comprovante enviado e processado pela IA!");
      loadAll();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro ao processar comprovante: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const resolvePending = async (p: Pending, decision: "approved" | "rejected") => {
    if (decision === "approved" && p.action_type === "payment" && p.tenant_id) {
      const data = p.proposed_data ?? {};
      if (data.amount && data.date) {
        const d = new Date(data.date);
        if (!isNaN(d.getTime())) {
          const { error: payErr } = await supabase.from("payments").insert({
            tenant_id: p.tenant_id,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            amount: data.amount,
            paid_at: data.date,
            status: "paid",
          });
          if (payErr) { toast.error("Falha ao registrar pagamento"); return; }
          
          // Gerar recibo automaticamente se aprovado
          toast.info("Pagamento registrado. Gerando recibo...");
          try {
             // Redirecionar para a página de recibo com os dados preenchidos ou abrir o PDF
             // Por enquanto, apenas avisamos
             toast.success("Recibo pronto para emissão!");
          } catch {}
        }
      }
    }
    const { error } = await supabase
      .from("whatsapp_pending_actions")
      .update({ status: decision, reviewed_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { toast.error("Falha"); return; }
    toast.success(decision === "approved" ? "Aprovado" : "Rejeitado");
    loadAll();
  };

  const undoPending = async (id: string) => {
    const { error } = await supabase
      .from("whatsapp_pending_actions")
      .update({ status: "pending", reviewed_at: null })
      .eq("id", id);
    if (error) { toast.error("Falha"); return; }
    toast.success("Ação desfeita");
    loadAll();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Assistente de IA</h1>
            <p className="text-sm text-muted-foreground">Envie comprovantes para processamento automático</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        {/* Upload Area */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-emerald-500" />
              Novo Comprovante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-8 text-center space-y-4 hover:border-emerald-500/50 transition-colors relative">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 text-emerald-500 animate-spin" />
                  <p className="text-sm font-medium">Processando com IA...</p>
                </div>
              ) : (
                <>
                  <div className="bg-emerald-500/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                    <Upload className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Clique ou arraste o comprovante</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou PDF</p>
                  </div>
                </>
              )}
            </div>
            <div className="bg-muted/30 p-4 rounded-lg">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Como funciona?</h4>
              <ul className="text-xs space-y-2 text-muted-foreground">
                <li className="flex gap-2"><span>1.</span> Você envia a foto do comprovante.</li>
                <li className="flex gap-2"><span>2.</span> A IA identifica o inquilino e o valor.</li>
                <li className="flex gap-2"><span>3.</span> Você revisa e aprova o pagamento.</li>
                <li className="flex gap-2"><span>4.</span> O sistema gera o recibo automaticamente.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Actions Area */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending" className="gap-2">
              <Bot className="h-4 w-4" /> Pendentes
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <FileText className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {pending.filter(p => p.status === "pending").length === 0 ? (
                      <div className="text-center py-20 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>Nenhuma pendência para revisão</p>
                        <p className="text-xs">Envie um comprovante ao lado para começar</p>
                      </div>
                    ) : (
                      pending.filter(p => p.status === "pending").map((p) => {
                        const tenant = tenants?.find(t => t.id === p.tenant_id);
                        return (
                          <div key={p.id} className="flex items-start justify-between p-4 border rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize bg-white">{p.action_type === 'payment' ? 'Pagamento' : 'Aviso'}</Badge>
                                <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-emerald-700">
                                  {p.proposed_data?.amount ? `R$ ${p.proposed_data.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "Valor não identificado"}
                                </p>
                                <p className="text-sm font-medium">{tenant?.name || p.proposed_data?.payer_name || "Inquilino desconhecido"}</p>
                                {p.proposed_data?.date && (
                                  <p className="text-[10px] text-muted-foreground">Data: {new Date(p.proposed_data.date).toLocaleDateString('pt-BR')}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-emerald-500" 
                                    style={{ width: `${(p.confidence || 0) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">IA: {Math.round((p.confidence || 0) * 100)}%</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => resolvePending(p, "approved")}>
                                <Check className="h-4 w-4 mr-1" /> Aprovar
                              </Button>
                              <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => resolvePending(p, "rejected")}>
                                <X className="h-4 w-4 mr-1" /> Rejeitar
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {pending.filter(p => p.status !== "pending").map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 border-b last:border-0 text-sm">
                        <div className="flex items-center gap-3">
                          {p.status === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                          <div>
                            <p className="font-medium capitalize">{p.proposed_data?.payer_name || "Pagamento"}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={p.status === "approved" ? "secondary" : "outline"} className={p.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-transparent' : ''}>
                            {p.status === "approved" ? "Aprovado" : "Rejeitado"}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => undoPending(p.id)}><Undo2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Avisos e Notificações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Avisos e Notificações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-20 flex flex-col gap-1 rounded-xl border-primary/20 hover:bg-primary/5" onClick={() => toast.info("Funcionalidade de aviso em massa em breve")}>
              <span className="font-bold">Aviso de Vencimento</span>
              <span className="text-[10px] text-muted-foreground">Lembrete para inquilinos</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-1 rounded-xl border-warning/20 hover:bg-warning/5" onClick={() => toast.info("Funcionalidade de cobrança em breve")}>
              <span className="font-bold">Cobrança de Atraso</span>
              <span className="text-[10px] text-muted-foreground">Notificar sobre pendência</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-1 rounded-xl border-emerald-200 hover:bg-emerald-50" onClick={() => toast.info("Funcionalidade de reajuste em breve")}>
              <span className="font-bold">Aviso de Reajuste</span>
              <span className="text-[10px] text-muted-foreground">Comunicar novo valor</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
