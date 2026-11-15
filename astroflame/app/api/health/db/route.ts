import { databaseErrorResponse, withDatabase } from "@/lib/database";

export async function GET() {
  try {
    await withDatabase((client) => client.query("SELECT 1"));

    return Response.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    return databaseErrorResponse("GET /api/health/db", error);
  }
}