import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import pool, { connectDB } from "./config/db.js";
import checkHealthRoutes from "./routes/checkhealth.js";
import adminRoutes from "./routes/admin.js";
import gameSessionRoutes from "./routes/gameSessions.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET || !process.env.CLIENT_ORIGIN) {
  throw new Error("SESSION_SECRET and CLIENT_ORIGIN are required");
}

// Configure this to match your hosting provider's trusted proxy setup.
// Leave unset for direct local development.
if (process.env.TRUST_PROXY_HOPS) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);

  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error("TRUST_PROXY_HOPS must be a positive integer");
  }

  app.set("trust proxy", hops);
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(
  session({
    name: "activity.sid",
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 60 * 60 * 1000,
    },
  })
);

app.use("/api", checkHealthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/game-sessions", gameSessionRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  const status = error.status === 400 ? 400 : 500;

  res.status(status).json({
    message:
      status === 400 ? "Invalid request body" : "Internal server error",
  });
});

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();