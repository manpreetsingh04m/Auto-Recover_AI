const { z } = require("zod");
const { INVOICE_STATUSES, PAYMENT_METHODS } = require("../config/constants");

const historyItemSchema = z.object({
  at: z.coerce.date().optional(),
  channel: z.enum(["WHATSAPP", "EMAIL", "PHONE", "PORTAL", "SYSTEM"]),
  note: z.string().min(1),
  actor: z.enum(["CLIENT", "MERCHANT", "AI", "SYSTEM"]).optional(),
});

const createInvoiceSchema = z.object({
  invoiceId: z.string().min(1).optional(),
  clientName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default("INR"),
  status: z.enum(INVOICE_STATUSES).default("OVERDUE"),
  daysOverdue: z.number().int().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  retryCount: z.number().int().min(0).max(3).optional(),
  cardExpiry: z.coerce.date().nullable().optional(),
  suspectedFraud: z.boolean().optional(),
  promiseToPayUntil: z.coerce.date().nullable().optional(),
  history: z.array(historyItemSchema).optional(),
});

const bulkCreateSchema = z.object({
  invoices: z.array(createInvoiceSchema).min(1).max(100),
});

module.exports = {
  createInvoiceSchema,
  bulkCreateSchema,
};
