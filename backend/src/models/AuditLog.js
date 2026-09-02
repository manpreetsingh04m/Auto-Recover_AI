const mongoose = require("mongoose");
const { AUDIT_STATUSES, RECOVERY_ACTIONS } = require("../config/constants");

const auditLogSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, immutable: true, index: true },
    inputContext: { type: mongoose.Schema.Types.Mixed, required: true },
    aiReasoning: { type: String, required: true },
    executedAction: { type: String, enum: RECOVERY_ACTIONS, required: true },
    confidenceScore: { type: Number, min: 0, max: 1, default: null },
    recoveryProbability: { type: Number, min: 0, max: 100, default: null },
    status: { type: String, enum: AUDIT_STATUSES, required: true },
    generatedMessage: { type: String, default: null },
    rootCause: { type: String, default: null },
    guardrailReason: { type: String, default: null },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
