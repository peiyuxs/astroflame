import { databaseErrorResponse, withDatabase } from "@/lib/database";

type RouteContext = {
  params: Promise<{ psiId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { psiId: rawPsiId } = await context.params;
  const psiId = rawPsiId.toUpperCase();
  if (!/^PSI-\d+$/.test(psiId)) {
    return Response.json(
      { error: "Use an investigation ID such as PSI-100." },
      { status: 400 },
    );
  }

  const rawLimit = new URL(request.url).searchParams.get("limit") ?? "100";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return Response.json(
      { error: "The limit must be a whole number from 1 through 500." },
      { status: 400 },
    );
  }

  try {
    const result = await withDatabase((client) =>
      client.query(
        `SELECT rejected.source_row_number, rejected.reason,
                rejected.raw_row, rejected.recorded_at
         FROM telemetry_import_rejections AS rejected
         JOIN source_files ON source_files.id = rejected.source_file_id
         WHERE source_files.investigation_id = $1
         ORDER BY rejected.source_row_number
         LIMIT $2`,
        [psiId, limit],
      ),
    );

    return Response.json({
      investigationId: psiId,
      rejectedRows: result.rows,
      limit,
    });
  } catch (error) {
    return databaseErrorResponse(
      `GET /api/investigations/${psiId}/rejections`,
      error,
    );
  }
}
