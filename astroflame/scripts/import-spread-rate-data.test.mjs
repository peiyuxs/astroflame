import assert from "node:assert/strict";
import test from "node:test";

import { loadSpreadRateRows } from "./import-spread-rate-data.mjs";

test("loads the curated BASS and SAFFIRE-V comparison observations", async () => {
  const rows = await loadSpreadRateRows();
  const bassRows = rows.filter((row) => row.projectRegime === "BASS");
  const saffireRows = rows.filter((row) => row.projectRegime === "SAFFIRE-V");

  assert.equal(bassRows.length, 39);
  assert.equal(new Set(bassRows.map((row) => row.experimentId)).size, 18);
  assert.equal(saffireRows.length, 18);
  assert.ok(
    bassRows.every(
      (row) =>
        row.airflowCmS !== null &&
        row.thicknessCm !== null &&
        row.oxygenInitialPct !== null,
    ),
  );
  assert.ok(
    saffireRows.every(
      (row) =>
        row.sourceDataset === "SAFFIRE-V" &&
        row.ribWidthCm !== null &&
        row.airflowCmS !== null,
    ),
  );
});
