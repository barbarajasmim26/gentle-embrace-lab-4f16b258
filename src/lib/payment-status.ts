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
  const dueMonth = isAnticipated ? refMonth - 1 : refMonth; // 0-indexed JS
  const dueYear = refYear;
  // Date com mês overflow se ajusta automaticamente (ex: dia 31 em fev)
  return new Date(dueYear, dueMonth, paymentDay);
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
