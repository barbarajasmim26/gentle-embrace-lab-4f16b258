import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Calendar, DollarSign } from "lucide-react";
import type { Tenant } from "@/hooks/use-tenants";

interface TenantCardProps {
  tenant: Tenant;
  overdue: boolean;
  paid: boolean;
  pattern: { label: string; icon: React.ComponentType<any>; colorClass: string } | null;
  onClick: () => void;
}

export default function TenantCard({ tenant: t, overdue, paid, pattern, onClick }: TenantCardProps) {
  const PatternIcon = pattern?.icon;
  return (
    <Card
      className={`cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${overdue ? "border-destructive/30" : paid ? "border-success/30" : ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm ${overdue ? "bg-destructive/10 text-destructive" : paid ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
              {t.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground">Casa {t.house_number}</p>
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
}
