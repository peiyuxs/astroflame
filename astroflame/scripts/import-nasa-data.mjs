import "dotenv/config";
import { Client } from "pg";
import { parse } from "csv-parse/sync";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://psi.nasa.gov/geode-py/ws";
const NASA_ROOT = "https://psi.nasa.gov";
const BATCH_SIZE = 500;
const DATASETS = [
  {
    psiId: "PSI-26",
    title: "Burning and Suppression of Solids (BASS)",
    kind: "bass",
    fileName: "PSI-26_Experimental table_BASS.csv",
    maxBytes: 100_000,
  },
  {
    psiId: "PSI-100",
    title: "Spacecraft Fire Safety (SAFFIRE-III)",
    kind: "telemetry",
    fileName: "PSI-100_Raw Data_Saffire_Data_Table2017.161.00.42.03-EU.csv",
    maxBytes: 10_000_000,
  },
];

const commonHeaders = {
  Accept: "application/json, text/plain, */*",
  Origin: NASA_ROOT,
  "User-Agent": "Mozilla/5.0 (compatible; astroflame-psi-import/1.0)",
};

function studyPageUrl(psiId) {
  return `${NASA_ROOT}/physci/repo/data/investigations/${psiId}`;
}

async function fetchJson(url, psiId) {
  const response = await fetch(url, {
    headers: {
      ...commonHeaders,
      Referer: studyPageUrl(psiId),
    },
  });
  if (!response.ok) {
    throw new Error(`NASA returned HTTP ${response.status} for ${psiId}.`);
  }

  const result = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`NASA returned an unexpected response for ${psiId}.`);
  }
  return result;
}

function flattenFiles(nodes) {
  const files = [];
  for (const node of nodes) {
    if (!node || node.visible === false) continue;
    if (node.directory === false) {
      files.push(node);
    } else if (Array.isArray(node.files)) {
      files.push(...flattenFiles(node.files));
    }
  }
  return files;
}

async function fetchDataset(dataset) {
  const study = await fetchJson(
    `${API_ROOT}/repo/investigations/${dataset.psiId}`,
    dataset.psiId,
  );
  if (!Number.isInteger(study.version)) {
    throw new Error(`NASA did not provide a valid study version for ${dataset.psiId}.`);
  }

  const listingResponse = await fetch(`${API_ROOT}/files/v2`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      Referer: studyPageUrl(dataset.psiId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      folder: `${dataset.psiId}/`,
      fileType: "study",
      studyId: dataset.psiId,
      version: study.version,
      obfuscationcode: "",
    }),
  });
  if (!listingResponse.ok) {
    throw new Error(
      `NASA returned HTTP ${listingResponse.status} for the ${dataset.psiId} file listing.`,
    );
  }

  const listing = await listingResponse.json();
  if (!Array.isArray(listing.files)) {
    throw new Error(`NASA did not provide a file list for ${dataset.psiId}.`);
  }

  const matches = flattenFiles(listing.files).filter(
    (file) =>
      typeof file.key === "string" &&
      file.key.endsWith(dataset.fileName) &&
      !file.restricted &&
      !file.restrictedAccess,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one public file named ${dataset.fileName} for ${dataset.psiId}; found ${matches.length}.`,
    );
  }

  const file = matches[0];
  if (
    typeof file.id !== "string" ||
    !Number.isInteger(file.version) ||
    !Number.isSafeInteger(file.bytes_size) ||
    file.bytes_size < 0 ||
    file.bytes_size > dataset.maxBytes
  ) {
    throw new Error(
      `The NASA file metadata for ${file.key} is invalid or exceeds the safe import limit.`,
    );
  }

  const query = new URLSearchParams({
    file: file.id,
    version: String(file.version),
    studyVersion: String(study.version),
    redirect: "false",
  });
  const downloadUrlResponse = await fetch(
    `${API_ROOT}/studies/${dataset.psiId}/download?${query}`,
    {
      headers: {
        ...commonHeaders,
        Referer: studyPageUrl(dataset.psiId),
      },
    },
  );
  if (!downloadUrlResponse.ok) {
    throw new Error(
      `NASA returned HTTP ${downloadUrlResponse.status} while preparing ${file.key}.`,
    );
  }

  const downloadUrl = (await downloadUrlResponse.text()).trim();
  if (new URL(downloadUrl).protocol !== "https:") {
    throw new Error(`NASA returned a non-HTTPS URL for ${file.key}.`);
  }

  const dataResponse = await fetch(downloadUrl);
  if (!dataResponse.ok) {
    throw new Error(
      `NASA returned HTTP ${dataResponse.status} while downloading ${file.key}.`,
    );
  }

  const bytes = new Uint8Array(await dataResponse.arrayBuffer());
  if (bytes.byteLength !== file.bytes_size) {
    throw new Error(
      `Downloaded ${bytes.byteLength} bytes for ${file.key}, but NASA listed ${file.bytes_size}.`,
    );
  }

  const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  if (rows.length === 0) {
    throw new Error(`NASA's CSV file ${file.key} contains no data rows.`);
  }

  return {
    studyVersion: study.version,
    file,
    rows,
    sourceUrl: studyPageUrl(dataset.psiId),
  };
}

function parseOptionalNumber(value, column, rowNumber) {
  if (value === undefined || value === null || value === "") return null;
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid number in ${column}, source row ${rowNumber}.`);
  }
  return parsedValue;
}

function parseBassDate(value, rowNumber) {
  const match = /^(\d{1,2})\/(\d{1,2})\/['`]?(\d{2}|\d{4})$/.exec(value ?? "");
  if (!match) {
    throw new Error(`Invalid BASS date in source row ${rowNumber}.`);
  }

  const [, monthText, dayText, yearText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const parsedYear = Number(yearText);
  const year = yearText.length === 2 ? 2000 + parsedYear : parsedYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid BASS calendar date in source row ${rowNumber}.`);
  }
  return date.toISOString().slice(0, 10);
}

export function mapBassRow(row, rowNumber) {
  return {
    sourceRowNumber: rowNumber,
    experimentDate: parseBassDate(row.Date, rowNumber),
    gmt: row.GMT || null,
    asRunTestNumber: row["As Run Test #"] || null,
    testNumber: row["Test #"] || null,
    sampleNumber: row["Sample #"] || null,
    fuelSampleMaterial: row["Fuel Sample Material"] || null,
    rawRow: row,
  };
}

export function mapTelemetryRow(row, rowNumber) {
  const cygnusTimestampMs = parseOptionalNumber(
    row.CygnusTimestamp,
    "CygnusTimestamp",
    rowNumber,
  );
  if (
    cygnusTimestampMs === null ||
    !Number.isSafeInteger(cygnusTimestampMs) ||
    cygnusTimestampMs <= 0
  ) {
    return {
      measurements: [],
      rejection: {
        sourceRowNumber: rowNumber,
        reason: "CygnusTimestamp is not a valid positive epoch-milliseconds timestamp.",
        rawRow: row,
      },
    };
  }

  const observedAt = new Date(cygnusTimestampMs);
  if (Number.isNaN(observedAt.getTime())) {
    return {
      measurements: [],
      rejection: {
        sourceRowNumber: rowNumber,
        reason: "CygnusTimestamp is outside the supported date range.",
        rawRow: row,
      },
    };
  }

  const relativeSeconds = parseOptionalNumber(
    row.RelativeSeconds,
    "RelativeSeconds",
    rowNumber,
  );
  const measurements = [];
  for (const [channel, rawValue] of Object.entries(row)) {
    if (
      channel === "CygnusTimestamp" ||
      channel === "RelativeSeconds" ||
      channel === "SaffireTimestamp" ||
      rawValue === ""
    ) {
      continue;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid value in ${channel}, source row ${rowNumber}.`);
    }
    measurements.push({
      observedAt: observedAt.toISOString(),
      sourceRowNumber: rowNumber,
      channel,
      value,
      relativeSeconds,
      cygnusTimestampMs,
      saffireTimestamp: row.SaffireTimestamp || null,
    });
  }

  return { measurements, rejection: null };
}

async function upsertInvestigation(client, dataset) {
  await client.query(
    `INSERT INTO investigations (psi_id, title, source_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (psi_id) DO UPDATE
     SET title = EXCLUDED.title,
         source_url = EXCLUDED.source_url,
         updated_at = now()`,
    [dataset.psiId, dataset.title, studyPageUrl(dataset.psiId)],
  );
}

async function upsertSourceFile(client, dataset, downloaded) {
  const result = await client.query(
    `INSERT INTO source_files (
       investigation_id, nasa_path, file_name, byte_size,
       nasa_file_version, nasa_study_version, source_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (investigation_id, nasa_path) DO UPDATE
     SET file_name = EXCLUDED.file_name,
         byte_size = EXCLUDED.byte_size,
         nasa_file_version = EXCLUDED.nasa_file_version,
         nasa_study_version = EXCLUDED.nasa_study_version,
         source_url = EXCLUDED.source_url
     RETURNING id`,
    [
      dataset.psiId,
      downloaded.file.key,
      dataset.fileName,
      downloaded.file.bytes_size,
      downloaded.file.version,
      downloaded.studyVersion,
      downloaded.sourceUrl,
    ],
  );
  return result.rows[0].id;
}

async function insertBassRows(client, sourceFileId, rows) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE).map((row) => ({
      ...row,
      rawRow: JSON.stringify(row.rawRow),
    }));
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const base = rowIndex * 9;
      values.push(
        sourceFileId,
        row.sourceRowNumber,
        row.experimentDate,
        row.gmt,
        row.asRunTestNumber,
        row.testNumber,
        row.sampleNumber,
        row.fuelSampleMaterial,
        row.rawRow,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4},
        $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    });
    await client.query(
      `INSERT INTO bass_experiments (
         source_file_id, source_row_number, experiment_date, gmt,
         as_run_test_number, test_number, sample_number, fuel_sample_material,
         raw_row
       ) VALUES ${placeholders.join(",")}
       ON CONFLICT (source_file_id, source_row_number) DO UPDATE
       SET experiment_date = EXCLUDED.experiment_date,
           gmt = EXCLUDED.gmt,
           as_run_test_number = EXCLUDED.as_run_test_number,
           test_number = EXCLUDED.test_number,
           sample_number = EXCLUDED.sample_number,
           fuel_sample_material = EXCLUDED.fuel_sample_material,
           raw_row = EXCLUDED.raw_row`,
      values,
    );
  }
}

async function insertTelemetryRows(client, investigationId, sourceFileId, rows) {
  let batch = [];
  let inserted = 0;
  let rejected = 0;

  async function flush() {
    if (batch.length === 0) return;
    const values = [];
    const placeholders = batch.map((measurement, rowIndex) => {
      const base = rowIndex * 10;
      values.push(
        measurement.observedAt,
        investigationId,
        sourceFileId,
        measurement.sourceRowNumber,
        measurement.channel,
        measurement.value,
        null,
        measurement.relativeSeconds,
        measurement.cygnusTimestampMs,
        measurement.saffireTimestamp,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4},
        $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8},
        $${base + 9}, $${base + 10})`;
    });
    const result = await client.query(
      `INSERT INTO telemetry_measurements (
         observed_at, investigation_id, source_file_id, source_row_number,
         channel, value, unit, relative_seconds, cygnus_timestamp_ms,
         saffire_timestamp
       ) VALUES ${placeholders.join(",")}
       ON CONFLICT DO NOTHING`,
      values,
    );
    inserted += result.rowCount ?? 0;
    batch = [];
  }

  for (let index = 0; index < rows.length; index++) {
    const mapped = mapTelemetryRow(rows[index], index + 1);
    if (mapped.rejection) {
      await client.query(
        `INSERT INTO telemetry_import_rejections (
           source_file_id, source_row_number, reason, raw_row
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_file_id, source_row_number) DO UPDATE
         SET reason = EXCLUDED.reason, raw_row = EXCLUDED.raw_row,
             recorded_at = now()`,
        [
          sourceFileId,
          mapped.rejection.sourceRowNumber,
          mapped.rejection.reason,
          JSON.stringify(mapped.rejection.rawRow),
        ],
      );
      rejected++;
      continue;
    }

    batch.push(...mapped.measurements);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  return { inserted, rejected };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = process.env.TIGER_DATABASE_URL?.trim();
  if (!dryRun && !connectionString) {
    throw new Error(
      "Set TIGER_DATABASE_URL in astroflame/.env before importing data.",
    );
  }

  const client = dryRun
    ? null
    : new Client({ connectionString, connectionTimeoutMillis: 10_000 });

  if (client) await client.connect();
  try {
    for (const dataset of DATASETS) {
      console.log(`Downloading the selected public NASA CSV for ${dataset.psiId}...`);
      const downloaded = await fetchDataset(dataset);
      if (dataset.kind === "bass") {
        const mappedRows = downloaded.rows.map((row, index) =>
          mapBassRow(row, index + 1),
        );
        if (client) {
          await client.query("BEGIN");
          try {
            await upsertInvestigation(client, dataset);
            const sourceFileId = await upsertSourceFile(client, dataset, downloaded);
            await insertBassRows(client, sourceFileId, mappedRows);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        }
        console.log(`${dataset.psiId}: ${mappedRows.length} valid BASS experiment rows.`);
        continue;
      }

      let measurementCount = 0;
      let rejectedCount = 0;
      for (let index = 0; index < downloaded.rows.length; index++) {
        const mapped = mapTelemetryRow(downloaded.rows[index], index + 1);
        measurementCount += mapped.measurements.length;
        if (mapped.rejection) rejectedCount++;
      }

      if (client) {
        await client.query("BEGIN");
        try {
          await upsertInvestigation(client, dataset);
          const sourceFileId = await upsertSourceFile(client, dataset, downloaded);
          const result = await insertTelemetryRows(
            client,
            dataset.psiId,
            sourceFileId,
            downloaded.rows,
          );
          await client.query("COMMIT");
          console.log(
            `${dataset.psiId}: imported ${result.inserted} measurements; quarantined ${result.rejected} invalid source rows.`,
          );
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      } else {
        console.log(
          `${dataset.psiId}: ${downloaded.rows.length} CSV rows; ${measurementCount} numeric channel values; ${rejectedCount} rows will be quarantined because their timestamp is invalid.`,
        );
      }
    }
    console.log(dryRun ? "NASA data preview finished." : "NASA PSI CSV import finished. Re-running is safe.");
  } finally {
    if (client) await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
