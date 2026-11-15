import { env } from "cloudflare:workers";
import { Client } from "pg";

export async function withDatabase<T>(
  query: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    return await query(client);
  } finally {
    await client.end();
  }
}

export function databaseErrorResponse(route: string, error: unknown) {
  console.error(`Database request failed (${route}):`, error);
  return Response.json(
    { error: "The database request could not be completed." },
    { status: 503 },
  );
}

export function parseLimit(rawLimit: string | null, defaultLimit = 100) {
  const limit = rawLimit === null ? defaultLimit : Number(rawLimit);
  return Number.isInteger(limit) && limit >= 1 && limit <= 500 ? limit : null;
}

export function parseInvestigationId(rawPsiId: string) {
  const psiId = rawPsiId.toUpperCase();
  return /^PSI-\d+$/.test(psiId) ? psiId : null;
}
