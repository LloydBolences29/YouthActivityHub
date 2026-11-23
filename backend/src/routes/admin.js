import express from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import pool from "../config/db.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." },
});

// Require the configured frontend origin for write requests.
router.use((req, res, next) => {
  if (
    req.method === "POST" &&
    req.get("origin") !== process.env.CLIENT_ORIGIN
  ) {
    return res.status(403).json({ message: "Request origin not allowed" });
  }

  next();
});

// Login
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    const { rows } = await pool.query(
      `SELECT id, email, password_hash, role, is_active
       FROM users
       WHERE LOWER(email) = $1`,
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    if (
      !user ||
      !user.is_active ||
      user.role !== "admin" ||
      !(await argon2.verify(user.password_hash, password))
    ) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.userId = user.id;

      req.session.save((error) => {
        if (error) return next(error);

        res.json({ message: "Logged in" });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Protect all routes below this middleware.
// Check the database so role/account changes take effect.
router.use(async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Please log in" });
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [req.session.userId]
    );

    if (!rows[0] || rows[0].role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/me", (req, res) => {
  res.json({ user: req.user });
});

// Create an account
router.post("/users", async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128 ||
      !["admin", "facilitator"].includes(role)
    ) {
      return res.status(400).json({
        message:
          "Provide a valid name, email, role, and a password of 12–128 characters.",
      });
    }

    const passwordHash = await argon2.hash(password);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        role,
      ]
    );

    res.status(201).json({
      message: "User created successfully",
      user: rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "This email is already registered",
      });
    }

    next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("activity.sid", { path: "/" });
    res.json({ message: "Logged out" });
  });
});

export default router;