const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");
const { AiDecisionSchema } = require("../schemas/aiDecision");
const { getAiDecision } = require("./geminiClient");
const {
  CONFIDENCE_THRESHOLD,
  MAX_RETRIES,
} = require("../config/constants");

function toInvoiceContext(invoice) {
  return {
    invoiceId: invoice.invoiceId,
    clientName: invoice.clientName,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    daysOverdue: invoice.daysOverdue,
    paymentMethod: invoice.paymentMethod,
    retryCount: invoice.retryCount,
    cardExpiry: invoice.cardExpiry,
    suspectedFraud: invoice.suspectedFraud,
    promiseToPayUntil: invoice.promiseToPayUntil,
    history: invoice.history,
  };
}

function simulateAction(action, invoice, message) {
  const label = `[action:${action}] ${invoice.invoiceId}`;
  switch (action) {
    case "SEND_WHATSAPP_REMINDER":
      console.log(`${label} → WhatsApp API (simulated): ${message}`);
      break;
    case "RETRY_CARD":
      console.log(`${label} → Card gateway retry (simulated)`);
      break;
    case "SEND_PAYMENT_LINK":
      console.log(`${label} → Payment link dispatch (simulated): ${message}`);
      break;
    case "PAUSE_PROMISE_TO_PAY":
      console.log(`${label} → Outreach paused until PTP window`);
      break;
    case "ESCALATE_TO_ADMIN":
      console.log(`${label} → Queued for human review`);
      break;
    default:
      console.log(`${label} → no-op`);
  }
}

async function appendHistory(invoice, note, channel = "SYSTEM") {
  invoice.history.push({
    at: new Date(),
    channel,
    actor: "AI",
    note,
  });
  await invoice.save();
}

async function writeAudit(entry) {
  return AuditLog.create(entry);
}

/**
 * Apply Zod + confidence + retry-cap guardrails.
 * Returns { allowed, decision, status, guardrailReason }.
 */
function applyGuardrails(parseResult, invoice) {
  if (invoice.retryCount >= MAX_RETRIES) {
    return {
      allowed: false,
      decision: {
        root_cause: "Retry ceiling reached",
        recommended_action: "ESCALATE_TO_ADMIN",
        generated_message: `Max retries (${MAX_RETRIES}) exhausted for ${invoice.invoiceId}.`,
        confidence_score: 1,
        reasoning: "Hard guardrail: automated recovery halted after max retries.",
      },
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason: `retryCount ${invoice.retryCount} >= MAX_RETRIES ${MAX_RETRIES}`,
    };
  }

  if (!parseResult.success) {
    return {
      allowed: false,
      decision: {
        root_cause: "Malformed AI output",
        recommended_action: "ESCALATE_TO_ADMIN",
        generated_message: "AI response failed schema validation — escalating.",
        confidence_score: 0,
        reasoning: parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason: "Zod validation failed",
    };
  }

  const decision = parseResult.data;

  if (decision.confidence_score < CONFIDENCE_THRESHOLD) {
    return {
      allowed: false,
      decision: {
        ...decision,
        recommended_action: "ESCALATE_TO_ADMIN",
        generated_message: `Low confidence (${decision.confidence_score}) — automated outreach halted.`,
      },
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason: `confidence_score ${decision.confidence_score} < ${CONFIDENCE_THRESHOLD}`,
    };
  }

  return {
    allowed: true,
    decision,
    status: "SUCCESS",
    guardrailReason: null,
  };
}

async function processInvoice(invoice) {
  const inputContext = toInvoiceContext(invoice);

  // Pre-flight retry cap — do not call the model if already exhausted
  if (invoice.retryCount >= MAX_RETRIES) {
    const decision = {
      root_cause: "Retry ceiling reached",
      recommended_action: "ESCALATE_TO_ADMIN",
      generated_message: `Max retries (${MAX_RETRIES}) exhausted for ${invoice.invoiceId}.`,
      confidence_score: 1,
      reasoning: "Hard guardrail: automated recovery halted after max retries.",
    };
    const guardrailReason = `retryCount ${invoice.retryCount} >= MAX_RETRIES ${MAX_RETRIES}`;

    simulateAction("ESCALATE_TO_ADMIN", invoice, decision.generated_message);
    await appendHistory(invoice, `GUARDRAIL: ${guardrailReason} → ESCALATE_TO_ADMIN`);

    const audit = await writeAudit({
      invoiceId: invoice.invoiceId,
      inputContext,
      aiReasoning: decision.reasoning,
      executedAction: "ESCALATE_TO_ADMIN",
      confidenceScore: decision.confidence_score,
      status: "BLOCKED_BY_GUARDRAIL",
      generatedMessage: decision.generated_message,
      rootCause: decision.root_cause,
      guardrailReason,
    });

    return {
      invoiceId: invoice.invoiceId,
      executedAction: "ESCALATE_TO_ADMIN",
      status: "BLOCKED_BY_GUARDRAIL",
      auditId: audit._id,
    };
  }

  let rawPayload;
  let source = "unknown";

  try {
    const ai = await getAiDecision(inputContext);
    rawPayload = ai.raw;
    source = ai.source;
  } catch (err) {
    const audit = await writeAudit({
      invoiceId: invoice.invoiceId,
      inputContext,
      aiReasoning: `AI call failed: ${err.message}`,
      executedAction: "ESCALATE_TO_ADMIN",
      confidenceScore: 0,
      status: "BLOCKED_BY_GUARDRAIL",
      generatedMessage: "AI provider error — escalating.",
      rootCause: "AI provider failure",
      guardrailReason: err.message,
    });

    simulateAction("ESCALATE_TO_ADMIN", invoice, "AI provider error");
    await appendHistory(invoice, `GUARDRAIL: AI error → ESCALATE_TO_ADMIN (${err.message})`);

    return {
      invoiceId: invoice.invoiceId,
      executedAction: "ESCALATE_TO_ADMIN",
      status: "BLOCKED_BY_GUARDRAIL",
      auditId: audit._id,
      error: err.message,
    };
  }

  const parseResult = AiDecisionSchema.safeParse(rawPayload);
  const gated = applyGuardrails(parseResult, invoice);
  const action = gated.decision.recommended_action;

  // Only execute automated outreach when guardrails allow (or escalate which is always safe)
  const mayOutreach =
    gated.allowed || action === "ESCALATE_TO_ADMIN" || action === "PAUSE_PROMISE_TO_PAY";

  if (mayOutreach) {
    simulateAction(action, invoice, gated.decision.generated_message);

    if (gated.allowed && action === "RETRY_CARD") {
      invoice.retryCount = Math.min(MAX_RETRIES, (invoice.retryCount || 0) + 1);
    }

    const channel =
      action === "SEND_WHATSAPP_REMINDER"
        ? "WHATSAPP"
        : action === "SEND_PAYMENT_LINK"
          ? "EMAIL"
          : "SYSTEM";

    await appendHistory(
      invoice,
      `${gated.status === "SUCCESS" ? "EXECUTED" : "GUARDRAIL"}: ${action} — ${gated.decision.root_cause}`,
      channel
    );
  }

  const audit = await writeAudit({
    invoiceId: invoice.invoiceId,
    inputContext: { ...inputContext, aiSource: source, rawAi: rawPayload },
    aiReasoning: gated.decision.reasoning,
    executedAction: action,
    confidenceScore: gated.decision.confidence_score,
    status: gated.status,
    generatedMessage: gated.decision.generated_message,
    rootCause: gated.decision.root_cause,
    guardrailReason: gated.guardrailReason,
  });

  return {
    invoiceId: invoice.invoiceId,
    executedAction: action,
    status: gated.status,
    confidenceScore: gated.decision.confidence_score,
    rootCause: gated.decision.root_cause,
    guardrailReason: gated.guardrailReason,
    auditId: audit._id,
    source,
  };
}

async function fetchRecoverableInvoices() {
  return Invoice.find({ status: { $in: ["FAILED", "OVERDUE"] } }).sort({
    daysOverdue: -1,
  });
}

/**
 * Batch recovery run over all FAILED / OVERDUE invoices.
 */
async function runRecoveryBatch() {
  const invoices = await fetchRecoverableInvoices();
  console.log(`[recovery] batch start — ${invoices.length} recoverable invoices`);

  const results = [];
  for (const invoice of invoices) {
    try {
      const result = await processInvoice(invoice);
      results.push(result);
    } catch (err) {
      console.error(`[recovery] failed on ${invoice.invoiceId}`, err);
      results.push({
        invoiceId: invoice.invoiceId,
        executedAction: "ESCALATE_TO_ADMIN",
        status: "BLOCKED_BY_GUARDRAIL",
        error: err.message,
      });
    }
  }

  const summary = {
    processed: results.length,
    success: results.filter((r) => r.status === "SUCCESS").length,
    blocked: results.filter((r) => r.status === "BLOCKED_BY_GUARDRAIL").length,
    byAction: results.reduce((acc, r) => {
      acc[r.executedAction] = (acc[r.executedAction] || 0) + 1;
      return acc;
    }, {}),
  };

  console.log("[recovery] batch complete", summary);
  return { summary, results };
}

module.exports = {
  fetchRecoverableInvoices,
  processInvoice,
  runRecoveryBatch,
  applyGuardrails,
  toInvoiceContext,
};
