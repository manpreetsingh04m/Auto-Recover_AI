require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDb } = require("./config/db");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "auto-recover-ai",
    phase: 2,
  });
});

async function start() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] failed to start", err);
  process.exit(1);
});

module.exports = app;
