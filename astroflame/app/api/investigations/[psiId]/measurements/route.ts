import { databaseErrorResponse, withDatabase } from "@/lib/database";

type RouteContext = {
  params: Promise<{ psiId: string }>;
};

function parseDateParameter(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: Request, context: RouteContext) {
  const { psiId: rawPsiId } = await context.params;
  const psiId = rawPsiId.toUpperCase();
  if (!/^PSI-\d+$/.test(psiId)) {
    return Response.json(
      { error: "Use an investigation ID such as PSI-100." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit") ?? "100";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return Response.json(
      { error: "The limit must be a whole number from 1 through 500." },
      { status: 400 },
    );
  }

  const from = parseDateParameter(url.searchParams.get("from"));
  const to = parseDateParameter(url.searchParams.get("to"));
  if (from === null || to === null) {
    return Response.json(
      { error: "from and to must be valid date/time values." },
      { status: 400 },
    );
  }
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    return Response.json(
      { error: "from must be earlier than or equal to to." },
      { status: 400 },
    );
  }

  const channel = url.searchParams.get("channel");
  if (channel !== null && (channel.trim().length === 0 || channel.length > 200)) {
    return Response.json(
      { error: "channel must contain 1 through 200 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await withDatabase(async (client) => {
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
      if (channel !== null) {
        values.push(channel.trim());
        filters.push(`channel = $${values.length}`);
      }
      values.push(limit);

      return client.query(
        `SELECT observed_at, relative_seconds, channel, value, unit,
                source_file_id, source_row_number
         FROM telemetry_measurements
         WHERE ${filters.join(" AND ")}
         ORDER BY observed_at, source_row_number, channel
         LIMIT $${values.length}`,
        values,
      );
    });

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
