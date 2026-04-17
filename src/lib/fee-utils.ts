import { getDueDate } from "./payment-status";

export interface FeeCalculation {
  daysOverdue: number;
  lateFeeAmount: number;
  interestAmount: number;
  totalAmount: number;
}

/**
 * Calcula a multa e os juros com base na data de vencimento e na data de pagamento (ou hoje).
 * A multa é um percentual fixo sobre o valor original.
 * Os juros são proporcionais aos dias de atraso (juros simples diários).
 * 
 * @param amount Valor original do aluguel
 * @param dueDate Data de vencimento
 * @param paymentDate Data do pagamento (ou hoje)
 * @param lateFeePercent Percentual da multa (ex: 10 para 10%)
 * @param interestPercentPerMonth Percentual de juros ao mês (ex: 1 para 1%)
 */
export function calculateFees(
  amount: number,
  dueDate: Date,
  paymentDate: Date = new Date(),
  lateFeePercent: number = 10,
  interestPercentPerMonth: number = 1
): FeeCalculation {
  // Zera as horas para comparar apenas as datas
  const d1 = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const d2 = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
  
  const diffTime = d2.getTime() - d1.getTime();
  const daysOverdue = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  if (daysOverdue === 0) {
    return {
      daysOverdue: 0,
      lateFeeAmount: 0,
      interestAmount: 0,
      totalAmount: amount,
    };
  }

  const lateFeeAmount = amount * (lateFeePercent / 100);
  
  // Juros diários: (percentual mensal / 30 dias) * dias de atraso
  const dailyInterestRate = (interestPercentPerMonth / 100) / 30;
  const interestAmount = amount * dailyInterestRate * daysOverdue;

  return {
    daysOverdue,
    lateFeeAmount,
    interestAmount,
    totalAmount: amount + lateFeeAmount + interestAmount,
  };
}

/**
 * Helper para calcular encargos usando os parâmetros do inquilino
 */
export function calculateTenantFees(
  amount: number,
  refMonth: number,
  refYear: number,
  paymentDay: number,
  cycle: string,
  paymentDate: Date = new Date(),
  lateFeePercent: number = 10,
  interestPercentPerMonth: number = 1
): FeeCalculation {
  const dueDate = getDueDate(refMonth, refYear, paymentDay, cycle as any);
  return calculateFees(amount, dueDate, paymentDate, lateFeePercent, interestPercentPerMonth);
}
