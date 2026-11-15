import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "pg";
import { parse } from "csv-parse/sync";

import { calculateGroupedBassPredictions } from "../lib/bass-validation.ts";

const sourceFileName = "astroflame_formatted_cgs.csv";
const sourcePath = fileURLToPath(
  new URL("../../elig-data/astroflame_formatted_cgs.csv", import.meta.url),
);
const insertColumns = [
  "source_file_name",
  "source_row_number",
  "project_regime",
  "source_dataset",
  "experiment_id",
  "observation_id",
  "airflow_cm_s",
  "thickness_cm",
  "sample_width_cm",
  "rib_width_cm",
  "oxygen_percent",
  "oxygen_initial_pct",
  "oxygen_final_pct",
  "fsr_cm_s",
  "sample_length_cm",
  "pressure_kpa",
  "rib_height_mm",
  "base_thickness_mm",
  "material",
  "geometry",
  "flow_direction",
  "measurement_method",
  "data_quality",
  "source_location",
  "notes",
];

export function mapSpreadRateRow(row, rowNumber) {
  const projectRegime =
    row.dataset === "BASS-II PSI-25"
      ? "BASS"
      : row.dataset === "SAFFIRE-V"
        ? "SAFFIRE-V"
        : null;
  if (projectRegime === null) return null;

  const mapped = {
    sourceFileName,
    sourceRowNumber: rowNumber,
    projectRegime,
    sourceDataset: row.dataset,
    experimentId: requiredText(row.experiment_id, "experiment_id", rowNumber),
    observationId: requiredText(row.observation_id, "observation_id", rowNumber),
    airflowCmS: optionalNumber(row.airflow_cm_s, "airflow_cm_s", rowNumber),
    thicknessCm: optionalNumber(row.thickness_cm, "thickness_cm", rowNumber),
    sampleWidthCm: optionalNumber(row.sample_width_cm, "sample_width_cm", rowNumber),
    ribWidthCm: optionalNumber(row.rib_width_cm, "rib_width_cm", rowNumber),
    oxygenPercent: optionalNumber(row.oxygen_percent, "oxygen_percent", rowNumber),
    oxygenInitialPct: optionalNumber(
      row.oxygen_initial_pct,
      "oxygen_initial_pct",
      rowNumber,
    ),
    oxygenFinalPct: optionalNumber(
      row.oxygen_final_pct,
      "oxygen_final_pct",
      rowNumber,
    ),
    fsrCmS: requiredPositiveNumber(row.fsr_cm_s, "fsr_cm_s", rowNumber),
    sampleLengthCm: optionalNumber(
      row.sample_length_cm,
      "sample_length_cm",
      rowNumber,
    ),
    pressureKpa: optionalNumber(row.pressure_kpa, "pressure_kpa", rowNumber),
    ribHeightMm: optionalNumber(row.rib_height_mm, "rib_height_mm", rowNumber),
    baseThicknessMm: optionalNumber(
      row.base_thickness_mm,
      "base_thickness_mm",
      rowNumber,
    ),
    material: optionalText(row.material),
    geometry: optionalText(row.geometry),
    flowDirection: optionalText(row.flow_direction),
    measurementMethod: optionalText(row.measurement_method),
    dataQuality: optionalText(row.data_quality),
    sourceLocation: requiredText(row.source_location, "source_location", rowNumber),
    notes: optionalText(row.notes),
  };

  if (projectRegime === "BASS") {
    if (
      mapped.airflowCmS === null ||
      mapped.thicknessCm === null ||
      mapped.oxygenInitialPct === null
    ) {
      throw new Error(
        `BASS source row ${rowNumber} is missing a predictor condition.`,
      );
    }
  }
  return mapped;
}

export async function loadSpreadRateRows() {
  const csv = await readFile(sourcePath, "utf8");
  const sourceRows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const selectedRows = sourceRows
    .map((row, index) => mapSpreadRateRow(row, index + 2))
    .filter((row) => row !== null);
  if (selectedRows.length === 0) {
    throw new Error(`No BASS or SAFFIRE-V observations found in ${sourceFileName}.`);
  }

  const uniqueIds = new Set(
    selectedRows.map((row) => `${row.projectRegime}:${row.observationId}`),
  );
  if (uniqueIds.size !== selectedRows.length) {
    throw new Error("The curated spread-rate file contains duplicate observation IDs.");
  }
  return selectedRows;
}

export async function importSpreadRateRows(client, rows) {
  const bassRows = rows.filter((row) => row.projectRegime === "BASS");
  const bassValidation = calculateGroupedBassPredictions(
    bassRows.map((row) => ({
      experimentId: row.experimentId,
      observationId: row.observationId,
      airflowCmS: row.airflowCmS,
      thicknessCm: row.thicknessCm,
      oxygenInitialPct: row.oxygenInitialPct,
      measuredFsrCmS: row.fsrCmS,
    })),
  );

  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM spread_rate_observations WHERE source_file_name = $1",
      [sourceFileName],
    );
    for (const row of rows) {
      const values = [
        row.sourceFileName,
        row.sourceRowNumber,
        row.projectRegime,
        row.sourceDataset,
        row.experimentId,
        row.observationId,
        row.airflowCmS,
        row.thicknessCm,
        row.sampleWidthCm,
        row.ribWidthCm,
        row.oxygenPercent,
        row.oxygenInitialPct,
        row.oxygenFinalPct,
        row.fsrCmS,
        row.sampleLengthCm,
        row.pressureKpa,
        row.ribHeightMm,
        row.baseThicknessMm,
        row.material,
        row.geometry,
        row.flowDirection,
        row.measurementMethod,
        row.dataQuality,
        row.sourceLocation,
        row.notes,
      ];
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      await client.query(
        `INSERT INTO spread_rate_observations (${insertColumns.join(", ")})
         VALUES (${placeholders})`,
        values,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { bassCount: bassRows.length, bassValidation };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await loadSpreadRateRows();
  const bassRows = rows.filter((row) => row.projectRegime === "BASS");
  const saffireRows = rows.filter((row) => row.projectRegime === "SAFFIRE-V");
  const bassValidation = calculateGroupedBassPredictions(
    bassRows.map((row) => ({
      experimentId: row.experimentId,
      observationId: row.observationId,
      airflowCmS: row.airflowCmS,
      thicknessCm: row.thicknessCm,
      oxygenInitialPct: row.oxygenInitialPct,
      measuredFsrCmS: row.fsrCmS,
    })),
  );

  console.log(
    `${basename(sourcePath)}: ${bassRows.length} BASS and ${saffireRows.length} SAFFIRE-V rows validated.`,
  );
  console.log(
    `Grouped leave-one-experiment-out BASS RMSE: ${bassValidation.metrics.equalExperimentRmseCmS.toFixed(7)} cm/s (equal experiment); ${bassValidation.metrics.rowWeightedRmseCmS.toFixed(7)} cm/s (per observation).`,
  );
  if (dryRun) {
    console.log("Preview only; TigerData was not changed.");
    return;
  }

  const connectionString = process.env.TIGER_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "Set TIGER_DATABASE_URL in astroflame/.env before importing spread-rate data.",
    );
  }
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const result = await importSpreadRateRows(client, rows);
    console.log(
      `Imported ${rows.length} spread-rate observations (${result.bassCount} BASS).`,
    );
  } finally {
    await client.end();
  }
}

function requiredText(value, column, rowNumber) {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`Missing ${column} in source row ${rowNumber}.`);
  }
  return text;
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value, column, rowNumber) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${column} in source row ${rowNumber}.`);
  }
  return number;
}

function requiredPositiveNumber(value, column, rowNumber) {
  const number = optionalNumber(value, column, rowNumber);
  if (number === null || number <= 0) {
    throw new Error(`Invalid positive ${column} in source row ${rowNumber}.`);
  }
  return number;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("Spread-rate data import failed:", error);
    process.exitCode = 1;
  });
}
