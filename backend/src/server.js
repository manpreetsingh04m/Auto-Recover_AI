require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDb } = require("./config/db");
const apiRouter = require("./routes/api");
const authRouter = require("./routes/auth");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    console.error("[db] connection failed", err.message);
    res.status(503).json({ error: "Database unavailable", detail: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "auto-recover-ai",
    buildathon: "razorpay",
  });
});

app.use("/api/auth", authRouter);
app.use("/api", apiRouter);

app.use((err, _req, res, _next) => {
  console.error("[server] unhandled", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("[server] failed to start", err);
    process.exit(1);
  });
}

module.exports = app;
