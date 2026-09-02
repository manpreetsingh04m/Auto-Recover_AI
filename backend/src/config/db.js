const mongoose = require("mongoose");

const globalCache = global;

if (!globalCache.__mongoose) {
  globalCache.__mongoose = { conn: null, promise: null };
}

async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (globalCache.__mongoose.conn) {
    return globalCache.__mongoose.conn;
  }

  if (!globalCache.__mongoose.promise) {
    mongoose.set("strictQuery", true);
    globalCache.__mongoose.promise = mongoose.connect(uri).then((m) => {
      console.log(`[db] connected → ${m.connection.name}`);
      return m;
    });
  }

  globalCache.__mongoose.conn = await globalCache.__mongoose.promise;
  return globalCache.__mongoose.conn;
}

async function disconnectDb() {
  if (globalCache.__mongoose.conn) {
    await mongoose.disconnect();
    globalCache.__mongoose.conn = null;
    globalCache.__mongoose.promise = null;
  }
}

module.exports = { connectDb, disconnectDb };
