const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fetchLatestAuditsByInvoiceIds } = require("../src/services/auditQueries");

describe("fetchLatestAuditsByInvoiceIds", () => {
  it("returns empty map when no invoice ids are provided", async () => {
    assert.deepEqual(await fetchLatestAuditsByInvoiceIds([]), {});
    assert.deepEqual(await fetchLatestAuditsByInvoiceIds([null, "", undefined]), {});
  });
});
