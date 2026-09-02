const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CONFIDENCE_THRESHOLD = "0.85";
process.env.MAX_RETRIES = "3";

const { AiDecisionSchema } = require("../src/schemas/aiDecision");
const { createInvoiceSchema } = require("../src/schemas/invoice");
const { applyGuardrails } = require("../src/services/recoveryEngine");
const { normalizeWhatsAppAddress, isTwilioConfigured } = require("../src/services/whatsapp");
const { signToken } = require("../src/middleware/auth");

describe("AiDecisionSchema", () => {
  it("accepts a valid recovery decision", () => {
    const parsed = AiDecisionSchema.safeParse({
      root_cause: "Card expired",
      recommended_action: "SEND_PAYMENT_LINK",
      generated_message: "Please use this fresh link",
      confidence_score: 0.91,
      recovery_probability: 72,
      reasoning: "Expired card cannot be retried",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects recovery_probability outside 0-100", () => {
    const parsed = AiDecisionSchema.safeParse({
      root_cause: "x",
      recommended_action: "SEND_PAYMENT_LINK",
      generated_message: "hi",
      confidence_score: 0.9,
      recovery_probability: 101,
      reasoning: "nope",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown actions", () => {
    const parsed = AiDecisionSchema.safeParse({
      root_cause: "x",
      recommended_action: "CALL_CLIENT",
      generated_message: "hi",
      confidence_score: 0.9,
      reasoning: "nope",
    });
    assert.equal(parsed.success, false);
  });
});

describe("createInvoiceSchema", () => {
  it("requires positive amount and payment method", () => {
    const ok = createInvoiceSchema.safeParse({
      clientName: "Acme / Rahul",
      amount: 12000,
      paymentMethod: "CARD",
      status: "FAILED",
      daysOverdue: 3,
      clientPhone: "+919876543210",
    });
    assert.equal(ok.success, true);

    const bad = createInvoiceSchema.safeParse({
      clientName: "Acme",
      amount: -1,
      paymentMethod: "UPI",
    });
    assert.equal(bad.success, false);
  });
});

describe("applyGuardrails", () => {
  it("blocks low confidence and forces escalate", () => {
    const result = applyGuardrails(
      {
        success: true,
        data: {
          root_cause: "unclear",
          recommended_action: "SEND_WHATSAPP_REMINDER",
          generated_message: "pay please",
          confidence_score: 0.7,
          recovery_probability: 45,
          reasoning: "guess",
        },
      },
      { retryCount: 0 }
    );
    assert.equal(result.status, "BLOCKED_BY_GUARDRAIL");
    assert.equal(result.decision.recommended_action, "ESCALATE_TO_ADMIN");
    assert.equal(result.decision.recovery_probability, 0);
  });

  it("allows high-confidence valid decisions", () => {
    const result = applyGuardrails(
      {
        success: true,
        data: {
          root_cause: "PTP",
          recommended_action: "PAUSE_PROMISE_TO_PAY",
          generated_message: "paused",
          confidence_score: 0.95,
          recovery_probability: 82,
          reasoning: "client promised",
        },
      },
      { retryCount: 1 }
    );
    assert.equal(result.allowed, true);
    assert.equal(result.status, "SUCCESS");
  });

  it("blocks when retry ceiling is hit", () => {
    const result = applyGuardrails(
      {
        success: true,
        data: {
          root_cause: "retry",
          recommended_action: "RETRY_CARD",
          generated_message: "retry",
          confidence_score: 0.99,
          recovery_probability: 60,
          reasoning: "again",
        },
      },
      { retryCount: 3 }
    );
    assert.equal(result.status, "BLOCKED_BY_GUARDRAIL");
    assert.match(result.guardrailReason, /MAX_RETRIES/);
  });

  it("blocks malformed Zod output", () => {
    const result = applyGuardrails(
      {
        success: false,
        error: { issues: [{ path: ["recommended_action"], message: "Invalid" }] },
      },
      { retryCount: 0 }
    );
    assert.equal(result.status, "BLOCKED_BY_GUARDRAIL");
    assert.equal(result.decision.recommended_action, "ESCALATE_TO_ADMIN");
  });
});

describe("whatsapp helpers", () => {
  it("normalizes phone numbers to whatsapp: addresses", () => {
    assert.equal(normalizeWhatsAppAddress("+919876543210"), "whatsapp:+919876543210");
    assert.equal(normalizeWhatsAppAddress("whatsapp:+14155552671"), "whatsapp:+14155552671");
  });

  it("reports Twilio as unconfigured without env", () => {
    const prev = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_WHATSAPP_FROM,
    };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;
    assert.equal(isTwilioConfigured(), false);
    process.env.TWILIO_ACCOUNT_SID = prev.sid;
    process.env.TWILIO_AUTH_TOKEN = prev.token;
    process.env.TWILIO_WHATSAPP_FROM = prev.from;
  });
});

describe("JWT signToken", () => {
  it("signs a token containing subject email", () => {
    const jwt = require("jsonwebtoken");
    const token = signToken({
      _id: { toString: () => "64b000000000000000000001" },
      email: "merchant@autorecover.ai",
      role: "merchant",
    });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.email, "merchant@autorecover.ai");
    assert.equal(payload.sub, "64b000000000000000000001");
  });
});
