const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  triggerVoiceAgent,
  isVoiceCallEligible,
  buildVoiceTask,
  isBlandConfigured,
  resolveVoiceCallOutcome,
} = require("../src/services/voiceAgent");
const { applyGuardrails } = require("../src/services/recoveryEngine");

describe("voiceAgent", () => {
  it("builds Hinglish task with invoice context", () => {
    const task = buildVoiceTask({
      invoiceId: "INV-0042",
      clientName: "Peak Pharma / Riya",
      amount: 85000,
      daysOverdue: 45,
    });
    assert.match(task, /INV-0042/);
    assert.match(task, /85000/);
    assert.match(task, /Hinglish/i);
  });

  it("simulates call when BLAND_API_KEY is missing", async () => {
    const prev = process.env.BLAND_API_KEY;
    delete process.env.BLAND_API_KEY;
    assert.equal(isBlandConfigured(), false);

    const result = await triggerVoiceAgent({
      invoiceId: "INV-0099",
      clientName: "Acme / Rahul",
      clientPhone: "+919876543210",
      amount: 60000,
      daysOverdue: 40,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "simulated");

    if (prev) process.env.BLAND_API_KEY = prev;
  });

  it("eligibility requires high value + severe overdue or prior WhatsApp", () => {
    assert.equal(
      isVoiceCallEligible({
        amount: 60000,
        daysOverdue: 35,
        history: [],
        suspectedFraud: false,
      }),
      true
    );
    assert.equal(
      isVoiceCallEligible({
        amount: 10000,
        daysOverdue: 5,
        history: [{ channel: "WHATSAPP", note: "EXECUTED: SEND_WHATSAPP_REMINDER" }],
        suspectedFraud: false,
      }),
      true
    );
    assert.equal(
      isVoiceCallEligible({
        amount: 10000,
        daysOverdue: 5,
        history: [],
        suspectedFraud: false,
      }),
      false
    );
    assert.equal(
      isVoiceCallEligible({
        amount: 60000,
        daysOverdue: 35,
        suspectedFraud: true,
        history: [],
      }),
      false
    );
  });
});

describe("resolveVoiceCallOutcome", () => {
  it("records promise-to-pay only when the call succeeded", () => {
    assert.deepEqual(resolveVoiceCallOutcome({ ok: true, mode: "bland" }), {
      callSucceeded: true,
      shouldRecordPromiseToPay: true,
      responseOk: true,
      mode: "bland",
    });
    assert.deepEqual(resolveVoiceCallOutcome({ ok: true, mode: "simulated" }), {
      callSucceeded: true,
      shouldRecordPromiseToPay: true,
      responseOk: true,
      mode: "simulated",
    });
    assert.deepEqual(resolveVoiceCallOutcome({ ok: false, mode: "error" }), {
      callSucceeded: false,
      shouldRecordPromiseToPay: false,
      responseOk: false,
      mode: "error",
    });
  });
});

describe("applyGuardrails voice call", () => {
  it("blocks voice when eligibility not met", () => {
    const result = applyGuardrails(
      {
        success: true,
        data: {
          root_cause: "ignored",
          recommended_action: "TRIGGER_AI_VOICE_CALL",
          generated_message: "call client",
          confidence_score: 0.92,
          recovery_probability: 40,
          reasoning: "try voice",
        },
      },
      { retryCount: 0, amount: 5000, daysOverdue: 3, history: [], suspectedFraud: false }
    );
    assert.equal(result.status, "BLOCKED_BY_GUARDRAIL");
    assert.equal(result.decision.recommended_action, "ESCALATE_TO_ADMIN");
    assert.equal(result.decision.recovery_probability, 0);
  });

  it("blocks voice on fraud and clears recovery probability", () => {
    const result = applyGuardrails(
      {
        success: true,
        data: {
          root_cause: "high value overdue",
          recommended_action: "TRIGGER_AI_VOICE_CALL",
          generated_message: "call client",
          confidence_score: 0.92,
          recovery_probability: 65,
          reasoning: "try voice",
        },
      },
      {
        retryCount: 0,
        amount: 60000,
        daysOverdue: 35,
        history: [],
        suspectedFraud: true,
      }
    );
    assert.equal(result.status, "BLOCKED_BY_GUARDRAIL");
    assert.equal(result.decision.recommended_action, "ESCALATE_TO_ADMIN");
    assert.equal(result.decision.recovery_probability, 0);
  });
});
