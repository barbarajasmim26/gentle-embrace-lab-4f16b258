import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessageTemplates, TEMPLATE_LABELS, type TemplateKey } from "@/hooks/use-message-templates";
import { toast } from "sonner";
import { Bot, RefreshCw, QrCode, CheckCircle2, XCircle, AlertTriangle, Inbox, ShieldAlert, Check, X, Send, Undo2, FileText } from "lucide-react";

type Config = {
  id: string;
  connection_status: string;
  qr_code: string | null;
  last_status_check: string | null;
  last_webhook_at: string | null;
  auto_approve_payments: boolean;
  auto_approve_profile: boolean;
  auto_send_receipt: boolean;
};

type Pending = {
  id: string;
  action_type: string;
  status: string;
  proposed_data: any;
  confidence: number | null;
  tenant_id: string | null;
  created_at: string;
};

type Message = {
  id: string;
  direction: string;
  from_phone: string;
  to_phone: string | null;
  body: string | null;
  message_type: string;
  media_url: string | null;
  ai_extracted: any;
  created_at: string;
  tenant_id: string | null;
};

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zapi-webhook`;

export default function WhatsAppAutoPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checking, setChecking] = useState(false);
  const [testPhone, setTestPhone] = useState("5513988312733");
  const [sendingTest, setSendingTest] = useState(false);
  const { templates, updateTemplate, resetTemplate, isModified } = useMessageTemplates();

  const loadAll = async () => {
    const [{ data: cfg }, { data: pen }, { data: msg }] = await Promise.all([
      supabase.from("whatsapp_config").select("*").limit(1).maybeSingle(),
      supabase.from("whatsapp_pending_actions").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("whatsapp_messages").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setConfig(cfg as any);
    setPending((pen as any) ?? []);
    setMessages((msg as any) ?? []);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("wa-auto")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_pending_actions" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_config" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-status");
      if (error) throw error;
      toast.success(`Status: ${data?.connectionStatus ?? "?"}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao consultar Z-API");
    } finally {
      setChecking(false);
    }
  };

  const updateToggle = async (field: "auto_approve_payments" | "auto_approve_profile" | "auto_send_receipt", value: boolean) => {
    if (!config) return;
    const patch = { [field]: value } as Record<typeof field, boolean>;
    const { error } = await supabase.from("whatsapp_config").update(patch).eq("id", config.id);
    if (error) { toast.error("Falha ao salvar"); return; }
    setConfig({ ...config, [field]: value });
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
          if (config?.auto_send_receipt) {
            try { await supabase.functions.invoke("zapi-send-receipt", { body: { tenantId: p.tenant_id } }); } catch {}
          }
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

  const sendTest = async () => {
    if (!testPhone) { toast.error("Informe um número"); return; }
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("zapi-send", {
        body: { type: "text", phone: testPhone, message: "Teste realizado com sucesso ✅ Sistema Mesquita Imóveis conectado ao WhatsApp." },
      });
      if (error) throw error;
      toast.success("Mensagem de teste enviada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no envio");
    } finally {
      setSendingTest(false);
    }
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

  const statusBadge = () => {
    const s = config?.connection_status ?? "disconnected";
    if (s === "connected") return <Badge className="bg-emerald-500 hover:bg-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" />Conectado</Badge>;
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Automático</h1>
          <p className="text-sm text-muted-foreground">Integração via Z-API — recebe comprovantes e atualiza pagamentos</p>
        </div>
      </div>

      <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Z-API não é API oficial da Meta</AlertTitle>
        <AlertDescription>
          A automação usa seu WhatsApp via QR Code. Existe risco de desconexão ou bloqueio do número pela Meta. Use um chip dedicado.
        </AlertDescription>
      </Alert>

      {/* Conexão */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">Status da conexão {statusBadge()}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Última verificação: {config?.last_status_check ? new Date(config.last_status_check).toLocaleString("pt-BR") : "—"}
              {" · "}Último webhook: {config?.last_webhook_at ? new Date(config.last_webhook_at).toLocaleString("pt-BR") : "—"}
            </p>
          </div>
          <Button onClick={checkStatus} disabled={checking} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            Verificar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {config?.connection_status !== "connected" && config?.qr_code && (
            <div className="flex flex-col items-center gap-2 p-4 border rounded-xl bg-muted/30">
              <QrCode className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Escaneie o QR Code com o WhatsApp</p>
              <img src={config.qr_code} alt="QR Code Z-API" className="w-56 h-56 border rounded-lg bg-white p-2" />
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">URL do Webhook (configure na Z-API)</p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded-md break-all">{WEBHOOK_URL}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); toast.success("Copiado"); }}>Copiar</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              No painel Z-API → Webhook → "Ao receber mensagens", cole essa URL.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Automação */}
      <Card>
        <CardHeader><CardTitle>Automação híbrida</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Aprovar pagamentos automaticamente</Label>
              <p className="text-xs text-muted-foreground">Quando valor e inquilino baterem com confiança ≥ 85%.</p>
            </div>
            <Switch checked={!!config?.auto_approve_payments} onCheckedChange={(v) => updateToggle("auto_approve_payments", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Aprovar mudanças de cadastro automaticamente</Label>
              <p className="text-xs text-muted-foreground">Recomendado deixar desligado.</p>
            </div>
            <Switch checked={!!config?.auto_approve_profile} onCheckedChange={(v) => updateToggle("auto_approve_profile", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Enviar recibo automaticamente após confirmar</Label>
              <p className="text-xs text-muted-foreground">Gera PDF e envia pelo WhatsApp.</p>
            </div>
            <Switch checked={!!config?.auto_send_receipt} onCheckedChange={(v) => updateToggle("auto_send_receipt", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Pendências */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Pendências para revisão ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma pendência. ✅</p>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => (
                <div key={p.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{p.action_type}</Badge>
                      {p.confidence != null && (
                        <span className="text-xs text-muted-foreground">{Math.round(p.confidence * 100)}% confiança</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(p.proposed_data, null, 2)}</pre>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => resolvePending(p, "approved")}>
                      <Check className="h-3 w-3 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolvePending(p, "rejected")}>
                      <X className="h-3 w-3 mr-1" />Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Histórico de mensagens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Sem mensagens ainda.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`p-3 rounded-lg border text-sm ${m.direction === "inbound" ? "bg-muted/40" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">
                      {m.direction === "inbound" ? `📥 ${m.from_phone}` : `📤 ${m.to_phone}`} · {m.message_type}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  {m.body && <p className="text-sm">{m.body}</p>}
                  {m.media_url && <a href={m.media_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver mídia</a>}
                  {m.ai_extracted && (
                    <div className="mt-2 text-xs bg-background/50 rounded p-2">
                      <span className="font-medium">IA:</span> R$ {m.ai_extracted.amount ?? "—"} · {m.ai_extracted.date ?? "—"} · {m.ai_extracted.payer_name ?? "—"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
