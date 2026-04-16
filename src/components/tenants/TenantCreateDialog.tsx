import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  properties: any[] | undefined;
  createTenant: any;
}

export default function TenantCreateDialog({ open, onOpenChange, properties, createTenant }: Props) {
  const [form, setForm] = useState({
    name: "", phone: "", house_number: "", rent_amount: "", deposit: "",
    payment_day: "10", entry_date: "", exit_date: "", property_id: "", cpf: "", notes: "",
    payment_cycle: "postecipado",
  });

  const handleCreate = async () => {
    if (!form.name || !form.rent_amount) { toast.error("Nome e valor são obrigatórios"); return; }
    try {
      await createTenant.mutateAsync({
        name: form.name, phone: form.phone || null, house_number: form.house_number || null,
        rent_amount: parseFloat(form.rent_amount), deposit: form.deposit ? parseFloat(form.deposit) : null,
        payment_day: parseInt(form.payment_day) || 10, entry_date: form.entry_date || null,
        exit_date: form.exit_date || null, property_id: form.property_id || null, cpf: form.cpf || null,
        notes: form.notes || null, status: "active", payment_cycle: form.payment_cycle,
      });
      toast.success("Inquilino criado!");
      onOpenChange(false);
      setForm({ name: "", phone: "", house_number: "", rent_amount: "", deposit: "", payment_day: "10", entry_date: "", exit_date: "", property_id: "", cpf: "", notes: "", payment_cycle: "postecipado" });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <div><Label>Ciclo de Pagamento</Label>
            <Select value={form.payment_cycle} onValueChange={(v) => setForm({ ...form, payment_cycle: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="antecipado">Antecipado</SelectItem>
                <SelectItem value="postecipado">Pós (depois de morar)</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
  );
}
