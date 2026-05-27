import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Lightbulb, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  DollarSign, Users, Zap, ArrowRight, Target
} from "lucide-react";
import {
  generateSmartSuggestions,
  generateTenantSummary,
  identifyRecurrentDefaults,
  generateAutoTags,
} from "@/lib/operational-intelligence";

export default function OperationalIntelligencePage() {
  const { data: tenants } = useTenants();
  const { data: allPayments } = useAllPayments(new Date().getFullYear());

  const suggestions = tenants && allPayments
    ? generateSmartSuggestions(tenants, allPayments, new Date().getFullYear())
    : [];

  const activeTenants = tenants?.filter((t) => t.status === "active") || [];
  const tenantAnalytics = activeTenants.map((t) => ({
    tenant: t,
    summary: generateTenantSummary(t, allPayments || []),
    tags: generateAutoTags(t, allPayments || []),
    recurrentDefaults: identifyRecurrentDefaults(t, allPayments || []),
  }));

  const highRiskTenants = tenantAnalytics.filter((ta) => ta.summary.paymentRate < 50);
  const perfectTenants = tenantAnalytics.filter((ta) => ta.summary.paymentRate === 100);

  const handleApplySuggestion = (suggestion: any) => {
    toast.success(`Sugestão aplicada: ${suggestion.title}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600">
            <Lightbulb className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inteligência Operacional</h1>
            <p className="text-sm text-muted-foreground">Sugestões inteligentes e análises automáticas</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <Users className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{activeTenants.length}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Inquilinos Ativos</p>
          </CardContent>
        </Card>

        <Card className="border-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <CheckCircle2 className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{perfectTenants.length}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Adimplentes Perfeitos</p>
          </CardContent>
        </Card>

        <Card className="border-0 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <AlertTriangle className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{highRiskTenants.length}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Alto Risco</p>
          </CardContent>
        </Card>

        <Card className="border-0 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg">
          <CardContent className="pt-5 pb-5">
            <Zap className="h-6 w-6 opacity-70 mb-3" />
            <p className="text-2xl font-bold">{suggestions.length}</p>
            <p className="text-[11px] uppercase tracking-wider opacity-70 mt-1">Sugestões</p>
          </CardContent>
        </Card>
      </div>

      {/* Smart Suggestions */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-purple-600" />
          Sugestões Inteligentes
        </h2>
        {suggestions.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma sugestão no momento. Tudo está funcionando bem!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suggestions.slice(0, 5).map((suggestion) => (
              <Card
                key={suggestion.id}
                className={`border-l-4 ${
                  suggestion.priority === "high"
                    ? "border-l-red-500 bg-red-50/30"
                    : suggestion.priority === "medium"
                      ? "border-l-yellow-500 bg-yellow-50/30"
                      : "border-l-blue-500 bg-blue-50/30"
                }`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <p className="font-semibold">{suggestion.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge
                        variant={suggestion.priority === "high" ? "destructive" : "secondary"}
                      >
                        {suggestion.priority === "high" ? "Urgente" : suggestion.priority === "medium" ? "Médio" : "Baixo"}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => handleApplySuggestion(suggestion)}
                      >
                        {suggestion.actionLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Tenant Performance */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          Desempenho dos Inquilinos
        </h2>
        <div className="space-y-3">
          {tenantAnalytics.slice(0, 8).map((ta) => (
            <Card key={ta.tenant.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <p className="font-semibold">{ta.summary.name}</p>
                      <p className="text-xs text-muted-foreground">{ta.summary.property}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {ta.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Taxa de Pagamento</p>
                      <p className="font-bold">{ta.summary.paymentRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Aluguel Mensal</p>
                      <p className="font-bold">R$ {ta.summary.monthlyRent?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pagamentos</p>
                      <p className="font-bold">{ta.summary.paidCount}/{ta.summary.totalPayments}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Progresso</span>
                      <span className="text-muted-foreground">{ta.summary.paymentRate}%</span>
                    </div>
                    <Progress value={ta.summary.paymentRate} className="h-2" />
                  </div>

                  {ta.recurrentDefaults.isRecurrent && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                      <AlertTriangle className="h-4 w-4" />
                      Atraso recorrente a cada {ta.recurrentDefaults.frequency} meses
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Intelligence Info */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="pt-6 pb-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Como Funciona a Inteligência Operacional
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ <strong>Análise Automática:</strong> Sistema analisa padrões de pagamento e comportamento</li>
            <li>✓ <strong>Sugestões Inteligentes:</strong> Recomendações baseadas em dados históricos</li>
            <li>✓ <strong>Detecção de Riscos:</strong> Identifica inquilinos com risco de inadimplência</li>
            <li>✓ <strong>Tags Automáticas:</strong> Classificação automática baseada em performance</li>
            <li>✓ <strong>Preenchimento Automático:</strong> Sugestões para campos de formulários</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
