import { useState } from "react";
import { useTenants, useCreateTenant, useProperties, useAllPayments } from "@/hooks/use-tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Phone, Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Building } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function TenantsPage() {
  const { data: tenants, isLoading } = useTenants("active");
  const { data: properties } = useProperties();
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const createTenant = useCreateTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", house_number: "", rent_amount: "", deposit: "",
    payment_day: "10", entry_date: "", exit_date: "", property_id: "", cpf: "", notes: "",
  });

  const now = new Date();
  const month = now.getMonth() + 1;

  const filtered = tenants?.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch = t.name.toLowerCase().includes(q) || t.house_number?.toLowerCase().includes(q) || t.property?.address?.toLowerCase().includes(q);
    const matchesProperty = filterProperty === "all" || t.property_id === filterProperty;
    return matchesSearch && matchesProperty;
  });

  const getPaymentPattern = (tenantId: string) => {
    if (!allPayments) return null;
    const recentPayments: boolean[] = [];
    for (let m = month - 1; m >= Math.max(1, month - 6); m--) {
      const p = allPayments.find((pay: any) => pay.tenant_id === tenantId && pay.month === m);
      recentPayments.push(p?.status === "paid" || p?.status === "paid_late");
    }
    const paidCount = recentPayments.filter(Boolean).length;
    const total = recentPayments.length;
    if (total === 0) return null;
    const ratio = paidCount / total;
    if (ratio >= 0.8) return { label: "Paga e mora", icon: TrendingUp, colorClass: "bg-success/10 text-success border-success/30" };
    if (ratio <= 0.3) return { label: "Mora e paga", icon: TrendingDown, colorClass: "bg-destructive/10 text-destructive border-destructive/30" };
    return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30" };
  };

  const isOverdue = (tenantId: string) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    const tenant = tenants?.find((t) => t.id === tenantId);
    if (payment?.status === "paid" || payment?.status === "paid_late" || payment?.status === "deposit") return false;
    return (tenant?.payment_day || 10) < now.getDate();
  };

  const isPaid = (tenantId: string) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    return payment?.status === "paid" || payment?.status === "paid_late";
  };

  const handleCreate = async () => {
    if (!form.name || !form.rent_amount) { toast.error("Nome e valor são obrigatórios"); return; }
    try {
      await createTenant.mutateAsync({
        name: form.name, phone: form.phone || null, house_number: form.house_number || null,
        rent_amount: parseFloat(form.rent_amount), deposit: form.deposit ? parseFloat(form.deposit) : null,
        payment_day: parseInt(form.payment_day) || 10, entry_date: form.entry_date || null,
        exit_date: form.exit_date || null, property_id: form.property_id || null, cpf: form.cpf || null,
        notes: form.notes || null, status: "active",
      });
      toast.success("Inquilino criado!");
      setOpen(false);
      setForm({ name: "", phone: "", house_number: "", rent_amount: "", deposit: "", payment_day: "10", entry_date: "", exit_date: "", property_id: "", cpf: "", notes: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos Ativos</h1>
          <p className="text-sm text-muted-foreground">{filtered?.length || 0} inquilinos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Novo Inquilino</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Inquilino</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome completo *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
              <div><Label>Telefone / WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Imóvel</Label>
                <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nº da Casa</Label><Input value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Aluguel (R$) *</Label><Input type="number" value={form.rent_amount} onChange={(e) => setForm({ ...form, rent_amount: e.target.value })} /></div>
                <div><Label>Caução (R$)</Label><Input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
              </div>
              <div><Label>Dia do Pagamento</Label><Input type="number" min={1} max={31} value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Entrada</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
                <div><Label>Data de Saída</Label><Input type="date" value={form.exit_date} onChange={(e) => setForm({ ...form, exit_date: e.target.value })} /></div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anotações sobre o inquilino..." rows={3} />
              </div>
              <Button className="w-full rounded-xl" onClick={handleCreate} disabled={createTenant.isPending}>
                {createTenant.isPending ? "Salvando..." : "Criar Inquilino"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters row */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, casa ou endereço..." className="pl-10 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[220px] rounded-xl">
            <Building className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Condomínio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os condomínios</SelectItem>
            {properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || p.address}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered?.map((t) => {
            const pattern = getPaymentPattern(t.id);
            const overdue = isOverdue(t.id);
            const paid = isPaid(t.id);
            const PatternIcon = pattern?.icon;
            return (
              <Card key={t.id} className={`cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group ${overdue ? "border-destructive/30" : paid ? "border-success/30" : ""}`} onClick={() => navigate(`/tenants/${t.id}`)}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm ${overdue ? "bg-destructive/10 text-destructive" : paid ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.property?.address} - Casa {t.house_number}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />Aluguel
                      </span>
                      <span className="font-semibold">R$ {Number(t.rent_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />Vencimento
                      </span>
                      <span>Dia {t.payment_day}</span>
                    </div>
                    {t.phone && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />Telefone
                        </span>
                        <span className="text-xs">{t.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {paid && <Badge className="bg-success/10 text-success border-success/30 text-[10px]" variant="outline">✓ Pago</Badge>}
                    {overdue && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                    {pattern && PatternIcon && (
                      <Badge variant="outline" className={`text-[10px] ${pattern.colorClass}`}>
                        <PatternIcon className="h-3 w-3 mr-0.5" />{pattern.label}
                      </Badge>
                    )}
                    {t.notes && <Badge variant="outline" className="text-[10px]">📝 OBS</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
