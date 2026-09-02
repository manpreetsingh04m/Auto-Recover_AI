const { GoogleGenerativeAI } = require("@google/generative-ai");
const { RECOVERY_ACTIONS } = require("../config/constants");

const SYSTEM_PROMPT = `You are an Accounts Receivable (AR) recovery agent for B2B invoices in India.

Your job: diagnose why a payment failed or is overdue, then recommend ONE bounded recovery action.

STRICT RULES:
1. Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text.
2. recommended_action MUST be exactly one of: ${RECOVERY_ACTIONS.join(", ")}
3. confidence_score must be a number between 0 and 1 reflecting how sure you are.
4. recovery_probability must be an integer from 0 to 100 — your estimate of how likely this invoice will be recovered based on payment history, delay duration, client behavior, and context.
5. If fraud is suspected, amount is extreme, or context is ambiguous → use ESCALATE_TO_ADMIN with high confidence.
6. If the client already promised to pay (promiseToPayUntil in the future, or history says "will pay next week") → PAUSE_PROMISE_TO_PAY.
7. If card is expired → SEND_PAYMENT_LINK (do not RETRY_CARD on an expired card).
8. If retryCount is already high or card retries keep failing → prefer ESCALATE_TO_ADMIN or SEND_PAYMENT_LINK over another RETRY_CARD.
9. generated_message should be a short Hinglish or English outreach message suitable for WhatsApp/email when the action involves messaging; otherwise a short internal note. Do not embed payment URLs — the system appends a Razorpay link automatically.
10. Only output TRIGGER_AI_VOICE_CALL if invoice amount is greater than ₹50,000 AND severely overdue (typically 30+ days), OR if the client has ignored previous WhatsApp/text reminders in history. Never use voice for fraud-flagged invoices.
11. Never invent payment methods, bank details, or actions outside the enum.

JSON shape:
{
  "root_cause": "string",
  "recommended_action": "ENUM_VALUE",
  "generated_message": "string",
  "confidence_score": 0.0,
  "recovery_probability": 0,
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
    throw new Error("AI response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function estimateRecoveryProbability(invoice) {
  if (invoice.suspectedFraud) return 12;
  if (invoice.promiseToPayUntil && new Date(invoice.promiseToPayUntil) > new Date()) return 78;

  let score = 72;
  score -= Math.min(40, (invoice.daysOverdue || 0) * 1.2);
  score -= (invoice.retryCount || 0) * 8;
  if (invoice.paymentMethod === "BANK_TRANSFER") score += 5;
  if (invoice.cardExpiry && new Date(invoice.cardExpiry) < new Date()) score -= 15;
  return Math.max(5, Math.min(95, Math.round(score)));
}

function heuristicDecision(invoice) {
  const recovery_probability = estimateRecoveryProbability(invoice);

  if (invoice.suspectedFraud) {
    return {
      root_cause: "Suspected fraudulent / high-risk card transaction",
      recommended_action: "ESCALATE_TO_ADMIN",
      generated_message: "Fraud flag set — halt outreach and route to compliance review.",
      confidence_score: 0.96,
      recovery_probability,
      reasoning: "Issuer/risk flag present; automated collection is unsafe.",
    };
  }

  if (invoice.promiseToPayUntil && new Date(invoice.promiseToPayUntil) > new Date()) {
    return {
      root_cause: "Active promise-to-pay from client",
      recommended_action: "PAUSE_PROMISE_TO_PAY",
      generated_message: "PTP active — pause reminders until the promised date.",
      confidence_score: 0.93,
      recovery_probability,
      reasoning: "Client committed to pay within the PTP window; outreach would be premature.",
    };
  }

  if (invoice.cardExpiry && new Date(invoice.cardExpiry) < new Date()) {
    return {
      root_cause: "Saved card expired",
      recommended_action: "SEND_PAYMENT_LINK",
      generated_message:
        `Hi ${invoice.clientName.split(" / ")[0]}, aapka card expire ho gaya lagta hai. Please use the payment link below for invoice ${invoice.invoiceId} (₹${invoice.amount}).`,
      confidence_score: 0.91,
      recovery_probability,
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
      recovery_probability,
      reasoning: "Extended delinquency warrants a tailored reminder before escalation.",
    };
  }

  if (invoice.status === "FAILED" && invoice.paymentMethod === "CARD" && (invoice.retryCount || 0) < 2) {
    return {
      root_cause: "Transient card decline",
      recommended_action: "RETRY_CARD",
      generated_message: `Scheduling card retry for ${invoice.invoiceId} (attempt ${(invoice.retryCount || 0) + 1}).`,
      confidence_score: 0.86,
      recovery_probability,
      reasoning: "Recent card failure with retries remaining; soft retry is appropriate.",
    };
  }

  return {
    root_cause: "Unclear payment delay",
    recommended_action: "SEND_WHATSAPP_REMINDER",
    generated_message:
      `Hi, gentle reminder for invoice ${invoice.invoiceId} (₹${invoice.amount}). Pay karne ka plan bata doge?`,
    confidence_score: 0.82,
    recovery_probability,
    reasoning: "Insufficient signal for a stronger action; soft reminder with moderate confidence.",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("[429") || /Too Many Requests|quota|rate.?limit/i.test(msg);
}

function isModelUnavailableError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("[Groq 404]") ||
    /does not exist|do not have access|model_not_found|not found/i.test(msg)
  );
}

function shouldFallback(err) {
  return isRateLimitError(err) || isModelUnavailableError(err);
}

function retryDelayMs(err, attempt) {
  const msg = String(err?.message || "");
  const match = msg.match(/retry in ([\d.]+)\s*s/i);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 500;
  }
  return Math.min(60000, 5000 * 2 ** attempt);
}

function resolveProvider() {
  const configured = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  if (configured) return configured;

  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "heuristic";
}

async function callGemini(invoiceContext) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const maxAttempts = Number(process.env.AI_MAX_RETRIES || process.env.GEMINI_MAX_RETRIES || 3);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await model.generateContent(buildUserPrompt(invoiceContext));
      return extractJson(result.response.text());
    } catch (err) {
      if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err;
      const waitMs = retryDelayMs(err, attempt);
      console.warn(
        `[gemini] rate limited on ${invoiceContext.invoiceId} — retry ${attempt + 1}/${maxAttempts} in ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }

  throw new Error("Gemini retries exhausted");
}

/**
 * Groq free tier — OpenAI-compatible Chat Completions.
 * Get a key at https://console.groq.com/keys
 */
async function callGroq(invoiceContext) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const modelName = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const maxAttempts = Number(process.env.AI_MAX_RETRIES || 3);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(invoiceContext) },
          ],
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = body?.error?.message || JSON.stringify(body);
        const err = new Error(`[Groq ${response.status}] ${detail}`);
        if (response.status === 429 || isRateLimitError(err)) {
          if (attempt === maxAttempts - 1) throw err;
          const waitMs = retryDelayMs(err, attempt);
          console.warn(
            `[groq] rate limited on ${invoiceContext.invoiceId} — retry ${attempt + 1}/${maxAttempts} in ${waitMs}ms`
          );
          await sleep(waitMs);
          continue;
        }
        throw err;
      }

      const text = body?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Groq returned an empty completion");
      }
      return extractJson(text);
    } catch (err) {
      if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err;
      const waitMs = retryDelayMs(err, attempt);
      console.warn(
        `[groq] rate limited on ${invoiceContext.invoiceId} — retry ${attempt + 1}/${maxAttempts} in ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }

  throw new Error("Groq retries exhausted");
}

async function callProvider(provider, invoiceContext) {
  if (provider === "groq") {
    return { source: "groq", raw: await callGroq(invoiceContext) };
  }
  if (provider === "gemini") {
    return { source: "gemini", raw: await callGemini(invoiceContext) };
  }
  if (provider === "heuristic") {
    return { source: "heuristic", raw: heuristicDecision(invoiceContext) };
  }
  throw new Error(`Unknown AI_PROVIDER: ${provider}`);
}

async function getAiDecision(invoiceContext) {
  const provider = resolveProvider();

  if (provider === "heuristic") {
    console.warn("[ai] no provider key set — using heuristic stub");
    return callProvider("heuristic", invoiceContext);
  }

  try {
    return await callProvider(provider, invoiceContext);
  } catch (err) {
    if (shouldFallback(err)) {
      const alternate =
        provider === "groq" && process.env.GEMINI_API_KEY
          ? "gemini"
          : provider === "gemini" && process.env.GROQ_API_KEY
            ? "groq"
            : null;

      if (alternate) {
        console.warn(
          `[ai] ${provider} failed on ${invoiceContext.invoiceId} (${err.message.slice(0, 80)}) — trying ${alternate}`
        );
        try {
          return await callProvider(alternate, invoiceContext);
        } catch (altErr) {
          console.warn(`[ai] ${alternate} also failed: ${altErr.message}`);
        }
      }

      console.warn(
        `[ai] provider unavailable for ${invoiceContext.invoiceId} — heuristic fallback`
      );
      return {
        source: "heuristic-fallback",
        raw: heuristicDecision(invoiceContext),
      };
    }
    throw err;
  }
}

module.exports = {
  getAiDecision,
  SYSTEM_PROMPT,
  heuristicDecision,
  sleep,
  resolveProvider,
};
