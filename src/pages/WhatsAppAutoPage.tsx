import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot, Send, Plus, MessageSquare, Loader2, Upload, Check, X, Undo2,
  CheckCircle2, XCircle, FileText, Sparkles, Receipt, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTenants } from "@/hooks/use-tenants";

type Conversation = { id: string; title: string; updated_at: string };
type Message = { id: string; role: string; content: string; created_at: string };
type Pending = {
  id: string; action_type: string; status: string;
  proposed_data: any; confidence: number | null; tenant_id: string | null; created_at: string;
};

const QUICK_COMMANDS = [
  { label: "Cobrar atrasados", prompt: "Liste os aluguéis atrasados e gere mensagens de cobrança humanizadas." },
  { label: "Vencimentos de hoje", prompt: "Liste os inquilinos com vencimento hoje." },
  { label: "Vencimentos da semana", prompt: "Liste os inquilinos com vencimento nos próximos 7 dias." },
  { label: "Resumir contrato", prompt: "Resuma o contrato do inquilino " },
];

export default function WhatsAppAutoPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: tenants } = useTenants("active");

  const loadConversations = async () => {
    const { data } = await supabase.from("ai_conversations").select("*").order("updated_at", { ascending: false }).limit(30);
    setConversations((data as any) ?? []);
    if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase.from("ai_messages").select("*").eq("conversation_id", convId)
      .in("role", ["user", "assistant"]).order("created_at", { ascending: true });
    setMessages(((data as any) ?? []).filter((m: Message) => m.content?.trim()));
  };

  const loadPending = async () => {
    const { data } = await supabase.from("whatsapp_pending_actions").select("*").order("created_at", { ascending: false }).limit(50);
    setPending((data as any) ?? []);
  };

  useEffect(() => { loadConversations(); loadPending(); }, []);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const newConversation = async () => {
    const { data, error } = await supabase.from("ai_conversations").insert({ title: "Nova conversa" }).select().single();
    if (error) { toast.error("Erro ao criar conversa"); return; }
    setActiveId(data.id);
    setMessages([]);
    loadConversations();
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("ai_conversations").delete().eq("id", id);
    if (activeId === id) { setActiveId(null); setMessages([]); }
    loadConversations();
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    let convId = activeId;
    if (!convId) {
      const { data } = await supabase.from("ai_conversations").insert({ title: msg.slice(0, 40) }).select().single();
      convId = data?.id ?? null;
      setActiveId(convId);
      loadConversations();
    }
    if (!convId) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: "tmp-u", role: "user", content: msg, created_at: new Date().toISOString() }]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { conversation_id: convId, message: msg },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await loadMessages(convId);
      // Atualiza título se for primeira msg
      if (messages.length === 0) {
        await supabase.from("ai_conversations").update({ title: msg.slice(0, 40) }).eq("id", convId);
        loadConversations();
      }
    } catch (e: any) {
      toast.error("Erro IA: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Math.random()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("contracts").upload(`receipts/${fileName}`, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("contracts").getPublicUrl(`receipts/${fileName}`);
      const { error } = await supabase.functions.invoke("process-receipt-ai", { body: { imageUrl: publicUrl } });
      if (error) throw error;
      toast.success("Comprovante processado pela IA!");
      loadPending();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const resolvePending = async (p: Pending, decision: "approved" | "rejected") => {
    if (decision === "approved" && p.action_type === "payment" && p.tenant_id) {
      const d = p.proposed_data ?? {};
      if (d.amount && d.date) {
        const dt = new Date(d.date);
        if (!isNaN(dt.getTime())) {
          await supabase.from("payments").insert({
            tenant_id: p.tenant_id, year: dt.getFullYear(), month: dt.getMonth() + 1,
            amount: d.amount, paid_at: d.date, status: "paid",
          });
        }
      }
    }
    await supabase.from("whatsapp_pending_actions").update({ status: decision, reviewed_at: new Date().toISOString() }).eq("id", p.id);
    toast.success(decision === "approved" ? "Aprovado" : "Rejeitado");
    loadPending();
  };

  const undoPending = async (id: string) => {
    await supabase.from("whatsapp_pending_actions").update({ status: "pending", reviewed_at: null }).eq("id", id);
    loadPending();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Assistente IA</h1>
          <p className="text-sm text-muted-foreground">Sua IA imobiliária inteligente — pergunte qualquer coisa sobre o sistema</p>
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList>
          <TabsTrigger value="chat" className="gap-2"><Bot className="h-4 w-4" />Chat IA</TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2"><Receipt className="h-4 w-4" />Comprovantes</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><FileText className="h-4 w-4" />Histórico de Ações</TabsTrigger>
        </TabsList>

        {/* ============ CHAT ============ */}
        <TabsContent value="chat" className="mt-4">
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            {/* Sidebar conversas */}
            <Card className="h-[650px] flex flex-col">
              <CardHeader className="pb-2">
                <Button onClick={newConversation} className="w-full" size="sm">
                  <Plus className="h-4 w-4 mr-2" />Nova conversa
                </Button>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-2">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {conversations.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem conversas ainda</p>
                    )}
                    {conversations.map((c) => (
                      <div key={c.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${activeId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                        onClick={() => setActiveId(c.id)}>
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{c.title}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Chat */}
            <Card className="h-[650px] flex flex-col">
              <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Olá! Sou sua IA imobiliária 🏠</h3>
                        <p className="text-sm text-muted-foreground mt-1">Pergunte sobre inquilinos, contratos, atrasos, ou peça para gerar mensagens de WhatsApp.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                        {QUICK_COMMANDS.map((qc) => (
                          <Button key={qc.label} size="sm" variant="outline" onClick={() => sendMessage(qc.prompt)}>
                            {qc.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                        {m.role === "assistant" && (
                          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Bot className="h-4 w-4 text-emerald-600" />
                          </div>
                        )}
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {sending && (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="bg-muted rounded-2xl px-4 py-3 flex gap-1">
                        <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                        <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                        <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.3s]" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t p-3 flex gap-2">
                  <Input
                    placeholder="Pergunte para a IA..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    disabled={sending}
                  />
                  <Button onClick={() => sendMessage()} disabled={sending || !input.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ COMPROVANTES ============ */}
        <TabsContent value="receipts" className="mt-4">
          <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
            <Card className="h-fit">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="h-5 w-5 text-emerald-500" />Novo Comprovante</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-emerald-500/50 transition-colors relative">
                  <input type="file" accept="image/*,application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2"><Loader2 className="h-10 w-10 text-emerald-500 animate-spin" /><p className="text-sm font-medium">Processando com IA...</p></div>
                  ) : (
                    <><div className="bg-emerald-500/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"><Upload className="h-6 w-6 text-emerald-600" /></div>
                      <p className="text-sm font-medium">Clique ou arraste o comprovante</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou PDF</p></>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Pendentes para revisão</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[450px]">
                  <div className="space-y-3">
                    {pending.filter(p => p.status === "pending").length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>Nenhuma pendência</p>
                      </div>
                    ) : pending.filter(p => p.status === "pending").map(p => {
                      const tenant = tenants?.find(t => t.id === p.tenant_id);
                      return (
                        <div key={p.id} className="flex items-start justify-between p-4 border rounded-xl bg-muted/20">
                          <div className="space-y-1">
                            <Badge variant="outline" className="capitalize">{p.action_type === 'payment' ? 'Pagamento' : 'Aviso'}</Badge>
                            <p className="text-sm font-bold text-emerald-700">
                              {p.proposed_data?.amount ? `R$ ${p.proposed_data.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "Valor não identificado"}
                            </p>
                            <p className="text-sm font-medium">{tenant?.name || p.proposed_data?.payer_name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground">IA: {Math.round((p.confidence || 0) * 100)}%</p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => resolvePending(p, "approved")}><Check className="h-4 w-4 mr-1" />Aprovar</Button>
                            <Button size="sm" variant="outline" className="text-rose-600 border-rose-200" onClick={() => resolvePending(p, "rejected")}><X className="h-4 w-4 mr-1" />Rejeitar</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ HISTÓRICO ============ */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {pending.filter(p => p.status !== "pending").map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 border-b text-sm">
                      <div className="flex items-center gap-3">
                        {p.status === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                        <div>
                          <p className="font-medium">{p.proposed_data?.payer_name || "Pagamento"}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.status === "approved" ? "secondary" : "outline"}>{p.status === "approved" ? "Aprovado" : "Rejeitado"}</Badge>
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
  );
}
