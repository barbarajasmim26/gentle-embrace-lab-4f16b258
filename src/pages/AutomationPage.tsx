import { useState, useEffect } from "react";
import { useTenants, useAllPayments } from "@/hooks/use-tenants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Zap, RefreshCw, CheckCircle2, AlertTriangle, Calendar,
  Loader2, Send, FileText, Clock, TrendingUp
} from "lucide-react";
import { generateMonthlyPayments, updatePaymentStatuses, getOverduePayments, getUpcomingPayments } from "@/lib/monthly-automation";
import { generateChargeMessage, generatePaymentConfirmationMessage, generateOverdueMessage, openWhatsAppWithMessage } from "@/lib/whatsapp-templates";

export default function AutomationPage() {
  const { data: tenants } = useTenants("active");
  const { data: allPayments } = useAllPayments(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [overduePayments, setOverduePayments] = useState<any[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const loadAutomationData = async () => {
    if (!tenants) return;
    try {
      const overdue = await getOverduePayments(tenants, year);
      const upcoming = await getUpcomingPayments(tenants, year, 7);
      setOverduePayments(overdue);
      setUpcomingPayments(upcoming);
    } catch (err) {
      console.error("Erro ao carregar dados de automação:", err);
    }
  };

  useEffect(() => {
    loadAutomationData();
  }, [tenants]);

  const handleGenerateMonthlyPayments = async () => {
    if (!tenants) {
      toast.error("Carregando inquilinos...");
      return;
    }

    setLoading(true);
    try {
      const result = await generateMonthlyPayments(tenants, month, year);
      if (result.created > 0) {
        toast.success(`${result.created} pagamento(s) criado(s) para ${month}/${year}`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} erro(s) ao criar pagamentos`);
      }
      setLastRun(new Date());
      loadAutomationData();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatuses = async () => {
    if (!tenants) {
      toast.error("Carregando inquilinos...");
      return;
    }

    setLoading(true);
    try {
      const result = await updatePaymentStatuses(tenants, year);
      if (result.updated > 0) {
        toast.success(`${result.updated} status(es) atualizado(s)`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} erro(s) ao atualizar`);
      }
      setLastRun(new Date());
      loadAutomationData();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendChargeMessage = (payment: any) => {
    const tenant = payment.tenant;
    if (!tenant.phone) {
      toast.error(`${tenant.name} não tem telefone cadastrado`);
      return;
    }

    const message = generateChargeMessage(
      tenant,
      payment.payment.month,
      payment.payment.year,
      payment.payment.amount
    );

    openWhatsAppWithMessage(tenant.phone, message.message);
    toast.success("WhatsApp aberto com mensagem de cobrança");
  };

  const handleSendOverdueMessage = (payment: any) => {
    const tenant = payment.tenant;
    if (!tenant.phone) {
      toast.error(`${tenant.name} não tem telefone cadastrado`);
      return;
    }

    const message = generateOverdueMessage(
      tenant,
      payment.payment.month,
      payment.payment.year,
      payment.daysOverdue
    );

    openWhatsAppWithMessage(tenant.phone, message.message);
    toast.success("WhatsApp aberto com aviso de atraso");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automação Mensal</h1>
            <p className="text-sm text-muted-foreground">Gerencie pagamentos e cobranças automáticas</p>
          </div>
        </div>
        <div className="text-right">
          {lastRun && (
            <p className="text-xs text-muted-foreground">
              Última execução: {lastRun.toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl border-emerald-200 bg-emerald-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Gerar Pagamentos do Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cria automaticamente registros de pagamento pendente para todos os inquilinos ativos do mês {month}/{year}.
            </p>
            <Button
              onClick={handleGenerateMonthlyPayments}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar Pagamentos
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Atualizar Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Atualiza automaticamente os status dos pagamentos baseado na data de vencimento (Pendente → Atrasado).
            </p>
            <Button
              onClick={handleUpdateStatuses}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Atualizar Status
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Payments */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-bold">Pagamentos Atrasados ({overduePayments.length})</h2>
        </div>
        {overduePayments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pagamento atrasado! 🎉</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {overduePayments.map((item, idx) => (
              <Card key={idx} className="border-destructive/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <p className="font-semibold">{item.tenant.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Referência: {item.payment.month}/{item.payment.year} • {item.daysOverdue} dias atrasado
                      </p>
                      <p className="text-sm font-bold text-destructive mt-1">
                        R$ {(item.payment.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendOverdueMessage(item)}
                        disabled={!item.tenant.phone}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Avisar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Payments */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-warning" />
          <h2 className="text-lg font-bold">Próximos Vencimentos (7 dias) ({upcomingPayments.length})</h2>
        </div>
        {upcomingPayments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum vencimento nos próximos 7 dias</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingPayments.map((item, idx) => (
              <Card key={idx} className="border-warning/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <p className="font-semibold">{item.tenant.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Referência: {item.payment.month}/{item.payment.year} • Vence em {item.daysUntilDue} dias
                      </p>
                      <p className="text-sm font-bold text-accent mt-1">
                        R$ {(item.payment.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendChargeMessage(item)}
                        disabled={!item.tenant.phone}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Cobrar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="pt-6 pb-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Como funciona a automação
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ <strong>Gerar Pagamentos:</strong> Cria registros pendentes para todos os inquilinos do mês</li>
            <li>✓ <strong>Atualizar Status:</strong> Muda status automaticamente conforme a data de vencimento</li>
            <li>✓ <strong>Enviar Mensagens:</strong> Prepara mensagens prontas para WhatsApp com dados do pagamento</li>
            <li>✓ <strong>Rastrear Atrasos:</strong> Identifica automaticamente pagamentos vencidos</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
