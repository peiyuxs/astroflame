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

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit") ?? "500";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return Response.json(
      { error: "The limit must be a whole number from 1 through 500." },
      { status: 400 },
    );
  }

  const requestedChannel = url.searchParams.get("channel");
  if (
    requestedChannel !== null &&
    (requestedChannel.trim().length === 0 || requestedChannel.length > 200)
  ) {
    return Response.json(
      { error: "channel must contain 1 through 200 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await withDatabase(async (client) => {
      const channelResult = await client.query(
        `SELECT DISTINCT channel
         FROM telemetry_measurements
         WHERE investigation_id = $1
         ORDER BY channel`,
        [psiId],
      );
      const channels = channelResult.rows.map((row) => row.channel as string);
      const channel = requestedChannel?.trim() ?? channels[0] ?? null;

      if (channel === null) {
        return { channels, channel, measurements: [] };
      }

      const measurementResult = await client.query(
        `SELECT observed_at, relative_seconds, value, unit
         FROM telemetry_measurements
         WHERE investigation_id = $1 AND channel = $2
         ORDER BY observed_at DESC
         LIMIT $3`,
        [psiId, channel, limit],
      );

      return {
        channels,
        channel,
        measurements: measurementResult.rows.reverse(),
      };
    });

    return Response.json({
      investigationId: psiId,
      ...result,
      limit,
    });
  } catch (error) {
    return databaseErrorResponse(
      `GET /api/investigations/${psiId}/timeseries`,
      error,
    );
  }
}
