"use client";

import { useEffect, useState } from "react";
import type {
  BassGrouping,
  BassPrediction,
  BassResidualGroup,
  BassValidationResult,
} from "@/lib/bass-validation";

type BassComparisonResponse = BassValidationResult & {
  sourceDataset: string;
  sourceFile: string;
  model: string;
  validationMethod: string;
  residualDefinition: string;
  groupBy: BassGrouping;
  groups: BassResidualGroup[];
};

const groupOptions: { value: BassGrouping; label: string; unit: string }[] = [
  { value: "airflowCmS", label: "Airflow", unit: "cm/s" },
  { value: "thicknessCm", label: "Thickness", unit: "cm" },
  { value: "oxygenInitialPct", label: "Initial oxygen", unit: "%" },
];

export default function BassComparison() {
  const [groupBy, setGroupBy] = useState<BassGrouping>("airflowCmS");
  const [result, setResult] = useState<BassComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadComparison() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/analysis/bass?groupBy=${groupBy}`,
          { signal: controller.signal },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getApiError(payload) ??
              `The BASS comparison request failed (${response.status}).`,
          );
        }
        if (!isBassComparisonResponse(payload)) {
          throw new Error("The BASS comparison returned an unexpected response.");
        }
        setResult(payload);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The BASS comparison could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadComparison();
    return () => controller.abort();
  }, [groupBy]);

  const selectedGroup =
    groupOptions.find((option) => option.value === groupBy) ?? groupOptions[0];

  return (
    <section aria-labelledby="bass-analysis-title" className="bass-analysis">
      <div className="bass-analysis-heading">
        <div>
          <h2 id="bass-analysis-title">BASS spread-rate comparison</h2>
          <p>
            Compare NASA-reported spread rates with predictions.
          </p>
        </div>
        <label className="bass-group-select" htmlFor="bass-group-by">
          Group residuals by
          <select
            id="bass-group-by"
            onChange={(event) =>
              setGroupBy(
                isBassGrouping(event.currentTarget.value)
                  ? event.currentTarget.value
                  : "airflowCmS",
              )
            }
            value={groupBy}
          >
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p aria-live="polite" className="bass-analysis-status">
          Loading measured rates from TigerData…
        </p>
      ) : error ? (
        <p aria-live="polite" className="bass-analysis-error" role="alert">
          {error}
        </p>
      ) : result ? (
        <>
          <div className="bass-validation-summary">
            <div>
              <span>Observations</span>
              <strong>{result.metrics.observationCount}</strong>
            </div>
            <div>
              <span>Experiments held out</span>
              <strong>{result.metrics.experimentCount}</strong>
            </div>
            <div>
              <span>Equal-experiment RMSE</span>
              <strong>
                {result.metrics.equalExperimentRmseCmS.toFixed(5)} cm/s
              </strong>
            </div>
            <div>
              <span>Per-observation RMSE</span>
              <strong>
                {result.metrics.rowWeightedRmseCmS.toFixed(5)} cm/s
              </strong>
            </div>
          </div>

          <div className="bass-analysis-grid">
            <figure className="bass-scatter-figure">
              <figcaption>
                <strong>Measured vs. held-out predicted rate</strong>
              </figcaption>
              <BassScatter records={result.records} />
            </figure>

            <div className="bass-residual-panel">
              <h3>Residuals by {selectedGroup.label.toLowerCase()}</h3>
              <p>
                Residual = measured rate - predicted rate
              </p>
              <div className="bass-residual-table-wrap">
                <table className="bass-residual-table">
                  <thead>
                    <tr>
                      <th scope="col">{selectedGroup.label}</th>
                      <th scope="col">Rows / tests</th>
                      <th scope="col">Mean measured</th>
                      <th scope="col">Mean predicted</th>
                      <th scope="col">Mean residual</th>
                      <th scope="col">RMSE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((group) => (
                      <tr key={group.value}>
                        <th scope="row">
                          {formatCondition(group.value)} {selectedGroup.unit}
                        </th>
                        <td>
                          {group.observationCount} / {group.experimentCount}
                        </td>
                        <td>{group.meanMeasuredFsrCmS.toFixed(5)}</td>
                        <td>{group.meanPredictedFsrCmS.toFixed(5)}</td>
                        <td>{group.meanResidualCmS.toFixed(5)}</td>
                        <td>{group.rmseCmS.toFixed(5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="bass-analysis-note">
            {result.validationMethod}. These exploratory results are not a safety prediction.
          </p>
          <p className="bass-analysis-source">
            Source: {result.sourceDataset}; {result.sourceFile}.
          </p>
        </>
      ) : null}
    </section>
  );
}

function BassScatter({ records }: { records: BassPrediction[] }) {
  const width = 560;
  const height = 340;
  const padding = { top: 20, right: 20, bottom: 56, left: 72 };
  const values = records.flatMap((record) => [
    record.measuredFsrCmS,
    record.predictedFsrCmS,
  ]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 0.001);
  const lower = minimum - range * 0.04;
  const upper = maximum + range * 0.04;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (value: number) =>
    padding.left + ((value - lower) / (upper - lower)) * plotWidth;
  const y = (value: number) =>
    padding.top + plotHeight - ((value - lower) / (upper - lower)) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) =>
    lower + ((upper - lower) * index) / 4,
  );

  return (
    <svg
      aria-label="Scatter plot comparing measured BASS spread rate on the horizontal axis with held-out predicted rate on the vertical axis"
      className="bass-scatter"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            className="bass-chart-grid"
            x1={x(tick)}
            x2={x(tick)}
            y1={padding.top}
            y2={padding.top + plotHeight}
          />
          <line
            className="bass-chart-grid"
            x1={padding.left}
            x2={padding.left + plotWidth}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className="bass-chart-tick" textAnchor="middle" x={x(tick)} y={height - 34}>
            {tick.toFixed(3)}
          </text>
          <text
            className="bass-chart-tick"
            dominantBaseline="middle"
            textAnchor="end"
            x={padding.left - 10}
            y={y(tick)}
          >
            {tick.toFixed(3)}
          </text>
        </g>
      ))}
      <line
        className="bass-perfect-prediction"
        x1={x(lower)}
        x2={x(upper)}
        y1={y(lower)}
        y2={y(upper)}
      />
      {records.map((record) => (
        <circle
          className="bass-scatter-point"
          cx={x(record.measuredFsrCmS)}
          cy={y(record.predictedFsrCmS)}
          key={record.observationId}
          r="4"
        >
          <title>
            {record.experimentId} / {record.observationId}: measured{" "}
            {record.measuredFsrCmS.toFixed(5)}, predicted{" "}
            {record.predictedFsrCmS.toFixed(5)} cm/s
          </title>
        </circle>
      ))}
      <line
        className="bass-chart-axis"
        x1={padding.left}
        x2={padding.left + plotWidth}
        y1={padding.top + plotHeight}
        y2={padding.top + plotHeight}
      />
      <line
        className="bass-chart-axis"
        x1={padding.left}
        x2={padding.left}
        y1={padding.top}
        y2={padding.top + plotHeight}
      />
      <text
        className="bass-chart-label"
        textAnchor="middle"
        x={padding.left + plotWidth / 2}
        y={height - 8}
      >
        Measured FSR (cm/s)
      </text>
      <text
        className="bass-chart-label"
        textAnchor="middle"
        transform={`translate(18 ${padding.top + plotHeight / 2}) rotate(-90)`}
      >
        Predicted FSR (cm/s)
      </text>
    </svg>
  );
}

function formatCondition(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isBassGrouping(value: string): value is BassGrouping {
  return groupOptions.some((option) => option.value === value);
}

function getApiError(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    const help =
      "help" in value && typeof value.help === "string" ? ` ${value.help}` : "";
    return `${value.error}${help}`;
  }
  return null;
}

function isBassComparisonResponse(
  value: unknown,
): value is BassComparisonResponse {
  if (typeof value !== "object" || value === null || !("metrics" in value)) {
    return false;
  }
  const metrics = value.metrics;
  return (
    "records" in value &&
    Array.isArray(value.records) &&
    "groups" in value &&
    Array.isArray(value.groups) &&
    typeof metrics === "object" &&
    metrics !== null &&
    "observationCount" in metrics &&
    typeof metrics.observationCount === "number" &&
    "experimentCount" in metrics &&
    typeof metrics.experimentCount === "number" &&
    "equalExperimentRmseCmS" in metrics &&
    typeof metrics.equalExperimentRmseCmS === "number" &&
    "rowWeightedRmseCmS" in metrics &&
    typeof metrics.rowWeightedRmseCmS === "number"
  );
}
