/**
 * Twilio WhatsApp sender.
 * Sends for real when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM are set.
 * Otherwise returns a simulated result so demos still work.
 */

function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

function normalizeWhatsAppAddress(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (value.startsWith("whatsapp:")) return value;
  const digits = value.startsWith("+") ? value : `+${value.replace(/[^\d]/g, "")}`;
  return `whatsapp:${digits}`;
}

async function sendWhatsAppReminder({ to, body, invoiceId }) {
  const destination =
    normalizeWhatsAppAddress(to) ||
    normalizeWhatsAppAddress(process.env.DEFAULT_WHATSAPP_TO);

  if (!isTwilioConfigured()) {
    console.log(
      `[whatsapp:simulated] ${invoiceId} → ${destination || "no-recipient"}: ${body}`
    );
    return {
      ok: true,
      mode: "simulated",
      to: destination,
      sid: null,
      detail: "Twilio not configured — message logged only",
    };
  }

  if (!destination) {
    return {
      ok: false,
      mode: "twilio",
      to: null,
      sid: null,
      detail: "No clientPhone / DEFAULT_WHATSAPP_TO for WhatsApp delivery",
    };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = normalizeWhatsAppAddress(process.env.TWILIO_WHATSAPP_FROM);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const params = new URLSearchParams({
    From: from,
    To: destination,
    Body: body,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload?.message || JSON.stringify(payload);
    console.error(`[whatsapp:twilio] failed for ${invoiceId}:`, detail);
    return {
      ok: false,
      mode: "twilio",
      to: destination,
      sid: payload?.sid || null,
      detail,
    };
  }

  console.log(`[whatsapp:twilio] sent ${invoiceId} → ${destination} sid=${payload.sid}`);
  return {
    ok: true,
    mode: "twilio",
    to: destination,
    sid: payload.sid,
    detail: "WhatsApp message accepted by Twilio",
  };
}

module.exports = {
  sendWhatsAppReminder,
  isTwilioConfigured,
  normalizeWhatsAppAddress,
};
