import { Tenant, Payment } from "@/hooks/use-tenants";
import { supabase } from "@/integrations/supabase/client";
import { getDueDate, isNotApplicable } from "@/lib/payment-status";

/**
 * Gera automaticamente os pagamentos pendentes para o mês atual
 * Deve ser chamado uma vez por mês (idealmente no primeiro dia)
 */
export async function generateMonthlyPayments(
  tenants: Tenant[],
  month: number,
  year: number
): Promise<{ created: number; failed: number; errors: string[] }> {
  const result = { created: 0, failed: 0, errors: [] };

  for (const tenant of tenants) {
    if (tenant.status !== "active") continue;

    // Verifica se o pagamento já existe
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("month", month)
      .eq("year", year)
      .single();

    if (existing) {
      // Pagamento já existe, pula
      continue;
    }

    // Verifica se o pagamento é aplicável (inquilino já estava no imóvel)
    if (isNotApplicable(month, year, tenant.entry_date)) {
      continue;
    }

    // Cria o pagamento com status "pending"
    const { error } = await supabase
      .from("payments")
      .insert({
        tenant_id: tenant.id,
        month,
        year,
        status: "pending",
        amount: tenant.rent_amount,
      });

    if (error) {
      result.failed++;
      result.errors.push(`Erro ao criar pagamento para ${tenant.name}: ${error.message}`);
    } else {
      result.created++;
    }
  }

  return result;
}

/**
 * Atualiza automaticamente os status dos pagamentos baseado na data
 * Deve ser chamado diariamente para manter os status atualizados
 */
export async function updatePaymentStatuses(
  tenants: Tenant[],
  year: number
): Promise<{ updated: number; failed: number; errors: string[] }> {
  const result = { updated: 0, failed: 0, errors: [] };
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  for (const tenant of tenants) {
    if (tenant.status !== "active") continue;

    // Busca todos os pagamentos do inquilino neste ano
    const { data: payments, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("year", year);

    if (fetchError) {
      result.failed++;
      result.errors.push(`Erro ao buscar pagamentos de ${tenant.name}: ${fetchError.message}`);
      continue;
    }

    // Atualiza cada pagamento
    for (const payment of payments || []) {
      if (payment.status === "paid" || payment.status === "paid_late" || payment.status === "deposit") {
        // Já foi pago, não precisa atualizar
        continue;
      }

      const dueDate = getDueDate(
        payment.month,
        payment.year,
        tenant.payment_day || 10,
        tenant.payment_cycle
      );

      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueMid = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      let newStatus = "pending";
      if (todayMid > dueMid) {
        newStatus = "overdue";
      } else if (todayMid.getTime() === dueMid.getTime()) {
        newStatus = "due_today";
      }

      if (newStatus !== payment.status) {
        const { error: updateError } = await supabase
          .from("payments")
          .update({ status: newStatus })
          .eq("id", payment.id);

        if (updateError) {
          result.failed++;
          result.errors.push(`Erro ao atualizar pagamento ${payment.id}: ${updateError.message}`);
        } else {
          result.updated++;
        }
      }
    }
  }

  return result;
}

/**
 * Gera automaticamente recibos para pagamentos confirmados
 * Deve ser chamado quando um pagamento é marcado como "paid"
 */
export async function generateReceiptForPayment(
  tenantId: string,
  month: number,
  year: number,
  amount: number,
  paidAt: string
): Promise<{ success: boolean; receiptPath?: string; error?: string }> {
  try {
    // Busca os dados do inquilino
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("*, property:properties(id, address, name)")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return { success: false, error: "Inquilino não encontrado" };
    }

    // Aqui você chamaria a função de geração de PDF
    // Por enquanto, apenas registramos que o recibo foi gerado
    const receiptPath = `${tenantId}/receipts/recibo_${month}_${year}_${Date.now()}.pdf`;

    // Registra o documento no banco
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        title: `Recibo ${month}/${year}`,
        category: "receipt",
        file_name: `recibo_${month}_${year}.pdf`,
        file_url: receiptPath,
        file_type: "application/pdf",
      });

    if (docError) {
      return { success: false, error: docError.message };
    }

    return { success: true, receiptPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Verifica quais inquilinos têm pagamentos vencidos e precisa de cobrança
 */
export async function getOverduePayments(
  tenants: Tenant[],
  year: number
): Promise<
  Array<{
    tenant: Tenant;
    payment: Payment;
    daysOverdue: number;
  }>
> {
  const result = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  for (const tenant of tenants) {
    if (tenant.status !== "active") continue;

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("year", year)
      .eq("status", "overdue");

    for (const payment of payments || []) {
      const dueDate = getDueDate(
        payment.month,
        payment.year,
        tenant.payment_day || 10,
        tenant.payment_cycle
      );

      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueMid = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      const daysOverdue = Math.floor((todayMid.getTime() - dueMid.getTime()) / (1000 * 60 * 60 * 24));

      result.push({
        tenant,
        payment,
        daysOverdue,
      });
    }
  }

  return result;
}

/**
 * Verifica quais inquilinos têm pagamentos vencendo nos próximos N dias
 */
export async function getUpcomingPayments(
  tenants: Tenant[],
  year: number,
  daysAhead: number = 7
): Promise<
  Array<{
    tenant: Tenant;
    payment: Payment;
    daysUntilDue: number;
  }>
> {
  const result = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  for (const tenant of tenants) {
    if (tenant.status !== "active") continue;

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("year", year)
      .eq("status", "pending");

    for (const payment of payments || []) {
      const dueDate = getDueDate(
        payment.month,
        payment.year,
        tenant.payment_day || 10,
        tenant.payment_cycle
      );

      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueMid = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      const daysUntilDue = Math.floor((dueMid.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue > 0 && daysUntilDue <= daysAhead) {
        result.push({
          tenant,
          payment,
          daysUntilDue,
        });
      }
    }
  }

  return result;
}
