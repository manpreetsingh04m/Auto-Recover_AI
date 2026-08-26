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
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
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
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

router.get("/me", authRequired, loadUser, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.currentUser._id,
      name: req.currentUser.name,
      email: req.currentUser.email,
      role: req.currentUser.role,
    },
  });
});

module.exports = router;
