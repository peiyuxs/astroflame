import { BASS_INPUT_RANGES } from "./bass-model.ts";

export type BassObservation = {
  experimentId: string;
  observationId: string;
  airflowCmS: number;
  thicknessCm: number;
  oxygenInitialPct: number;
  measuredFsrCmS: number;
  sourceLocation?: string;
  measurementMethod?: string;
  dataQuality?: string;
};

export type BassGrouping = "airflowCmS" | "thicknessCm" | "oxygenInitialPct";

export type BassPrediction = BassObservation & {
  predictedFsrCmS: number;
  residualCmS: number;
};

export type BassResidualGroup = {
  value: number;
  observationCount: number;
  experimentCount: number;
  meanMeasuredFsrCmS: number;
  meanPredictedFsrCmS: number;
  meanResidualCmS: number;
  rmseCmS: number;
};

export type BassValidationResult = {
  records: BassPrediction[];
  metrics: {
    observationCount: number;
    experimentCount: number;
    rowWeightedRmseCmS: number;
    equalExperimentRmseCmS: number;
  };
};

export function calculateGroupedBassPredictions(
  observations: readonly BassObservation[],
): BassValidationResult {
  if (observations.length < 2) {
    throw new RangeError("At least two BASS observations are required.");
  }

  const grouped = new Map<string, BassObservation[]>();
  for (const observation of observations) {
    assertObservationWithinBounds(observation);
    const group = grouped.get(observation.experimentId) ?? [];
    group.push(observation);
    grouped.set(observation.experimentId, group);
  }
  if (grouped.size < 2) {
    throw new RangeError("At least two distinct BASS experiment IDs are required.");
  }

  const records: BassPrediction[] = [];
  const experimentMeanSquaredErrors: number[] = [];
  for (const [heldOutId, validationRows] of grouped) {
    const trainingRows = observations.filter(
      (observation) => observation.experimentId !== heldOutId,
    );
    const model = fitAirflowModel(trainingRows);
    const foldRecords = validationRows.map((observation) => {
      const predictedFsrCmS = predictWithModel(observation, model);
      return {
        ...observation,
        predictedFsrCmS,
        residualCmS: observation.measuredFsrCmS - predictedFsrCmS,
      };
    });
    const meanSquaredError =
      foldRecords.reduce(
        (sum, record) => sum + record.residualCmS ** 2,
        0,
      ) / foldRecords.length;
    experimentMeanSquaredErrors.push(meanSquaredError);
    records.push(...foldRecords);
  }

  const squaredErrors = records.map((record) => record.residualCmS ** 2);
  return {
    records,
    metrics: {
      observationCount: records.length,
      experimentCount: grouped.size,
      rowWeightedRmseCmS: Math.sqrt(
        squaredErrors.reduce((sum, error) => sum + error, 0) /
          squaredErrors.length,
      ),
      equalExperimentRmseCmS: Math.sqrt(
        experimentMeanSquaredErrors.reduce((sum, error) => sum + error, 0) /
          experimentMeanSquaredErrors.length,
      ),
    },
  };
}

export function groupBassResiduals(
  records: readonly BassPrediction[],
  groupBy: BassGrouping,
): BassResidualGroup[] {
  const groups = new Map<number, BassPrediction[]>();
  for (const record of records) {
    const value = record[groupBy];
    const group = groups.get(value) ?? [];
    group.push(record);
    groups.set(value, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, group]) => {
      const mean = (select: (record: BassPrediction) => number) =>
        group.reduce((sum, record) => sum + select(record), 0) / group.length;
      const squaredError =
        group.reduce((sum, record) => sum + record.residualCmS ** 2, 0) /
        group.length;
      return {
        value,
        observationCount: group.length,
        experimentCount: new Set(group.map((record) => record.experimentId))
          .size,
        meanMeasuredFsrCmS: mean((record) => record.measuredFsrCmS),
        meanPredictedFsrCmS: mean((record) => record.predictedFsrCmS),
        meanResidualCmS: mean((record) => record.residualCmS),
        rmseCmS: Math.sqrt(squaredError),
      };
    });
}

function assertObservationWithinBounds(observation: BassObservation) {
  if (
    !observation.experimentId.trim() ||
    !observation.observationId.trim() ||
    !Number.isFinite(observation.measuredFsrCmS) ||
    observation.measuredFsrCmS <= 0 ||
    !Number.isFinite(observation.thicknessCm) ||
    observation.thicknessCm < BASS_INPUT_RANGES.thicknessCm.min ||
    observation.thicknessCm > BASS_INPUT_RANGES.thicknessCm.max ||
    !Number.isFinite(observation.airflowCmS) ||
    observation.airflowCmS < BASS_INPUT_RANGES.airflowCmS.min ||
    observation.airflowCmS > BASS_INPUT_RANGES.airflowCmS.max ||
    !Number.isFinite(observation.oxygenInitialPct) ||
    observation.oxygenInitialPct < BASS_INPUT_RANGES.oxygenInitialPct.min ||
    observation.oxygenInitialPct > BASS_INPUT_RANGES.oxygenInitialPct.max
  ) {
    throw new RangeError(
      "BASS observation inputs must remain within the measured model ranges.",
    );
  }
}

type FittedModel = {
  exponent: number;
  coefficients: number[];
};

function fitAirflowModel(observations: readonly BassObservation[]): FittedModel {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let lower = -5;
  let upper = 5;
  let left = upper - ratio * (upper - lower);
  let right = lower + ratio * (upper - lower);
  let leftFit = fitAtExponent(observations, left);
  let rightFit = fitAtExponent(observations, right);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    if (leftFit.error < rightFit.error) {
      upper = right;
      right = left;
      rightFit = leftFit;
      left = upper - ratio * (upper - lower);
      leftFit = fitAtExponent(observations, left);
    } else {
      lower = left;
      left = right;
      leftFit = rightFit;
      right = lower + ratio * (upper - lower);
      rightFit = fitAtExponent(observations, right);
    }
  }

  const exponent = (lower + upper) / 2;
  const fitted = fitAtExponent(observations, exponent);
  return { exponent, coefficients: fitted.coefficients };
}

function fitAtExponent(
  observations: readonly BassObservation[],
  exponent: number,
) {
  const design = observations.map((observation) => [
    1,
    observation.thicknessCm ** exponent,
    observation.airflowCmS,
    observation.oxygenInitialPct,
  ]);
  const target = observations.map((observation) => observation.measuredFsrCmS);
  const coefficients = solveLeastSquares(design, target);
  const error = observations.reduce((sum, observation, index) => {
    const residual =
      observation.measuredFsrCmS -
      predictWithModel(observation, { exponent, coefficients });
    return sum + residual ** 2;
  }, 0);
  return { coefficients, error };
}

function predictWithModel(
  observation: BassObservation,
  model: FittedModel,
): number {
  const [intercept, thicknessCoefficient, airflowCoefficient, oxygenCoefficient] =
    model.coefficients;
  return (
    intercept +
    thicknessCoefficient * observation.thicknessCm ** model.exponent +
    airflowCoefficient * observation.airflowCmS +
    oxygenCoefficient * observation.oxygenInitialPct
  );
}

function solveLeastSquares(design: readonly number[][], target: readonly number[]) {
  const matrix = design.map((row) => [...row]);
  const values = [...target];
  const rowCount = matrix.length;
  const columnCount = matrix[0]?.length ?? 0;

  for (let column = 0; column < columnCount; column += 1) {
    let norm = 0;
    for (let row = column; row < rowCount; row += 1) {
      norm = Math.hypot(norm, matrix[row][column]);
    }
    if (!Number.isFinite(norm) || norm === 0) {
      throw new RangeError("BASS validation model could not be fit to this fold.");
    }

    const alpha = matrix[column][column] >= 0 ? -norm : norm;
    const reflector = Array.from(
      { length: rowCount - column },
      (_, index) => matrix[column + index][column],
    );
    reflector[0] -= alpha;
    const reflectorNormSquared = reflector.reduce(
      (sum, value) => sum + value ** 2,
      0,
    );
    if (!Number.isFinite(reflectorNormSquared) || reflectorNormSquared === 0) {
      throw new RangeError("BASS validation model could not be fit to this fold.");
    }
    const scale = 2 / reflectorNormSquared;

    for (let nextColumn = column; nextColumn < columnCount; nextColumn += 1) {
      let projection = 0;
      for (let row = column; row < rowCount; row += 1) {
        projection += reflector[row - column] * matrix[row][nextColumn];
      }
      projection *= scale;
      for (let row = column; row < rowCount; row += 1) {
        matrix[row][nextColumn] -= projection * reflector[row - column];
      }
    }

    let targetProjection = 0;
    for (let row = column; row < rowCount; row += 1) {
      targetProjection += reflector[row - column] * values[row];
    }
    targetProjection *= scale;
    for (let row = column; row < rowCount; row += 1) {
      values[row] -= targetProjection * reflector[row - column];
    }
    matrix[column][column] = alpha;
    for (let row = column + 1; row < rowCount; row += 1) {
      matrix[row][column] = 0;
    }
  }

  const coefficients = Array.from({ length: columnCount }, () => 0);
  for (let row = columnCount - 1; row >= 0; row -= 1) {
    let value = values[row];
    for (let column = row + 1; column < columnCount; column += 1) {
      value -= matrix[row][column] * coefficients[column];
    }
    const diagonal = matrix[row][row];
    if (!Number.isFinite(diagonal) || Math.abs(diagonal) < 1e-12) {
      throw new RangeError("BASS validation model could not be fit to this fold.");
    }
    coefficients[row] = value / diagonal;
  }
  return coefficients;
}
