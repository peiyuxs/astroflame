import {
  estimateFullSpreadTime,
  estimateOpposedFsrCmS,
  getDirectionalRates,
  getScenarioGeometry,
  GRID_COLUMNS,
  type IgnitionPoint,
  type SimulationSettings,
} from "./flame-simulation.ts";

export type SimulationInsight = {
  summary: string;
  observations: string[];
  applicationIdea: string;
  researchQuestion: string;
  limitations: string;
};

export type SimulationInsightContext = {
  scenario: SimulationSettings["scenario"];
  scenarioLabel: string;
  settings: SimulationSettings;
  ignitionPoint: IgnitionPoint;
  outcome: "burned" | "extinguished";
  modelTimeSeconds: number;
  fullSpreadTimeSeconds: number | null;
  burnedAreaCm2: number;
  burnedPercent: number;
  instantaneousGrowthCm2S: number;
  averageGrowthCm2S: number;
  opposedFsrCmS: number;
  lateralFsrCmS: number;
  concurrentFsrCmS: number;
  evidenceNote: string;
};

type ValidationResult =
  | { ok: true; context: SimulationInsightContext }
  | { ok: false; error: string };

const MAX_OUTPUT_LENGTH = {
  summary: 700,
  observation: 400,
  applicationIdea: 520,
  researchQuestion: 400,
  limitations: 600,
} as const;

export const GEMINI_INSIGHT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", maxLength: MAX_OUTPUT_LENGTH.summary },
    observations: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 3,
      items: { type: "STRING", maxLength: MAX_OUTPUT_LENGTH.observation },
    },
    applicationIdea: {
      type: "STRING",
      maxLength: MAX_OUTPUT_LENGTH.applicationIdea,
    },
    researchQuestion: {
      type: "STRING",
      maxLength: MAX_OUTPUT_LENGTH.researchQuestion,
    },
    limitations: {
      type: "STRING",
      maxLength: MAX_OUTPUT_LENGTH.limitations,
    },
  },
  required: [
    "summary",
    "observations",
    "applicationIdea",
    "researchQuestion",
    "limitations",
  ],
} as const;

export function validateSimulationInsightRequest(
  value: unknown,
): ValidationResult {
  if (!isRecord(value) || !isRecord(value.settings) || !isRecord(value.result)) {
    return { ok: false, error: "The simulation summary is incomplete." };
  }

  const { settings: settingsRecord, result: resultRecord } = value;
  if (
    settingsRecord.scenario !== "bass" &&
    settingsRecord.scenario !== "saffire-v"
  ) {
    return { ok: false, error: "Choose a supported simulation scenario." };
  }

  const settings = {
    scenario: settingsRecord.scenario,
    oxygenPct: finiteNumber(settingsRecord.oxygenPct),
    airflowCmS: finiteNumber(settingsRecord.airflowCmS),
    thicknessCm: finiteNumber(settingsRecord.thicknessCm),
    ribWidthCm: finiteNumber(settingsRecord.ribWidthCm),
    concurrentMultiplier: finiteNumber(settingsRecord.concurrentMultiplier),
  } satisfies SimulationSettings;
  if (Object.values(settings).some((item) => typeof item === "number" && !Number.isFinite(item))) {
    return { ok: false, error: "The simulation settings must be finite numbers." };
  }

  const ignition = readIgnitionPoint(value.ignitionPoint);
  if (!ignition) {
    return { ok: false, error: "The ignition location is invalid." };
  }

  let geometry: ReturnType<typeof getScenarioGeometry>;
  let opposedFsrCmS: number;
  try {
    geometry = getScenarioGeometry(settings);
    if (
      !Number.isInteger(ignition.x) ||
      ignition.x < 0 ||
      ignition.x >= GRID_COLUMNS ||
      !Number.isInteger(ignition.y) ||
      ignition.y < 0 ||
      ignition.y >= geometry.gridRows
    ) {
      return { ok: false, error: "The ignition location is outside the specimen." };
    }
    opposedFsrCmS = estimateOpposedFsrCmS(settings);
  } catch {
    return {
      ok: false,
      error: "The scenario inputs are outside the simulator's evidence bounds.",
    };
  }

  if (
    resultRecord.status !== "burned" &&
    resultRecord.status !== "extinguished"
  ) {
    return { ok: false, error: "Only a completed simulation can be summarized." };
  }

  const modelTimeSeconds = finiteNumber(resultRecord.modelTimeSeconds);
  const burnedAreaCm2 = finiteNumber(resultRecord.burnedAreaCm2);
  const instantaneousGrowthCm2S = finiteNumber(
    resultRecord.instantaneousGrowthCm2S,
  );
  const averageGrowthCm2S = finiteNumber(resultRecord.averageGrowthCm2S);
  const surfaceAreaCm2 = geometry.lengthCm * geometry.widthCm;
  if (
    !Number.isFinite(modelTimeSeconds) ||
    !Number.isFinite(burnedAreaCm2) ||
    !Number.isFinite(instantaneousGrowthCm2S) ||
    !Number.isFinite(averageGrowthCm2S) ||
    modelTimeSeconds < 0 ||
    modelTimeSeconds > 100_000_000 ||
    burnedAreaCm2 < 0 ||
    burnedAreaCm2 > surfaceAreaCm2 ||
    instantaneousGrowthCm2S < 0 ||
    instantaneousGrowthCm2S > surfaceAreaCm2 * 1_000 ||
    averageGrowthCm2S < 0 ||
    averageGrowthCm2S > surfaceAreaCm2 * 1_000
  ) {
    return { ok: false, error: "The simulation results contain invalid values." };
  }

  let fullSpreadTimeSeconds: number | null = null;
  if (resultRecord.status === "burned") {
    fullSpreadTimeSeconds = estimateFullSpreadTime(
      ignition,
      geometry,
      opposedFsrCmS,
      settings.concurrentMultiplier,
    );
    if (
      !Number.isFinite(fullSpreadTimeSeconds) ||
      burnedAreaCm2 < surfaceAreaCm2 * 0.999 ||
      Math.abs(modelTimeSeconds - fullSpreadTimeSeconds) >
        Math.max(0.1, fullSpreadTimeSeconds * 0.01)
    ) {
      return {
        ok: false,
        error: "The completed simulation summary does not match the model.",
      };
    }
  }

  const directionalRates = getDirectionalRates(
    opposedFsrCmS,
    settings.concurrentMultiplier,
  );
  return {
    ok: true,
    context: {
      scenario: settings.scenario,
      scenarioLabel:
        settings.scenario === "bass" ? "BASS smooth-PMMA assumption" : "SAFFIRE-V ribbed PMMA",
      settings,
      ignitionPoint: ignition,
      outcome: resultRecord.status,
      modelTimeSeconds,
      fullSpreadTimeSeconds,
      burnedAreaCm2,
      burnedPercent: (burnedAreaCm2 / surfaceAreaCm2) * 100,
      instantaneousGrowthCm2S,
      averageGrowthCm2S,
      opposedFsrCmS,
      lateralFsrCmS: directionalRates.lateralCmS,
      concurrentFsrCmS: directionalRates.concurrentCmS,
      evidenceNote:
        settings.scenario === "bass"
          ? "BASS-II PSI-25: 39 curated observations from 18 experiment IDs. Inputs are within the simulator's documented range; intermediate settings and the smooth-PMMA geometry are modeling assumptions, not new measurements."
          : "SAFFIRE-V: 18 approximate digitized observations from one experiment. Airflow is limited to 5 or 20 cm/s; rib-width values between observations are interpolated.",
    },
  };
}

export function parseSimulationInsight(value: unknown): SimulationInsight | null {
  if (!isRecord(value)) return null;
  const summary = readText(value.summary, MAX_OUTPUT_LENGTH.summary);
  const researchQuestion = readText(
    value.researchQuestion,
    MAX_OUTPUT_LENGTH.researchQuestion,
  );
  const applicationIdea = readText(
    value.applicationIdea,
    MAX_OUTPUT_LENGTH.applicationIdea,
  );
  const limitations = readText(value.limitations, MAX_OUTPUT_LENGTH.limitations);
  if (
    summary === null ||
    applicationIdea === null ||
    researchQuestion === null ||
    limitations === null ||
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > 3
  ) {
    return null;
  }

  const observations = value.observations.map((observation) =>
    readText(observation, MAX_OUTPUT_LENGTH.observation),
  );
  if (observations.some((observation) => observation === null)) return null;

  return {
    summary,
    observations: observations.filter(
      (observation): observation is string => observation !== null,
    ),
    applicationIdea,
    researchQuestion,
    limitations,
  };
}

export function parseGeminiResponse(value: unknown): SimulationInsight | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const parts = candidate.content.parts;
    if (!Array.isArray(parts)) continue;

    const text = parts
      .filter(isRecord)
      .filter((part) => part.thought !== true)
      .map((part) => part.text)
      .filter((part): part is string => typeof part === "string")
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!text) continue;

    try {
      const insight = parseSimulationInsight(JSON.parse(text));
      if (insight) return insight;
    } catch {
      continue;
    }
  }
  return null;
}

function readIgnitionPoint(value: unknown): IgnitionPoint | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function readText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maximumLength ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}