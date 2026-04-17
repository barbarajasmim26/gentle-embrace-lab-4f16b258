import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Percent } from "lucide-react";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/use-settings";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: settings, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [lateFee, setLateFee] = useState("10");
  const [interest, setInterest] = useState("1");

  useEffect(() => {
    if (settings) {
      setLateFee(String(settings.default_late_fee_percent));
      setInterest(String(settings.default_interest_percent));
    }
  }, [settings]);

  const save = async () => {
    if (!settings) return;
    try {
      await update.mutateAsync({
        id: settings.id,
        default_late_fee_percent: Number(lateFee),
        default_interest_percent: Number(interest),
      });
      toast.success("Configurações salvas!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Ajustes padrão do sistema</p>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4 text-muted-foreground" /> Multa e Juros Padrão
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Aplicados a todos os inquilinos. Cada inquilino pode ter valores próprios no perfil dele (que sobrescrevem estes).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Multa (%)</Label>
                  <Input type="number" step="0.1" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Percentual fixo aplicado uma vez sobre o valor do aluguel.</p>
                </div>
                <div className="space-y-2">
                  <Label>Juros mensal (%)</Label>
                  <Input type="number" step="0.1" value={interest} onChange={(e) => setInterest(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Calculado proporcionalmente por dia de atraso (juros simples).</p>
                </div>
              </div>
              <Button onClick={save} disabled={update.isPending} className="w-full rounded-xl gap-2">
                <Save className="h-4 w-4" /> {update.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
