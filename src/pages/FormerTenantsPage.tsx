import { useState } from "react";
import { useTenants, useUpdateTenant, useProperties } from "@/hooks/use-tenants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RotateCcw, Building, ChevronDown, Users, Search, Calendar } from "lucide-react";

export default function FormerTenantsPage() {
  const { data: tenants, isLoading } = useTenants("former");
  const { data: properties } = useProperties();
  const updateTenant = useUpdateTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const reactivate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateTenant.mutateAsync({ id, status: "active" });
      toast.success("Inquilino reativado!");
    } catch (err: any) { toast.error(err.message); }
  };

  const filtered = tenants?.filter((t) => {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.house_number?.toLowerCase().includes(q) || t.property?.address?.toLowerCase().includes(q);
  });

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ex-Inquilinos</h1>
        <p className="text-sm text-muted-foreground">{filtered?.length || 0} ex-inquilinos</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, casa ou endereço..." className="pl-10 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : !filtered?.length ? (
        <p className="text-muted-foreground">Nenhum ex-inquilino encontrado.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([propertyId, groupTenants]) => {
            const isOpen = openGroups[propertyId] ?? false;
            return (
              <Collapsible key={propertyId} open={isOpen} onOpenChange={() => toggleGroup(propertyId)}>
                <CollapsibleTrigger asChild>
                  <Card className="cursor-pointer hover:shadow-md transition-all">
                    <CardContent className="flex items-center justify-between py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Building className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold">{getPropertyName(propertyId)}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {groupTenants.length} ex-morador{groupTenants.length !== 1 ? "es" : ""}
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
                      <Card key={t.id} className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200" onClick={() => navigate(`/tenants/${t.id}`)}>
                        <CardContent className="pt-5 pb-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold text-sm text-muted-foreground">
                              {t.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{t.name}</p>
                              <p className="text-xs text-muted-foreground">Casa {t.house_number}</p>
                            </div>
                          </div>
                          {(t.entry_date || t.exit_date) && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                              <Calendar className="h-3 w-3" />
                              {t.entry_date && <span>{new Date(t.entry_date).toLocaleDateString("pt-BR")}</span>}
                              {t.entry_date && t.exit_date && <span>→</span>}
                              {t.exit_date && <span>{new Date(t.exit_date).toLocaleDateString("pt-BR")}</span>}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/tenants/${t.id}`); }}>Ver perfil</Button>
                            <Button variant="outline" size="sm" className="text-xs" onClick={(e) => reactivate(t.id, e)}>
                              <RotateCcw className="mr-1 h-3 w-3" />Reativar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
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
