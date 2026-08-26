# Auto-Recover AI

**Autonomous AI Revenue Recovery** for B2B merchants — built for the **Razorpay Buildathon**.

Detects overdue invoices and failed payments, diagnoses root cause with an LLM, and executes only **bounded** recovery actions with Zod validation, confidence guardrails, JWT-protected APIs, and an immutable audit trail.

Merchant UI follows a Razorpay-inspired fintech console (navy `#012652`, blue `#0D94FB`).

---

## Problem

Merchants lose cash to failed cards, overdue bank transfers, promise-to-pay delays, and fraud-flagged charges. Manual collections don’t scale; unbounded AI messaging is unsafe.

## Solution

1. Ingest invoices (`FAILED` / `OVERDUE`) via seed, IBM AR CSV, API, or dashboard  
2. Run a **batch recovery engine** over the ledger  
3. LLM returns structured JSON (root cause, action, message, confidence)  
4. **Guardrails:** Zod parse + confidence ≥ **0.85** + max **3** card retries — otherwise `ESCALATE_TO_ADMIN`  
5. Log every decision to **AuditLog**  
6. Merchant dashboard + full invoices page behind JWT auth  

### Allowed actions

| Action | Behavior |
|--------|----------|
| `SEND_WHATSAPP_REMINDER` | WhatsApp reminder (simulated / configured channel) |
| `RETRY_CARD` | Simulated card retry (capped at 3) |
| `SEND_PAYMENT_LINK` | Simulated payment-link dispatch |
| `PAUSE_PROMISE_TO_PAY` | Pause outreach for active PTP |
| `ESCALATE_TO_ADMIN` | Queue for human review |

---

## Tech stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, JWT (`jsonwebtoken` + `bcryptjs`) |
| Database | MongoDB + Mongoose |
| AI | Groq (default) or Google Gemini |
| Validation | Zod |
| Frontend | Next.js 15, TypeScript |
| Tests | Node.js built-in test runner |

---

## Quick start

### Prerequisites

- Node.js 18+
- MongoDB (Atlas or local)
- Groq API key: https://console.groq.com/keys

### Backend

```bash
cd backend
cp .env.example .env
# Set MONGODB_URI, JWT_SECRET, GROQ_API_KEY
npm install
npm run seed              # demo invoices + default merchant user
npm run import:ibm        # optional IBM AR CSV import
npm run dev               # http://localhost:4000
```

**Default login (from seed)**

- Email: `merchant@autorecover.ai`  
- Password: `Recover@123`

### Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Open http://localhost:3000 → sign in → dashboard / invoices / audit trail.

---

## Environment

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Mongo connection string |
| `JWT_SECRET` | Yes | Secret for signing tokens |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `AI_PROVIDER` | No | `groq` \| `gemini` \| `heuristic` |
| `GROQ_API_KEY` | For Groq | Free Groq key |
| `GROQ_MODEL` | No | Default `openai/gpt-oss-20b` |
| `GEMINI_API_KEY` | Optional | Fallback provider |
| `CONFIDENCE_THRESHOLD` | No | Default `0.85` |
| `MAX_RETRIES` | No | Default `3` |

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## API (JWT required except auth + health)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `POST` | `/api/auth/register` | No | Create merchant user |
| `POST` | `/api/auth/login` | No | Login → `{ token, user }` |
| `GET` | `/api/auth/me` | Yes | Current user |
| `GET` | `/api/metrics` | Yes | KPIs |
| `GET` | `/api/audit-logs` | Yes | Paginated audit trail |
| `GET` | `/api/invoices` | Yes | Paginated invoices (`status`, `q`) |
| `GET` | `/api/invoices/:invoiceId` | Yes | Invoice detail + recent audits |
| `POST` | `/api/invoices` | Yes | Create invoice |
| `POST` | `/api/invoices/bulk` | Yes | Bulk create |
| `POST` | `/api/run-batch` | Yes | Run recovery engine |

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"merchant@autorecover.ai","password":"Recover@123"}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/invoices
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/run-batch
```

---

## Data sources

| Source | How |
|--------|-----|
| Synthetic seed | `npm run seed` (edge cases: fraud, expired card, PTP, 45-day overdue) |
| IBM late-payment CSV | `npm run import:ibm` — [Kaggle schema](https://www.kaggle.com/datasets/hhenry/finance-factoring-ibm-late-payment-histories) |
| Dashboard / API | Add invoice form or `POST /api/invoices` |

```bash
npm run import:ibm -- --replace --limit=80
```

---

## Tests

```bash
cd backend
npm test
```

Covers Zod AI schema, guardrails, invoice create schema, auth helpers, and IBM CSV field mapping.

---

## Project layout

```text
backend/src/
  models/          Invoice, AuditLog, User
  middleware/      JWT auth
  routes/          auth + api
  services/        aiClient, recoveryEngine, whatsapp
  schemas/         Zod
  seed.js / importIbm.js
frontend/src/
  app/             login, dashboard, invoices
  components/      UI
  lib/             api + auth storage
```

---

## Scripts

| Location | Script | Purpose |
|----------|--------|---------|
| backend | `npm run dev` | API with watch |
| backend | `npm run seed` | Seed invoices + merchant user |
| backend | `npm run import:ibm` | Import AR CSV |
| backend | `npm run run-batch` | CLI batch |
| backend | `npm test` | Test suite |
| frontend | `npm run dev` | Next.js UI |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 401 on API | Login again; token in `Authorization: Bearer …` |
| Groq model 404 | Set `GROQ_MODEL` to a model your key can access |
| Empty dashboard | Run `npm run seed` / `import:ibm`; confirm backend on `:4000` |

---

Not affiliated with Razorpay. UI colors inspired by Razorpay’s public brand palette for a familiar merchant experience.
