const axios = require("axios");

const BLAND_API_URL = "https://api.bland.ai/v1/calls";

function isBlandConfigured() {
  return Boolean(process.env.BLAND_API_KEY);
}

function clientFirstName(invoice) {
  const raw = invoice.clientName || "Sir/Madam";
  return raw.split(" / ")[0].trim() || raw;
}

function normalizePhone(invoice) {
  const raw = invoice.clientPhone || process.env.DEFAULT_WHATSAPP_TO || "";
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits.startsWith("91") ? `+${digits}` : `+${digits}`;
}

function buildVoiceTask(invoice) {
  const name = clientFirstName(invoice);
  return [
    `You are a polite Indian B2B collections assistant speaking Hinglish.`,
    `Call ${name} regarding overdue invoice ${invoice.invoiceId}.`,
    `Amount due: ₹${invoice.amount} (${invoice.currency || "INR"}).`,
    `Days overdue: ${invoice.daysOverdue || 0}.`,
    `Politely ask when they can complete payment.`,
    `Offer to resend the Razorpay payment link on WhatsApp if helpful.`,
    `Do not threaten legal action. Keep the call under 2 minutes.`,
  ].join(" ");
}

/**
 * Trigger Bland.ai outbound voice call for high-value recovery.
 * Falls back to simulated success when BLAND_API_KEY is not set.
 */
async function triggerVoiceAgent(invoice) {
  const phone = normalizePhone(invoice);
  const task = buildVoiceTask(invoice);

  if (!isBlandConfigured()) {
    console.log(
      `[voice:simulated] ${invoice.invoiceId} → would call ${phone || "unknown"} | task: ${task.slice(0, 80)}…`
    );
    return {
      ok: true,
      mode: "simulated",
      callId: null,
      detail: "BLAND_API_KEY not set — voice call logged only",
      phone,
    };
  }

  if (!phone) {
    return {
      ok: false,
      mode: "error",
      callId: null,
      detail: "No client phone number for voice outreach",
      phone: null,
    };
  }

  try {
    const response = await axios.post(
      BLAND_API_URL,
      {
        phone_number: phone,
        task,
        voice: process.env.BLAND_VOICE || "maya",
        language: "hi",
        metadata: {
          invoice_id: invoice.invoiceId,
          source: "revive-ai",
        },
      },
      {
        headers: {
          Authorization: process.env.BLAND_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const callId = response.data?.call_id || response.data?.id || null;
    console.log(`[voice:bland] ${invoice.invoiceId} → call ${callId || "queued"}`);
    return {
      ok: true,
      mode: "bland",
      callId,
      detail: "Bland.ai voice call initiated",
      phone,
    };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error(`[voice:bland] ${invoice.invoiceId} failed`, detail);
    return {
      ok: false,
      mode: "error",
      callId: null,
      detail,
      phone,
    };
  }
}

function isVoiceCallEligible(invoice) {
  if (invoice.suspectedFraud) return false;

  const amount = Number(invoice.amount) || 0;
  const daysOverdue = Number(invoice.daysOverdue) || 0;
  const priorWhatsApp = (invoice.history || []).some(
    (h) =>
      h.channel === "WHATSAPP" ||
      String(h.note || "").toUpperCase().includes("WHATSAPP")
  );

  const highValueSevere = amount > 50000 && daysOverdue >= 30;
  return highValueSevere || priorWhatsApp;
}

/**
 * Only successful or simulated voice calls should mutate invoice state.
 * Bland API errors must not record promise-to-pay commitments.
 */
function resolveVoiceCallOutcome(callResult) {
  const callSucceeded = callResult.ok === true;
  return {
    callSucceeded,
    shouldRecordPromiseToPay: callSucceeded,
    responseOk: callSucceeded,
    mode: callResult.mode,
  };
}

function buildDemoCallScript(invoice) {
  const name = clientFirstName(invoice);
  const amount = invoice.amount;
  const invoiceId = invoice.invoiceId;

  return [
    {
      speaker: "system",
      text: "Connecting AI voice agent…",
      delayMs: 1200,
    },
    {
      speaker: "agent",
      text: `Namaste ${name}, main Razorpay Revive AI se bol rahi hoon. Aapka invoice ${invoiceId} ke liye ₹${amount} payment pending hai.`,
      delayMs: 3500,
    },
    {
      speaker: "customer",
      text: "Ha ji, card issue tha last time. Hum pay karenge.",
      delayMs: 2800,
    },
    {
      speaker: "agent",
      text: "Thank you. Kya aap kal tak Razorpay link se payment complete kar sakte hain? Main WhatsApp par link bhej deti hoon.",
      delayMs: 3200,
    },
    {
      speaker: "customer",
      text: "Kal tak ho jayega, confirm.",
      delayMs: 2200,
    },
    {
      speaker: "agent",
      text: "Perfect. Promise-to-pay kal ke liye note kar liya. Dhanyavaad!",
      delayMs: 2000,
    },
    {
      speaker: "system",
      text: "Call completed · Promise-to-pay captured · Follow-up scheduled",
      delayMs: 1500,
    },
  ];
}

module.exports = {
  triggerVoiceAgent,
  isBlandConfigured,
  isVoiceCallEligible,
  buildVoiceTask,
  buildDemoCallScript,
  resolveVoiceCallOutcome,
  clientFirstName,
  normalizePhone,
};
