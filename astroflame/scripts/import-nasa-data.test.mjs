import assert from "node:assert/strict";
import test from "node:test";

import { mapBassRow } from "./import-nasa-data.mjs";

test("maps BASS test rows while preserving their original values", () => {
  const mapped = mapBassRow(
    {
      Date: "3/30/2012",
      GMT: "90",
      "As Run Test #": "1",
      "Test #": "12-R2",
      "Sample #": "24",
      "Fuel Sample Material": "PMMA sphere 2 cm",
    },
    1,
  );

  assert.equal(mapped.experimentDate, "2012-03-30");
  assert.equal(mapped.gmt, "90");
  assert.equal(mapped.testNumber, "12-R2");
  assert.equal(mapped.fuelSampleMaterial, "PMMA sphere 2 cm");
  assert.equal(mapped.rawRow.Date, "3/30/2012");
});

test("rejects invalid BASS dates instead of silently importing them", () => {
  assert.throws(
    () =>
      mapBassRow(
        {
          Date: "2/30/2012",
          "As Run Test #": "1",
          "Test #": "1",
          "Sample #": "1",
        },
        3,
      ),
    /Invalid BASS calendar date/,
  );
});

test("normalizes the NASA two-digit year format", () => {
  const mapped = mapBassRow(
    {
      Date: "6/29/'12",
      "As Run Test #": "42",
      "Test #": "35",
      "Sample #": "16",
    },
    42,
  );

  assert.equal(mapped.experimentDate, "2012-06-29");
});
test("normalizes the malformed two-digit BASS year", () => {
  const mapped = mapBassRow(
    {
      Date: "6/29/`12",
      "As Run Test #": "42",
      "Test #": "35",
      "Sample #": "16",
    },
    42,
  );

  assert.equal(mapped.experimentDate, "2012-06-29");
});
