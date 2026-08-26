const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function loadUser(req, res, next) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = await User.findById(req.user.sub).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.currentUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  signToken,
  authRequired,
  loadUser,
  getJwtSecret,
};
