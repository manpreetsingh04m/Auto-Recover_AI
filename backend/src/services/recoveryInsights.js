const { heuristicDecision } = require("./aiClient");
const { toInvoiceContext } = require("./recoveryEngine");

function computeRiskScore(invoice, recoveryProbability) {
  const probability = recoveryProbability ?? 50;
  let risk = 100 - probability;
  if (invoice.suspectedFraud) risk = Math.min(98, risk + 25);
  if ((invoice.daysOverdue || 0) >= 30) risk = Math.min(98, risk + 8);
  if (invoice.status === "FAILED") risk = Math.min(98, risk + 5);
  return Math.max(5, Math.round(risk));
}

function insightsFromAudit(invoice, audit) {
  const recoveryProbability = audit.recoveryProbability ?? 50;
  const expectedRecoveryValue = Math.round(
    Number(invoice.amount) * (recoveryProbability / 100)
  );
  return {
    riskScore: computeRiskScore(invoice, recoveryProbability),
    recoveryProbability,
    expectedRecoveryValue,
    recommendedAction: audit.executedAction,
    confidenceScore: audit.confidenceScore,
    rootCause: audit.rootCause,
    reasoning: audit.aiReasoning,
    generatedMessage: audit.generatedMessage,
    status: audit.status,
    source: "audit",
    auditId: audit._id,
    timestamp: audit.timestamp,
  };
}

function insightsFromHeuristic(invoice) {
  const ctx = toInvoiceContext(invoice);
  const decision = heuristicDecision(ctx);
  const recoveryProbability = decision.recovery_probability;
  const expectedRecoveryValue = Math.round(
    Number(invoice.amount) * (recoveryProbability / 100)
  );
  return {
    riskScore: computeRiskScore(invoice, recoveryProbability),
    recoveryProbability,
    expectedRecoveryValue,
    recommendedAction: decision.recommended_action,
    confidenceScore: decision.confidence_score,
    rootCause: decision.root_cause,
    reasoning: decision.reasoning,
    generatedMessage: decision.generated_message,
    status: null,
    source: "heuristic-preview",
    auditId: null,
    timestamp: null,
  };
}

function buildRecoveryInsights(invoice, latestAudit) {
  if (latestAudit) {
    return insightsFromAudit(invoice, latestAudit);
  }
  return insightsFromHeuristic(invoice);
}

module.exports = {
  buildRecoveryInsights,
  computeRiskScore,
};
