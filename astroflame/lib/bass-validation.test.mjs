import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

import {
  calculateGroupedBassPredictions,
  groupBassResiduals,
} from "./bass-validation.ts";

const sourcePath = fileURLToPath(
  new URL("../../elig-data/astroflame_formatted_cgs.csv", import.meta.url),
);
const sourceRows = parse(readFileSync(sourcePath, "utf8"), {
  bom: true,
  columns: true,
  skip_empty_lines: true,
  trim: true,
});
const bassObservations = sourceRows
  .filter((row) => row.dataset === "BASS-II PSI-25")
  .map((row) => ({
    experimentId: row.experiment_id,
    observationId: row.observation_id,
    airflowCmS: Number(row.airflow_cm_s),
    thicknessCm: Number(row.thickness_cm),
    oxygenInitialPct: Number(row.oxygen_initial_pct),
    measuredFsrCmS: Number(row.fsr_cm_s),
  }));

test("reproduces grouped leave-one-experiment-out BASS validation", () => {
  const result = calculateGroupedBassPredictions(bassObservations);

  assert.equal(result.metrics.observationCount, 39);
  assert.equal(result.metrics.experimentCount, 18);
  assert.ok(
    Math.abs(result.metrics.equalExperimentRmseCmS - 0.0021106) < 0.0000001,
  );
  assert.ok(
    Math.abs(result.metrics.rowWeightedRmseCmS - 0.0020374) < 0.0000001,
  );
  assert.ok(
    result.records.every(
      (record) =>
        record.residualCmS ===
        record.measuredFsrCmS - record.predictedFsrCmS,
    ),
  );
});

test("groups residuals by exact measured condition values", () => {
  const { records } = calculateGroupedBassPredictions(bassObservations);
  const groups = groupBassResiduals(records, "thicknessCm");

  assert.deepEqual(
    groups.map((group) => group.value),
    [0.1, 0.2, 0.3, 0.4, 0.5],
  );
  assert.equal(
    groups.reduce((count, group) => count + group.observationCount, 0),
    39,
  );
  assert.ok(groups.every((group) => Number.isFinite(group.meanResidualCmS)));
});

test("rejects BASS rows outside the validated input bounds", () => {
  assert.throws(
    () =>
      calculateGroupedBassPredictions([
        ...bassObservations.slice(1),
        { ...bassObservations[0], airflowCmS: 22 },
      ]),
    /measured model ranges/,
  );
});
