const express = require("express");
const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");
const { runRecoveryBatch } = require("../services/recoveryEngine");
const { createInvoiceSchema, bulkCreateSchema } = require("../schemas/invoice");

const router = express.Router();

let batchRunning = false;

async function nextInvoiceId() {
  const latest = await Invoice.findOne({})
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

/**
 * GET /api/invoices?page=1&limit=20&status=
 */
router.get("/invoices", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);

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

/**
 * POST /api/invoices
 * Merchant / integration creates one invoice for recovery.
 */
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

/**
 * POST /api/invoices/bulk
 * Import many invoices at once (CSV/ERP sync style).
 */
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

/**
 * GET /api/metrics
 */
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
    const falsePositives = auditBlocked;

    const actionBreakdown = await AuditLog.aggregate([
      { $group: { _id: "$executedAction", count: { $sum: 1 } } },
    ]);

    res.json({
      currency: "INR",
      totalRecovered,
      totalAtRisk,
      recoverableCount,
      invoiceCount: invoiceCounts,
      successRate,
      falsePositives,
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

/**
 * GET /api/audit-logs?page=1&limit=20&status=&invoiceId=&action=
 */
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

/**
 * POST /api/run-batch
 */
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
