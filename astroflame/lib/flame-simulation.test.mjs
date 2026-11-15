import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSimulation,
  directionalSpreadVelocity,
  estimateOpposedFsrCmS,
  getDirectionalRates,
  getScenarioGeometry,
  getSaffireRibWidthRange,
  GRID_COLUMNS,
  startSimulation,
} from "./flame-simulation.ts";

const bassSettings = {
  scenario: "bass",
  oxygenPct: 20.8,
  airflowCmS: 10,
  thicknessCm: 0.3,
  ribWidthCm: 0.5,
  concurrentMultiplier: 2.1,
};

test("BASS simulation uses bounded opposed-flow rates and the reported specimen scale", () => {
  const rate = estimateOpposedFsrCmS(bassSettings);
  assert.ok(rate > 0);
  assert.deepEqual(getScenarioGeometry(bassSettings), {
    lengthCm: 10,
    widthCm: 2.2,
    thicknessCm: 0.3,
    widthOptionsCm: [1.2, 2.2],
    gridRows: 22,
  });
  assert.equal(10 / GRID_COLUMNS, 2.2 / getScenarioGeometry(bassSettings).gridRows);
  assert.throws(
    () => estimateOpposedFsrCmS({ ...bassSettings, oxygenPct: 22.3 }),
    RangeError,
  );
  assert.throws(
    () => estimateOpposedFsrCmS({ ...bassSettings, thicknessCm: 0.7 }),
    RangeError,
  );
});

test("directional interpolation matches opposed, lateral, and concurrent endpoints", () => {
  const opposed = 0.01;
  assert.equal(directionalSpreadVelocity(opposed, 0, 2.1), opposed);
  assert.equal(directionalSpreadVelocity(opposed, 90, 2.1), opposed * 0.85);
  assert.equal(directionalSpreadVelocity(opposed, 180, 2.1), opposed * 2.1);
  assert.equal(directionalSpreadVelocity(-0.1, 0, 2.1), 0);
  assert.deepEqual(getDirectionalRates(opposed, 2.1), {
    opposedCmS: 0.01,
    lateralCmS: 0.0085,
    concurrentCmS: 0.021,
  });
});

test("SAFFIRE-5 uses airflow-specific rib observations and bounded interpolation", () => {
  const saffire = {
    ...bassSettings,
    scenario: "saffire-5",
    oxygenPct: 26.9,
    airflowCmS: 20,
    thicknessCm: 1,
    ribWidthCm: 0.3,
  };
  assert.equal(estimateOpposedFsrCmS(saffire), 0.036);
  assert.equal(
    estimateOpposedFsrCmS({ ...saffire, airflowCmS: 5, ribWidthCm: 0.4 }),
    0.009,
  );
  assert.ok(
    Math.abs(
      estimateOpposedFsrCmS({ ...saffire, airflowCmS: 5, ribWidthCm: 0.7 }) -
        0.00675,
    ) < 1e-12,
  );
  assert.deepEqual(getSaffireRibWidthRange(5), {
    min: 0.2,
    max: 1,
    step: 0.1,
  });
  assert.throws(
    () => estimateOpposedFsrCmS({ ...saffire, airflowCmS: 10 }),
    RangeError,
  );
  assert.throws(
    () =>
      estimateOpposedFsrCmS({
        ...saffire,
        airflowCmS: 5,
        ribWidthCm: 0.1,
      }),
    RangeError,
  );
  assert.deepEqual(
    {
      length: getScenarioGeometry(saffire).lengthCm,
      width: getScenarioGeometry(saffire).widthCm,
      gridRows: getScenarioGeometry(saffire).gridRows,
    },
    { length: 40, width: 20, gridRows: 50 },
  );
  assert.equal(40 / GRID_COLUMNS, 20 / getScenarioGeometry(saffire).gridRows);
});

test("simulation records area growth and finishes only after reaching the specimen boundary", () => {
  let simulation = startSimulation(bassSettings);
  assert.equal(simulation.status, "running");
  assert.equal(simulation.cells.length, GRID_COLUMNS * 22);

  for (let tick = 0; tick < 2000 && simulation.status === "running"; tick += 1) {
    simulation = advanceSimulation(simulation, bassSettings);
  }

  assert.equal(simulation.status, "burned");
  assert.ok(simulation.fullSpreadTimeSeconds > 0);
  assert.equal(simulation.simulatedSeconds, simulation.fullSpreadTimeSeconds);
  assert.equal(simulation.history.at(-1).burnedPct, 100);
  assert.ok(simulation.history.some((point) => point.areaGrowthCm2S > 0));
  assert.ok(simulation.history.length > 2);
});

test("simulation rejects ignition points outside the map", () => {
  assert.throws(
    () => startSimulation(bassSettings, { x: GRID_COLUMNS, y: 0 }),
    RangeError,
  );
});

test("concurrent multiplier is clamped to its supported exploration range", () => {
  assert.throws(
    () =>
      estimateOpposedFsrCmS({
        ...bassSettings,
        concurrentMultiplier: 4.1,
      }),
    RangeError,
  );
});
