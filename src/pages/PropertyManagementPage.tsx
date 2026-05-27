import { useState } from "react";
import { useProperties, useTenants } from "@/hooks/use-tenants";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Home, Plus, Edit2, Trash2, MapPin, Users, FileText } from "lucide-react";

export default function PropertyManagementPage() {
  const { data: properties } = useProperties();
  const { data: tenants } = useTenants();
  const [newProperty, setNewProperty] = useState({ address: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);

  const handleAddProperty = async () => {
    if (!newProperty.address) {
      toast.error("Preencha o endereço");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("properties")
        .insert({
          address: newProperty.address,
          name: newProperty.name || newProperty.address,
        });

      if (error) throw error;
      toast.success("Propriedade adicionada!");
      setNewProperty({ address: "", name: "" });
      setOpenDialog(false);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar esta propriedade?")) return;

    try {
      const { error } = await supabase
        .from("properties")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Propriedade deletada!");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const getPropertyStats = (propertyId: string) => {
    const propertyTenants = tenants?.filter((t) => t.property_id === propertyId && t.status === "active") || [];
    return {
      totalTenants: propertyTenants.length,
      totalRent: propertyTenants.reduce((sum, t) => sum + Number(t.rent_amount), 0),
    };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Home className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gerenciamento de Propriedades</h1>
            <p className="text-sm text-muted-foreground">Cadastre e gerencie seus imóveis</p>
          </div>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Propriedade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Nova Propriedade</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Endereço *</Label>
                <Input
                  placeholder="Ex: Rua das Flores, 123"
                  value={newProperty.address}
                  onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                />
              </div>
              <div>
                <Label>Nome (opcional)</Label>
                <Input
                  placeholder="Ex: Casa Principal"
                  value={newProperty.name}
                  onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setOpenDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddProperty} disabled={loading}>
                  {loading ? "Adicionando..." : "Adicionar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Properties Grid */}
      {!properties || properties.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Home className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground mb-4">Nenhuma propriedade cadastrada</p>
            <Button onClick={() => setOpenDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Primeira Propriedade
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => {
            const stats = getPropertyStats(property.id);
            return (
              <Card key={property.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        {property.name || property.address}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{property.address}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteProperty(property.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{stats.totalTenants} inquilino(s)</span>
                    </div>
                    <Badge variant="outline">
                      R$ {stats.totalRent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </Badge>
                  </div>
                  <Button variant="outline" className="w-full" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Ver Contratos
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Contract Management Info */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="pt-6 pb-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Dicas de Gerenciamento
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ <strong>Organize por propriedade:</strong> Agrupe todos os inquilinos por imóvel</li>
            <li>✓ <strong>Rastreie receitas:</strong> Veja a renda total de cada propriedade</li>
            <li>✓ <strong>Gerencie contratos:</strong> Acompanhe datas de vencimento e renovações</li>
            <li>✓ <strong>Documente tudo:</strong> Salve contratos e documentos por propriedade</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
