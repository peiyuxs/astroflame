import assert from "node:assert/strict";
import test from "node:test";

import { predictBassFsr } from "./bass-model.ts";

const typicalInputs = {
  thicknessCm: 0.3,
  oxygenInitialPct: 20.8,
  airflowCmS: 10,
};

test("predicts BASS FSR with the supplied oxygen and airflow equations", () => {
  assert.ok(
    Math.abs(predictBassFsr(typicalInputs, "oxygen") - 0.0039060007113740514) <
      1e-12,
  );
  assert.ok(
    Math.abs(predictBassFsr(typicalInputs, "airflow") - 0.003887543456231848) <
      1e-12,
  );
});

test("accepts observed-range boundaries and rejects out-of-range inputs", () => {
  assert.ok(
    predictBassFsr(
      { thicknessCm: 0.1, oxygenInitialPct: 17.9, airflowCmS: 2 },
      "oxygen",
    ) > 0,
  );
  assert.throws(
    () => predictBassFsr({ ...typicalInputs, thicknessCm: 0.09 }, "oxygen"),
    RangeError,
  );
  assert.throws(
    () => predictBassFsr({ ...typicalInputs, oxygenInitialPct: 22.3 }, "oxygen"),
    RangeError,
  );
});
