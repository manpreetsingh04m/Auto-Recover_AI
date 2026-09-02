const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const { signToken, authRequired, loadUser } = require("../middleware/auth");

const router = express.Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  businessName: z.string().max(160).optional().default(""),
  phone: z.string().max(32).optional().default(""),
  gstin: z.string().max(20).optional().default(""),
  address: z.string().max(240).optional().default(""),
  city: z.string().max(80).optional().default(""),
  state: z.string().max(80).optional().default(""),
  pincode: z.string().max(12).optional().default(""),
  preferredLanguage: z.enum(["Hinglish", "English"]).optional().default("Hinglish"),
  whatsappBusinessNumber: z.string().max(32).optional().default(""),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await User.hashPassword(parsed.data.password);
    const user = await User.create({
      name: parsed.data.name || email.split("@")[0],
      email,
      passwordHash,
      role: "merchant",
    });

    const token = signToken(user);
    res.status(201).json({
      ok: true,
      token,
      user: user.toPublicProfile(),
    });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: "Registration failed", detail: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const parsed = credentialsSchema
      .pick({ email: true, password: true })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
    if (!user || !(await user.verifyPassword(parsed.data.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user);
    res.json({
      ok: true,
      token,
      user: user.toPublicProfile(),
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

router.get("/me", authRequired, loadUser, (req, res) => {
  res.json({
    ok: true,
    user: req.currentUser.toPublicProfile(),
  });
});

router.patch("/me", authRequired, loadUser, async (req, res) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid profile", issues: parsed.error.issues });
    }

    const data = parsed.data;
    req.currentUser.name = data.name;
    req.currentUser.businessName = data.businessName || "";
    req.currentUser.phone = data.phone || "";
    req.currentUser.gstin = (data.gstin || "").toUpperCase();
    req.currentUser.address = data.address || "";
    req.currentUser.city = data.city || "";
    req.currentUser.state = data.state || "";
    req.currentUser.pincode = data.pincode || "";
    req.currentUser.preferredLanguage = data.preferredLanguage || "Hinglish";
    req.currentUser.whatsappBusinessNumber = data.whatsappBusinessNumber || "";

    await req.currentUser.save();

    res.json({
      ok: true,
      user: req.currentUser.toPublicProfile(),
    });
  } catch (err) {
    console.error("[auth/me PATCH]", err);
    res.status(500).json({ error: "Failed to save profile", detail: err.message });
  }
});

module.exports = router;
