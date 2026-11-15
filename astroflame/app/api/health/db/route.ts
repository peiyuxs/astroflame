import { databaseErrorResponse, withDatabase } from "@/lib/database";

export async function GET() {
  try {
    const result = await withDatabase((client) =>
      client.query<{ connected_at: Date }>(
        "SELECT CURRENT_TIMESTAMP AS connected_at",
      ),
    );

    return Response.json({
      status: "connected",
      database: "TigerData PostgreSQL via Cloudflare Hyperdrive",
      connectedAt: result.rows[0]?.connected_at,
    });
  } catch (error) {
    return databaseErrorResponse("GET /api/health/db", error);
  }
}
