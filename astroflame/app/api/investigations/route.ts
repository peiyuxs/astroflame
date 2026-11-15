import { databaseErrorResponse, withDatabase } from "@/lib/database";

export async function GET() {
  try {
    const result = await withDatabase((client) =>
      client.query(
        `SELECT psi_id, title, source_url, updated_at
         FROM investigations
         ORDER BY psi_id`,
      ),
    );
    return Response.json({ investigations: result.rows });
  } catch (error) {
    return databaseErrorResponse("GET /api/investigations", error);
  }
}
