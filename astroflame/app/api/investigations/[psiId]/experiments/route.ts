import {
  databaseErrorResponse,
  parseInvestigationId,
  parseLimit,
  withDatabase,
} from "@/lib/database";

type RouteContext = {
  params: Promise<{ psiId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { psiId: rawPsiId } = await context.params;
  const psiId = parseInvestigationId(rawPsiId);
  if (!psiId) {
    return Response.json(
      { error: "Use an investigation ID such as PSI-26." },
      { status: 400 },
    );
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  if (limit === null) {
    return Response.json(
      { error: "The limit must be a whole number from 1 through 500." },
      { status: 400 },
    );
  }

  try {
    const result = await withDatabase((client) =>
      client.query(
        `SELECT experiments.source_row_number, experiments.experiment_date,
                experiments.gmt, experiments.as_run_test_number,
                experiments.test_number, experiments.sample_number,
                experiments.fuel_sample_material, experiments.raw_row
         FROM bass_experiments AS experiments
         JOIN source_files
           ON source_files.id = experiments.source_file_id
         WHERE source_files.investigation_id = $1
         ORDER BY experiments.experiment_date, experiments.source_row_number
         LIMIT $2`,
        [psiId, limit],
      ),
    );

    return Response.json({
      investigationId: psiId,
      experiments: result.rows,
      limit,
    });
  } catch (error) {
    return databaseErrorResponse(
      `GET /api/investigations/${psiId}/experiments`,
      error,
    );
  }
}
