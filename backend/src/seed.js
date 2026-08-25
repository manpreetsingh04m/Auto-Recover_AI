require("dotenv").config();

const { connectDb, disconnectDb } = require("./config/db");
const Invoice = require("./models/Invoice");
const AuditLog = require("./models/AuditLog");

const FIRST_NAMES = [
  "Aarav", "Diya", "Kabir", "Ananya", "Rohan", "Meera", "Ishaan", "Priya",
  "Vihaan", "Sana", "Arjun", "Nisha", "Dev", "Kavya", "Nikhil", "Riya",
];
const LAST_NAMES = [
  "Sharma", "Patel", "Reddy", "Iyer", "Kapoor", "Mehta", "Nair", "Singh",
  "Gupta", "Joshi", "Khan", "Das",
];
const COMPANIES = [
  "Lotus Logistics", "Nimbus Labs", "Saffron Textiles", "Orbit Retail",
  "Peak Pharma", "Harbor Foods", "Zenith Media", "Blueleaf Clinic",
  "Gridline Energy", "Kite Apparel",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function buildBaseInvoice(index, overrides = {}) {
  const company = pick(COMPANIES);
  const contact = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const statusPool = ["OVERDUE", "FAILED", "PENDING", "RECOVERED"];
  const status = overrides.status || pick(statusPool);
  const daysOverdue =
    overrides.daysOverdue ??
    (status === "OVERDUE" || status === "FAILED" ? 1 + (index % 40) : 0);

  return {
    invoiceId: `INV-${String(index + 1).padStart(4, "0")}`,
    clientName: `${company} / ${contact}`,
    amount: overrides.amount ?? 15000 + (index % 20) * 4750,
    currency: "INR",
    status,
    daysOverdue,
    paymentMethod: overrides.paymentMethod || (index % 3 === 0 ? "BANK_TRANSFER" : "CARD"),
    retryCount: overrides.retryCount ?? (status === "FAILED" ? index % 3 : 0),
    cardExpiry: overrides.cardExpiry ?? null,
    suspectedFraud: overrides.suspectedFraud ?? false,
    promiseToPayUntil: overrides.promiseToPayUntil ?? null,
    history: overrides.history ?? [],
  };
}

function syntheticBatch() {
  const invoices = [];

  // Edge case 1: 45-day overdue B2B invoice
  invoices.push(
    buildBaseInvoice(0, {
      status: "OVERDUE",
      daysOverdue: 45,
      paymentMethod: "BANK_TRANSFER",
      amount: 285000,
      history: [
        {
          at: daysAgo(30),
          channel: "EMAIL",
          actor: "MERCHANT",
          note: "First overdue notice sent for bulk order INV-0001.",
        },
        {
          at: daysAgo(14),
          channel: "PHONE",
          actor: "MERCHANT",
          note: "AP team asked for extra time citing month-end close.",
        },
      ],
    })
  );

  // Edge case 2: card expired yesterday
  invoices.push(
    buildBaseInvoice(1, {
      status: "FAILED",
      daysOverdue: 1,
      paymentMethod: "CARD",
      amount: 18990,
      cardExpiry: daysAgo(1),
      history: [
        {
          at: daysAgo(1),
          channel: "SYSTEM",
          actor: "SYSTEM",
          note: "Card charge declined: expired_card.",
        },
      ],
    })
  );

  // Edge case 3: suspected fraudulent transaction
  invoices.push(
    buildBaseInvoice(2, {
      status: "FAILED",
      daysOverdue: 2,
      paymentMethod: "CARD",
      amount: 499999,
      suspectedFraud: true,
      retryCount: 1,
      history: [
        {
          at: daysAgo(2),
          channel: "SYSTEM",
          actor: "SYSTEM",
          note: "Issuer flagged transaction as high-risk / possible fraud.",
        },
      ],
    })
  );

  // Edge case 4: client promised to pay next week
  invoices.push(
    buildBaseInvoice(3, {
      status: "OVERDUE",
      daysOverdue: 12,
      paymentMethod: "BANK_TRANSFER",
      amount: 76000,
      promiseToPayUntil: daysFromNow(7),
      history: [
        {
          at: daysAgo(3),
          channel: "WHATSAPP",
          actor: "CLIENT",
          note: "Will pay next week after the client disbursement hits.",
        },
      ],
    })
  );

  for (let i = 4; i < 52; i += 1) {
    invoices.push(buildBaseInvoice(i));
  }

  return invoices;
}

async function seed() {
  await connectDb();

  await Promise.all([Invoice.deleteMany({}), AuditLog.deleteMany({})]);
  const docs = await Invoice.insertMany(syntheticBatch());

  const counts = docs.reduce((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`[seed] inserted ${docs.length} invoices`, counts);
  await disconnectDb();
}

seed().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
