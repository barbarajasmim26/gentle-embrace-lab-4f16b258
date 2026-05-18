import { useState, useMemo } from "react";
import { useTenants } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { openWhatsApp, buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  useMessageTemplates,
  fillTemplate,
  TEMPLATE_LABELS,
  type TemplateKey,
  type FillData,
} from "@/hooks/use-message-templates";
import { useZApiConfig, sendViaZApi } from "@/hooks/use-zapi";
import { useAllWhatsAppMessages, useSaveWhatsAppMessage } from "@/hooks/use-whatsapp-messages";
import { toast } from "sonner";
import { Send, MessageCircle, ExternalLink, CheckCircle2, Pencil, Save, X, Copy, User, History, Zap, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TEMPLATE_ICONS: Record<string, string> = {
  reminder: "🔔",
  overdue: "⚠️",
  due_notice: "📮",
  payment_confirm: "✅",
  welcome: "🎉",
  custom: "✏️",
};

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Mode = "individual" | "mass" | "history";

export default function WhatsAppPage() {
  const { data: tenants } = useTenants("active");
  const { templates, updateTemplate } = useMessageTemplates();
  const { config: zapiConfig, isConfigured: zapiConfigured } = useZApiConfig();
  const { data: allMessages, isLoading: messagesLoading } = useAllWhatsAppMessages();
  const saveMessage = useSaveWhatsAppMessage();

  const [template, setTemplate] = useState<TemplateKey | "custom">("reminder");
  const [customMessage, setCustomMessage] = useState("");
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("individual");
  const [singleTenant, setSingleTenant] = useState("");
  const [sentTenants, setSentTenants] = useState<string[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [refMonth, setRefMonth] = useState(String(new Date().getMonth() + 1));
  const [refYear, setRefYear] = useState(String(new Date().getFullYear()));
  const [editingKey, setEditingKey] = useState<TemplateKey | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [sending, setSending] = useState(false);

  const DEFAULT_LATE_FEE = 10;
  const DEFAULT_INTEREST = 1;

  const buildFillData = (tenantId: string): FillData | null => {
    const t = tenants?.find((x) => x.id === tenantId);
    if (!t) return null;
    const amount = Number(t.rent_amount);
    const fee = amount * (DEFAULT_LATE_FEE / 100);
    const int = amount * (DEFAULT_INTEREST / 100);
    return {
      name: t.name, amount,
      month: Number(refMonth), year: Number(refYear),
      property: t.property?.address || "", houseNumber: t.house_number || "",
      dueDay: t.payment_day || 10,
      lateFee: DEFAULT_LATE_FEE,
      interest: DEFAULT_INTEREST,
      totalWithFees: amount + fee + int,
    };
  };

  const getMessageForTenant = (tenantId: string) => {
    const data = buildFillData(tenantId);
    if (!data) return "";
    if (template === "custom") return customMessage;
    return fillTemplate(templates[template as TemplateKey], data);
  };

  const doSend = async (phone: string, message: string, tenantId?: string, tenantName?: string) => {
    if (zapiConfigured) {
      const result = await sendViaZApi(zapiConfig, phone, message);
      if (result.success) {
        await saveMessage.mutateAsync({ to_phone: phone, body: message, tenant_id: tenantId || null });
        toast.success(`Enviado via Z-API para ${tenantName || phone}`);
        return true;
      } else {
        toast.warning(`Z-API falhou, abrindo WhatsApp Web… (${result.error})`);
        openWhatsApp({ phone, message });
        await saveMessage.mutateAsync({ to_phone: phone, body: message, tenant_id: tenantId || null });
        return false;
      }
    } else {
      openWhatsApp({ phone, message });
      await saveMessage.mutateAsync({ to_phone: phone, body: message, tenant_id: tenantId || null });
      toast.success(`WhatsApp aberto para ${tenantName || phone}`);
      return true;
    }
  };

  const handleSendIndividual = async () => {
    const t = tenants?.find((x) => x.id === singleTenant);
    const phone = whatsappNumber || t?.phone;
    if (!phone) { toast.error("Informe um número de WhatsApp."); return; }
    const message = getMessageForTenant(singleTenant);
    setSending(true);
    await doSend(phone, message, t?.id, t?.name);
    setSending(false);
  };

  const handleSendOne = async (tenantId: string) => {
    const t = tenants?.find((x) => x.id === tenantId);
    if (!t?.phone) return;
    const message = getMessageForTenant(tenantId);
    await doSend(t.phone, message, t.id, t.name);
    setSentTenants((prev) => (prev.includes(tenantId) ? prev : [...prev, tenantId]));
  };

  const massLinks = useMemo(() => {
    return selectedTenants
      .map((id) => {
        const t = tenants?.find((x) => x.id === id);
        if (!t?.phone) return null;
        const message = getMessageForTenant(id);
        return { id, name: t.name, phone: t.phone, message, url: buildWhatsAppUrl({ phone: t.phone, message }) };
      })
      .filter(Boolean) as { id: string; name: string; phone: string; message: string; url: string }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenants, tenants, template, customMessage, templates, refMonth, refYear]);

  const toggleTenant = (id: string) => {
    setSelectedTenants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSentTenants((prev) => prev.filter((x) => x !== id));
  };

  const selectAll = () => {
    const withPhone = tenants?.filter((t) => t.phone)?.map((t) => t.id) || [];
    setSelectedTenants(withPhone);
    setSentTenants([]);
  };

  const tenant = tenants?.find((t) => t.id === singleTenant);
  const previewMessage = mode === "individual" ? getMessageForTenant(singleTenant) : "";

  const startEditing = (key: TemplateKey) => { setEditingKey(key); setEditDraft(templates[key]); };
  const saveEditing = () => { if (editingKey) { updateTemplate(editingKey, editDraft); toast.success("Modelo salvo!"); } setEditingKey(null); };
  const cancelEditing = () => { setEditingKey(null); };

  const copyMessage = () => {
    navigator.clipboard.writeText(previewMessage);
    toast.success("Mensagem copiada!");
  };

  const tenantName = (tenantId: string | null) => {
    if (!tenantId) return null;
    return tenants?.find((t) => t.id === tenantId)?.name ?? null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              {zapiConfigured ? (
                <><Zap className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 font-medium">Z-API ativa</span></>
              ) : (
                <><AlertCircle className="h-3 w-3 text-amber-500" /><span className="text-amber-600">Configure Z-API nas Configurações para envio direto</span></>
              )}
            </p>
          </div>
        </div>
        <div className="inline-flex items-center border rounded-xl p-1 gap-1">
          <Button variant={mode === "individual" ? "default" : "ghost"} size="sm" className="rounded-lg px-3 gap-1.5" onClick={() => setMode("individual")}>
            <User className="h-4 w-4" /> Individual
          </Button>
          <Button variant={mode === "mass" ? "default" : "ghost"} size="sm" className="rounded-lg px-3 gap-1.5" onClick={() => setMode("mass")}>
            <Send className="h-4 w-4" /> Em Massa
          </Button>
          <Button variant={mode === "history" ? "default" : "ghost"} size="sm" className="rounded-lg px-3 gap-1.5" onClick={() => setMode("history")}>
            <History className="h-4 w-4" /> Histórico
          </Button>
        </div>
      </div>

      {/* HISTORY TAB */}
      {mode === "history" && (
        <Card className="rounded-2xl">
          <CardContent className="pt-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Histórico de Mensagens Enviadas
            </h3>
            {messagesLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Carregando...</div>
            ) : !allMessages?.length ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <MessageCircle className="h-8 w-8 opacity-30" />
                <p>Nenhuma mensagem enviada ainda.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                <div className="space-y-3 pr-2">
                  {allMessages.map((msg) => (
                    <div key={msg.id} className="p-3 rounded-xl border bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{msg.direction === "outbound" ? "Enviado" : "Recebido"}</Badge>
                          {msg.tenant_id && (
                            <span className="text-xs font-medium text-foreground">{tenantName(msg.tenant_id) ?? msg.tenant_id}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{msg.to_phone || msg.from_phone}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {msg.received_at ? format(new Date(msg.received_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </span>
                      </div>
                      {msg.body && (
                        <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{msg.body}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* SEND TABS */}
      {mode !== "history" && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: Tenant Selection */}
          <Card className="rounded-2xl">
            <CardContent className="pt-5 pb-5">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                Selecionar Inquilino
              </h3>
              {mode === "individual" ? (
                <div className="space-y-4">
                  <Select value={singleTenant} onValueChange={(v) => { setSingleTenant(v); const t = tenants?.find(x => x.id === v); setWhatsappNumber(t?.phone || ""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {tenants?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">WhatsApp</Label>
                    <Input placeholder="64 9 9999-9999" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button variant="outline" size="sm" onClick={selectAll} className="w-full">Selecionar todos com telefone</Button>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-3">
                      {tenants?.map((t) => (
                        <label key={t.id} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={selectedTenants.includes(t.id)} onCheckedChange={() => toggleTenant(t.id)} disabled={!t.phone} />
                          <span className={!t.phone ? "text-muted-foreground" : ""}>{t.name} {!t.phone && "(sem tel.)"}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Message Configuration */}
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold text-lg">Configurar Mensagem</h3>
              <div className="flex gap-2">
                <Select value={refMonth} onValueChange={setRefMonth}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={refYear} onValueChange={setRefYear}>
                  <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.entries(TEMPLATE_LABELS) as [TemplateKey, string][]).map(([k, v]) => (
                <Button
                  key={k}
                  variant={template === k ? "default" : "outline"}
                  size="sm"
                  className={`rounded-full px-4 gap-1.5 ${template === k ? "shadow-md" : ""}`}
                  onClick={() => setTemplate(k)}
                >
                  {TEMPLATE_ICONS[k]} {v}
                </Button>
              ))}
              <Button
                variant={template === "custom" ? "default" : "outline"}
                size="sm"
                className="rounded-full px-4 gap-1.5"
                onClick={() => setTemplate("custom")}
              >
                ✏️ Personalizada
              </Button>
            </div>

            <Card className="rounded-2xl">
              <CardContent className="pt-5 pb-5">
                {template === "custom" ? (
                  <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Digite sua mensagem..." rows={8} className="font-mono text-sm" />
                ) : editingKey === template ? (
                  <div className="space-y-3">
                    <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={8} className="font-mono text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditing}><Save className="mr-1 h-3 w-3" />Salvar</Button>
                      <Button size="sm" variant="outline" onClick={cancelEditing}><X className="mr-1 h-3 w-3" />Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(template as TemplateKey)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyMessage}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-4 text-sm whitespace-pre-wrap min-h-[200px] border border-border/30">
                      {previewMessage || (
                        <span className="text-muted-foreground">
                          {fillTemplate(templates[template as TemplateKey], {
                            name: "Inquilino", amount: 0, month: Number(refMonth), year: Number(refYear),
                            property: "—", houseNumber: "—", dueDay: 0,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {mode === "individual" ? (
              <Button
                className="w-full h-12 rounded-xl text-white text-base gap-2"
                style={{ backgroundColor: zapiConfigured ? "#059669" : "#10b981" }}
                onClick={handleSendIndividual}
                disabled={sending}
              >
                {zapiConfigured ? <Zap className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                {sending ? "Enviando..." : zapiConfigured ? "Enviar via Z-API" : "Enviar WhatsApp"}
              </Button>
            ) : (
              <Card className="rounded-2xl">
                <CardContent className="pt-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Send className="h-4 w-4" /> Enviar Mensagens ({sentTenants.length}/{massLinks.length})
                  </h3>
                  {massLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Selecione inquilinos para ver a lista.</p>
                  ) : (
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-2 pr-3">
                        {massLinks.map((link) => {
                          const isSent = sentTenants.includes(link.id);
                          return (
                            <div key={link.id} className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${isSent ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/50"}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                {isSent && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                                <span className="text-sm font-medium truncate">{link.name}</span>
                                <span className="text-xs text-muted-foreground">{link.phone}</span>
                              </div>
                              <Button size="sm" variant={isSent ? "outline" : "default"} className={!isSent ? "bg-emerald-500 hover:bg-emerald-600" : ""} onClick={() => handleSendOne(link.id)}>
                                <ExternalLink className="mr-1 h-3 w-3" />{isSent ? "Reenviar" : "Enviar"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
