import { useMemo, useState } from "react";
import { useProperties, useTenants } from "@/hooks/use-tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountInWords, formatReceiptDate, generateReceipt, type ReceiptData } from "@/lib/receipt-generator";
import { toast } from "sonner";
import { Download, Printer, Receipt } from "lucide-react";

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
  const [signatureName, setSignatureName] = useState("Maria Eneide da Silva - LOCADORA");

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
  const receiptNumber = tenant ? `REC-${yearNumber}-${String(monthNumber).padStart(2, "0")}-${tenant.id.slice(0, 6).toUpperCase()}` : `REC-${yearNumber}-${String(monthNumber).padStart(2, "0")}`;

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
      receiptNumber,
      signatureName,
    } satisfies ReceiptData;
  }, [tenant, amount, monthNumber, yearNumber, emissionDate, paymentMethod, paymentType, receiptNumber, signatureName]);

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

  const propertyLabel = tenant?.property?.address || "____________________________";
  const fullAddress = `${propertyLabel}${tenant?.house_number ? `, casa ${tenant.house_number}` : ""}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recibo profissional</h1>
            <p className="text-sm text-muted-foreground">Pré-visualização, assinatura e emissão no padrão do sistema anterior.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleGenerate("download")}>
            <Download className="mr-2 h-4 w-4" />
            Gerar PDF
          </Button>
          <Button onClick={() => handleGenerate("print")}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[1.75rem] border-border/60 bg-card/95 shadow-sm">
          <CardHeader>
            <CardDescription>Parâmetros do recibo</CardDescription>
            <CardTitle>Configuração da emissão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Propriedade</Label>
              <Select value={selectedProperty} onValueChange={(value) => { setSelectedProperty(value); setSelectedTenant(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {properties?.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Inquilino</Label>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um inquilino" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTenants.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.house_number ? ` - Casa ${item.house_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo do pagamento</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={tenant ? Number(tenant.rent_amount).toFixed(2) : "0,00"}
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Mês de referência</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_PT.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ano de referência</Label>
              <Input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Data de emissão</Label>
              <Input type="date" value={emissionDate} onChange={(event) => setEmissionDate(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Assinatura</Label>
              <Input value={signatureName} onChange={(event) => setSignatureName(event.target.value || "LOCADOR")} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-border/60 bg-card/95 shadow-sm">
          <CardHeader>
            <CardDescription>Pré-visualização</CardDescription>
            <CardTitle>Recibo pronto para PDF</CardTitle>
          </CardHeader>
          <CardContent>
            {previewData ? (
              <div className="rounded-[1.75rem] border border-border/70 bg-muted/30 p-8">
                <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Recibo de pagamento</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight">{receiptNumber}</h3>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Data de emissão</p>
                    <p className="mt-1 font-medium text-foreground">{formatReceiptDate(emissionDate)}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4 text-sm leading-7 text-foreground/85">
                  <p>
                    Recebi de <span className="font-semibold text-foreground">{tenant?.name}</span>
                    {tenant?.cpf ? <> , CPF <span className="font-semibold text-foreground">{tenant.cpf}</span></> : null}, a quantia de <span className="font-semibold text-foreground">R$ {amount.toFixed(2)}</span>.
                  </p>
                  <p>
                    Valor por extenso: <span className="font-semibold text-foreground">{amountInWords(amount)}</span>.
                  </p>
                  <p>
                    Referente ao <span className="font-semibold text-foreground">{paymentType}</span> do mês de <span className="font-semibold text-foreground">{monthName}/{year}</span>, imóvel situado em <span className="font-semibold text-foreground">{fullAddress}</span>.
                  </p>
                  <p>
                    Forma de pagamento: <span className="font-semibold text-foreground">{paymentMethod}</span>.
                  </p>
                </div>

                <div className="mt-10 flex items-end justify-between gap-6 border-t border-border/70 pt-8 text-sm text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">Assinatura</p>
                    <p className="mt-2">{signatureName}</p>
                  </div>
                  <Button onClick={() => handleGenerate("download")}>Gerar PDF</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione um inquilino para visualizar o recibo no padrão anterior.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
