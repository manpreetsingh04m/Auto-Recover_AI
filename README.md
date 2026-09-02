# Razorpay Revive AI

**Razorpay Revive AI** — autonomous, bounded **AI revenue recovery** for B2B merchants. Built for the **Razorpay Buildathon**.

Detects overdue invoices and failed payments, diagnoses root cause with an LLM, predicts recovery probability, generates **Razorpay payment links**, and executes only **bounded** recovery actions (WhatsApp, voice fallback, card retry) with Zod validation, confidence guardrails, JWT-protected APIs, and an immutable audit trail.

Merchant UI follows a Razorpay-inspired fintech console (navy `#012652`, blue `#0D94FB`).

---

## Problem

Merchants lose cash to failed cards, overdue bank transfers, promise-to-pay delays, and fraud-flagged charges. Manual collections don’t scale; unbounded AI messaging is unsafe.

## Solution

1. Ingest invoices (`FAILED` / `OVERDUE`) via seed, IBM AR CSV, API, or dashboard  
2. Run a **batch recovery engine** over the ledger  
3. LLM returns structured JSON (root cause, action, message, confidence, **recovery_probability**)  
4. **Guardrails:** Zod parse + confidence ≥ **0.85** + max **3** card retries — otherwise `ESCALATE_TO_ADMIN`  
5. **Razorpay Payment Links** appended to WhatsApp / payment-link outreach  
6. **AI Voice fallback** (Bland.ai) for high-value, severely overdue invoices  
7. Log every decision to **AuditLog**  
8. Merchant dashboard + full invoices page behind JWT auth  

### Allowed actions

| Action | Behavior |
|--------|----------|
| `SEND_WHATSAPP_REMINDER` | WhatsApp reminder + Razorpay link (Twilio or simulated) |
| `RETRY_CARD` | Simulated card retry (capped at 3) |
| `SEND_PAYMENT_LINK` | Razorpay payment link in message |
| `TRIGGER_AI_VOICE_CALL` | Bland.ai Hinglish voice call (simulated if no API key) |
| `PAUSE_PROMISE_TO_PAY` | Pause outreach for active PTP |
| `ESCALATE_TO_ADMIN` | Queue for human review |

---

## 🛠️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js Merchant Dashboard                      │
│     (KPI Metrics | Live Audit Feed | Batch Runner | Invoices Portal)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST API (+ JWT)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Express.js Engine API                            │
│ ┌──────────────────────┐ ┌────────────────────┐ ┌───────────────────┐ │
│ │  Batch Event Engine  │ │ LLM Orchestrator   │ │ Zod Guardrail     │ │
│ │  (FAILED / OVERDUE)  │ │ (Groq / Gemini)    │ │ (conf ≥ 0.85)     │ │
│ └──────────────────────┘ └────────────────────┘ └───────────────────┘ │
└─────────────────┬──────────────────┬───────────────────┬───────────────┘
                  │                  │                   │
                  ▼                  ▼                   ▼
      ┌──────────────────────┐ ┌───────────┐ ┌───────────────────────┐
      │  MongoDB (Mongoose) │ │ Groq /    │ │ WhatsApp (Twilio or   │
      │  Invoice + AuditLog │ │ Gemini    │ │ simulated webhook)    │
      └──────────────────────┘ └───────────┘ └───────────────────────┘
```

### 💻 Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express.js, JWT (`jsonwebtoken` + `bcryptjs`) |
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Database | MongoDB Atlas or local (Mongoose ODM) |
| AI Engine | Groq (default) or Google Gemini; heuristic fallback |
| Validation & Safety | Zod schema validation |
| Testing | Node.js built-in test runner (`node --test`) |
| Communications | WhatsApp via Twilio when configured / mock otherwise |

---

## 🚀 Quickstart Guide

### Prerequisites

- Node.js (v18+)
- MongoDB instance (local or MongoDB Atlas)
- Groq API key: https://console.groq.com/keys (or Gemini key if using `AI_PROVIDER=gemini`)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/manpreetsingh04m/razorpay-revive-ai.git
cd razorpay-revive-ai

# Install Backend
cd backend && npm install

# Install Frontend
cd ../frontend && npm install
```

### 2. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Set at least:

```bash
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/auto_recover_ai
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=7d

AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b

# Optional alternate provider
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash

CONFIDENCE_THRESHOLD=0.85
MAX_RETRIES=3
```

Frontend (`frontend/.env.local`):

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Seed Database & Optional IBM Import

```bash
cd backend
npm run seed              # synthetic invoices + default merchant user
npm run import:ibm        # optional IBM AR CSV import
# npm run import:ibm -- --replace --limit=80
npm run run-batch         # optional CLI recovery batch
```

**Default login (from seed)**

- Email: `merchant@autorecover.ai`
- Password: `Recover@123`

### 4. Start Local Development Servers

```bash
# Terminal 1: Backend
cd backend && npm run dev          # http://localhost:4000

# Terminal 2: Frontend
cd frontend && npm run dev         # http://localhost:3000
```

Open http://localhost:3000 → sign in → dashboard / invoices / audit trail.

---

## 🧪 Testing & Guardrail Verification

```bash
cd backend
npm test
```

Covers Zod AI schema, guardrails (confidence &lt; 0.85 → escalate, max retries ≤ 3), invoice create schema, auth helpers, and IBM CSV field mapping.

Example expectations:

```text
✓ Should escalate / block when confidence < 0.85
✓ Should reject malformed / unknown actions
✓ Should enforce maximum retry limit (<= 3)
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

## Deploy to Vercel

Use **two Vercel projects** from this monorepo (backend + frontend).

### 1. Backend (`backend/`)

```bash
cd backend
vercel login
vercel          # first deploy — note the production URL, e.g. https://razorpay-revive-ai-backend.vercel.app
```

**Environment variables** (Vercel dashboard → Project → Settings → Environment Variables):

| Variable | Required |
|----------|----------|
| `MONGODB_URI` | Yes (MongoDB Atlas) |
| `JWT_SECRET` | Yes |
| `GROQ_API_KEY` | For AI |
| `AI_PROVIDER` | `groq` |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `CONFIDENCE_THRESHOLD` | `0.85` |
| `MAX_RETRIES` | `3` |
| `RAZORPAY_KEY_ID` | For real payment links |
| `RAZORPAY_KEY_SECRET` | For real payment links |
| `BLAND_API_KEY` | Optional voice agent |

MongoDB Atlas → **Network Access** → allow `0.0.0.0/0` (or Vercel IPs) so serverless can connect.

Seed production DB once from your machine:

```bash
MONGODB_URI="your-atlas-uri" npm run seed
```

**Note:** `POST /api/run-batch` can run 1–3 minutes. Vercel Hobby has a **10s** function limit — batch may timeout. Pro plan + `maxDuration: 300` in `backend/vercel.json` is recommended for demos.

### 2. Frontend (`frontend/`)

```bash
cd frontend
vercel
```

Set:

```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.vercel.app
```

Redeploy frontend after the backend URL is known.

### 3. Verify

```bash
curl https://your-backend-url.vercel.app/health
```

Open the frontend URL → login → dashboard.

---

## Troubleshooting

| Issue | Fix |
|-------|------|
| 401 on API | Login again; send `Authorization: Bearer …` |
| Groq model 404 | Set `GROQ_MODEL` to a model your key can access |
| Empty dashboard | Run `npm run seed` / `import:ibm`; confirm backend on `:4000` |

---

Not affiliated with Razorpay. UI colors inspired by Razorpay’s public brand palette for a familiar merchant experience.
