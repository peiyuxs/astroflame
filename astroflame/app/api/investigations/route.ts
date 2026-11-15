import { databaseErrorResponse, withDatabase } from "@/lib/database";

export async function GET() {
  try {
    const result = await withDatabase((client) =>
      client.query(
        `SELECT psi_id, title, description, source_url, updated_at
         FROM investigations
         WHERE psi_id = 'PSI-26'
         ORDER BY psi_id`,
      ),
    );

    return Response.json({ investigations: result.rows });
  } catch (error) {
    return databaseErrorResponse("GET /api/investigations", error);
  }
}
