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
      { error: "Use an investigation ID such as PSI-100." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) {
    return Response.json(
      { error: "The limit must be a whole number from 1 through 500." },
      { status: 400 },
    );
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  for (const [name, value] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (value !== null && Number.isNaN(Date.parse(value))) {
      return Response.json(
        { error: `${name} must be a valid ISO date or timestamp.` },
        { status: 400 },
      );
    }
  }
  if (from && to && Date.parse(from) > Date.parse(to)) {
    return Response.json(
      { error: "The from value must be earlier than or equal to to." },
      { status: 400 },
    );
  }

  const channel = url.searchParams.get("channel");
  if (channel !== null && (channel.length < 1 || channel.length > 200)) {
    return Response.json(
      { error: "The channel filter must be 1 through 200 characters." },
      { status: 400 },
    );
  }

  const filters = ["investigation_id = $1"];
  const values: (string | number)[] = [psiId];
  if (from) {
    values.push(from);
    filters.push(`observed_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    filters.push(`observed_at <= $${values.length}`);
  }
  if (channel) {
    values.push(channel);
    filters.push(`channel = $${values.length}`);
  }
  values.push(limit);

  try {
    const result = await withDatabase((client) =>
      client.query(
        `SELECT observed_at, channel, value, unit, relative_seconds,
                source_file_id, source_row_number
         FROM telemetry_measurements
         WHERE ${filters.join(" AND ")}
         ORDER BY observed_at DESC
         LIMIT $${values.length}`,
        values,
      ),
    );

    return Response.json({
      investigationId: psiId,
      measurements: result.rows,
      limit,
    });
  } catch (error) {
    return databaseErrorResponse(
      `GET /api/investigations/${psiId}/measurements`,
      error,
    );
  }
}
