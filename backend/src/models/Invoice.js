const mongoose = require("mongoose");
const { INVOICE_STATUSES, PAYMENT_METHODS } = require("../config/constants");

const interactionSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    channel: {
      type: String,
      enum: ["WHATSAPP", "EMAIL", "PHONE", "PORTAL", "SYSTEM"],
      required: true,
    },
    note: { type: String, required: true },
    actor: { type: String, enum: ["CLIENT", "MERCHANT", "AI", "SYSTEM"], default: "SYSTEM" },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: INVOICE_STATUSES, required: true, index: true },
    daysOverdue: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    history: { type: [interactionSchema], default: [] },
    retryCount: { type: Number, default: 0, min: 0, max: 3 },
    cardExpiry: { type: Date, default: null },
    suspectedFraud: { type: Boolean, default: false },
    promiseToPayUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

invoiceSchema.index({ status: 1, daysOverdue: -1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
