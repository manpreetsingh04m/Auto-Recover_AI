const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  generatePaymentLink,
  appendPaymentLinkToMessage,
  isRazorpayConfigured,
} = require("../src/services/razorpayLinks");

describe("razorpayLinks", () => {
  it("simulates payment link when credentials are missing", async () => {
    const prev = {
      id: process.env.RAZORPAY_KEY_ID,
      secret: process.env.RAZORPAY_KEY_SECRET,
    };
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    assert.equal(isRazorpayConfigured(), false);
    const result = await generatePaymentLink({
      invoiceId: "INV-0001",
      clientName: "Acme / Rahul",
      amount: 5000,
      currency: "INR",
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "simulated");
    assert.match(result.short_url, /INV-0001/);

    process.env.RAZORPAY_KEY_ID = prev.id;
    process.env.RAZORPAY_KEY_SECRET = prev.secret;
  });

  it("appends short_url to outreach message once", () => {
    const out = appendPaymentLinkToMessage("Please pay", "https://rzp.io/i/abc");
    assert.match(out, /Please pay/);
    assert.match(out, /https:\/\/rzp\.io\/i\/abc/);
    assert.equal(
      appendPaymentLinkToMessage(out, "https://rzp.io/i/abc"),
      out
    );
  });

  it("returns error state for invalid invoice amount instead of throwing", async () => {
    const result = await generatePaymentLink({
      invoiceId: "INV-BAD",
      clientName: "Acme",
      amount: 0,
      currency: "INR",
    });
    assert.equal(result.ok, false);
    assert.equal(result.mode, "error");
    assert.equal(result.short_url, null);
  });
});
