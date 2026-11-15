import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSimulation,
  estimateMaterialFsrCmS,
  GRID_COLUMNS,
  GRID_ROWS,
  MATERIAL_PRESETS,
  startSimulation,
} from "./flame-simulation.ts";

const settings = {
  materialId: "pmma",
  oxygenPct: 21,
  airflowCmS: 20,
};

test("simulation starts at the edge and marks nearby cells vulnerable", () => {
  const rate = estimateMaterialFsrCmS(settings);
  let simulation = startSimulation(settings, rate);

  assert.equal(simulation.status, "running");
  assert.equal(
    simulation.cells.filter((cell) => cell.state === "burning").length,
    1,
  );

  simulation = advanceSimulation(simulation, settings, rate);
  assert.ok(simulation.cells.some((cell) => cell.state === "vulnerable"));
  assert.ok(simulation.cells.some((cell) => cell.state === "burning"));
});

test("simulation ignites at the selected map cell", () => {
  const ignitionPoint = { x: 17, y: 4 };
  const rate = estimateMaterialFsrCmS(settings);
  let simulation = startSimulation(settings, rate, ignitionPoint);

  assert.deepEqual(simulation.ignitionPoint, ignitionPoint);
  assert.equal(
    simulation.cells.find(
      (cell) => cell.x === ignitionPoint.x && cell.y === ignitionPoint.y,
    ).state,
    "burning",
  );

  simulation = advanceSimulation(simulation, settings, rate);
  assert.ok(simulation.history.at(-1).distanceCm > 0);
});

test("simulation finishes with the full map burned and an increasing timeline", () => {
  const rate = estimateMaterialFsrCmS(settings);
  let simulation = startSimulation(settings, rate);

  for (let tick = 0; tick < GRID_COLUMNS + GRID_ROWS + 10; tick += 1) {
    if (simulation.status !== "running") break;
    simulation = advanceSimulation(simulation, settings, rate);
  }

  assert.equal(simulation.status, "burned");
  assert.ok(simulation.cells.every((cell) => cell.state === "burned"));
  assert.ok(simulation.history.at(-1).timeSeconds > 0);
  assert.ok(
    simulation.history.at(-1).distanceCm >
      simulation.history[0].distanceCm,
  );
});

test("rejects ignition points outside the map", () => {
  assert.throws(
    () => startSimulation(settings, 0.01, { x: GRID_COLUMNS, y: 0 }),
    RangeError,
  );
});

test("zero oxygen self-extinguishes without spreading", () => {
  const zeroOxygenSettings = { ...settings, oxygenPct: 0 };
  const simulation = startSimulation(zeroOxygenSettings, 0);

  assert.equal(simulation.status, "extinguished");
  assert.equal(simulation.endReason, "No positive flame-spread rate at these settings.");
  assert.ok(simulation.cells.every((cell) => cell.state === "unburned"));
});

test("each material preset produces a defined, distinct exploratory rate", () => {
  const rates = MATERIAL_PRESETS.map((material) =>
    estimateMaterialFsrCmS({ ...settings, materialId: material.id }),
  );

  assert.ok(rates.every((rate) => Number.isFinite(rate) && rate > 0));
  assert.equal(new Set(rates).size, MATERIAL_PRESETS.length);
});
