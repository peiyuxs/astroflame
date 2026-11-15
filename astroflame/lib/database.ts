import { env } from "cloudflare:workers";
import { Client } from "pg";

export async function withDatabase<T>(
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error(
      "The HYPERDRIVE binding is unavailable. Configure Hyperdrive before querying the database.",
    );
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export function databaseErrorResponse(route: string, error: unknown): Response {
  console.error(`${route} database request failed`, error);
  return Response.json(
    {
      error: "Database request failed.",
      help: "Check that the TigerData schema is migrated and the Hyperdrive binding is configured. See the server logs for details.",
    },
    { status: 503 },
  );
}
