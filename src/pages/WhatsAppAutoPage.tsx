import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, RefreshCw, CheckCircle2, XCircle, FileText, Upload, Check, X, Undo2, Loader2, Receipt, Send, Download, MessageSquare } from "lucide-react";
import { useTenants } from "@/hooks/use-tenants";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { generateReceipt, type ReceiptData } from "@/lib/receipt-generator";

type Pending = {
  id: string;
  action_type: string;
  status: string;
  proposed_data: any;
  confidence: number | null;
  tenant_id: string | null;
  created_at: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };
type SavedReceipt = { id: string; title: string | null; file_name: string; file_url: string; tenant_id: string; created_at: string };

export default function WhatsAppAutoPage() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { data: tenants } = useTenants("active");
  const navigate = useNavigate();

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: pen }, { data: rec }] = await Promise.all([
        supabase.from("whatsapp_pending_actions").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("documents").select("id,title,file_name,file_url,tenant_id,created_at").eq("category", "receipt").order("created_at", { ascending: false }).limit(50),
      ]);
      setPending((pen as any) ?? []);
      setReceipts((rec as any) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    const { data, error } = await supabase.from("ai_conversations").insert({ title: "Conversa " + new Date().toLocaleString("pt-BR") }).select().single();
    if (error) { toast.error("Erro ao criar conversa"); throw error; }
    setConversationId(data.id);
    return data.id;
  };

  const loadChatHistory = async (cid: string) => {
    const { data } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", cid).order("created_at");
    setChatMessages((data ?? []).filter((m: any) => m.role === "user" || (m.role === "assistant" && m.content)).map((m: any) => ({ role: m.role, content: m.content })));
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("ai-assistant")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_pending_actions" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split('.').pop();
        const filePath = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('contracts').upload(filePath, file);
        if (upErr) throw upErr;
        const { error } = await supabase.functions.invoke("process-receipt-ai", { body: { filePath } });
        if (error) throw error;
        ok++;
      } catch (err: any) {
        fail++;
        console.error(err);
        toast.error(`Erro em ${file.name}: ${err.message}`);
      }
    }
    if (ok) toast.success(`${ok} comprovante(s) processado(s) pela IA!`);
    if (fail) toast.error(`${fail} arquivo(s) falharam`);
    setUploading(false);
    loadAll();
    if (e.target) e.target.value = "";
  };

  const updatePendingTenant = async (pendingId: string, tenantId: string) => {
    const { error } = await supabase.from("whatsapp_pending_actions").update({ tenant_id: tenantId }).eq("id", pendingId);
    if (error) { toast.error("Falha ao vincular"); return; }
    toast.success("Inquilino vinculado");
    loadAll();
  };

  const generateAndStoreReceipt = async (p: Pending, tenantId: string): Promise<string | null> => {
    const tenant = tenants?.find(t => t.id === tenantId);
    if (!tenant) { toast.error("Inquilino não encontrado"); return null; }
    const data = p.proposed_data ?? {};
    const dateStr = data.date || new Date().toISOString().slice(0, 10);
    const d = new Date(dateStr);
    const receiptData: ReceiptData = {
      tenantName: tenant.name,
      cpf: tenant.cpf || undefined,
      address: tenant.property?.address || "",
      houseNumber: tenant.house_number || undefined,
      amount: Number(data.amount || tenant.rent_amount || 0),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      paymentDate: dateStr,
      paymentMethod: data.bank ? "Pix" : "Pix",
      paymentType: "aluguel",
      paidBy: data.payer_name && data.payer_name.toLowerCase() !== tenant.name.toLowerCase() ? data.payer_name : undefined,
    };
    try {
      const pdf = await generateReceipt(receiptData);
      const blob = pdf.output("blob");
      const fileName = `recibo_${tenant.name.replace(/\s+/g, "_")}_${d.getMonth() + 1}_${d.getFullYear()}_${Date.now()}.pdf`;
      const filePath = `${tenantId}/receipts/${fileName}`;
      const { error: upErr } = await supabase.storage.from("contracts").upload(filePath, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("documents").insert({
        tenant_id: tenantId, title: `Recibo ${receiptData.month}/${receiptData.year}`,
        category: "receipt", file_name: fileName, file_url: filePath, file_type: "application/pdf",
      });
      if (dbErr) throw dbErr;
      toast.success("Recibo gerado e salvo!");
      return filePath;
    } catch (err: any) {
      console.error(err);
      toast.error("Falha ao gerar recibo: " + err.message);
      return null;
    }
  };

  const downloadReceipt = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("contracts").download(filePath);
    if (error) { toast.error("Falha ao baixar"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const sendReceiptWhatsApp = async (filePath: string, tenantId: string) => {
    const tenant = tenants?.find(t => t.id === tenantId);
    if (!tenant?.phone) { toast.error("Inquilino sem telefone"); return; }
    const { data: signed } = await supabase.storage.from("contracts").createSignedUrl(filePath, 60 * 60 * 24 * 7);
    if (!signed?.signedUrl) { toast.error("Falha ao gerar link"); return; }
    const message = `Olá ${tenant.name}! 😊 Segue o recibo do seu pagamento:\n${signed.signedUrl}`;
    const { error } = await supabase.functions.invoke("zapi-send", { body: { phone: tenant.phone, message } });
    if (error) { toast.error("Falha ao enviar: " + error.message); return; }
    toast.success("Recibo enviado por WhatsApp!");
  };

  const resolvePending = async (p: Pending, decision: "approved" | "rejected") => {
    if (decision === "approved") {
      if (!p.tenant_id) { toast.error("Vincule um inquilino antes de aprovar"); return; }
      if (p.action_type === "payment") {
        const data = p.proposed_data ?? {};
        const dateStr = data.date || new Date().toISOString().slice(0, 10);
        const d = new Date(dateStr);
        if (!isNaN(d.getTime()) && data.amount) {
          const { error: payErr } = await supabase.from("payments").upsert({
            tenant_id: p.tenant_id, year: d.getFullYear(), month: d.getMonth() + 1,
            amount: Number(data.amount), paid_at: dateStr, status: "paid",
          }, { onConflict: "tenant_id,month,year" });
          if (payErr) { toast.error("Falha ao registrar pagamento: " + (payErr.message || payErr)); return; }
          await generateAndStoreReceipt(p, p.tenant_id);
        }
      }
    }
    const { error } = await supabase.from("whatsapp_pending_actions").update({ status: decision, reviewed_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { toast.error("Falha ao atualizar"); return; }
    if (decision === "rejected") toast.success("Rejeitado");
    loadAll();
  };

  const undoPending = async (id: string) => {
    await supabase.from("whatsapp_pending_actions").update({ status: "pending", reviewed_at: null }).eq("id", id);
    loadAll();
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: text }]);
    setChatLoading(true);
    try {
      const cid = await ensureConversation();
      const { data, error } = await supabase.functions.invoke("ai-assistant", { body: { conversation_id: cid, message: text } });
      if (error) throw error;
      const reply = (data as any)?.reply ?? "(sem resposta)";
      setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
      setChatMessages(prev => [...prev, { role: "assistant", content: "❌ " + err.message }]);
    } finally {
      setChatLoading(false);
      loadAll();
    }
  };

  const newChat = async () => {
    setConversationId(null);
    setChatMessages([]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Assistente de IA</h1>
            <p className="text-sm text-muted-foreground">Chat, comprovantes e recibos automatizados</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="chat"><MessageSquare className="h-4 w-4 mr-2" />Chat IA</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-2" />Comprovantes</TabsTrigger>
          <TabsTrigger value="pending"><Bot className="h-4 w-4 mr-2" />Pendentes ({pending.filter(p => p.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="receipts"><Receipt className="h-4 w-4 mr-2" />Recibos ({receipts.length})</TabsTrigger>
        </TabsList>

        {/* CHAT */}
        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Converse com a IA</CardTitle>
              <Button variant="outline" size="sm" onClick={newChat}>Nova conversa</Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-4 mb-4 border rounded-lg p-4 bg-muted/10">
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-12">
                    <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>Pergunte algo como:</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li>"Quais comprovantes estão pendentes?"</li>
                      <li>"O comprovante 1 é do João Silva"</li>
                      <li>"Listar atrasados e cobrar todos"</li>
                      <li>"Resumir contrato da Maria"</li>
                    </ul>
                  </div>
                )}
                <div className="space-y-4">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-card border"}`}>
                        {m.role === "assistant" ? (
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        ) : <p className="whitespace-pre-wrap">{m.content}</p>}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-2xl px-4 py-2 text-sm flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> pensando...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder="Digite sua mensagem..." disabled={chatLoading} />
                <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}><Send className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* UPLOAD */}
        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-12 text-center space-y-4 hover:border-emerald-500/50 transition-colors relative">
                <input type="file" multiple accept="image/*,application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-12 w-12 text-emerald-500 animate-spin" />
                    <p className="text-sm font-medium">Processando arquivos com IA...</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-emerald-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <Upload className="h-8 w-8 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-base font-medium">Clique ou arraste comprovantes (PNG, JPG, PDF)</p>
                      <p className="text-xs text-muted-foreground mt-1">Você pode enviar vários ao mesmo tempo</p>
                    </div>
                  </>
                )}
              </div>
              <div className="bg-muted/30 p-4 rounded-lg mt-4 text-xs text-muted-foreground space-y-1">
                <p>✅ A IA extrai pagador, valor e data automaticamente.</p>
                <p>✅ Se não reconhecer o inquilino, vincule manualmente na aba Pendentes.</p>
                <p>✅ Ao aprovar, o pagamento é registrado e o recibo é gerado e arquivado.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PENDING */}
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[520px]">
                <div className="space-y-3">
                  {pending.filter(p => p.status === "pending").length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Nenhuma pendência</p>
                    </div>
                  ) : pending.filter(p => p.status === "pending").map((p) => {
                    const tenant = tenants?.find(t => t.id === p.tenant_id);
                    return (
                      <div key={p.id} className="p-4 border rounded-xl bg-muted/20 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{p.action_type === 'payment' ? 'Pagamento' : 'Aviso'}</Badge>
                              <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                            </div>
                            <p className="text-sm font-bold text-emerald-700">
                              {p.proposed_data?.amount ? `R$ ${Number(p.proposed_data.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "Valor não identificado"}
                            </p>
                            {p.proposed_data?.payer_name && (
                              <p className="text-xs text-muted-foreground">Pagador detectado: <strong>{p.proposed_data.payer_name}</strong></p>
                            )}
                            {p.proposed_data?.date && (
                              <p className="text-[10px] text-muted-foreground">Data: {new Date(p.proposed_data.date).toLocaleDateString('pt-BR')}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Select value={p.tenant_id ?? ""} onValueChange={(v) => updatePendingTenant(p.id, v)}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder={tenant?.name ?? "Vincular inquilino..."} /></SelectTrigger>
                            <SelectContent>
                              {tenants?.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}{t.house_number ? ` - Casa ${t.house_number}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => resolvePending(p, "approved")} disabled={!p.tenant_id}>
                              <Check className="h-4 w-4 mr-1" /> Aprovar e Gerar Recibo
                            </Button>
                            <Button size="sm" variant="outline" className="text-rose-600" onClick={() => resolvePending(p, "rejected")}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECEIPTS */}
        <TabsContent value="receipts" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[520px]">
                <div className="space-y-2">
                  {receipts.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Nenhum recibo gerado ainda</p>
                    </div>
                  ) : receipts.map((r) => {
                    const tenant = tenants?.find(t => t.id === r.tenant_id);
                    return (
                      <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                        <div className="flex items-center gap-3">
                          <Receipt className="h-5 w-5 text-emerald-500" />
                          <div>
                            <p className="font-medium text-sm">{r.title || r.file_name}</p>
                            <p className="text-xs text-muted-foreground">{tenant?.name ?? "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadReceipt(r.file_url, r.file_name)}>
                            <Download className="h-3 w-3 mr-1" /> Baixar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => sendReceiptWhatsApp(r.file_url, r.tenant_id)} disabled={!tenant?.phone}>
                            <Send className="h-3 w-3 mr-1" /> WhatsApp
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />Atalhos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => navigate('/alerts')}>
              <span className="font-bold">Vencimentos</span>
              <span className="text-[10px] text-muted-foreground">Contratos vencendo</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => navigate('/overdue')}>
              <span className="font-bold">Atrasados</span>
              <span className="text-[10px] text-muted-foreground">Cobranças</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => navigate('/receipt')}>
              <span className="font-bold">Recibo Manual</span>
              <span className="text-[10px] text-muted-foreground">Gerar avulso</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History strip */}
      {pending.filter(p => p.status !== "pending").length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Histórico de revisão</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-auto">
              {pending.filter(p => p.status !== "pending").slice(0, 20).map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 border-b last:border-0 text-xs">
                  <div className="flex items-center gap-2">
                    {p.status === "approved" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-rose-500" />}
                    <span>{p.proposed_data?.payer_name || "—"} · R$ {p.proposed_data?.amount ?? "—"}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => undoPending(p.id)}><Undo2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
