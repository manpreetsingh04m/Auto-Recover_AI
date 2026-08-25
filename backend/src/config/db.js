const mongoose = require("mongoose");

async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);
  console.log(`[db] connected → ${mongoose.connection.name}`);
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
