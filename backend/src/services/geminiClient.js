const { GoogleGenerativeAI } = require("@google/generative-ai");
const { RECOVERY_ACTIONS } = require("../config/constants");

const SYSTEM_PROMPT = `You are an Accounts Receivable (AR) recovery agent for B2B invoices in India.

Your job: diagnose why a payment failed or is overdue, then recommend ONE bounded recovery action.

STRICT RULES:
1. Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text.
2. recommended_action MUST be exactly one of: ${RECOVERY_ACTIONS.join(", ")}
3. confidence_score must be a number between 0 and 1 reflecting how sure you are.
4. If fraud is suspected, amount is extreme, or context is ambiguous → use ESCALATE_TO_ADMIN with high confidence.
5. If the client already promised to pay (promiseToPayUntil in the future, or history says "will pay next week") → PAUSE_PROMISE_TO_PAY.
6. If card is expired → SEND_PAYMENT_LINK (do not RETRY_CARD on an expired card).
7. If retryCount is already high or card retries keep failing → prefer ESCALATE_TO_ADMIN or SEND_PAYMENT_LINK over another RETRY_CARD.
8. generated_message should be a short Hinglish or English outreach message suitable for WhatsApp/email when the action involves messaging; otherwise a short internal note.
9. Never invent payment methods, bank details, or actions outside the enum.

JSON shape:
{
  "root_cause": "string",
  "recommended_action": "ENUM_VALUE",
  "generated_message": "string",
  "confidence_score": 0.0,
  "reasoning": "string"
}`;

function buildUserPrompt(invoice) {
  return `Diagnose this invoice and recommend one recovery action:

${JSON.stringify(invoice, null, 2)}`;
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Heuristic stub used when GEMINI_API_KEY is missing — still returns schema-shaped JSON
 * so the guardrail pipeline can be demoed offline.
 */
function heuristicDecision(invoice) {
  if (invoice.suspectedFraud) {
    return {
      root_cause: "Suspected fraudulent / high-risk card transaction",
      recommended_action: "ESCALATE_TO_ADMIN",
      generated_message: "Fraud flag set — halt outreach and route to compliance review.",
      confidence_score: 0.96,
      reasoning: "Issuer/risk flag present; automated collection is unsafe.",
    };
  }

  if (invoice.promiseToPayUntil && new Date(invoice.promiseToPayUntil) > new Date()) {
    return {
      root_cause: "Active promise-to-pay from client",
      recommended_action: "PAUSE_PROMISE_TO_PAY",
      generated_message: "PTP active — pause reminders until the promised date.",
      confidence_score: 0.93,
      reasoning: "Client committed to pay within the PTP window; outreach would be premature.",
    };
  }

  if (invoice.cardExpiry && new Date(invoice.cardExpiry) < new Date()) {
    return {
      root_cause: "Saved card expired",
      recommended_action: "SEND_PAYMENT_LINK",
      generated_message:
        `Hi ${invoice.clientName.split(" / ")[0]}, your card on file seems expired. Fresh payment link: https://pay.example/inv/${invoice.invoiceId}`,
      confidence_score: 0.91,
      reasoning: "Retrying an expired card will fail; send a fresh payment link instead.",
    };
  }

  if (invoice.daysOverdue >= 30) {
    return {
      root_cause: "Long-overdue B2B receivable",
      recommended_action: "SEND_WHATSAPP_REMINDER",
      generated_message:
        `Namaste, invoice ${invoice.invoiceId} for ₹${invoice.amount} is ${invoice.daysOverdue} days overdue. Please confirm payment timeline?`,
      confidence_score: 0.88,
      reasoning: "Extended delinquency warrants a tailored reminder before escalation.",
    };
  }

  if (invoice.status === "FAILED" && invoice.paymentMethod === "CARD" && (invoice.retryCount || 0) < 2) {
    return {
      root_cause: "Transient card decline",
      recommended_action: "RETRY_CARD",
      generated_message: `Scheduling card retry for ${invoice.invoiceId} (attempt ${(invoice.retryCount || 0) + 1}).`,
      confidence_score: 0.86,
      reasoning: "Recent card failure with retries remaining; soft retry is appropriate.",
    };
  }

  return {
    root_cause: "Unclear payment delay",
    recommended_action: "SEND_WHATSAPP_REMINDER",
    generated_message:
      `Hi, gentle reminder for invoice ${invoice.invoiceId} (₹${invoice.amount}). Pay karne ka plan bata doge?`,
    confidence_score: 0.82,
    reasoning: "Insufficient signal for a stronger action; soft reminder with moderate confidence.",
  };
}

async function getAiDecision(invoiceContext) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("[gemini] GEMINI_API_KEY missing — using heuristic stub");
    return { source: "heuristic", raw: heuristicDecision(invoiceContext) };
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(buildUserPrompt(invoiceContext));
  const text = result.response.text();
  const raw = extractJson(text);

  return { source: "gemini", raw };
}

module.exports = {
  getAiDecision,
  SYSTEM_PROMPT,
  heuristicDecision,
};
