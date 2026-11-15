import assert from "node:assert/strict";
import test from "node:test";

import { mapBassRow, mapTelemetryRow } from "./import-nasa-data.mjs";

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

test("converts telemetry channels to timestamped measurement rows", () => {
  const mapped = mapTelemetryRow(
    {
      RelativeSeconds: "0",
      CygnusTimestamp: "1496691300155",
      SaffireTimestamp: "0",
      "P@sfsHk.Radiometer1value": "-4002.47233224",
      "P@sfsHk.Anemometer1": "",
    },
    1,
  );

  assert.equal(mapped.rejection, null);
  assert.equal(mapped.measurements.length, 1);
  assert.equal(mapped.measurements[0].channel, "P@sfsHk.Radiometer1value");
  assert.equal(mapped.measurements[0].value, -4002.47233224);
  assert.equal(mapped.measurements[0].unit, undefined);
  assert.equal(mapped.measurements[0].relativeSeconds, 0);
  assert.equal(mapped.measurements[0].cygnusTimestampMs, 1496691300155);
  assert.equal(mapped.measurements[0].observedAt, "2017-06-05T19:35:00.155Z");
});

test("quarantines telemetry rows with invalid timestamps instead of inventing a time", () => {
  const row = {
    RelativeSeconds: "-63632288338155",
    CygnusTimestamp: "-62135597038000",
    SaffireTimestamp: "0",
    "P@sfsHk.Radiometer1value": "-4002.47233224",
  };
  const mapped = mapTelemetryRow(row, 11450);

  assert.deepEqual(mapped.measurements, []);
  assert.equal(mapped.rejection.sourceRowNumber, 11450);
  assert.match(mapped.rejection.reason, /valid positive epoch/);
  assert.equal(mapped.rejection.rawRow, row);
});
