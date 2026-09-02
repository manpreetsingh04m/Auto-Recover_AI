const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");
const { AiDecisionSchema } = require("../schemas/aiDecision");
const { getAiDecision, sleep } = require("./aiClient");
const { sendWhatsAppReminder } = require("./whatsapp");
const {
  generatePaymentLink,
  appendPaymentLinkToMessage,
} = require("./razorpayLinks");
const { triggerVoiceAgent, isVoiceCallEligible } = require("./voiceAgent");
const {
  CONFIDENCE_THRESHOLD,
  MAX_RETRIES,
} = require("../config/constants");

function toInvoiceContext(invoice) {
  return {
    invoiceId: invoice.invoiceId,
    clientName: invoice.clientName,
    clientPhone: invoice.clientPhone || null,
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

async function executeAction(action, invoice, message) {
  const label = `[action:${action}] ${invoice.invoiceId}`;

  switch (action) {
    case "SEND_WHATSAPP_REMINDER": {
      const result = await sendWhatsAppReminder({
        to: invoice.clientPhone,
        body: message,
        invoiceId: invoice.invoiceId,
      });
      console.log(
        `${label} → WhatsApp (${result.mode}${result.ok ? "" : " FAILED"}): ${result.detail}`
      );
      return result;
    }
    case "RETRY_CARD":
      console.log(`${label} → Card gateway retry (simulated)`);
      return { ok: true, mode: "simulated", detail: "Card retry simulated" };
    case "SEND_PAYMENT_LINK": {
      console.log(`${label} → Payment link dispatch: ${message}`);
      return { ok: true, mode: "razorpay", detail: "Payment link included in message" };
    }
    case "TRIGGER_AI_VOICE_CALL": {
      const result = await triggerVoiceAgent(invoice);
      console.log(
        `${label} → Voice (${result.mode}${result.ok ? "" : " FAILED"}): ${result.detail}`
      );
      return result;
    }
    case "PAUSE_PROMISE_TO_PAY":
      console.log(`${label} → Outreach paused until PTP window`);
      return { ok: true, mode: "internal", detail: "PTP pause recorded" };
    case "ESCALATE_TO_ADMIN":
      console.log(`${label} → Queued for human review`);
      return { ok: true, mode: "internal", detail: "Escalated to admin queue" };
    default:
      console.log(`${label} → no-op`);
      return { ok: false, mode: "none", detail: "Unknown action" };
  }
}

async function enrichOutboundMessage(action, invoice, message, allowed) {
  if (!allowed) return message;
  if (action !== "SEND_PAYMENT_LINK" && action !== "SEND_WHATSAPP_REMINDER") {
    return message;
  }

  try {
    const link = await generatePaymentLink(invoice);
    if (!link.ok || !link.short_url) {
      console.warn(
        `[recovery] payment link skipped for ${invoice.invoiceId}: ${link.detail || "unavailable"}`
      );
      return message;
    }
    return appendPaymentLinkToMessage(message, link.short_url);
  } catch (err) {
    console.error(
      `[recovery] payment link enrichment failed for ${invoice.invoiceId}`,
      err.message
    );
    return message;
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
        recovery_probability: 0,
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
        recovery_probability: 0,
        reasoning: parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason: "Zod validation failed",
    };
  }

  const decision = parseResult.data;

  function blockedEscalationDecision(patch) {
    return {
      ...decision,
      ...patch,
      recommended_action: "ESCALATE_TO_ADMIN",
      recovery_probability: 0,
    };
  }

  if (
    decision.recommended_action === "TRIGGER_AI_VOICE_CALL" &&
    !isVoiceCallEligible(invoice)
  ) {
    return {
      allowed: false,
      decision: blockedEscalationDecision({
        generated_message: "Voice call eligibility not met — escalating to admin.",
      }),
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason:
        "TRIGGER_AI_VOICE_CALL requires amount > ₹50,000 with 30+ days overdue, or prior ignored WhatsApp reminders",
    };
  }

  if (invoice.suspectedFraud && decision.recommended_action === "TRIGGER_AI_VOICE_CALL") {
    return {
      allowed: false,
      decision: blockedEscalationDecision({
        generated_message: "Voice outreach blocked on fraud-flagged invoice.",
      }),
      status: "BLOCKED_BY_GUARDRAIL",
      guardrailReason: "Voice call not allowed when suspectedFraud is true",
    };
  }

  if (decision.confidence_score < CONFIDENCE_THRESHOLD) {
    return {
      allowed: false,
      decision: blockedEscalationDecision({
        generated_message: `Low confidence (${decision.confidence_score}) — automated outreach halted.`,
      }),
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
      recovery_probability: 0,
      reasoning: "Hard guardrail: automated recovery halted after max retries.",
    };
    const guardrailReason = `retryCount ${invoice.retryCount} >= MAX_RETRIES ${MAX_RETRIES}`;

    await executeAction("ESCALATE_TO_ADMIN", invoice, decision.generated_message);
    await appendHistory(invoice, `GUARDRAIL: ${guardrailReason} → ESCALATE_TO_ADMIN`);

    const audit = await writeAudit({
      invoiceId: invoice.invoiceId,
      inputContext,
      aiReasoning: decision.reasoning,
      executedAction: "ESCALATE_TO_ADMIN",
      confidenceScore: decision.confidence_score,
      recoveryProbability: decision.recovery_probability ?? null,
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
      recoveryProbability: null,
      status: "BLOCKED_BY_GUARDRAIL",
      generatedMessage: "AI provider error — escalating.",
      rootCause: "AI provider failure",
      guardrailReason: err.message,
    });

    await executeAction("ESCALATE_TO_ADMIN", invoice, "AI provider error");
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

  let outboundMessage = gated.decision.generated_message;
  let delivery = null;

  if (mayOutreach) {
    outboundMessage = await enrichOutboundMessage(
      action,
      invoice,
      gated.decision.generated_message,
      gated.allowed
    );

    delivery = await executeAction(action, invoice, outboundMessage);

    if (gated.allowed && action === "RETRY_CARD") {
      invoice.retryCount = Math.min(MAX_RETRIES, (invoice.retryCount || 0) + 1);
    }

    const channel =
      action === "SEND_WHATSAPP_REMINDER"
        ? "WHATSAPP"
        : action === "SEND_PAYMENT_LINK"
          ? "EMAIL"
          : action === "TRIGGER_AI_VOICE_CALL"
            ? "PHONE"
            : "SYSTEM";

    const deliveryNote =
      action === "SEND_WHATSAPP_REMINDER"
        ? ` | WA:${delivery.mode}${delivery.ok ? "" : ":fail"} ${delivery.detail || ""}`
        : action === "TRIGGER_AI_VOICE_CALL"
          ? ` | Voice:${delivery.mode}${delivery.ok ? "" : ":fail"} ${delivery.detail || ""}`
          : "";

    await appendHistory(
      invoice,
      `${gated.status === "SUCCESS" ? "EXECUTED" : "GUARDRAIL"}: ${action} — ${gated.decision.root_cause}${deliveryNote}`,
      channel
    );
  }

  const audit = await writeAudit({
    invoiceId: invoice.invoiceId,
    inputContext: { ...inputContext, aiSource: source, rawAi: rawPayload },
    aiReasoning: gated.decision.reasoning,
    executedAction: action,
    confidenceScore: gated.decision.confidence_score,
    recoveryProbability: gated.decision.recovery_probability ?? null,
    status: gated.status,
    generatedMessage: outboundMessage || gated.decision.generated_message,
    rootCause: gated.decision.root_cause,
    guardrailReason: gated.guardrailReason,
  });

  const sentMessage = mayOutreach ? outboundMessage : gated.decision.generated_message;

  return {
    invoiceId: invoice.invoiceId,
    executedAction: action,
    status: gated.status,
    confidenceScore: gated.decision.confidence_score,
    recoveryProbability: gated.decision.recovery_probability ?? null,
    rootCause: gated.decision.root_cause,
    guardrailReason: gated.guardrailReason,
    generatedMessage: sentMessage,
    delivery: mayOutreach ? delivery : null,
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
  const delayMs = Number(process.env.BATCH_DELAY_MS || 1500);
  console.log(`[recovery] batch start — ${invoices.length} recoverable invoices`);

  const results = [];
  for (let i = 0; i < invoices.length; i += 1) {
    const invoice = invoices[i];
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

    if (i < invoices.length - 1 && delayMs > 0) {
      await sleep(delayMs);
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
  executeAction,
};
