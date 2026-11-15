import { env } from "cloudflare:workers";
import { Client } from "pg";

export async function GET() {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Hyperdrive database health check failed:", error);
    return Response.json(
      { status: "error", message: "Could not connect to the database." },
      { status: 503 },
    );
  } finally {
    await client.end();
  }
}
