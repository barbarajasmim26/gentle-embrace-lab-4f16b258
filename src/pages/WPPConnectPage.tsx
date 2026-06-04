import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, QrCode, RefreshCw, LogOut, Send, MessageCircle, Wifi, WifiOff, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/use-tenants";
import { getWppConfig, saveWppConfig, wpp } from "@/lib/wppconnect-client";
import { normalizeBrazilPhone } from "@/lib/whatsapp";

interface MsgRow {
  id: string; direction: string; from_phone: string; to_phone: string | null;
  body: string | null; tenant_id: string | null; received_at: string; message_type: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    connected: { label: "Conectado", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: Wifi },
    qrcode: { label: "Aguardando QR", cls: "bg-amber-100 text-amber-700 border-amber-300", icon: QrCode },
    connecting: { label: "Conectando…", cls: "bg-blue-100 text-blue-700 border-blue-300", icon: Loader2 },
    disconnected: { label: "Desconectado", cls: "bg-rose-100 text-rose-700 border-rose-300", icon: WifiOff },
  };
  const s = map[status] || map.disconnected;
  const Icon = s.icon;
  return <Badge variant="outline" className={`gap-1.5 ${s.cls}`}><Icon className="h-3.5 w-3.5" />{s.label}</Badge>;
}

export default function WPPConnectPage() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState(getWppConfig());
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const { data: tenants = [] } = useTenants();

  // status polling
  const statusQ = useQuery({
    queryKey: ["wpp-status", cfg.baseUrl, cfg.apiKey],
    queryFn: async () => {
      try { const s = await wpp.status(); setServerOnline(true); return s; }
      catch (e: any) { setServerOnline(false); throw e; }
    },
    refetchInterval: 4000,
    retry: false,
  });

  // qr polling quando não conectado
  const qrQ = useQuery({
    queryKey: ["wpp-qr", cfg.baseUrl],
    queryFn: () => wpp.qrCode(),
    refetchInterval: statusQ.data?.status === "connected" ? false : 5000,
    enabled: serverOnline === true && statusQ.data?.status !== "connected",
    retry: false,
  });

  // mensagens recentes
  const msgsQ = useQuery<MsgRow[]>({
    queryKey: ["wpp-messages"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_messages").select("*")
        .order("received_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as MsgRow[]) || [];
    },
    refetchInterval: 6000,
  });

  // realtime
  useEffect(() => {
    const ch = supabase.channel("wpp-messages-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" },
        () => qc.invalidateQueries({ queryKey: ["wpp-messages"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Agrupa por telefone
  const conversations = useMemo(() => {
    const groups = new Map<string, MsgRow[]>();
    for (const m of msgsQ.data || []) {
      const key = (m.direction === "inbound" ? m.from_phone : m.to_phone || m.from_phone) || "—";
      const k = String(key).replace(/\D/g, "");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }
    return Array.from(groups.entries())
      .map(([phone, msgs]) => {
        const tenant = tenants.find(t => String(t.phone || "").replace(/\D/g, "").endsWith(phone.replace(/^55/, "").slice(-11)));
        const inbound = msgs.filter(m => m.direction === "inbound");
        return { phone, tenant, messages: msgs, last: msgs[0], unread: inbound.length };
      })
      .sort((a, b) => new Date(b.last.received_at).getTime() - new Date(a.last.received_at).getTime());
  }, [msgsQ.data, tenants]);

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (!selected && conversations[0]) setSelected(conversations[0].phone); }, [conversations, selected]);
  const current = conversations.find(c => c.phone === selected);
  const chatRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!current || !draft.trim()) return;
    setSending(true);
    try {
      await wpp.send(current.phone, draft, current.tenant?.id);
      setDraft("");
      toast.success("Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["wpp-messages"] });
    } catch (e: any) { toast.error(e.message || "Falha ao enviar"); }
    finally { setSending(false); }
  }

  async function handleAction(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast.success(ok); statusQ.refetch(); qrQ.refetch(); }
    catch (e: any) { toast.error(e.message || "Erro"); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MessageCircle className="h-6 w-6" />Central WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Conectado via WPPConnect local (Windows)</p>
        </div>
        <div className="flex items-center gap-2">
          {serverOnline === false && <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-300 gap-1.5"><Plug className="h-3.5 w-3.5" />Servidor offline</Badge>}
          {statusQ.data && <StatusBadge status={statusQ.data.status} />}
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList>
          <TabsTrigger value="chat">Conversas</TabsTrigger>
          <TabsTrigger value="connection">Conexão / QR</TabsTrigger>
          <TabsTrigger value="settings">Configuração</TabsTrigger>
        </TabsList>

        {/* CHAT */}
        <TabsContent value="chat" className="mt-4">
          <div className="grid grid-cols-12 gap-4 h-[70vh]">
            <Card className="col-span-4 flex flex-col overflow-hidden">
              <CardHeader className="py-3"><CardTitle className="text-sm">Conversas ({conversations.length})</CardTitle></CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {conversations.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>}
                {conversations.map(c => (
                  <button key={c.phone} onClick={() => setSelected(c.phone)}
                    className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 ${selected === c.phone ? "bg-muted" : ""}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm truncate">{c.tenant?.name || `+${c.phone}`}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(c.last.received_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.last.body || `[${c.last.message_type}]`}</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="col-span-8 flex flex-col overflow-hidden">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm">
                  {current ? (current.tenant?.name || `+${current.phone}`) : "Selecione uma conversa"}
                </CardTitle>
              </CardHeader>
              <CardContent ref={chatRef} className="flex-1 overflow-y-auto space-y-2 py-4 bg-muted/20">
                {current?.messages.slice().reverse().map(m => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === "outbound" ? "bg-emerald-500 text-white" : "bg-card border"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body || `[${m.message_type}]`}</p>
                      <p className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-emerald-50" : "text-muted-foreground"}`}>
                        {new Date(m.received_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="p-3 border-t flex gap-2">
                <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Digite uma mensagem…"
                  className="resize-none min-h-[44px] max-h-32" disabled={!current || statusQ.data?.status !== "connected"}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
                <Button onClick={handleSend} disabled={!draft.trim() || sending || statusQ.data?.status !== "connected"}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* CONEXÃO */}
        <TabsContent value="connection" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Sessão WhatsApp</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {serverOnline === false && (
                <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                  Não foi possível falar com o servidor em <code>{cfg.baseUrl}</code>.<br />
                  Verifique se o <strong>start.bat</strong> está rodando no Windows e se a URL/API Key estão corretas na aba <em>Configuração</em>.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => handleAction(wpp.start, "Sessão iniciada")} variant="default">
                  <Plug className="h-4 w-4 mr-2" />Iniciar
                </Button>
                <Button onClick={() => handleAction(wpp.reconnect, "Reconectando…")} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />Reconectar
                </Button>
                <Button onClick={() => handleAction(wpp.logout, "Desconectado")} variant="outline" className="text-rose-700">
                  <LogOut className="h-4 w-4 mr-2" />Sair / Desconectar
                </Button>
              </div>

              {statusQ.data?.status !== "connected" && qrQ.data?.qr && (
                <div className="flex flex-col items-center gap-3 p-6 border rounded-lg bg-card">
                  <p className="text-sm text-muted-foreground">Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho</p>
                  <img src={qrQ.data.qr} alt="QR Code WhatsApp" className="w-64 h-64 border rounded" />
                  <p className="text-xs text-muted-foreground">O QR é atualizado automaticamente a cada poucos segundos.</p>
                </div>
              )}

              {statusQ.data?.status === "connected" && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                  ✅ WhatsApp conectado. Sessão: <code>{statusQ.data.session}</code>
                </div>
              )}

              {statusQ.data?.error && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  Último erro: {statusQ.data.error}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Servidor WPPConnect</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-1">
                <Label>URL do servidor</Label>
                <Input value={cfg.baseUrl} onChange={e => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="http://localhost:3333" />
              </div>
              <div className="space-y-1">
                <Label>API Key (X-Api-Key)</Label>
                <Input value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value })} placeholder="o mesmo valor de WPP_API_KEY no .env" />
              </div>
              <Button onClick={() => { saveWppConfig(cfg); toast.success("Configuração salva"); statusQ.refetch(); }}>
                Salvar
              </Button>
              <div className="text-xs text-muted-foreground border-t pt-3">
                <p className="font-medium mb-1">Como instalar no Windows:</p>
                <ol className="list-decimal pl-5 space-y-0.5">
                  <li>Copie a pasta <code>wppconnect-server</code> para o PC.</li>
                  <li>Instale o Node.js 18+ e rode <code>npm install</code> dentro da pasta.</li>
                  <li>Configure o arquivo <code>.env</code> (veja <code>.env.example</code>).</li>
                  <li>Execute <code>start.bat</code> ou <code>npm start</code>.</li>
                  <li>Volte aqui, conecte e escaneie o QR.</li>
                </ol>
                <p className="mt-2">Documentação completa: <code>wppconnect-server/README.md</code>.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
