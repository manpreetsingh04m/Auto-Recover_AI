const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["merchant", "admin"], default: "merchant" },

    // Merchant business profile (persisted — used in dashboard + outreach context)
    businessName: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, uppercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    preferredLanguage: {
      type: String,
      enum: ["Hinglish", "English"],
      default: "Hinglish",
    },
    whatsappBusinessNumber: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.toPublicProfile = function toPublicProfile() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    businessName: this.businessName || "",
    phone: this.phone || "",
    gstin: this.gstin || "",
    address: this.address || "",
    city: this.city || "",
    state: this.state || "",
    pincode: this.pincode || "",
    preferredLanguage: this.preferredLanguage || "Hinglish",
    whatsappBusinessNumber: this.whatsappBusinessNumber || "",
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
