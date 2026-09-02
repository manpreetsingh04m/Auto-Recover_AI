const express = require("express");
const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");
const { runRecoveryBatch, processInvoice } = require("../services/recoveryEngine");
const { buildRecoveryInsights } = require("../services/recoveryInsights");
const { fetchLatestAuditsByInvoiceIds } = require("../services/auditQueries");
const {
  triggerVoiceAgent,
  buildDemoCallScript,
  clientFirstName,
  resolveVoiceCallOutcome,
} = require("../services/voiceAgent");
const { createInvoiceSchema, bulkCreateSchema } = require("../schemas/invoice");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

let batchRunning = false;

async function nextInvoiceId() {
  const latest = await Invoice.findOne({ invoiceId: { $regex: /^INV-/ } })
    .sort({ invoiceId: -1 })
    .select("invoiceId")
    .lean();

  let next = 1;
  if (latest?.invoiceId) {
    const match = String(latest.invoiceId).match(/(\d+)/);
    if (match) next = Number(match[1]) + 1;
  }
  return `INV-${String(next).padStart(4, "0")}`;
}

function toInvoiceDoc(payload, invoiceId) {
  return {
    invoiceId,
    clientName: payload.clientName,
    clientPhone: payload.clientPhone || null,
    amount: payload.amount,
    currency: payload.currency || "INR",
    status: payload.status || "OVERDUE",
    daysOverdue: payload.daysOverdue ?? 0,
    paymentMethod: payload.paymentMethod,
    retryCount: payload.retryCount ?? 0,
    cardExpiry: payload.cardExpiry ?? null,
    suspectedFraud: payload.suspectedFraud ?? false,
    promiseToPayUntil: payload.promiseToPayUntil ?? null,
    history: payload.history || [],
  };
}

router.get("/invoices", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.q) {
      const q = String(req.query.q).trim();
      filter.$or = [
        { invoiceId: new RegExp(q, "i") },
        { clientName: new RegExp(q, "i") },
        { clientPhone: new RegExp(q, "i") },
      ];
    }

    const [total, data] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter).sort({ daysOverdue: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      data,
    });
  } catch (err) {
    console.error("[api/invoices GET]", err);
    res.status(500).json({ error: "Failed to list invoices", detail: err.message });
  }
});

router.get("/invoices/:invoiceId", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId }).lean();
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const audits = await AuditLog.find({ invoiceId: invoice.invoiceId })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    res.json({ ok: true, invoice, audits });
  } catch (err) {
    console.error("[api/invoices/:id]", err);
    res.status(500).json({ error: "Failed to fetch invoice", detail: err.message });
  }
});

router.post("/invoices", async (req, res) => {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid invoice payload",
        issues: parsed.error.issues,
      });
    }

    const invoiceId = parsed.data.invoiceId || (await nextInvoiceId());
    const existing = await Invoice.findOne({ invoiceId }).lean();
    if (existing) {
      return res.status(409).json({ error: `Invoice ${invoiceId} already exists` });
    }

    const doc = await Invoice.create(toInvoiceDoc(parsed.data, invoiceId));
    res.status(201).json({ ok: true, invoice: doc });
  } catch (err) {
    console.error("[api/invoices POST]", err);
    res.status(500).json({ error: "Failed to create invoice", detail: err.message });
  }
});

router.post("/invoices/bulk", async (req, res) => {
  try {
    const parsed = bulkCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid bulk payload",
        issues: parsed.error.issues,
      });
    }

    const created = [];
    const skipped = [];

    for (const item of parsed.data.invoices) {
      const invoiceId = item.invoiceId || (await nextInvoiceId());
      const exists = await Invoice.findOne({ invoiceId }).lean();
      if (exists) {
        skipped.push({ invoiceId, reason: "already exists" });
        continue;
      }
      const doc = await Invoice.create(toInvoiceDoc(item, invoiceId));
      created.push(doc);
    }

    res.status(201).json({
      ok: true,
      created: created.length,
      skipped: skipped.length,
      invoices: created,
      skippedItems: skipped,
    });
  } catch (err) {
    console.error("[api/invoices/bulk]", err);
    res.status(500).json({ error: "Bulk create failed", detail: err.message });
  }
});

router.get("/metrics", async (_req, res) => {
  try {
    const [statusAgg, auditAgg, invoiceCounts] = await Promise.all([
      Invoice.aggregate([
        {
          $group: {
            _id: "$status",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      AuditLog.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Invoice.countDocuments(),
    ]);

    const byStatus = Object.fromEntries(
      statusAgg.map((row) => [row._id, { amount: row.totalAmount, count: row.count }])
    );
    const auditByStatus = Object.fromEntries(auditAgg.map((row) => [row._id, row.count]));

    const totalRecovered = byStatus.RECOVERED?.amount || 0;
    const totalAtRisk =
      (byStatus.OVERDUE?.amount || 0) + (byStatus.FAILED?.amount || 0);
    const recoverableCount =
      (byStatus.OVERDUE?.count || 0) + (byStatus.FAILED?.count || 0);

    const auditSuccess = auditByStatus.SUCCESS || 0;
    const auditBlocked = auditByStatus.BLOCKED_BY_GUARDRAIL || 0;
    const auditTotal = auditSuccess + auditBlocked;
    const successRate = auditTotal === 0 ? 0 : Number((auditSuccess / auditTotal).toFixed(4));

    const actionBreakdown = await AuditLog.aggregate([
      { $group: { _id: "$executedAction", count: { $sum: 1 } } },
    ]);

    const recoverableInvoices = await Invoice.find({
      status: { $in: ["FAILED", "OVERDUE"] },
    }).lean();
    const latestAuditsByInvoiceId = await fetchLatestAuditsByInvoiceIds(
      recoverableInvoices.map((invoice) => invoice.invoiceId)
    );
    let expectedRecovery = 0;
    for (const invoice of recoverableInvoices) {
      const latestAudit = latestAuditsByInvoiceId[invoice.invoiceId] ?? null;
      expectedRecovery += buildRecoveryInsights(invoice, latestAudit).expectedRecoveryValue;
    }

    res.json({
      currency: "INR",
      totalRecovered,
      totalAtRisk,
      expectedRecovery,
      recoverableCount,
      invoiceCount: invoiceCounts,
      successRate,
      falsePositives: auditBlocked,
      audit: {
        total: auditTotal,
        success: auditSuccess,
        blocked: auditBlocked,
      },
      invoicesByStatus: {
        OVERDUE: byStatus.OVERDUE || { amount: 0, count: 0 },
        FAILED: byStatus.FAILED || { amount: 0, count: 0 },
        RECOVERED: byStatus.RECOVERED || { amount: 0, count: 0 },
        PENDING: byStatus.PENDING || { amount: 0, count: 0 },
      },
      actionsByType: Object.fromEntries(
        actionBreakdown.map((row) => [row._id, row.count])
      ),
      batchRunning,
    });
  } catch (err) {
    console.error("[api/metrics]", err);
    res.status(500).json({ error: "Failed to compute metrics", detail: err.message });
  }
});

router.get("/recovery-queue", async (_req, res) => {
  try {
    const invoices = await Invoice.find({ status: { $in: ["FAILED", "OVERDUE"] } })
      .sort({ daysOverdue: -1, amount: -1 })
      .lean();

    const latestAuditsByInvoiceId = await fetchLatestAuditsByInvoiceIds(
      invoices.map((invoice) => invoice.invoiceId)
    );

    const data = invoices.map((invoice) => ({
      invoice,
      insights: buildRecoveryInsights(
        invoice,
        latestAuditsByInvoiceId[invoice.invoiceId] ?? null
      ),
    }));

    data.sort(
      (a, b) => b.insights.expectedRecoveryValue - a.insights.expectedRecoveryValue
    );

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[api/recovery-queue]", err);
    res.status(500).json({ error: "Failed to load recovery queue", detail: err.message });
  }
});

router.get("/conversations", async (_req, res) => {
  try {
    const voiceAudits = await AuditLog.find({
      executedAction: "TRIGGER_AI_VOICE_CALL",
    })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    const invoices = await Invoice.find({
      invoiceId: { $in: voiceAudits.map((a) => a.invoiceId) },
    }).lean();
    const byId = Object.fromEntries(invoices.map((inv) => [inv.invoiceId, inv]));

    const phoneHistory = await Invoice.find({
      "history.channel": "PHONE",
    })
      .select("invoiceId clientName amount history")
      .lean();

    const fromHistory = phoneHistory.flatMap((inv) =>
      (inv.history || [])
        .filter((h) => h.channel === "PHONE")
        .map((h) => ({
          invoiceId: inv.invoiceId,
          clientName: inv.clientName,
          amount: inv.amount,
          at: h.at,
          note: h.note,
          source: "history",
        }))
    );

    const fromAudits = voiceAudits.map((audit) => ({
      invoiceId: audit.invoiceId,
      clientName: byId[audit.invoiceId]?.clientName || audit.invoiceId,
      amount: byId[audit.invoiceId]?.amount || 0,
      at: audit.timestamp,
      note: audit.generatedMessage || audit.rootCause || audit.aiReasoning,
      source: "audit",
      status:
        audit.status === "SUCCESS"
          ? byId[audit.invoiceId]?.status === "RECOVERED"
            ? "Resolved"
            : "Negotiated"
          : "Pending",
      recoveryProbability: audit.recoveryProbability,
    }));

    const merged = [...fromAudits, ...fromHistory]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 25);

    res.json({ ok: true, data: merged });
  } catch (err) {
    console.error("[api/conversations]", err);
    res.status(500).json({ error: "Failed to load conversations", detail: err.message });
  }
});

router.get("/audit-logs", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.invoiceId) filter.invoiceId = String(req.query.invoiceId);
    if (req.query.action) filter.executedAction = String(req.query.action);

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      data: logs,
    });
  } catch (err) {
    console.error("[api/audit-logs]", err);
    res.status(500).json({ error: "Failed to fetch audit logs", detail: err.message });
  }
});

router.get("/invoices/:invoiceId/recovery-insights", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const latestAudit = await AuditLog.findOne({ invoiceId: invoice.invoiceId })
      .sort({ timestamp: -1 })
      .lean();

    const insights = buildRecoveryInsights(invoice, latestAudit);

    res.json({
      ok: true,
      invoice: invoice.toObject(),
      insights,
      audits: await AuditLog.find({ invoiceId: invoice.invoiceId })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    });
  } catch (err) {
    console.error("[api/recovery-insights]", err);
    res.status(500).json({ error: "Failed to load recovery insights", detail: err.message });
  }
});

router.post("/invoices/:invoiceId/recover", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (!["FAILED", "OVERDUE"].includes(invoice.status)) {
      return res.status(400).json({
        error: "Invoice is not in a recoverable state",
        status: invoice.status,
      });
    }

    const result = await processInvoice(invoice);
    const refreshed = await Invoice.findOne({ invoiceId: invoice.invoiceId }).lean();
    const insights = buildRecoveryInsights(
      refreshed,
      await AuditLog.findById(result.auditId).lean()
    );

    res.json({ ok: true, result, invoice: refreshed, insights });
  } catch (err) {
    console.error("[api/recover]", err);
    res.status(500).json({ error: "Recovery execution failed", detail: err.message });
  }
});

router.post("/invoices/:invoiceId/simulate-payment", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    invoice.status = "RECOVERED";
    invoice.daysOverdue = 0;
    invoice.history.push({
      at: new Date(),
      channel: "PORTAL",
      actor: "CLIENT",
      note: `Payment of ₹${invoice.amount} confirmed via Razorpay (simulated demo).`,
    });
    await invoice.save();

    res.json({
      ok: true,
      message: "Payment simulated — invoice marked RECOVERED",
      invoice: invoice.toObject(),
    });
  } catch (err) {
    console.error("[api/simulate-payment]", err);
    res.status(500).json({ error: "Simulate payment failed", detail: err.message });
  }
});

router.post("/invoices/:invoiceId/voice-call", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const callResult = await triggerVoiceAgent(invoice);
    const script = buildDemoCallScript(invoice);
    const outcome = resolveVoiceCallOutcome(callResult);

    if (outcome.shouldRecordPromiseToPay) {
      const promiseDate = new Date();
      promiseDate.setDate(promiseDate.getDate() + 1);
      invoice.promiseToPayUntil = promiseDate;
      invoice.history.push({
        at: new Date(),
        channel: "PHONE",
        actor: "AI",
        note: `AI voice call completed (${callResult.mode}) — client promised to pay by ${promiseDate.toISOString().slice(0, 10)}.`,
      });
      await invoice.save();
    }

    res.json({
      ok: outcome.responseOk,
      call: {
        ...callResult,
        ok: outcome.responseOk,
        mode: callResult.mode,
        clientName: clientFirstName(invoice),
        invoiceId: invoice.invoiceId,
        amount: invoice.amount,
        script,
        promiseToPayDate: outcome.shouldRecordPromiseToPay ? invoice.promiseToPayUntil : null,
      },
      invoice: invoice.toObject(),
    });
  } catch (err) {
    console.error("[api/voice-call]", err);
    res.status(500).json({ error: "Voice call failed", detail: err.message });
  }
});

router.post("/run-batch", async (_req, res) => {
  if (batchRunning) {
    return res.status(409).json({
      error: "Batch already running",
      batchRunning: true,
    });
  }

  batchRunning = true;
  const startedAt = new Date();

  try {
    const { summary, results } = await runRecoveryBatch();
    res.json({
      ok: true,
      startedAt,
      finishedAt: new Date(),
      summary,
      results,
    });
  } catch (err) {
    console.error("[api/run-batch]", err);
    res.status(500).json({ error: "Batch failed", detail: err.message });
  } finally {
    batchRunning = false;
  }
});

module.exports = router;
