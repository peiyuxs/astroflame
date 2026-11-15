import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.TIGER_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "Set TIGER_DATABASE_URL in astroflame/.env before running the migration.",
  );
}

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
  await client.query(schema);
  console.log("Database schema is ready.");
} finally {
  await client.end();
}
