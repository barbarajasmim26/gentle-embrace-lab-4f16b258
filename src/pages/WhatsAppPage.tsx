import { useState, useMemo } from "react";
import { useTenants } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { openWhatsApp, buildWhatsAppUrl, getMessageTemplates } from "@/lib/whatsapp";
import { toast } from "sonner";
import { Send, MessageCircle, ExternalLink, CheckCircle2 } from "lucide-react";

type TemplateKey = "reminder" | "overdue" | "expiring" | "confirmation" | "welcome" | "custom";

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  reminder: "Lembrete de aluguel",
  overdue: "Cobrança com multa/juros",
  expiring: "Aviso de vencimento de contrato",
  confirmation: "Confirmação de pagamento",
  welcome: "Boas-vindas",
  custom: "Mensagem personalizada",
};

export default function WhatsAppPage() {
  const { data: tenants } = useTenants("active");
  const [template, setTemplate] = useState<TemplateKey>("reminder");
  const [customMessage, setCustomMessage] = useState("");
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [mode, setMode] = useState<"individual" | "mass">("individual");
  const [singleTenant, setSingleTenant] = useState("");
  const [sentTenants, setSentTenants] = useState<string[]>([]);

  const now = new Date();

  const getMessageForTenant = (tenantId: string) => {
    const t = tenants?.find((x) => x.id === tenantId);
    if (!t) return "";
    if (template === "custom") return customMessage;
    const templates = getMessageTemplates({
      name: t.name, amount: Number(t.rent_amount),
      month: now.getMonth() + 1, year: now.getFullYear(),
      property: t.property?.address || "", houseNumber: t.house_number || "",
      dueDay: t.payment_day || 10,
    });
    return templates[template as keyof typeof templates] || customMessage;
  };

  const handleSendIndividual = () => {
    const t = tenants?.find((x) => x.id === singleTenant);
    if (!t?.phone) { toast.error("Selecione um inquilino com telefone."); return; }
    const message = getMessageForTenant(singleTenant);
    if (message) openWhatsApp({ phone: t.phone, message });
    toast.success(`WhatsApp aberto para ${t.name}.`);
  };

  const handleSendOne = (tenantId: string) => {
    const t = tenants?.find((x) => x.id === tenantId);
    if (!t?.phone) return;
    const message = getMessageForTenant(tenantId);
    if (message) openWhatsApp({ phone: t.phone, message });
    setSentTenants((prev) => prev.includes(tenantId) ? prev : [...prev, tenantId]);
  };

  const massLinks = useMemo(() => {
    return selectedTenants.map((id) => {
      const t = tenants?.find((x) => x.id === id);
      if (!t?.phone) return null;
      const message = getMessageForTenant(id);
      return { id, name: t.name, phone: t.phone, message, url: buildWhatsAppUrl({ phone: t.phone, message }) };
    }).filter(Boolean) as { id: string; name: string; phone: string; message: string; url: string }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenants, tenants, template, customMessage]);

  const toggleTenant = (id: string) => {
    setSelectedTenants((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setSentTenants((prev) => prev.filter((x) => x !== id));
  };

  const selectAll = () => {
    const withPhone = tenants?.filter((t) => t.phone)?.map((t) => t.id) || [];
    setSelectedTenants(withPhone);
    setSentTenants([]);
  };

  const tenant = tenants?.find((t) => t.id === singleTenant);
  const previewMessage = mode === "individual" && tenant
    ? getMessageForTenant(singleTenant)
    : customMessage;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">WhatsApp</h1>

      <div className="flex gap-2">
        <Button variant={mode === "individual" ? "default" : "outline"} onClick={() => setMode("individual")}>Individual</Button>
        <Button variant={mode === "mass" ? "default" : "outline"} onClick={() => setMode("mass")}>Em Massa</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">{mode === "individual" ? "Selecionar Inquilino" : "Selecionar Inquilinos"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mode === "individual" ? (
              <Select value={singleTenant} onValueChange={setSingleTenant}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{tenants?.filter((t) => t.phone).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} - {t.phone}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={selectAll}>Selecionar todos com telefone</Button>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {tenants?.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selectedTenants.includes(t.id)} onCheckedChange={() => toggleTenant(t.id)} disabled={!t.phone} />
                      <span className={!t.phone ? "text-muted-foreground" : ""}>{t.name} {!t.phone && "(sem tel.)"}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div>
              <Label>Modelo de Mensagem</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TEMPLATE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {template === "custom" && (
              <div>
                <Label>Mensagem</Label>
                <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Digite sua mensagem..." rows={4} />
              </div>
            )}

            {mode === "individual" && (
              <Button className="w-full" onClick={handleSendIndividual}><Send className="mr-2 h-4 w-4" />Enviar via WhatsApp</Button>
            )}
          </CardContent>
        </Card>

        {mode === "individual" ? (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageCircle className="h-5 w-5" />Pré-visualização</CardTitle></CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap min-h-[200px]">
                {previewMessage || "Selecione um inquilino e modelo para ver a prévia."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5" />
                Enviar Mensagens ({sentTenants.length}/{massLinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {massLinks.length === 0 ? (
                <p className="text-muted-foreground text-sm">Selecione inquilinos para ver a lista de envio.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {massLinks.map((link) => {
                    const isSent = sentTenants.includes(link.id);
                    return (
                      <div key={link.id} className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${isSent ? "bg-green-500/10 border-green-500/30" : "bg-muted/50"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {isSent && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                          <span className="text-sm font-medium truncate">{link.name}</span>
                          <span className="text-xs text-muted-foreground">{link.phone}</span>
                        </div>
                        <Button
                          size="sm"
                          variant={isSent ? "outline" : "default"}
                          onClick={() => handleSendOne(link.id)}
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          {isSent ? "Reenviar" : "Enviar"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
