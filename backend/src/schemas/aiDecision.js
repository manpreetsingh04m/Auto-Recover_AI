const { z } = require("zod");
const { RECOVERY_ACTIONS } = require("../config/constants");

const AiDecisionSchema = z.object({
  root_cause: z.string().min(1),
  recommended_action: z.enum(RECOVERY_ACTIONS),
  generated_message: z.string().min(1),
  confidence_score: z.number().min(0).max(1),
  recovery_probability: z.number().min(0).max(100),
  reasoning: z.string().min(1),
});

module.exports = { AiDecisionSchema };
