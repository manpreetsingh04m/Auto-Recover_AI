export type InvoiceStatus = "OVERDUE" | "FAILED" | "RECOVERED" | "PENDING";
export type PaymentMethod = "CARD" | "BANK_TRANSFER";
export type AuditStatus = "SUCCESS" | "BLOCKED_BY_GUARDRAIL";
export type RecoveryAction =
  | "SEND_WHATSAPP_REMINDER"
  | "RETRY_CARD"
  | "SEND_PAYMENT_LINK"
  | "TRIGGER_AI_VOICE_CALL"
  | "ESCALATE_TO_ADMIN"
  | "PAUSE_PROMISE_TO_PAY";

export type Metrics = {
  currency: string;
  totalRecovered: number;
  totalAtRisk: number;
  expectedRecovery?: number;
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
  recoveryProbability?: number | null;
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

export type RecoveryInsights = {
  riskScore: number;
  recoveryProbability: number;
  expectedRecoveryValue: number;
  recommendedAction: RecoveryAction;
  confidenceScore: number | null;
  rootCause: string | null;
  reasoning: string | null;
  generatedMessage: string | null;
  status: AuditStatus | null;
  source: "audit" | "heuristic-preview";
  auditId: string | null;
  timestamp: string | null;
};

export type RecoveryInsightsResponse = {
  ok: boolean;
  invoice: Invoice;
  insights: RecoveryInsights;
  audits: AuditLog[];
};

export type RecoverResult = {
  ok: boolean;
  result: {
    invoiceId: string;
    executedAction: RecoveryAction;
    status: AuditStatus;
    confidenceScore: number | null;
    recoveryProbability: number | null;
    rootCause: string | null;
    guardrailReason: string | null;
    generatedMessage: string | null;
    delivery: { ok: boolean; mode: string; detail?: string } | null;
    auditId: string;
    source: string;
  };
  invoice: Invoice;
  insights: RecoveryInsights;
};

export type CallScriptLine = {
  speaker: "system" | "agent" | "customer";
  text: string;
  delayMs: number;
};

export type VoiceCallResponse = {
  ok: boolean;
  call: {
    ok: boolean;
    mode: string;
    callId: string | null;
    detail: string;
    phone: string | null;
    clientName: string;
    invoiceId: string;
    amount: number;
    script: CallScriptLine[];
    promiseToPayDate?: string | null;
  };
  invoice: Invoice;
};

export type RecoveryQueueItem = {
  invoice: Invoice;
  insights: RecoveryInsights;
};

export type ConversationItem = {
  invoiceId: string;
  clientName: string;
  amount: number;
  at: string;
  note: string;
  source: string;
  status?: string;
  recoveryProbability?: number | null;
};
