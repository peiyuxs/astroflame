import {
  BASS_REFERENCE_THICKNESS_CM,
  estimateBassFsrPotential,
  type BassInputs,
} from "./bass-model.ts";

export type MaterialId = "pmma" | "sibal-fabric" | "nomex" | "ultem";

export type MaterialPreset = {
  id: MaterialId;
  label: string;
  composition: string;
  source: string;
  evidence: string;
};

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  {
    id: "pmma",
    label: "PMMA sheet",
    composition: "PMMA slab (poly(methyl methacrylate))",
    source: "BASS-II PSI-25",
    evidence: "BASS-II measured model reference",
  },
  {
    id: "sibal-fabric",
    label: "SIBAL / cotton-fiberglass fabric",
    composition: "BASS custom fabric: 75% cotton / 25% fiberglass by mass",
    source: "NASA PSI-26 and PSI-100",
    evidence: "5 reported SIBAL spread rates; transferred response is exploratory",
  },
  {
    id: "nomex",
    label: "Nomex fabric",
    composition: "Nomex fabric; detailed formulation not supplied",
    source: "NASA PSI-26",
    evidence: "No material-specific spread-rate fit; placeholder multiplier",
  },
  {
    id: "ultem",
    label: "Ultem",
    composition: "Ultem; detailed formulation not supplied",
    source: "NASA PSI-26",
    evidence: "No material-specific spread-rate fit; placeholder multiplier",
  },
];

export const GRID_COLUMNS = 32;
export const GRID_ROWS = 14;
export const CELL_SIZE_CM = 0.1;
export const VISUALIZATION_ACCELERATION = 160;
export const CELL_BURN_TICKS = 3;

export const SIBAL_REPORTED_RATES_CM_S = [0.175, 0.13, 0.203, 0.232, 0.098];

// PLACEHOLDER: replace null with validated material-specific oxygen cutoffs.
export const EXTINCTION_OXYGEN_CUTOFFS_PCT: Record<MaterialId, number | null> = {
  pmma: null,
  "sibal-fabric": null,
  nomex: null,
  ultem: null,
};

// PLACEHOLDER: qualitative prototype factors, not measurements or material properties.
export const ASSUMED_SPREAD_MULTIPLIERS: Partial<Record<MaterialId, number>> = {
  nomex: 0.75,
  ultem: 0.9,
};

export type SimulationSettings = {
  materialId: MaterialId;
  oxygenPct: number;
  airflowCmS: number;
};

export type CellState = "unburned" | "vulnerable" | "burning" | "burned";

export type FlameCell = {
  x: number;
  y: number;
  state: CellState;
  burnTicks: number;
};

export type SpreadPoint = {
  timeSeconds: number;
  distanceCm: number;
};

export type IgnitionPoint = {
  x: number;
  y: number;
};

export type FlameSimulationStatus = "idle" | "running" | "burned" | "extinguished";

export type FlameSimulationState = {
  status: FlameSimulationStatus;
  cells: FlameCell[];
  ignitionPoint: IgnitionPoint | null;
  simulatedSeconds: number;
  history: SpreadPoint[];
  endReason: string | null;
};

export const DEFAULT_IGNITION_POINT: IgnitionPoint = {
  x: 0,
  y: Math.floor(GRID_ROWS / 2),
};

export function estimateMaterialFsrCmS(settings: SimulationSettings): number {
  const inputs: BassInputs = {
    thicknessCm: BASS_REFERENCE_THICKNESS_CM,
    oxygenInitialPct: settings.oxygenPct,
    airflowCmS: settings.airflowCmS,
  };
  const pmmaPotential = estimateBassFsrPotential(inputs);

  if (settings.materialId === "sibal-fabric") {
    const observedMean =
      SIBAL_REPORTED_RATES_CM_S.reduce((total, rate) => total + rate, 0) /
      SIBAL_REPORTED_RATES_CM_S.length;
    const referencePotential = estimateBassFsrPotential({
      ...inputs,
      oxygenInitialPct: 21.58,
      airflowCmS: 22,
    });
    return Math.max(0, observedMean * (pmmaPotential / referencePotential));
  }

  const multiplier = ASSUMED_SPREAD_MULTIPLIERS[settings.materialId] ?? 1;
  return Math.max(0, pmmaPotential * multiplier);
}

export function createInitialSimulation(): FlameSimulationState {
  return {
    status: "idle",
    cells: createCells(),
    ignitionPoint: null,
    simulatedSeconds: 0,
    history: [],
    endReason: null,
  };
}

export function startSimulation(
  settings: SimulationSettings,
  predictedFsrCmS: number,
  ignitionPoint: IgnitionPoint = DEFAULT_IGNITION_POINT,
): FlameSimulationState {
  if (
    !Number.isInteger(ignitionPoint.x) ||
    ignitionPoint.x < 0 ||
    ignitionPoint.x >= GRID_COLUMNS ||
    !Number.isInteger(ignitionPoint.y) ||
    ignitionPoint.y < 0 ||
    ignitionPoint.y >= GRID_ROWS
  ) {
    throw new RangeError("Ignition point must be inside the fuel-sample map.");
  }

  const state = createInitialSimulation();
  const extinctionCutoff = EXTINCTION_OXYGEN_CUTOFFS_PCT[settings.materialId] ?? 0;
  if (settings.oxygenPct <= extinctionCutoff || predictedFsrCmS <= 0) {
    return {
      ...state,
      status: "extinguished",
      ignitionPoint,
      history: [{ timeSeconds: 0, distanceCm: 0 }],
      endReason: "No positive flame-spread rate at these settings.",
    };
  }

  const cells = state.cells.map((cell) =>
    cell.x === ignitionPoint.x && cell.y === ignitionPoint.y
      ? { ...cell, state: "burning" as const }
      : cell,
  );

  return {
    ...state,
    status: "running",
    cells,
    ignitionPoint,
    history: [{ timeSeconds: 0, distanceCm: 0 }],
  };
}

export function advanceSimulation(
  state: FlameSimulationState,
  settings: SimulationSettings,
  predictedFsrCmS: number,
): FlameSimulationState {
  if (state.status !== "running") return state;

  const extinctionCutoff = EXTINCTION_OXYGEN_CUTOFFS_PCT[settings.materialId] ?? 0;
  if (settings.oxygenPct <= extinctionCutoff || predictedFsrCmS <= 0) {
    return finishByExtinguishing(state);
  }

  const cells = state.cells.map((cell) => ({ ...cell }));
  const burningIndices = state.cells.reduce<number[]>((indices, cell, index) => {
    if (cell.state === "burning") indices.push(index);
    return indices;
  }, []);
  const nextFlames = new Set<number>();
  const vulnerableCells = new Set<number>();

  for (const index of burningIndices) {
    const cell = cells[index];
    cell.burnTicks += 1;
    if (cell.burnTicks >= CELL_BURN_TICKS) cell.state = "burned";

    for (const neighborIndex of getNeighborIndices(cell.x, cell.y)) {
      const neighbor = cells[neighborIndex];
      if (neighbor.state === "unburned" || neighbor.state === "vulnerable") {
        nextFlames.add(neighborIndex);
      }
    }
  }

  for (const index of nextFlames) {
    cells[index].state = "burning";
    cells[index].burnTicks = 0;
    for (const neighborIndex of getNeighborIndices(cells[index].x, cells[index].y)) {
      if (cells[neighborIndex].state === "unburned") {
        vulnerableCells.add(neighborIndex);
      }
    }
  }

  for (const index of vulnerableCells) {
    if (!nextFlames.has(index) && cells[index].state === "unburned") {
      cells[index].state = "vulnerable";
    }
  }

  const simulatedSeconds = state.simulatedSeconds + CELL_SIZE_CM / predictedFsrCmS;
  const ignitionPoint = state.ignitionPoint ?? DEFAULT_IGNITION_POINT;
  const distanceCm =
    Math.max(
      0,
      ...cells
        .filter((cell) => cell.state === "burning" || cell.state === "burned")
        .map((cell) => Math.hypot(cell.x - ignitionPoint.x, cell.y - ignitionPoint.y)),
    ) * CELL_SIZE_CM;
  const history = [
    ...state.history,
    { timeSeconds: simulatedSeconds, distanceCm },
  ];
  const complete = cells.every((cell) => cell.state === "burned");

  return {
    status: complete ? "burned" : "running",
    cells,
    ignitionPoint,
    simulatedSeconds,
    history,
    endReason: complete ? "The simulated sample is fully burned." : null,
  };
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

function createCells(): FlameCell[] {
  return Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => ({
    x: index % GRID_COLUMNS,
    y: Math.floor(index / GRID_COLUMNS),
    state: "unburned" as const,
    burnTicks: 0,
  }));
}

function getNeighborIndices(x: number, y: number): number[] {
  const neighbors: number[] = [];
  if (x > 0) neighbors.push(y * GRID_COLUMNS + x - 1);
  if (x + 1 < GRID_COLUMNS) neighbors.push(y * GRID_COLUMNS + x + 1);
  if (y > 0) neighbors.push((y - 1) * GRID_COLUMNS + x);
  if (y + 1 < GRID_ROWS) neighbors.push((y + 1) * GRID_COLUMNS + x);
  return neighbors;
}
