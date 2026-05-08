// Lógica unificada para determinar se um aluguel está atrasado,
// considerando o ciclo de pagamento (antecipado vs postecipado).

export type PaymentCycle = "antecipado" | "postecipado" | string | null | undefined;

export const PAYMENT_CYCLE_LABELS: Record<string, string> = {
  antecipado: "Paga e mora (antecipado)",
  postecipado: "Mora e paga (postecipado)",
};

/**
 * Retorna a data limite (vencimento) de um aluguel para um determinado mês/ano de referência (competência).
 * 
 * - Competência: O mês que o inquilino está morando.
 * - Vencimento: Quando ele deve pagar por esse mês.
 * 
 * Regra de Negócio:
 * 1. Antecipado: Paga no dia X do PRÓPRIO mês de competência.
 * 2. Postecipado: Paga no dia X do mês SEGUINTE ao de competência.
 */
export function getDueDate(
  refMonth: number, // 1..12 (Mês de Competência)
  refYear: number,  // Ano de Competência
  paymentDay: number = 10,
  cycle: PaymentCycle = "postecipado",
): Date {
  const isAnticipated = cycle === "antecipado";
  
  // Se for postecipado, o vencimento é no mês seguinte (refMonth)
  // Se for antecipado, o vencimento é no próprio mês (refMonth - 1)
  // Nota: Em JS, meses são 0-11.
  const dueMonthJs = isAnticipated ? refMonth - 1 : refMonth;
  
  // O construtor de Date lida com overflow de meses (ex: mês 12 vira Janeiro do ano seguinte)
  return new Date(refYear, dueMonthJs, paymentDay);
}

/**
 * Decide se o pagamento de um mês de competência está atrasado.
 * 
 * @param refMonth Mês de competência (1-12)
 * @param refYear Ano de competência
 * @param paymentDay Dia do vencimento (padrão 10)
 * @param cycle Ciclo de pagamento
 * @param today Data de referência para o teste (padrão agora)
 * @param toleranceDays Dias de tolerância antes de marcar como inadimplente (padrão 0)
 */
export function isOverdue(
  refMonth: number,
  refYear: number,
  paymentDay: number = 10,
  cycle: PaymentCycle = "postecipado",
  today: Date = new Date(),
  toleranceDays: number = 0
): boolean {
  const due = getDueDate(refMonth, refYear, paymentDay, cycle);
  
  // Adiciona tolerância se houver
  if (toleranceDays > 0) {
    due.setDate(due.getDate() + toleranceDays);
  }

  // Zera as horas para comparar apenas as datas
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  
  return todayMid > dueMid;
}

/**
 * Verifica se um pagamento não é aplicável para um determinado mês/ano
 * (ex: antes do inquilino entrar no imóvel).
 */
export function isNotApplicable(
  refMonth: number,
  refYear: number,
  entryDate?: string | null
): boolean {
  if (!entryDate) return false;
  
  const entry = new Date(entryDate);
  const refDate = new Date(refYear, refMonth - 1, 1);
  const entryFirstDay = new Date(entry.getFullYear(), entry.getMonth(), 1);
  
  return refDate < entryFirstDay;
}

export function isPaymentPaid(status: string | null | undefined): boolean {
  return status === "paid" || status === "paid_late";
}
