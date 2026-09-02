const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { computeRiskScore, buildRecoveryInsights } = require("../src/services/recoveryInsights");

describe("computeRiskScore", () => {
  it("treats recovery probability 0 as maximum risk", () => {
    const risk = computeRiskScore({ suspectedFraud: false, daysOverdue: 0, status: "OVERDUE" }, 0);
    assert.equal(risk, 100);
  });

  it("defaults null recovery probability to 50", () => {
    const risk = computeRiskScore({ suspectedFraud: false, daysOverdue: 0, status: "OVERDUE" }, null);
    assert.equal(risk, 50);
  });
});

describe("buildRecoveryInsights", () => {
  it("uses zero recovery probability from audit without coercing to 50", () => {
    const insights = buildRecoveryInsights(
      { amount: 100000, suspectedFraud: false, daysOverdue: 10, status: "OVERDUE" },
      {
        recoveryProbability: 0,
        executedAction: "ESCALATE_TO_ADMIN",
        confidenceScore: 1,
        rootCause: "Max retries exhausted",
        aiReasoning: "Hard guardrail",
        generatedMessage: "Escalated",
        status: "BLOCKED_BY_GUARDRAIL",
        _id: "audit1",
        timestamp: new Date().toISOString(),
      }
    );

    assert.equal(insights.recoveryProbability, 0);
    assert.equal(insights.riskScore, 100);
    assert.equal(insights.expectedRecoveryValue, 0);
  });
});
