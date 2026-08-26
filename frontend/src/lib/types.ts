export type InvoiceStatus = "OVERDUE" | "FAILED" | "RECOVERED" | "PENDING";
export type PaymentMethod = "CARD" | "BANK_TRANSFER";
export type AuditStatus = "SUCCESS" | "BLOCKED_BY_GUARDRAIL";
export type RecoveryAction =
  | "SEND_WHATSAPP_REMINDER"
  | "RETRY_CARD"
  | "SEND_PAYMENT_LINK"
  | "ESCALATE_TO_ADMIN"
  | "PAUSE_PROMISE_TO_PAY";

export type Metrics = {
  currency: string;
  totalRecovered: number;
  totalAtRisk: number;
  recoverableCount: number;
  invoiceCount: number;
  successRate: number;
  falsePositives: number;
  audit: { total: number; success: number; blocked: number };
  invoicesByStatus: Record<string, { amount: number; count: number }>;
  actionsByType: Record<string, number>;
  batchRunning: boolean;
};

export type AuditLog = {
  _id: string;
  invoiceId: string;
  timestamp: string;
  aiReasoning: string;
  executedAction: RecoveryAction;
  confidenceScore: number | null;
  status: AuditStatus;
  generatedMessage: string | null;
  rootCause: string | null;
  guardrailReason: string | null;
  inputContext?: Record<string, unknown>;
};

export type Paginated<T> = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: T[];
};

export type Invoice = {
  _id: string;
  invoiceId: string;
  clientName: string;
  clientPhone?: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  daysOverdue: number;
  paymentMethod: PaymentMethod;
  retryCount: number;
  suspectedFraud: boolean;
  cardExpiry?: string | null;
  promiseToPayUntil?: string | null;
  history?: Array<{
    at: string;
    channel: string;
    note: string;
    actor: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type BatchResult = {
  ok: boolean;
  summary: {
    processed: number;
    success: number;
    blocked: number;
    byAction: Record<string, number>;
  };
};
