import "dotenv/config";
import argon2 from "argon2";
import pool from "../config/db.js";

try {
  const { INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } =
    process.env;

  if (
    !INITIAL_ADMIN_NAME?.trim() ||
    !INITIAL_ADMIN_EMAIL?.trim() ||
    !INITIAL_ADMIN_PASSWORD ||
    INITIAL_ADMIN_PASSWORD.length < 12 ||
    INITIAL_ADMIN_PASSWORD.length > 128
  ) {
    throw new Error(
      "Set initial admin details in .env with a password of 12–128 characters."
    );
  }

  const passwordHash = await argon2.hash(INITIAL_ADMIN_PASSWORD);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [
      INITIAL_ADMIN_NAME.trim(),
      INITIAL_ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash,
    ]
  );

  console.log("Admin created");
} catch (error) {
  console.error(
    error.code === "23505"
      ? "That email already exists. No account was changed."
      : error.message
  );

  process.exitCode = 1;
} finally {
  await pool.end();
}