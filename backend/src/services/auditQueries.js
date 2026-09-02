const AuditLog = require("../models/AuditLog");

/**
 * Fetch the most recent audit log per invoice in a single aggregation query.
 * Returns a map of invoiceId → audit document.
 */
async function fetchLatestAuditsByInvoiceIds(invoiceIds) {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  if (ids.length === 0) {
    return {};
  }

  const rows = await AuditLog.aggregate([
    { $match: { invoiceId: { $in: ids } } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: "$invoiceId",
        doc: { $first: "$$ROOT" },
      },
    },
  ]);

  return Object.fromEntries(rows.map((row) => [row._id, row.doc]));
}

module.exports = {
  fetchLatestAuditsByInvoiceIds,
};
