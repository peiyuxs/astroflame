import {
  BASS_INPUT_RANGES,
  BASS_REFERENCE_THICKNESS_CM,
  predictBassFsr,
} from "./bass-model.ts";

export type ScenarioId = "bass" | "saffire-v";

export type SimulationSettings = {
  scenario: ScenarioId;
  oxygenPct: number;
  airflowCmS: number;
  thicknessCm: number;
  ribWidthCm: number;
  concurrentMultiplier: number;
};

export type SpecimenGeometry = {
  lengthCm: number;
  widthCm: number;
  thicknessCm: number;
  widthOptionsCm: readonly number[];
  gridRows: number;
};

export const DEFAULT_CONCURRENT_MULTIPLIER = 2.1;
export const CONCURRENT_MULTIPLIER_RANGE = { min: 0.5, max: 4, step: 0.1 } as const;
export const LATERAL_SPREAD_RATIO = 0.85;
export const VISUALIZATION_ACCELERATION = 160;
export const GRID_COLUMNS = 100;
export const GRID_ROWS = 50;

export const SCENARIO_GEOMETRY: Record<ScenarioId, SpecimenGeometry> = {
  bass: {
    lengthCm: 10,
    widthCm: 2.2,
    thicknessCm: BASS_REFERENCE_THICKNESS_CM,
    widthOptionsCm: [1.2, 2.2],
    gridRows: 22,
  },
  "saffire-v": {
    lengthCm: 40,
    widthCm: 20,
    thicknessCm: 1,
    widthOptionsCm: [40],
    gridRows: 50,
  },
};

const SAFFIRE_FSR_DATA: Record<number, readonly (readonly [number, number])[]> = {
  5: [
    [0.2, 0.015],
    [0.3, 0.013],
    [0.4, 0.009],
    [0.5, 0.0095],
    [0.6, 0.0065],
    [0.8, 0.007],
    [0.9, 0.012],
    [1, 0.0078],
  ],
  20: [
    [0.1, 0.088],
    [0.2, 0.047],
    [0.3, 0.036],
    [0.4, 0.03],
    [0.5, 0.026],
    [0.6, 0.023],
    [0.7, 0.019],
    [0.8, 0.022],
    [0.9, 0.021],
    [1, 0.019],
  ],
};

export type CellState = "unburned" | "vulnerable" | "burning" | "burned";

export type FlameCell = {
  x: number;
  y: number;
  state: CellState;
};

export type SpreadPoint = {
  timeSeconds: number;
  distanceCm: number;
  burnedAreaCm2: number;
  areaGrowthCm2S: number;
  burnedPct: number;
};

export type IgnitionPoint = { x: number; y: number };
export type FlameSimulationStatus = "idle" | "running" | "burned" | "extinguished";

export type FlameSimulationState = {
  status: FlameSimulationStatus;
  cells: FlameCell[];
  ignitionPoint: IgnitionPoint | null;
  simulatedSeconds: number;
  fullSpreadTimeSeconds: number | null;
  timeStepSeconds: number;
  history: SpreadPoint[];
  endReason: string | null;
};

export const DEFAULT_IGNITION_POINT: IgnitionPoint = {
  x: 0,
  y: Math.floor(SCENARIO_GEOMETRY.bass.gridRows / 2),
};

export const BASS_AIRFLOW_OPTIONS_CM_S = [2, 21] as const;
export const BASS_THICKNESS_OPTIONS_CM = [0.1, 0.5] as const;
export const BASS_OXYGEN_OPTIONS_PCT = [17.9, 22.2] as const;
export const SAFFIRE_AIRFLOW_OPTIONS_CM_S = [5, 20] as const;

export function getDefaultIgnitionPoint(scenario: ScenarioId): IgnitionPoint {
  return { x: 0, y: Math.floor(SCENARIO_GEOMETRY[scenario].gridRows / 2) };
}

export function getScenarioGeometry(
  settings: SimulationSettings,
): SpecimenGeometry {
  return {
    ...SCENARIO_GEOMETRY[settings.scenario],
    thicknessCm:
      settings.scenario === "bass"
        ? settings.thicknessCm
        : SCENARIO_GEOMETRY["saffire-v"].thicknessCm,
  };
}

export function getSaffireRibWidthRange(airflowCmS: number) {
  const data = SAFFIRE_FSR_DATA[airflowCmS];
  if (!data) {
    throw new RangeError("SAFFIRE-V airflow must be 5 or 20 cm/s.");
  }
  return { min: data[0][0], max: data[data.length - 1][0], step: 0.1 };
}

export function estimateOpposedFsrCmS(settings: SimulationSettings): number {
  assertSettingsWithinBounds(settings);
  if (settings.scenario === "bass") {
    return predictBassFsr(
      {
        thicknessCm: settings.thicknessCm,
        oxygenInitialPct: settings.oxygenPct,
        airflowCmS: settings.airflowCmS,
      },
      "airflow",
    );
  }

  const data = SAFFIRE_FSR_DATA[settings.airflowCmS];
  if (!data) {
    throw new RangeError("SAFFIRE-V airflow must be 5 or 20 cm/s.");
  }
  return interpolateTable(data, settings.ribWidthCm);
}

export function directionalSpreadVelocity(
  opposedFsrCmS: number,
  angleDegrees: number,
  concurrentMultiplier: number,
): number {
  if (
    !Number.isFinite(opposedFsrCmS) ||
    !Number.isFinite(angleDegrees) ||
    !Number.isFinite(concurrentMultiplier) ||
    angleDegrees < 0 ||
    angleDegrees > 180 ||
    concurrentMultiplier < CONCURRENT_MULTIPLIER_RANGE.min ||
    concurrentMultiplier > CONCURRENT_MULTIPLIER_RANGE.max
  ) {
    throw new RangeError("Directional spread inputs are outside supported bounds.");
  }
  if (opposedFsrCmS <= 0) return 0;

  const theta = (angleDegrees * Math.PI) / 180;
  if (angleDegrees <= 90) {
    return opposedFsrCmS * (1 - 0.15 * Math.sin(theta) ** 2);
  }
  const lateral = LATERAL_SPREAD_RATIO * opposedFsrCmS;
  return (
    lateral +
    (concurrentMultiplier * opposedFsrCmS - lateral) *
      Math.abs(Math.cos(theta)) ** 1.8
  );
}

export function getDirectionalRates(
  opposedFsrCmS: number,
  concurrentMultiplier: number,
) {
  return {
    opposedCmS: Math.max(0, opposedFsrCmS),
    lateralCmS: Math.max(0, opposedFsrCmS) * LATERAL_SPREAD_RATIO,
    concurrentCmS: Math.max(0, opposedFsrCmS) * concurrentMultiplier,
  };
}

export function createInitialSimulation(
  settings: SimulationSettings,
): FlameSimulationState {
  const geometry = getScenarioGeometry(settings);
  return {
    status: "idle",
    cells: createCells(geometry.gridRows),
    ignitionPoint: null,
    simulatedSeconds: 0,
    fullSpreadTimeSeconds: null,
    timeStepSeconds: 0,
    history: [],
    endReason: null,
  };
}

export function startSimulation(
  settings: SimulationSettings,
  ignitionPoint = getDefaultIgnitionPoint(settings.scenario),
): FlameSimulationState {
  const geometry = getScenarioGeometry(settings);
  assertIgnitionPoint(ignitionPoint, geometry.gridRows);
  const opposedFsrCmS = estimateOpposedFsrCmS(settings);
  const state = createInitialSimulation(settings);
  if (opposedFsrCmS <= 0) {
    return {
      ...state,
      status: "extinguished",
      ignitionPoint,
      history: [createSpreadPoint(0, 0, 0, 0, 0)],
      endReason: "No positive flame-spread rate at these settings.",
    };
  }

  const concurrentRate = opposedFsrCmS * settings.concurrentMultiplier;
  const fullSpreadTimeSeconds = estimateFullSpreadTime(
    ignitionPoint,
    geometry,
    opposedFsrCmS,
    settings.concurrentMultiplier,
  );
  const timeStepSeconds =
    Math.min(
      geometry.lengthCm / GRID_COLUMNS,
      geometry.widthCm / geometry.gridRows,
    ) / Math.max(opposedFsrCmS, concurrentRate);
  const initialCells = createCells(geometry.gridRows);
  const ignitionIndex = cellIndex(ignitionPoint.x, ignitionPoint.y);
  initialCells[ignitionIndex].state = "burning";
  const initialArea = 0;

  return {
    ...state,
    status: "running",
    cells: initialCells,
    ignitionPoint,
    fullSpreadTimeSeconds,
    timeStepSeconds,
    history: [
      createSpreadPoint(
        0,
        0,
        initialArea,
        0,
        0,
      ),
    ],
  };
}

export function advanceSimulation(
  state: FlameSimulationState,
  settings: SimulationSettings,
): FlameSimulationState {
  if (state.status !== "running") return state;
  const opposedFsrCmS = estimateOpposedFsrCmS(settings);
  if (opposedFsrCmS <= 0) return finishByExtinguishing(state);

  const geometry = getScenarioGeometry(settings);
  const ignition = state.ignitionPoint ?? DEFAULT_IGNITION_POINT;
  const previousSeconds = state.simulatedSeconds;
  const simulatedSeconds = Math.min(
    state.fullSpreadTimeSeconds ?? 0,
    previousSeconds + state.timeStepSeconds,
  );
  const cellWidthCm = geometry.lengthCm / GRID_COLUMNS;
  const cellHeightCm = geometry.widthCm / geometry.gridRows;
  const cells = state.cells.map((cell) => {
    const position = {
      x: (cell.x + 0.5) * cellWidthCm - (ignition.x + 0.5) * cellWidthCm,
      y: (cell.y + 0.5) * cellHeightCm - (ignition.y + 0.5) * cellHeightCm,
    };
    const arrival = arrivalTime(
      position.x,
      position.y,
      opposedFsrCmS,
      settings.concurrentMultiplier,
    );
    if (arrival > simulatedSeconds) return { ...cell, state: "unburned" as const };
    if (arrival > previousSeconds) return { ...cell, state: "burning" as const };
    return { ...cell, state: "burned" as const };
  });
  const cellArea = cellWidthCm * cellHeightCm;
  const complete = simulatedSeconds >= (state.fullSpreadTimeSeconds ?? Infinity);
  const burnedAreaCm2 = complete
    ? geometry.lengthCm * geometry.widthCm
    : Math.min(
        geometry.lengthCm * geometry.widthCm,
        cells.filter((cell) => cell.state !== "unburned").length * cellArea,
      );
  const previousArea = state.history.at(-1)?.burnedAreaCm2 ?? 0;
  const areaGrowthCm2S =
    Math.max(
      0,
      (burnedAreaCm2 - previousArea) / (simulatedSeconds - previousSeconds),
    );
  const distanceCm = Math.max(
    0,
    ...cells
      .filter((cell) => cell.state !== "unburned")
      .map((cell) =>
        Math.hypot(
          (cell.x - ignition.x) * cellWidthCm,
          (cell.y - ignition.y) * cellHeightCm,
        ),
      ),
  );
  const surfaceArea = geometry.lengthCm * geometry.widthCm;
  const history = [
    ...state.history,
    createSpreadPoint(
      simulatedSeconds,
      distanceCm,
      burnedAreaCm2,
      areaGrowthCm2S,
      (burnedAreaCm2 / surfaceArea) * 100,
    ),
  ];
  return {
    ...state,
    status: complete ? "burned" : "running",
    cells: complete
      ? cells.map((cell) => ({ ...cell, state: "burned" as const }))
      : cells,
    simulatedSeconds,
    history,
    endReason: complete ? "The simulated flame front reached the full specimen surface." : null,
  };
}

export function getAverageAreaGrowthCm2S(
  simulation: FlameSimulationState,
): number {
  const area = simulation.history.at(-1)?.burnedAreaCm2 ?? 0;
  return simulation.simulatedSeconds > 0 ? area / simulation.simulatedSeconds : 0;
}

function assertSettingsWithinBounds(settings: SimulationSettings) {
  if (
    !Number.isFinite(settings.concurrentMultiplier) ||
    settings.concurrentMultiplier < CONCURRENT_MULTIPLIER_RANGE.min ||
    settings.concurrentMultiplier > CONCURRENT_MULTIPLIER_RANGE.max
  ) {
    throw new RangeError("Concurrent multiplier must be between 0.5 and 4.");
  }

  if (settings.scenario === "bass") {
    if (
      settings.oxygenPct < BASS_INPUT_RANGES.oxygenInitialPct.min ||
      settings.oxygenPct > BASS_INPUT_RANGES.oxygenInitialPct.max ||
      settings.airflowCmS < BASS_INPUT_RANGES.airflowCmS.min ||
      settings.airflowCmS > BASS_INPUT_RANGES.airflowCmS.max ||
      settings.thicknessCm < BASS_INPUT_RANGES.thicknessCm.min ||
      settings.thicknessCm > BASS_INPUT_RANGES.thicknessCm.max
    ) {
      throw new RangeError("BASS inputs must remain within the observed data ranges.");
    }
    return;
  }

  const ribRange = getSaffireRibWidthRange(settings.airflowCmS);
  if (
    !Number.isFinite(settings.ribWidthCm) ||
    settings.ribWidthCm < ribRange.min ||
    settings.ribWidthCm > ribRange.max ||
    settings.oxygenPct !== 26.9 ||
    settings.thicknessCm !== 1
  ) {
    throw new RangeError(
      "SAFFIRE-V inputs must match its observed oxygen, thickness, airflow, and rib-width ranges.",
    );
  }
}

function interpolateTable(
  data: readonly (readonly [number, number])[],
  ribWidthCm: number,
): number {
  for (let index = 0; index < data.length - 1; index += 1) {
    const [lowerWidth, lowerRate] = data[index];
    const [upperWidth, upperRate] = data[index + 1];
    if (ribWidthCm === lowerWidth) return lowerRate;
    if (ribWidthCm <= upperWidth) {
      const ratio = (ribWidthCm - lowerWidth) / (upperWidth - lowerWidth);
      return Math.max(0, lowerRate + ratio * (upperRate - lowerRate));
    }
  }
  return data[data.length - 1][1];
}

export function estimateFullSpreadTime(
  ignition: IgnitionPoint,
  geometry: SpecimenGeometry,
  opposedFsrCmS: number,
  concurrentMultiplier: number,
): number {
  const ignitionX =
    ((ignition.x + 0.5) / GRID_COLUMNS) * geometry.lengthCm;
  const ignitionY =
    ((ignition.y + 0.5) / geometry.gridRows) * geometry.widthCm;
  const boundaryPoints: [number, number][] = [];
  for (let column = 0; column <= GRID_COLUMNS; column += 1) {
    const x = (column / GRID_COLUMNS) * geometry.lengthCm;
    boundaryPoints.push([x, 0], [x, geometry.widthCm]);
  }
  for (let row = 0; row <= geometry.gridRows; row += 1) {
    const y = (row / geometry.gridRows) * geometry.widthCm;
    boundaryPoints.push([0, y], [geometry.lengthCm, y]);
  }
  return Math.max(
    ...boundaryPoints.map(([x, y]) => {
      const dx = x - ignitionX;
      const dy = y - ignitionY;
      return arrivalTime(dx, dy, opposedFsrCmS, concurrentMultiplier);
    }),
  );
}

function arrivalTime(
  x: number,
  y: number,
  opposedFsrCmS: number,
  concurrentMultiplier: number,
): number {
  const distance = Math.hypot(x, y);
  if (distance === 0) return 0;
  const angleDegrees =
    (Math.acos(Math.max(-1, Math.min(1, -x / distance))) * 180) / Math.PI;
  const velocity = directionalSpreadVelocity(
    opposedFsrCmS,
    angleDegrees,
    concurrentMultiplier,
  );
  return velocity > 0 ? distance / velocity : Infinity;
}

function createSpreadPoint(
  timeSeconds: number,
  distanceCm: number,
  burnedAreaCm2: number,
  areaGrowthCm2S: number,
  burnedPct: number,
): SpreadPoint {
  return { timeSeconds, distanceCm, burnedAreaCm2, areaGrowthCm2S, burnedPct };
}

function assertIgnitionPoint(point: IgnitionPoint, gridRows: number) {
  if (
    !Number.isInteger(point.x) ||
    point.x < 0 ||
    point.x >= GRID_COLUMNS ||
    !Number.isInteger(point.y) ||
    point.y < 0 ||
    point.y >= gridRows
  ) {
    throw new RangeError("Ignition point must be inside the fuel-sample map.");
  }
}

function finishByExtinguishing(state: FlameSimulationState): FlameSimulationState {
  return {
    ...state,
    status: "extinguished",
    cells: state.cells.map((cell) =>
      cell.state === "burning" ? { ...cell, state: "burned" } : cell,
    ),
    endReason: "The model estimates no positive flame spread.",
  };
}

function createCells(gridRows: number): FlameCell[] {
  return Array.from({ length: gridRows * GRID_COLUMNS }, (_, index) => ({
    x: index % GRID_COLUMNS,
    y: Math.floor(index / GRID_COLUMNS),
    state: "unburned" as const,
  }));
}

function cellIndex(x: number, y: number) {
  return y * GRID_COLUMNS + x;
}
