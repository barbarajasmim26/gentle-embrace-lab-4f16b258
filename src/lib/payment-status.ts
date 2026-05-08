// Lógica unificada para determinar se um aluguel está atrasado,
// considerando o ciclo de pagamento (antecipado vs postecipado).

export type PaymentCycle = "antecipado" | "postecipado" | string | null | undefined;

export const PAYMENT_CYCLE_LABELS: Record<string, string> = {
  antecipado: "Paga e mora (antecipado)",
  postecipado: "Mora e paga (postecipado)",
};

/**
 * Retorna a data limite (vencimento) de um aluguel para um determinado mês/ano de referência.
 *
 * - antecipado: paga ANTES de morar — vence no dia X do PRÓPRIO mês de referência.
 * - postecipado: paga DEPOIS de morar — vence no dia X do mês SEGUINTE.
 */
export function getDueDate(
  refMonth: number, // 1..12
  refYear: number,
  paymentDay: number = 10,
  cycle: PaymentCycle = "postecipado",
): Date {
  const isAnticipated = cycle === "antecipado";
  // refMonth é 1..12. Date espera mês 0-indexed.
  // - antecipado (paga e mora): vence dia X do PRÓPRIO mês de referência → mês JS = refMonth - 1
  // - postecipado (mora e paga): vence dia X do mês SEGUINTE → mês JS = refMonth (que equivale a refMonth+1 0-indexed)
  const dueMonthJs = isAnticipated ? refMonth - 1 : refMonth;
  // Date com overflow se ajusta automaticamente (ex: mês 12 vira jan do ano seguinte)
  return new Date(refYear, dueMonthJs, paymentDay);
}

/**
 * Decide se o pagamento de um mês está atrasado em relação à data atual.
 * Considera o ciclo (antecipado/postecipado).
 */
export function isOverdue(
  refMonth: number,
  refYear: number,
  paymentDay: number = 10,
  cycle: PaymentCycle = "postecipado",
  today: Date = new Date(),
): boolean {
  const due = getDueDate(refMonth, refYear, paymentDay, cycle);
  // zera horas para comparar só por dia
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayMid > due;
}

export function isPaymentPaid(status: string | null | undefined): boolean {
  return status === "paid" || status === "paid_late";
}

export function isPaymentApplicable(status: string | null | undefined): boolean {
  return status !== "not_applicable";
}
