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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Search, Phone, Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Building, ChevronDown, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isOverdue as checkOverdue, isPaymentPaid } from "@/lib/payment-status";

import TenantCreateDialog from "@/components/tenants/TenantCreateDialog";
import TenantCard from "@/components/tenants/TenantCard";

export default function TenantsPage() {
  const { data: tenants, isLoading } = useTenants("active");
  const { data: properties } = useProperties();
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const createTenant = useCreateTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const filtered = tenants?.filter((t) => {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.house_number?.toLowerCase().includes(q) || t.property?.address?.toLowerCase().includes(q);
  });

  // Group tenants by property
  const grouped = filtered?.reduce<Record<string, typeof filtered>>((acc, t) => {
    const key = t.property_id || "sem-imovel";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {}) || {};

  const getPropertyName = (propertyId: string) => {
    if (propertyId === "sem-imovel") return "Sem Condomínio";
    const prop = properties?.find(p => p.id === propertyId);
    return prop?.name || prop?.address || "Condomínio";
  };

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getPaymentPattern = (tenantId: string) => {
    const tenant = tenants?.find((t) => t.id === tenantId);
    if (!tenant) return null;

    // Se o usuário definiu um status manual de comportamento
    if (tenant.status === "irregular") {
      return { label: "Irregular - Pagamento instável", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30" };
    }

    if (!allPayments) return null;
    const recentPayments: boolean[] = [];
    for (let m = month - 1; m >= Math.max(1, month - 6); m--) {
      const p = allPayments.find((pay: any) => pay.tenant_id === tenantId && pay.month === m);
      recentPayments.push(isPaymentPaid(p?.status));
    }
    const paidCount = recentPayments.filter(Boolean).length;
    const total = recentPayments.length;
    if (total === 0) return null;
    const ratio = paidCount / total;
    
    if (ratio >= 0.8) return { label: "Bom pagador", icon: TrendingUp, colorClass: "bg-success/10 text-success border-success/30" };
    if (ratio <= 0.3) return { label: "Inadimplente", icon: AlertTriangle, colorClass: "bg-destructive/10 text-destructive border-destructive/30" };
    return { label: "Irregular", icon: AlertTriangle, colorClass: "bg-warning/10 text-warning border-warning/30" };
  };

  const isOverdue = (tenantId: string) => {
    const tenant = tenants?.find((t) => t.id === tenantId);
    if (!tenant) return false;
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    if (isPaymentPaid(payment?.status) || payment?.status === "deposit") return false;
    return checkOverdue(month, year, tenant.payment_day || 10, tenant.payment_cycle, now);
  };

  const isPaid = (tenantId: string) => {
    const payment = allPayments?.find((p: any) => p.tenant_id === tenantId && p.month === month);
    return isPaymentPaid(payment?.status);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos Ativos</h1>
          <p className="text-sm text-muted-foreground">{filtered?.length || 0} inquilinos</p>
        </div>
        <TenantCreateDialog
          open={open}
          onOpenChange={setOpen}
          properties={properties}
          createTenant={createTenant}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, casa ou endereço..." className="pl-10 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([propertyId, groupTenants]) => {
            const isOpen = openGroups[propertyId] ?? false;
            const overdueCount = groupTenants.filter(t => isOverdue(t.id)).length;
            return (
              <Collapsible key={propertyId} open={isOpen} onOpenChange={() => toggleGroup(propertyId)}>
                <CollapsibleTrigger asChild>
                  <Card className="cursor-pointer hover:shadow-md transition-all">
                    <CardContent className="flex items-center justify-between py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{getPropertyName(propertyId)}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {groupTenants.length} morador{groupTenants.length !== 1 ? "es" : ""}
                            {overdueCount > 0 && (
                              <Badge variant="destructive" className="text-[10px] ml-2">{overdueCount} atrasado{overdueCount !== 1 ? "s" : ""}</Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </CardContent>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 pl-2">
                    {groupTenants.map((t) => (
                      <TenantCard
                        key={t.id}
                        tenant={t}
                        overdue={isOverdue(t.id)}
                        paid={isPaid(t.id)}
                        pattern={getPaymentPattern(t.id)}
                        onClick={() => navigate(`/tenants/${t.id}`)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
