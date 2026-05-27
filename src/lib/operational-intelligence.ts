import { Tenant, Payment } from "@/hooks/use-tenants";

export interface SmartSuggestion {
  id: string;
  type: "payment_reminder" | "maintenance" | "contract_renewal" | "value_update" | "contact_update";
  title: string;
  description: string;
  actionLabel: string;
  priority: "high" | "medium" | "low";
  tenantId?: string;
  data?: Record<string, any>;
}

/**
 * Gera sugestões inteligentes baseadas no histórico e padrões
 */
export function generateSmartSuggestions(
  tenants: Tenant[],
  payments: Payment[],
  year: number
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  tenants.forEach((tenant) => {
    if (tenant.status !== "active") return;

    // Sugestão 1: Atualizar valor de aluguel se houver aumento padrão
    const lastPayments = payments
      .filter((p) => p.tenant_id === tenant.id && p.year === year)
      .sort((a, b) => b.month - a.month)
      .slice(0, 3);

    if (lastPayments.length >= 3) {
      const avgAmount = lastPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / lastPayments.length;
      const expectedIncrease = avgAmount * 0.05; // 5% de aumento anual

      if (Math.abs((tenant.rent_amount || 0) - avgAmount) > expectedIncrease) {
        suggestions.push({
          id: `rent-update-${tenant.id}`,
          type: "value_update",
          title: `Atualizar aluguel de ${tenant.name}`,
          description: `O aluguel pode estar desatualizado. Valor atual: R$ ${tenant.rent_amount?.toFixed(2) || "0,00"}. Média recente: R$ ${avgAmount.toFixed(2)}`,
          actionLabel: "Atualizar",
          priority: "medium",
          tenantId: tenant.id,
          data: { newAmount: avgAmount },
        });
      }
    }

    // Sugestão 2: Renovação de contrato próxima
    if (tenant.exit_date) {
      const exitDate = new Date(tenant.exit_date);
      const daysUntilExpiry = Math.floor((exitDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry > 0 && daysUntilExpiry <= 60) {
        suggestions.push({
          id: `contract-renewal-${tenant.id}`,
          type: "contract_renewal",
          title: `Renovar contrato de ${tenant.name}`,
          description: `O contrato vence em ${daysUntilExpiry} dias (${exitDate.toLocaleDateString("pt-BR")})`,
          actionLabel: "Renovar",
          priority: daysUntilExpiry <= 30 ? "high" : "medium",
          tenantId: tenant.id,
        });
      }
    }

    // Sugestão 3: Atualizar telefone se estiver vazio
    if (!tenant.phone) {
      suggestions.push({
        id: `contact-update-${tenant.id}`,
        type: "contact_update",
        title: `Adicionar telefone de ${tenant.name}`,
        description: "Telefone não cadastrado. Importante para enviar mensagens via WhatsApp",
        actionLabel: "Adicionar",
        priority: "low",
        tenantId: tenant.id,
      });
    }

    // Sugestão 4: Manutenção preventiva (a cada 6 meses)
    const lastMaintenanceMonth = Math.floor(Math.random() * 12); // Simulação
    const monthsSinceLastMaintenance = (currentMonth - lastMaintenanceMonth + 12) % 12;

    if (monthsSinceLastMaintenance >= 6) {
      suggestions.push({
        id: `maintenance-${tenant.id}`,
        type: "maintenance",
        title: `Agendar manutenção em ${tenant.property?.address || "propriedade"}`,
        description: "Recomendação: realizar inspeção e manutenção preventiva",
        actionLabel: "Agendar",
        priority: "low",
        tenantId: tenant.id,
      });
    }
  });

  // Ordenar por prioridade
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Calcula preenchimento automático baseado em histórico
 */
export function getAutoFillSuggestions(tenant: Tenant, payments: Payment[]) {
  const recentPayments = payments
    .filter((p) => p.tenant_id === tenant.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return {
    suggestedAmount: recentPayments.length > 0
      ? recentPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / recentPayments.length
      : tenant.rent_amount,
    suggestedPaymentMethod: "Pix", // Mais comum
    suggestedPaymentType: "aluguel",
  };
}

/**
 * Identifica padrões de atraso recorrente
 */
export function identifyRecurrentDefaults(tenant: Tenant, payments: Payment[]): {
  isRecurrent: boolean;
  frequency: number;
  lastOccurrences: number[];
} {
  const tenantPayments = payments
    .filter((p) => p.tenant_id === tenant.id && (p.status === "overdue" || p.status === "paid_late"))
    .sort((a, b) => a.month - b.month);

  if (tenantPayments.length < 2) {
    return { isRecurrent: false, frequency: 0, lastOccurrences: [] };
  }

  // Calcular intervalos entre atrasos
  const intervals: number[] = [];
  for (let i = 1; i < tenantPayments.length; i++) {
    const interval = tenantPayments[i].month - tenantPayments[i - 1].month;
    intervals.push(interval);
  }

  // Verificar se há padrão recorrente (intervalos similares)
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const isRecurrent = intervals.every((i) => Math.abs(i - avgInterval) <= 2);

  return {
    isRecurrent,
    frequency: Math.round(avgInterval),
    lastOccurrences: tenantPayments.slice(-3).map((p) => p.month),
  };
}

/**
 * Gera resumo rápido do inquilino
 */
export function generateTenantSummary(tenant: Tenant, payments: Payment[]) {
  const tenantPayments = payments.filter((p) => p.tenant_id === tenant.id);
  const paidCount = tenantPayments.filter((p) => p.status === "paid" || p.status === "paid_late").length;
  const overdueCount = tenantPayments.filter((p) => p.status === "overdue").length;
  const paymentRate = tenantPayments.length > 0 ? Math.round((paidCount / tenantPayments.length) * 100) : 0;

  const recurrentDefaults = identifyRecurrentDefaults(tenant, payments);

  return {
    name: tenant.name,
    property: tenant.property?.address,
    monthlyRent: tenant.rent_amount,
    paymentRate,
    totalPayments: tenantPayments.length,
    paidCount,
    overdueCount,
    hasRecurrentDefaults: recurrentDefaults.isRecurrent,
    defaultFrequency: recurrentDefaults.frequency,
    status: tenant.status,
    entryDate: tenant.entry_date,
    exitDate: tenant.exit_date,
  };
}

/**
 * Busca inteligente com sugestões
 */
export function performSmartSearch(query: string, tenants: Tenant[]): Tenant[] {
  const lowerQuery = query.toLowerCase();

  return tenants.filter((tenant) => {
    const matchName = tenant.name.toLowerCase().includes(lowerQuery);
    const matchAddress = tenant.property?.address.toLowerCase().includes(lowerQuery);
    const matchPhone = tenant.phone?.includes(query);
    const matchCPF = tenant.cpf?.includes(query.replace(/\D/g, ""));

    return matchName || matchAddress || matchPhone || matchCPF;
  });
}

/**
 * Gera tags automáticas baseadas em padrões
 */
export function generateAutoTags(tenant: Tenant, payments: Payment[]): string[] {
  const tags: string[] = [];

  const recurrentDefaults = identifyRecurrentDefaults(tenant, payments);
  if (recurrentDefaults.isRecurrent) {
    tags.push("atraso-recorrente");
  }

  const tenantPayments = payments.filter((p) => p.tenant_id === tenant.id);
  const paymentRate = tenantPayments.length > 0
    ? (tenantPayments.filter((p) => p.status === "paid" || p.status === "paid_late").length / tenantPayments.length) * 100
    : 0;

  if (paymentRate === 100) {
    tags.push("adimplente-perfeito");
  } else if (paymentRate >= 90) {
    tags.push("adimplente");
  } else if (paymentRate < 50) {
    tags.push("alto-risco");
  }

  if (tenant.exit_date) {
    const daysUntilExpiry = Math.floor((new Date(tenant.exit_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 30) {
      tags.push("contrato-vencendo");
    }
  }

  if (!tenant.phone) {
    tags.push("sem-telefone");
  }

  return tags;
}
