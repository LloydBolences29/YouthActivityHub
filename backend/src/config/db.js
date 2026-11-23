import "dotenv/config"
import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export const connectDB = async () => {
  await pool.query("SELECT 1");
  console.log("PostgreSQL connected");
};

export default pool;