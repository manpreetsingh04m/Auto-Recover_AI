require("dotenv").config();

const { connectDb, disconnectDb } = require("./config/db");
const { runRecoveryBatch } = require("./services/recoveryEngine");

async function main() {
  await connectDb();
  const { summary } = await runRecoveryBatch();
  console.log(JSON.stringify(summary, null, 2));
  await disconnectDb();
}

main().catch((err) => {
  console.error("[run-batch] failed", err);
  process.exit(1);
});
