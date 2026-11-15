import { databaseErrorResponse, withDatabase } from "@/lib/database";
import {
  calculateGroupedBassPredictions,
  groupBassResiduals,
  type BassGrouping,
  type BassObservation,
} from "@/lib/bass-validation";

type BassDatabaseRow = {
  experiment_id: string;
  observation_id: string;
  airflow_cm_s: number | null;
  thickness_cm: number | null;
  oxygen_initial_pct: number | null;
  fsr_cm_s: number;
  source_location: string;
  measurement_method: string | null;
  data_quality: string | null;
};

const groupings = new Set([
  "airflowCmS",
  "thicknessCm",
  "oxygenInitialPct",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedGrouping = url.searchParams.get("groupBy") ?? "airflowCmS";
  if (!isBassGrouping(requestedGrouping)) {
    return Response.json(
      {
        error:
          "groupBy must be airflowCmS, thicknessCm, or oxygenInitialPct.",
      },
      { status: 400 },
    );
  }
  const groupBy = requestedGrouping;

  let rows: BassDatabaseRow[];
  try {
    const result = await withDatabase((client) =>
      client.query<BassDatabaseRow>(
        `SELECT experiment_id, observation_id, airflow_cm_s,
                thickness_cm, oxygen_initial_pct, fsr_cm_s,
                source_location, measurement_method, data_quality
         FROM spread_rate_observations
         WHERE project_regime = 'BASS'
         ORDER BY experiment_id, source_row_number`,
      ),
    );
    rows = result.rows;
  } catch (error) {
    return databaseErrorResponse("GET /api/analysis/bass", error);
  }

  if (rows.length === 0) {
    return Response.json(
      {
        error: "No BASS comparison data is loaded in TigerData.",
        help: "Run the database migration and the spread-rate data import.",
      },
      { status: 503 },
    );
  }

  try {
    const observations = rows.map((row) => ({
      experimentId: row.experiment_id,
      observationId: row.observation_id,
      airflowCmS: requiredValue(row.airflow_cm_s, "airflow_cm_s"),
      thicknessCm: requiredValue(row.thickness_cm, "thickness_cm"),
      oxygenInitialPct: requiredValue(
        row.oxygen_initial_pct,
        "oxygen_initial_pct",
      ),
      measuredFsrCmS: row.fsr_cm_s,
      sourceLocation: row.source_location,
      measurementMethod: row.measurement_method ?? undefined,
      dataQuality: row.data_quality ?? undefined,
    } satisfies BassObservation));
    const validation = calculateGroupedBassPredictions(observations);
    return Response.json(
      {
        sourceDataset: "BASS-II PSI-25",
        sourceFile: "astroflame_formatted_cgs.csv",
        model: "Thickness power law + airflow + initial oxygen",
        validationMethod: "Leave-one-experiment-ID-out grouped cross-validation",
        residualDefinition: "measured - predicted",
        metrics: validation.metrics,
        groupBy,
        groups: groupBassResiduals(validation.records, groupBy),
        records: validation.records,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/analysis/bass calculation failed", error);
    return Response.json(
      { error: "BASS validation could not be calculated from the stored data." },
      { status: 500 },
    );
  }
}

function isBassGrouping(value: string): value is BassGrouping {
  return groupings.has(value);
}

function requiredValue(value: number | null, column: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Stored BASS row has no valid ${column}.`);
  }
  return value;
}
