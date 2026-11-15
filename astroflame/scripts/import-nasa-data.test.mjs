import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBassRow,
  mapTelemetryRow,
} from "./import-nasa-data.mjs";

test("maps BASS test identifiers as text and preserves the source row", () => {
  const source = {
    Date: "6/29/'12",
    GMT: "12:30",
    "As Run Test #": "12-R",
    "Test #": "12-R2",
    "Sample #": "A1",
    "Fuel Sample Material": "cotton",
  };

  const mapped = mapBassRow(source, 1);
  assert.equal(mapped.experimentDate, "2012-06-29");
  assert.equal(mapped.testNumber, "12-R2");
  assert.deepEqual(mapped.rawRow, source);
});

test("quarantines telemetry with an invalid timestamp", () => {
  const source = { CygnusTimestamp: "-1", ChannelA: "2.5" };
  const mapped = mapTelemetryRow(source, 8);
  assert.deepEqual(mapped.measurements, []);
  assert.equal(mapped.rejection.sourceRowNumber, 8);
  assert.deepEqual(mapped.rejection.rawRow, source);
});

test("maps numeric telemetry channels at the NASA epoch timestamp", () => {
  const mapped = mapTelemetryRow(
    {
      CygnusTimestamp: "1496757600000",
      RelativeSeconds: "1.25",
      SaffireTimestamp: "2017-06-06 14:00:00",
      ChannelA: "-2.5",
    },
    3,
  );

  assert.equal(mapped.rejection, null);
  assert.equal(mapped.measurements.length, 1);
  assert.equal(mapped.measurements[0].channel, "ChannelA");
  assert.equal(mapped.measurements[0].value, -2.5);
  assert.equal(mapped.measurements[0].relativeSeconds, 1.25);
  assert.equal(mapped.measurements[0].sourceRowNumber, 3);
});
