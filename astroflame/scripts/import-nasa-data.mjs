import "dotenv/config";
import { Client } from "pg";
import { parse } from "csv-parse/sync";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://psi.nasa.gov/geode-py/ws";
const NASA_ROOT = "https://psi.nasa.gov";
const USER_AGENT = "Mozilla/5.0 (compatible; astroflame-psi-import/1.0)";
const DATASET = {
  psiId: "PSI-26",
  fileName: "PSI-26_Experimental table_BASS.csv",
  maxBytes: 100_000,
};

const commonHeaders = {
  Accept: "application/json, text/plain, */*",
  Origin: NASA_ROOT,
  "User-Agent": USER_AGENT,
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
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
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
      `The NASA file metadata for ${file.key} is invalid or larger than the safe import limit.`,
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
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`NASA's CSV file ${file.key} contains no data rows.`);
  }

  return {
    study,
    studyVersion: study.version,
    file,
    rows,
    sourceUrl: studyPageUrl(dataset.psiId),
  };
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

async function upsertInvestigation(client, dataset, imported) {
  const title =
    typeof imported.study.title === "string"
      ? imported.study.title
      : dataset.psiId;
  const description =
    typeof imported.study.description === "string"
      ? imported.study.description
      : null;

  await client.query(
    `INSERT INTO investigations (psi_id, title, description, source_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (psi_id) DO UPDATE
     SET title = EXCLUDED.title,
         description = EXCLUDED.description,
         source_url = EXCLUDED.source_url,
         updated_at = now()`,
    [dataset.psiId, title, description, imported.sourceUrl],
  );
}

async function upsertSourceFile(client, dataset, imported) {
  const fileName = imported.file.key.split("/").at(-1);
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
      imported.file.key,
      fileName,
      imported.file.bytes_size,
      imported.file.version,
      imported.studyVersion,
      imported.sourceUrl,
    ],
  );
  return result.rows[0].id;
}

async function importBassRows(client, rows, sourceFileId) {
  let inserted = 0;
  for (const [index, row] of rows.entries()) {
    const mapped = mapBassRow(row, index + 1);
    const result = await client.query(
      `INSERT INTO bass_experiments (
         source_file_id, source_row_number, experiment_date, gmt,
         as_run_test_number, test_number, sample_number,
         fuel_sample_material, raw_row
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (source_file_id, source_row_number) DO UPDATE
       SET experiment_date = EXCLUDED.experiment_date,
           gmt = EXCLUDED.gmt,
           as_run_test_number = EXCLUDED.as_run_test_number,
           test_number = EXCLUDED.test_number,
           sample_number = EXCLUDED.sample_number,
           fuel_sample_material = EXCLUDED.fuel_sample_material,
           raw_row = EXCLUDED.raw_row`,
      [
        sourceFileId,
        mapped.sourceRowNumber,
        mapped.experimentDate,
        mapped.gmt,
        mapped.asRunTestNumber,
        mapped.testNumber,
        mapped.sampleNumber,
        mapped.fuelSampleMaterial,
        JSON.stringify(mapped.rawRow),
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function importDataset(client, dataset, imported) {
  await client.query("BEGIN");
  try {
    await upsertInvestigation(client, dataset, imported);
    const sourceFileId = await upsertSourceFile(client, dataset, imported);
    const inserted = await importBassRows(client, imported.rows, sourceFileId);
    await client.query("COMMIT");
    console.log(
      `${dataset.psiId}: processed ${imported.rows.length} CSV rows; ${inserted} database rows affected.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = process.env.TIGER_DATABASE_URL?.trim();
  if (!dryRun && !connectionString) {
    throw new Error(
      "Set TIGER_DATABASE_URL in astroflame/.env before importing NASA data.",
    );
  }

  console.log(`Downloading the selected public NASA CSV for ${DATASET.psiId}...`);
  const imported = await fetchDataset(DATASET);
  if (dryRun) {
    for (const [index, row] of imported.rows.entries()) {
      mapBassRow(row, index + 1);
    }
    console.log(
      `${DATASET.psiId}: ${imported.rows.length} valid BASS experiment rows.`,
    );
  } else {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 10_000,
    });
    try {
      await client.connect();
      await importDataset(client, DATASET, imported);
    } finally {
      await client.end();
    }
  }
  console.log("NASA PSI CSV import finished. Re-running is safe.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("NASA data import failed:", error);
    process.exitCode = 1;
  });
}
