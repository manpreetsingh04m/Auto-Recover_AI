const Razorpay = require("razorpay");

function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getClient() {
  if (!isRazorpayConfigured()) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function clientDisplayName(invoice) {
  const raw = invoice.clientName || "Customer";
  return raw.split(" / ")[0].trim() || raw;
}

/**
 * Create a Razorpay Payment Link for an invoice.
 * Falls back to a simulated link when test credentials are not configured.
 */
async function generatePaymentLink(invoice) {
  const amountPaise = Math.round(Number(invoice.amount) * 100);
  if (!amountPaise || amountPaise < 100) {
    const detail = `Invalid invoice amount for payment link: ${invoice.amount}`;
    console.error(`[razorpay] ${invoice.invoiceId} → ${detail}`);
    return {
      ok: false,
      mode: "error",
      short_url: null,
      id: null,
      detail,
    };
  }

  const client = getClient();
  if (!client) {
    const simulated = `https://rzp.io/i/sim-${invoice.invoiceId}`;
    console.log(`[razorpay:simulated] ${invoice.invoiceId} → ${simulated}`);
    return {
      ok: true,
      mode: "simulated",
      short_url: simulated,
      id: null,
      detail: "Razorpay credentials not set — simulated payment link",
    };
  }

  try {
    const link = await client.paymentLink.create({
      amount: amountPaise,
      currency: invoice.currency || "INR",
      accept_partial: false,
      description: `Recovery payment — ${invoice.invoiceId}`,
      customer: {
        name: clientDisplayName(invoice),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        invoice_id: invoice.invoiceId,
        source: "auto-recover-ai",
      },
    });

    console.log(`[razorpay] ${invoice.invoiceId} → ${link.short_url}`);
    return {
      ok: true,
      mode: "razorpay",
      short_url: link.short_url,
      id: link.id,
      detail: "Razorpay payment link created",
    };
  } catch (err) {
    console.error(`[razorpay] failed for ${invoice.invoiceId}`, err.message);
    return {
      ok: false,
      mode: "error",
      short_url: null,
      id: null,
      detail: err.message,
    };
  }
}

function appendPaymentLinkToMessage(message, shortUrl) {
  if (!shortUrl) return message;
  const trimmed = String(message || "").trim();
  if (trimmed.includes(shortUrl)) return trimmed;
  return `${trimmed}\n\nPay securely here: ${shortUrl}`;
}

module.exports = {
  generatePaymentLink,
  appendPaymentLinkToMessage,
  isRazorpayConfigured,
};
