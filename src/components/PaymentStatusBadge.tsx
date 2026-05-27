import { Badge } from "@/components/ui/badge";
import { getPaymentStatusInfo, PaymentStatus } from "@/lib/payment-status";

interface PaymentStatusBadgeProps {
  status: string | null | undefined;
  refMonth: number;
  refYear: number;
  paymentDay?: number;
  cycle?: string | null;
  entryDate?: string | null;
  today?: Date;
  variant?: "default" | "outline" | "secondary" | "destructive";
  showIcon?: boolean;
}

export function PaymentStatusBadge({
  status,
  refMonth,
  refYear,
  paymentDay = 10,
  cycle = "postecipado",
  entryDate,
  today = new Date(),
  variant = "default",
  showIcon = true,
}: PaymentStatusBadgeProps) {
  const statusInfo = getPaymentStatusInfo(
    status,
    refMonth,
    refYear,
    paymentDay,
    cycle,
    entryDate,
    today
  );

  return (
    <Badge 
      variant={variant}
      className={`${statusInfo.bgColor} ${statusInfo.textColor} border-transparent`}
    >
      {showIcon && <span className="mr-1">{statusInfo.icon}</span>}
      {statusInfo.label}
    </Badge>
  );
}

interface PaymentStatusIndicatorProps {
  status: string | null | undefined;
  refMonth: number;
  refYear: number;
  paymentDay?: number;
  cycle?: string | null;
  entryDate?: string | null;
  today?: Date;
  showLabel?: boolean;
}

export function PaymentStatusIndicator({
  status,
  refMonth,
  refYear,
  paymentDay = 10,
  cycle = "postecipado",
  entryDate,
  today = new Date(),
  showLabel = true,
}: PaymentStatusIndicatorProps) {
  const statusInfo = getPaymentStatusInfo(
    status,
    refMonth,
    refYear,
    paymentDay,
    cycle,
    entryDate,
    today
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{statusInfo.icon}</span>
      {showLabel && <span className="text-sm font-medium">{statusInfo.label}</span>}
    </div>
  );
}
