import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Save, Percent, MessageCircle, QrCode, Wifi, WifiOff, RefreshCw, Trash2, Eye, EyeOff } from "lucide-react";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/use-settings";
import { useZApiConfig, getZApiStatus, getZApiQrCodeUrl } from "@/hooks/use-zapi";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: settings, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [lateFee, setLateFee] = useState("10");
  const [interest, setInterest] = useState("1");

  const { config, isConfigured, saveConfig, clearConfig } = useZApiConfig();
  const [zapiForm, setZapiForm] = useState({
    instanceId: config.instanceId,
    token: config.token,
    clientToken: config.clientToken,
  });
  const [showToken, setShowToken] = useState(false);
  const [zapiStatus, setZapiStatus] = useState<"idle" | "connected" | "disconnected" | "error" | "checking">("idle");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (settings) {
      setLateFee(String(settings.default_late_fee_percent));
      setInterest(String(settings.default_interest_percent));
    }
  }, [settings]);

  const save = async () => {
    if (!settings) return;
    try {
      await update.mutateAsync({
        id: settings.id,
        default_late_fee_percent: Number(lateFee),
        default_interest_percent: Number(interest),
      });
      toast.success("Configurações salvas!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const saveZapi = () => {
    if (!zapiForm.instanceId || !zapiForm.token || !zapiForm.clientToken) {
      toast.error("Preencha todos os campos da Z-API.");
      return;
    }
    saveConfig(zapiForm);
    toast.success("Credenciais Z-API salvas!");
    setZapiStatus("idle");
    setShowQr(false);
    setQrCodeUrl(null);
  };

  const checkZapiStatus = useCallback(async () => {
    const cfg = { instanceId: zapiForm.instanceId, token: zapiForm.token, clientToken: zapiForm.clientToken };
    if (!cfg.instanceId || !cfg.token || !cfg.clientToken) {
      toast.error("Salve as credenciais primeiro.");
      return;
    }
    setZapiStatus("checking");
    const status = await getZApiStatus(cfg);
    setZapiStatus(status);
    if (status === "connected") {
      toast.success("WhatsApp conectado!");
    } else if (status === "disconnected") {
      toast.info("WhatsApp desconectado. Escaneie o QR Code.");
    } else {
      toast.error("Erro ao conectar. Verifique as credenciais.");
    }
  }, [zapiForm]);

  const loadQrCode = useCallback(async () => {
    const cfg = { instanceId: zapiForm.instanceId, token: zapiForm.token, clientToken: zapiForm.clientToken };
    if (!cfg.instanceId || !cfg.token || !cfg.clientToken) {
      toast.error("Salve as credenciais primeiro.");
      return;
    }
    const url = await getZApiQrCodeUrl(cfg);
    setQrCodeUrl(url);
    setShowQr(true);
  }, [zapiForm]);

  const statusBadge = () => {
    if (zapiStatus === "connected") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1"><Wifi className="h-3 w-3" /> Conectado</Badge>;
    if (zapiStatus === "disconnected") return <Badge className="bg-orange-500/15 text-orange-700 border-orange-500/30 gap-1"><WifiOff className="h-3 w-3" /> Desconectado</Badge>;
    if (zapiStatus === "error") return <Badge variant="destructive" className="gap-1"><WifiOff className="h-3 w-3" /> Erro</Badge>;
    if (zapiStatus === "checking") return <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Verificando…</Badge>;
    if (isConfigured) return <Badge variant="outline" className="gap-1">Configurado</Badge>;
    return <Badge variant="secondary">Não configurado</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Ajustes padrão do sistema</p>
        </div>
      </div>

      {/* Multa e Juros */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4 text-muted-foreground" /> Multa e Juros Padrão
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Aplicados a todos os inquilinos. Cada inquilino pode ter valores próprios no perfil.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Multa (%)</Label>
                  <Input type="number" step="0.1" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Percentual fixo sobre o valor do aluguel.</p>
                </div>
                <div className="space-y-2">
                  <Label>Juros mensal (%)</Label>
                  <Input type="number" step="0.1" value={interest} onChange={(e) => setInterest(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Calculado por dia de atraso (juros simples).</p>
                </div>
              </div>
              <Button onClick={save} disabled={update.isPending} className="w-full rounded-xl gap-2">
                <Save className="h-4 w-4" /> {update.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Z-API WhatsApp */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> Z-API — WhatsApp Real
            </CardTitle>
            {statusBadge()}
          </div>
          <p className="text-xs text-muted-foreground">
            Configure a Z-API para enviar mensagens diretamente pelo WhatsApp sem abrir o navegador.
            Obtenha as credenciais em <a href="https://app.z-api.io" target="_blank" rel="noopener noreferrer" className="underline text-emerald-600">app.z-api.io</a>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instance ID</Label>
            <Input
              placeholder="Ex: 3D9E12345ABCD..."
              value={zapiForm.instanceId}
              onChange={(e) => setZapiForm({ ...zapiForm, instanceId: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Token</Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="Token da instância"
                value={zapiForm.token}
                onChange={(e) => setZapiForm({ ...zapiForm, token: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Client-Token</Label>
            <Input
              type="password"
              placeholder="Client-Token (Security Token)"
              value={zapiForm.clientToken}
              onChange={(e) => setZapiForm({ ...zapiForm, clientToken: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveZapi} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white flex-1">
              <Save className="h-4 w-4" /> Salvar Credenciais
            </Button>
            <Button variant="outline" onClick={checkZapiStatus} disabled={zapiStatus === "checking"} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${zapiStatus === "checking" ? "animate-spin" : ""}`} />
              Verificar Status
            </Button>
          </div>

          {isConfigured && (
            <>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadQrCode} className="gap-2 flex-1">
                  <QrCode className="h-4 w-4" /> {showQr ? "Atualizar QR Code" : "Exibir QR Code"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { clearConfig(); setZapiForm({ instanceId: "", token: "", clientToken: "" }); setZapiStatus("idle"); setShowQr(false); toast.info("Credenciais removidas."); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {showQr && qrCodeUrl && (
                <div className="flex flex-col items-center gap-3 p-4 bg-muted/50 rounded-xl border">
                  <p className="text-sm font-medium">Escaneie com o WhatsApp para conectar</p>
                  <img
                    src={qrCodeUrl}
                    alt="QR Code Z-API"
                    className="w-48 h-48 rounded-xl border bg-white"
                    onError={() => toast.error("Não foi possível carregar o QR Code. Verifique as credenciais.")}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Abra o WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo
                  </p>
                  <Button variant="outline" size="sm" onClick={checkZapiStatus} className="gap-2">
                    <RefreshCw className="h-3 w-3" /> Verificar conexão após escanear
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/20 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-blue-700">Como funciona:</p>
            <p>• Com Z-API configurada, o botão "Enviar" envia direto pela sua conta do WhatsApp</p>
            <p>• Se houver falha, abre o WhatsApp Web como alternativa</p>
            <p>• Todas as mensagens enviadas ficam registradas no Histórico</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
