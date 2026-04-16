import { useMemo, useState } from "react";
import { useProperties, useTenants } from "@/hooks/use-tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountInWords, formatReceiptDate, generateReceipt, formatCPF, type ReceiptData } from "@/lib/receipt-generator";
import { toast } from "sonner";
import { Download, Printer, Receipt } from "lucide-react";
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
  const fullAddress = `${tenant?.property?.address || "____________________________"}${tenant?.house_number ? `, casa ${tenant.house_number}` : ""}`;

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
    } satisfies ReceiptData;
  }, [tenant, amount, monthNumber, yearNumber, emissionDate, paymentMethod, paymentType, signatureName]);

  const handleGenerate = async (mode: "download" | "print") => {
    if (!previewData) {
      toast.error("Selecione um inquilino para gerar o recibo.");
      return;
    }
    const pdf = await generateReceipt(previewData);
    if (mode === "download") {
      pdf.save(`recibo_${previewData.tenantName}_${monthName}_${year}.pdf`);
      toast.success("Recibo em PDF gerado com sucesso.");
      return;
    }
    const blobUrl = URL.createObjectURL(pdf.output("blob"));
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    toast.success("Prévia do recibo aberta para impressão.");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recibo Profissional</h1>
            <p className="text-sm text-muted-foreground">Pré-visualização fiel ao PDF final</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleGenerate("download")}>
            <Download className="mr-2 h-4 w-4" />Gerar PDF
          </Button>
          <Button onClick={() => handleGenerate("print")}>
            <Printer className="mr-2 h-4 w-4" />Imprimir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {/* Config Panel */}
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader>
            <CardDescription>Parâmetros do recibo</CardDescription>
            <CardTitle>Configuração da emissão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Propriedade</Label>
              <Select value={selectedProperty} onValueChange={(v) => { setSelectedProperty(v); setSelectedTenant(""); }}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Inquilino</Label>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filteredTenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.house_number ? ` - Casa ${t.house_number}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo do pagamento</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" placeholder={tenant ? Number(tenant.rent_amount).toFixed(2) : "0,00"} value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mês de referência</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_PT.map((l, i) => <SelectItem key={l} value={String(i + 1)}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de emissão</Label>
              <Input type="date" value={emissionDate} onChange={(e) => setEmissionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nome da assinatura</Label>
              <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value || "LOCADOR")} />
            </div>
          </CardContent>
        </Card>

        {/* A4 Preview - White document style */}
        <div className="flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-3">Pré-visualização do recibo</p>
          <div
            className="bg-white text-black shadow-2xl border border-gray-200 mx-auto"
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
            {previewData ? (
              <>
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                  <img src={logoSrc} alt="Logo" style={{ maxWidth: "200px", height: "auto", margin: "0 auto" }} />
                </div>

                {/* Title */}
                <h2 style={{ textAlign: "center", fontSize: "16px", fontWeight: "bold", letterSpacing: "2px", marginBottom: "30px", textDecoration: "underline", textUnderlineOffset: "6px" }}>
                  RECIBO DE PAGAMENTO
                </h2>

                {/* Body */}
                <div style={{ textAlign: "justify", marginBottom: "30px", lineHeight: "2" }}>
                  <p>
                    Recebi de <strong>{tenant?.name?.toUpperCase() || "____________________________"}</strong>, brasileiro(a), CPF n° <strong>{formatCPF(tenant?.cpf)}</strong>, o valor de <strong>R$ {amount.toFixed(2)}</strong> ({amountInWords(amount)}) via <strong>{paymentMethod.toLowerCase()}</strong>, valor este referente ao {paymentType} do mês de <strong>{monthName || "__________"} de {year || "______"}</strong>, do imóvel localizado <strong>{fullAddress} - Cascavel - CE</strong>.
                  </p>
                </div>

                {/* Date */}
                <div style={{ textAlign: "center", margin: "40px 0 50px" }}>
                  <p>{formatReceiptDate(emissionDate)}</p>
                </div>

                {/* Signature */}
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <img src={signatureSrc} alt="Assinatura" style={{ maxWidth: "180px", height: "auto", margin: "0 auto 5px" }} />
                  <div style={{ width: "250px", borderTop: "1px solid #000", margin: "0 auto", paddingTop: "8px" }}>
                    <p style={{ fontWeight: "bold", margin: 0 }}>{signatureName}</p>
                    <p style={{ margin: 0, fontSize: "12px" }}>LOCADORA</p>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#999", paddingTop: "200px" }}>
                <p>Selecione um inquilino para visualizar o recibo.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
