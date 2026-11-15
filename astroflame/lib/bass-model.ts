export type BassInputs = {
  thicknessCm: number;
  oxygenInitialPct: number;
  airflowCmS: number;
};

export type BassModel = "oxygen" | "airflow";

export const BASS_REFERENCE_THICKNESS_CM = 0.3;

export const BASS_INPUT_RANGES = {
  thicknessCm: { min: 0.1, max: 0.5 },
  oxygenInitialPct: { min: 17.9, max: 22.2 },
  airflowCmS: { min: 2, max: 21 },
} as const;

export const BASS_MODEL_INFO = {
  oxygen: {
    label: "Thickness + initial oxygen",
    equalIdRmse: 0.0020768,
  },
  airflow: {
    label: "Thickness + airflow + initial oxygen",
    equalIdRmse: 0.0021106,
  },
} as const;

export function predictBassFsr(inputs: BassInputs, model: BassModel): number {
  const { thicknessCm, oxygenInitialPct, airflowCmS } = inputs;
  if (
    !Number.isFinite(thicknessCm) ||
    thicknessCm < BASS_INPUT_RANGES.thicknessCm.min ||
    thicknessCm > BASS_INPUT_RANGES.thicknessCm.max ||
    !Number.isFinite(oxygenInitialPct) ||
    oxygenInitialPct < BASS_INPUT_RANGES.oxygenInitialPct.min ||
    oxygenInitialPct > BASS_INPUT_RANGES.oxygenInitialPct.max ||
    !Number.isFinite(airflowCmS) ||
    airflowCmS < BASS_INPUT_RANGES.airflowCmS.min ||
    airflowCmS > BASS_INPUT_RANGES.airflowCmS.max
  ) {
    throw new RangeError("BASS inputs must remain within the observed data ranges.");
  }

  return calculateBassFsr(inputs, model);
}

export function estimateBassFsrPotential(
  inputs: BassInputs,
  model: BassModel = "airflow",
): number {
  return predictBassFsr(inputs, model);
}

function calculateBassFsr(inputs: BassInputs, model: BassModel): number {
  const { thicknessCm, oxygenInitialPct, airflowCmS } = inputs;
  if (model === "airflow") {
    return Math.max(
      0,
      -0.0046401565 +
        0.00012822354 * thicknessCm ** -1.7904 +
        0.000020195711 * airflowCmS +
        0.00034705712 * oxygenInitialPct,
    );
  }

  return Math.max(
    0,
    -0.0047724994 +
      0.0001178348 * thicknessCm ** -1.8194 +
      0.00036659067 * oxygenInitialPct,
  );
}
