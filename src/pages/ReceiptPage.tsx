import { useMemo, useState } from "react";
import { useProperties, useTenants } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountInWords, formatReceiptDate, generateReceipt, formatCPF, type ReceiptData } from "@/lib/receipt-generator";
import { openWhatsApp } from "@/lib/whatsapp";
import { toast } from "sonner";
import { Download, Printer, Receipt, MessageCircle } from "lucide-react";
import logoSrc from "@/assets/logo-mesquita.png";
import signatureSrc from "@/assets/signature.png";

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PAYMENT_METHOD_OPTIONS = ["Pix", "Dinheiro", "Transferência", "Cartão", "Outro"];
const PAYMENT_TYPE_OPTIONS = ["aluguel", "caução", "outro"];

export default function ReceiptPage() {
  const { data: tenants } = useTenants("active");
  const { data: properties } = useProperties();
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [selectedTenant, setSelectedTenant] = useState("");
  const [paymentType, setPaymentType] = useState("aluguel");
  const [customAmount, setCustomAmount] = useState("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [emissionDate, setEmissionDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [signatureName, setSignatureName] = useState("Maria Eneide da Silva");
  const [paidBy, setPaidBy] = useState("");

  const filteredTenants = useMemo(() => {
    if (!tenants) return [];
    if (selectedProperty === "all") return tenants;
    return tenants.filter((tenant) => tenant.property_id === selectedProperty);
  }, [selectedProperty, tenants]);

  const tenant = tenants?.find((item) => item.id === selectedTenant);
  const amount = customAmount ? Number(customAmount) : Number(tenant?.rent_amount || 0);
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  const monthName = MONTHS_PT[monthNumber - 1] || "";
  const fullAddress = tenant?.property?.address
    ? `${tenant.property.address}${tenant.house_number ? `, casa ${tenant.house_number}` : ""}`
    : "____________________________";

  const previewData = useMemo(() => {
    if (!tenant) return null;
    return {
      tenantName: tenant.name,
      cpf: tenant.cpf || undefined,
      address: tenant.property?.address || "____________________________",
      houseNumber: tenant.house_number || undefined,
      amount,
      month: monthNumber,
      year: yearNumber,
      paymentDate: emissionDate,
      paymentMethod,
      paymentType,
      signatureName,
      paidBy: paidBy || undefined,
    } satisfies ReceiptData;
  }, [tenant, amount, monthNumber, yearNumber, emissionDate, paymentMethod, paymentType, signatureName, paidBy]);

  const handleGenerate = async (mode: "download" | "print" | "whatsapp") => {
    if (!previewData) {
      toast.error("Selecione um inquilino para gerar o recibo.");
      return;
    }
    try {
      const pdf = await generateReceipt(previewData);
      const fileName = `recibo_${previewData.tenantName}_${monthName}_${year}.pdf`;

      if (mode === "download") {
        pdf.save(fileName);
        toast.success("Recibo em PDF gerado com sucesso.");
        return;
      }

      if (mode === "whatsapp") {
        if (!tenant?.phone) {
          toast.error("Inquilino sem telefone cadastrado.");
          return;
        }
        pdf.save(fileName);
        const message = `Olá ${tenant.name}! 😊\n\nSegue em anexo o recibo de ${paymentType} referente ao mês de ${monthName}/${year} no valor de R$ ${amount.toFixed(2).replace(".", ",")}.\n\nQualquer dúvida, estamos à disposição!`;
        openWhatsApp({ phone: tenant.phone, message });
        toast.success("Recibo baixado e WhatsApp aberto. Anexe o PDF na conversa.");
        return;
      }

      pdf.autoPrint();
      const blobUrl = URL.createObjectURL(pdf.output("blob"));
      const win = window.open(blobUrl, "_blank");
      if (!win || win.closed) {
        pdf.save(fileName);
        toast.info("Pop-up bloqueado. PDF baixado — abra para imprimir.");
        return;
      }
      toast.success("Prévia do recibo aberta para impressão.");
    } catch (err: any) {
      console.error("Erro ao gerar recibo:", err);
      toast.error("Erro ao gerar recibo: " + (err?.message || "tente novamente"));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Emissão de Recibo</h1>
            <p className="text-sm text-muted-foreground">Gere e salve recibos profissionais</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => handleGenerate("download")}>
            <Download className="mr-2 h-4 w-4" />Baixar PDF
          </Button>
          <Button variant="outline" onClick={() => handleGenerate("whatsapp")} disabled={!tenant?.phone}>
            <MessageCircle className="mr-2 h-4 w-4" />Enviar por WhatsApp
          </Button>
          <Button onClick={() => handleGenerate("print")}>
            <Printer className="mr-2 h-4 w-4" />Imprimir Recibo
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {/* Left: Form Sections */}
        <div className="space-y-5">
          {/* Section 1 */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <h3 className="text-xs font-semibold tracking-widest text-muted-foreground mb-6">1. SELECIONAR INQUILINO</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Propriedade</Label>
                  <Select value={selectedProperty} onValueChange={(v) => { setSelectedProperty(v); setSelectedTenant(""); }}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Inquilino</Label>
                  <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {filteredTenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.house_number ? ` - Casa ${t.house_number}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <h3 className="text-xs font-semibold tracking-widest text-muted-foreground mb-6">2. DADOS DO PAGAMENTO</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Tipo</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Valor (R$)</Label>
                  <Input type="number" step="0.01" placeholder={tenant ? Number(tenant.rent_amount).toFixed(2) : "0,00"} value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Mês Ref.</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS_PT.map((l, i) => <SelectItem key={l} value={String(i + 1)}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Ano Ref.</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Data de emissão</Label>
                  <Input type="date" value={emissionDate} onChange={(e) => setEmissionDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Valor enviado por (opcional)</Label>
                  <Input placeholder="Nome de quem pagou, se diferente" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Nome da assinatura</Label>
                  <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value || "LOCADOR")} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Receipt Preview - always visible */}
        <div className="flex flex-col items-center">
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-3">Pré-visualização do recibo</p>
          <div
            className="bg-white text-black shadow-2xl border border-gray-200 mx-auto rounded-sm"
            style={{
              width: "100%",
              maxWidth: "595px",
              minHeight: "842px",
              padding: "50px 55px",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: "13px",
              lineHeight: "1.8",
            }}
          >
            {/* Logo */}
            <div style={{ textAlign: "center", marginBottom: "35px" }}>
              <img src={logoSrc} alt="Logo" style={{ maxWidth: "220px", height: "auto", margin: "0 auto" }} />
            </div>

            {/* Title */}
            <h2 style={{ textAlign: "center", fontSize: "15px", fontWeight: "bold", marginBottom: "28px" }}>
              RECIBO DE PAGAMENTO
            </h2>

            {/* Body */}
            <div style={{ textAlign: "center", marginBottom: "30px", lineHeight: "1.9" }}>
              <p>
                Recebi de <strong>{tenant?.name?.toUpperCase() || "____________________________"}</strong>, brasileiro(a), CPF n° {formatCPF(tenant?.cpf)}, o valor de <strong>R$ {amount.toFixed(2).replace(".", ",")} ({amountInWords(amount)})</strong> via {paymentMethod.toLowerCase()}{paidBy ? ` por ${paidBy.toUpperCase()}` : ""}, valor este referente ao {paymentType} do mês de {monthName || "__________"}, do imóvel localizado na {tenant?.property?.address || "____________________________"}, casa {tenant?.house_number || "___"} - Cascavel - CE
              </p>
            </div>

            {/* Date */}
            <div style={{ textAlign: "center", margin: "40px 0 60px" }}>
              <p>{formatReceiptDate(emissionDate)}</p>
            </div>

            {/* Signature */}
            <div style={{ textAlign: "center", marginTop: "30px" }}>
              <img src={signatureSrc} alt="Assinatura" style={{ maxWidth: "150px", height: "auto", display: "block", margin: "0 auto -25px" }} />
              <div style={{ width: "340px", borderTop: "1px solid #000", margin: "0 auto", paddingTop: "8px" }}>
                <p style={{ margin: 0 }}>{signatureName} - LOCADORA</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
