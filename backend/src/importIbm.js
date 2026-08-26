/**
 * Import IBM Late Payment Histories–style CSV into Invoice collection.
 *
 * Default file: backend/data/WA_Fn-UseC_-Accounts-Receivable.csv
 * (sample with the official Kaggle column names — replace with the real
 * download from https://www.kaggle.com/datasets/hhenry/finance-factoring-ibm-late-payment-histories )
 *
 * Usage:
 *   npm run import:ibm
 *   npm run import:ibm -- --limit=60
 *   npm run import:ibm -- --replace
 *   npm run import:ibm -- --file=./data/my-export.csv
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { connectDb, disconnectDb } = require("./config/db");
const Invoice = require("./models/Invoice");

const DEFAULT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "WA_Fn-UseC_-Accounts-Receivable.csv"
);

const COMPANIES = [
  "Lotus Logistics",
  "Nimbus Labs",
  "Saffron Textiles",
  "Orbit Retail",
  "Peak Pharma",
  "Harbor Foods",
  "Zenith Media",
  "Blueleaf Clinic",
  "Gridline Energy",
  "Kite Apparel",
  "Cedar Motors",
  "Summit Soft",
];

const CONTACTS = [
  "Aarav Sharma",
  "Diya Patel",
  "Kabir Reddy",
  "Meera Iyer",
  "Rohan Kapoor",
  "Ananya Mehta",
  "Ishaan Nair",
  "Priya Singh",
];

function parseArgs(argv) {
  const opts = {
    file: DEFAULT_FILE,
    limit: 80,
    replace: false,
    usdToInr: 83,
  };

  for (const arg of argv) {
    if (arg === "--replace") opts.replace = true;
    else if (arg.startsWith("--file=")) opts.file = path.resolve(arg.slice(7));
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.slice(8));
    else if (arg.startsWith("--usd-to-inr=")) opts.usdToInr = Number(arg.slice(13));
  }

  return opts;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function hashIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapRow(row, opts) {
  const invoiceNumber = row.invoiceNumber || row.InvoiceNumber || row.invoice_number;
  const customerID = row.customerID || row.CustomerID || "UNKNOWN";
  const amountUsd = Number(row.InvoiceAmount || row.invoiceAmount || 0);
  const daysLate = Number(row.DaysLate || row.daysLate || 0);
  const disputed = String(row.Disputed || "").toLowerCase() === "yes";
  const paperless = String(row.PaperlessBill || "").toLowerCase();
  const dueDate = parseDate(row.DueDate || row.dueDate);

  if (!invoiceNumber || !amountUsd) return null;

  const company = COMPANIES[hashIndex(customerID, COMPANIES.length)];
  const contact = CONTACTS[hashIndex(customerID + "c", CONTACTS.length)];

  let status = "RECOVERED";
  if (disputed) status = "FAILED";
  else if (daysLate >= 1) status = "OVERDUE";

  const history = [];
  if (disputed) {
    history.push({
      at: dueDate || new Date(),
      channel: "EMAIL",
      actor: "CLIENT",
      note: "Invoice disputed in source AR dataset (IBM late-payment histories).",
    });
  }
  if (daysLate > 0) {
    history.push({
      at: dueDate || new Date(),
      channel: "SYSTEM",
      actor: "SYSTEM",
      note: `Source dataset DaysLate=${daysLate}; DaysToSettle=${row.DaysToSettle || "n/a"}.`,
    });
  }

  const amountInr = Math.round(amountUsd * opts.usdToInr);

  return {
    invoiceId: `IBM-${String(invoiceNumber).padStart(5, "0")}`,
    clientName: `${company} / ${contact}`,
    amount: amountInr,
    currency: "INR",
    status,
    daysOverdue: Math.max(0, daysLate),
    paymentMethod: paperless.includes("electronic") || paperless.includes("yes")
      ? "CARD"
      : "BANK_TRANSFER",
    retryCount: disputed ? 1 : daysLate >= 20 ? 2 : 0,
    cardExpiry: null,
    suspectedFraud: disputed && amountInr > 15000,
    promiseToPayUntil: null,
    history,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.file)) {
    throw new Error(
      `CSV not found at ${opts.file}. Download the IBM dataset from Kaggle and place it there, or keep the bundled sample.`
    );
  }

  const rows = parseCsv(fs.readFileSync(opts.file, "utf8"));
  const mapped = rows
    .map((row) => mapRow(row, opts))
    .filter(Boolean)
    .slice(0, opts.limit);

  if (!mapped.length) {
    throw new Error("No mappable rows found — check CSV headers match IBM schema.");
  }

  await connectDb();

  if (opts.replace) {
    await Invoice.deleteMany({ invoiceId: { $regex: /^IBM-/ } });
    console.log("[import:ibm] cleared previous IBM-* invoices");
  }

  let inserted = 0;
  let skipped = 0;

  for (const doc of mapped) {
    const exists = await Invoice.findOne({ invoiceId: doc.invoiceId }).lean();
    if (exists) {
      skipped += 1;
      continue;
    }
    await Invoice.create(doc);
    inserted += 1;
  }

  const counts = await Invoice.aggregate([
    { $match: { invoiceId: { $regex: /^IBM-/ } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  console.log("[import:ibm] done", {
    source: opts.file,
    considered: mapped.length,
    inserted,
    skipped,
    statusBreakdown: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  });

  await disconnectDb();
}

main().catch((err) => {
  console.error("[import:ibm] failed", err.message);
  process.exit(1);
});
