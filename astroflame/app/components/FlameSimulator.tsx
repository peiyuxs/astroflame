"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BASS_INPUT_RANGES,
  BASS_REFERENCE_THICKNESS_CM,
} from "@/lib/bass-model";
import {
  advanceSimulation,
  ASSUMED_SPREAD_MULTIPLIERS,
  CELL_SIZE_CM,
  createInitialSimulation,
  DEFAULT_IGNITION_POINT,
  EXTINCTION_OXYGEN_CUTOFFS_PCT,
  estimateMaterialFsrCmS,
  GRID_COLUMNS,
  GRID_ROWS,
  type IgnitionPoint,
  MATERIAL_PRESETS,
  SIBAL_REPORTED_RATES_CM_S,
  startSimulation,
  VISUALIZATION_ACCELERATION,
  type FlameCell,
  type FlameSimulationState,
  type MaterialId,
  type SimulationSettings,
  type SpreadPoint,
} from "@/lib/flame-simulation";

const CELL_PIXELS = 14;
const MAX_AIRFLOW_CM_S = 40;
const SIMULATION_WIDTH_CM = GRID_COLUMNS * CELL_SIZE_CM;
const SIMULATION_HEIGHT_CM = GRID_ROWS * CELL_SIZE_CM;

function formatClock(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const tenths = Math.floor((milliseconds % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${seconds}.${tenths}`;
}

function FireMap({
  cells,
  ignitionPoint,
  onSelectIgnition,
  selectable,
}: {
  cells: FlameCell[];
  ignitionPoint: IgnitionPoint;
  onSelectIgnition: (point: IgnitionPoint) => void;
  selectable: boolean;
}) {
  return (
    <figure
      className={`fire-map-figure${selectable ? " can-select-ignition" : ""}`}
    >
      <svg
        aria-label="Fuel map. Click a cell to choose the ignition point. Burned areas are black, unburned areas green, active flame red, and vulnerable areas yellow."
        className="fire-map"
        role="img"
        viewBox={`0 0 ${GRID_COLUMNS * CELL_PIXELS} ${GRID_ROWS * CELL_PIXELS}`}
      >
        {cells.map((cell) => (
          <rect
            className={`fire-cell fire-cell-${cell.state}`}
            height={CELL_PIXELS - 1}
            key={`${cell.x}-${cell.y}`}
            width={CELL_PIXELS - 1}
            x={cell.x * CELL_PIXELS}
            y={cell.y * CELL_PIXELS}
            onClick={() => {
              if (selectable) onSelectIgnition({ x: cell.x, y: cell.y });
            }}
          />
        ))}
        <circle
          aria-hidden="true"
          className="ignition-marker"
          cx={ignitionPoint.x * CELL_PIXELS + CELL_PIXELS / 2}
          cy={ignitionPoint.y * CELL_PIXELS + CELL_PIXELS / 2}
          r={CELL_PIXELS * 0.42}
        />
      </svg>
      <figcaption className="fire-map-caption">
        {selectable ? "Click a cell to place ignition" : "Ignition location"}{" "}
        · column {ignitionPoint.x + 1}, row {ignitionPoint.y + 1} ·{" "}
        {SIMULATION_WIDTH_CM.toFixed(1)} × {SIMULATION_HEIGHT_CM.toFixed(1)} cm
      </figcaption>
    </figure>
  );
}

function SpreadTimeChart({ points }: { points: SpreadPoint[] }) {
  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const width = 780;
    const height = 270;
    const left = 72;
    const right = 18;
    const top = 18;
    const bottom = 48;
    const maxTime = Math.max(1, points[points.length - 1].timeSeconds);
    const maxDistance = Math.max(
      SIMULATION_WIDTH_CM,
      ...points.map((point) => point.distanceCm),
    );
    const x = (timeSeconds: number) =>
      left + (timeSeconds / maxTime) * (width - left - right);
    const y = (distanceCm: number) =>
      top +
      ((maxDistance - distanceCm) / maxDistance) *
        (height - top - bottom);
    const path = points
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${x(point.timeSeconds).toFixed(2)},${y(point.distanceCm).toFixed(2)}`;
      })
      .join(" ");

    return { width, height, left, right, top, bottom, maxTime, maxDistance, path };
  }, [points]);

  if (!chart) return null;

  return (
    <figure className="spread-time-figure">
      <svg
        aria-label="Simulated flame-front distance over model time"
        className="spread-time-chart"
        role="img"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
      >
        <line
          className="chart-axis"
          x1={chart.left}
          x2={chart.width - chart.right}
          y1={chart.height - chart.bottom}
          y2={chart.height - chart.bottom}
        />
        <line
          className="chart-axis"
          x1={chart.left}
          x2={chart.left}
          y1={chart.top}
          y2={chart.height - chart.bottom}
        />
        <path className="spread-time-line" d={chart.path} />
        <text className="chart-label" x={chart.left} y={chart.top + 6}>
          {chart.maxDistance.toFixed(1)} cm
        </text>
        <text
          className="chart-label"
          x={chart.left}
          y={chart.height - 14}
        >
          0 s
        </text>
        <text
          className="chart-label"
          textAnchor="end"
          x={chart.width - chart.right}
          y={chart.height - 14}
        >
          {chart.maxTime.toFixed(0)} s
        </text>
        <text
          className="chart-label"
          textAnchor="middle"
          x={(chart.left + chart.width - chart.right) / 2}
          y={chart.height - 2}
        >
          Simulated time
        </text>
      </svg>
      <figcaption>
        Model-time axis; animation runs at {VISUALIZATION_ACCELERATION}× for
        demonstration.
      </figcaption>
    </figure>
  );
}

function getBurnedCount(cells: FlameCell[]) {
  return cells.filter((cell) => cell.state === "burned").length;
}

function getStatusLabel(simulation: FlameSimulationState) {
  switch (simulation.status) {
    case "running":
      return "Flame spreading";
    case "burned":
      return "Sample fully burned";
    case "extinguished":
      return "Self-extinguished";
    default:
      return "Ready";
  }
}

export default function FlameSimulator() {
  const [settings, setSettings] = useState<SimulationSettings>({
    materialId: "pmma",
    oxygenPct: 21,
    airflowCmS: 20,
  });
  const [ignitionPoint, setIgnitionPoint] =
    useState<IgnitionPoint>(DEFAULT_IGNITION_POINT);
  const [simulation, setSimulation] = useState(createInitialSimulation);
  const [elapsedRunMs, setElapsedRunMs] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<"map" | "chart">("map");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const runStartedAt = useRef<number | null>(null);
  const simulatorRef = useRef<HTMLDivElement>(null);
  const selectedMaterial =
    MATERIAL_PRESETS.find((material) => material.id === settings.materialId) ??
    MATERIAL_PRESETS[0];
  const predictedFsrCmS = estimateMaterialFsrCmS(settings);
  const burnedCount = getBurnedCount(simulation.cells);
  const progressPct =
    (burnedCount / (GRID_COLUMNS * GRID_ROWS)) * 100;
  const outsideValidatedRange =
    settings.oxygenPct < BASS_INPUT_RANGES.oxygenInitialPct.min ||
    settings.oxygenPct > BASS_INPUT_RANGES.oxygenInitialPct.max ||
    settings.airflowCmS < BASS_INPUT_RANGES.airflowCmS.min ||
    settings.airflowCmS > BASS_INPUT_RANGES.airflowCmS.max;
  const assumedMultiplier = ASSUMED_SPREAD_MULTIPLIERS[settings.materialId];
  const extinctionCutoff =
    EXTINCTION_OXYGEN_CUTOFFS_PCT[settings.materialId] ?? 0;
  const farthestMapDistanceCm =
    Math.max(
      Math.hypot(ignitionPoint.x, ignitionPoint.y),
      Math.hypot(GRID_COLUMNS - 1 - ignitionPoint.x, ignitionPoint.y),
      Math.hypot(ignitionPoint.x, GRID_ROWS - 1 - ignitionPoint.y),
      Math.hypot(
        GRID_COLUMNS - 1 - ignitionPoint.x,
        GRID_ROWS - 1 - ignitionPoint.y,
      ),
    ) * CELL_SIZE_CM;
  const estimatedModelTime =
    predictedFsrCmS > 0 ? farthestMapDistanceCm / predictedFsrCmS : null;

  useEffect(() => {
    if (simulation.status !== "running") {
      if (
        (simulation.status === "burned" ||
          simulation.status === "extinguished") &&
        runStartedAt.current !== null
      ) {
        setElapsedRunMs(Date.now() - runStartedAt.current);
        runStartedAt.current = null;
      } else if (simulation.status === "idle") {
        setElapsedRunMs(0);
      }
      return;
    }

    const startedAt = runStartedAt.current;
    const clock = window.setInterval(() => {
      if (startedAt !== null) setElapsedRunMs(Date.now() - startedAt);
    }, 100);
    const tickMs =
      predictedFsrCmS > 0
        ? Math.max(
            25,
            Math.min(
              750,
              ((CELL_SIZE_CM / predictedFsrCmS) * 1000) /
                VISUALIZATION_ACCELERATION,
            ),
          )
        : 25;
    const runner = window.setInterval(() => {
      setSimulation((current) =>
        advanceSimulation(current, settings, predictedFsrCmS),
      );
    }, tickMs);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(runner);
    };
  }, [predictedFsrCmS, settings, simulation.status]);

  useEffect(() => {
    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === simulatorRef.current);
    }

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  function updateSetting<Key extends keyof SimulationSettings>(
    key: Key,
    value: SimulationSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function run() {
    runStartedAt.current = Date.now();
    setElapsedRunMs(0);
    setSimulation(startSimulation(settings, predictedFsrCmS, ignitionPoint));
  }

  function reset() {
    runStartedAt.current = null;
    setElapsedRunMs(0);
    setSimulation(createInitialSimulation());
  }

  function chooseIgnitionPoint(point: IgnitionPoint) {
    if (simulation.status === "running") return;
    setIgnitionPoint(point);
    if (simulation.status !== "idle") reset();
  }

  async function toggleFullscreen() {
    const simulator = simulatorRef.current;
    if (!simulator) return;

    try {
      if (document.fullscreenElement === simulator) {
        await document.exitFullscreen();
      } else {
        await simulator.requestFullscreen();
      }
      setFullscreenError(null);
    } catch (error) {
      setFullscreenError(
        error instanceof Error
          ? error.message
          : "The browser could not change fullscreen mode.",
      );
    }
  }

  return (
    <div
      className={`microgravity-simulator${isFullscreen ? " is-fullscreen" : ""}`}
      ref={simulatorRef}
    >
      <header className="simulation-dashboard-header">
        <div className="simulation-heading">
          <p className="eyebrow">Microgravity · flame spread</p>
          <h2 id="simulation-title">Flame simulator</h2>
        </div>
        <div className="simulation-actions">
          <button
            aria-controls="simulation-settings"
            aria-expanded={settingsOpen}
            className="simulation-toolbar-button"
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
          >
            {settingsOpen ? "Hide settings" : "Settings"}
          </button>
          <button
            className="simulation-run-button"
            disabled={simulation.status === "running"}
            onClick={run}
            type="button"
          >
            {simulation.status === "running" ? "Running…" : "Run"}
          </button>
          <button
            className="simulation-toolbar-button"
            onClick={reset}
            type="button"
          >
            Reset
          </button>
          <button
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="simulation-toolbar-button"
            onClick={toggleFullscreen}
            type="button"
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>

      <div className="simulation-notice" role="note">
        Exploratory estimate only · not for fire-safety decisions
      </div>

      {fullscreenError && (
        <p className="fullscreen-error" role="alert">
          Fullscreen could not be changed: {fullscreenError}
        </p>
      )}

      <div
        className={`simulation-workbench${settingsOpen ? " with-settings" : ""}`}
      >
        <aside
          aria-label="Simulation settings"
          className="simulation-settings-panel"
          hidden={!settingsOpen}
          id="simulation-settings"
        >
            <div className="settings-panel-heading">
              <h3>Parameters</h3>
              <button
                aria-label="Close settings"
                className="settings-close-button"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="settings-panel-content">
              <label className="material-select" htmlFor="simulation-material">
                Material
                <select
                  disabled={simulation.status === "running"}
                  id="simulation-material"
                  onChange={(event) => {
                    const material = MATERIAL_PRESETS.find(
                      (preset) => preset.id === event.currentTarget.value,
                    );
                    if (material) updateSetting("materialId", material.id);
                  }}
                  value={settings.materialId}
                >
                  {MATERIAL_PRESETS.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="material-evidence">
                <strong>{selectedMaterial.composition}</strong>
                <span>{selectedMaterial.source}</span>
                <span>{selectedMaterial.evidence}</span>
                {settings.materialId === "sibal-fabric" && (
                  <span>
                    Reported rates:{" "}
                    {Math.min(...SIBAL_REPORTED_RATES_CM_S).toFixed(3)}–
                    {Math.max(...SIBAL_REPORTED_RATES_CM_S).toFixed(3)} cm/s
                  </span>
                )}
                {assumedMultiplier !== undefined && (
                  <span>
                    Placeholder multiplier: {assumedMultiplier.toFixed(2)}×
                  </span>
                )}
              </div>

              <label className="simulation-range" htmlFor="simulation-oxygen">
                <span>Oxygen</span>
                <output>{settings.oxygenPct}%</output>
                <div className="oxygen-slider-wrap">
                  <input
                    disabled={simulation.status === "running"}
                    id="simulation-oxygen"
                    max="100"
                    min="0"
                    onChange={(event) =>
                      updateSetting("oxygenPct", event.currentTarget.valueAsNumber)
                    }
                    step="1"
                    type="range"
                    value={settings.oxygenPct}
                  />
                  <span aria-hidden="true" className="earth-oxygen-marker">
                    <i />
                    <span>21% Earth</span>
                  </span>
                </div>
                <span className="range-endpoints">
                  <span>0%</span>
                  <span>100%</span>
                </span>
              </label>

              <label className="simulation-range" htmlFor="simulation-airflow">
                <span>Airflow</span>
                <output>{settings.airflowCmS.toFixed(1)} cm/s</output>
                <input
                  disabled={simulation.status === "running"}
                  id="simulation-airflow"
                  max={MAX_AIRFLOW_CM_S}
                  min="0"
                  onChange={(event) =>
                    updateSetting("airflowCmS", event.currentTarget.valueAsNumber)
                  }
                  step="0.5"
                  type="range"
                  value={settings.airflowCmS}
                />
                <span className="range-endpoints">
                  <span>0 cm/s</span>
                  <span>40 cm/s</span>
                </span>
              </label>

              <fieldset className="ignition-controls">
                <legend>Ignition point</legend>
                <p>Click the map or adjust the coordinates.</p>
                <label htmlFor="ignition-column">
                  Column <output>{ignitionPoint.x + 1}</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="ignition-column"
                    max={GRID_COLUMNS}
                    min="1"
                    onChange={(event) =>
                      chooseIgnitionPoint({
                        ...ignitionPoint,
                        x: event.currentTarget.valueAsNumber - 1,
                      })
                    }
                    type="range"
                    value={ignitionPoint.x + 1}
                  />
                </label>
                <label htmlFor="ignition-row">
                  Row <output>{ignitionPoint.y + 1}</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="ignition-row"
                    max={GRID_ROWS}
                    min="1"
                    onChange={(event) =>
                      chooseIgnitionPoint({
                        ...ignitionPoint,
                        y: event.currentTarget.valueAsNumber - 1,
                      })
                    }
                    type="range"
                    value={ignitionPoint.y + 1}
                  />
                </label>
              </fieldset>

              <div className="reference-conditions">
                <span>Reference thickness</span>
                <strong>{BASS_REFERENCE_THICKNESS_CM.toFixed(2)} cm</strong>
              </div>

              {outsideValidatedRange && (
                <p className="range-warning" role="alert">
                  Outside PMMA measured ranges: oxygen{" "}
                  {BASS_INPUT_RANGES.oxygenInitialPct.min}–
                  {BASS_INPUT_RANGES.oxygenInitialPct.max}%, airflow{" "}
                  {BASS_INPUT_RANGES.airflowCmS.min}–
                  {BASS_INPUT_RANGES.airflowCmS.max} cm/s. Extrapolated.
                </p>
              )}

              <p className="extinction-placeholder">
                Extinction cutoffs are unavailable. A run stops at 0% oxygen or
                when the estimated spread rate is not positive.
              </p>

              <details className="simulation-method">
                <summary>Model scope and sources</summary>
                <p>
                  PMMA uses the supplied BASS-II fit at fixed thickness; the
                  tested oxygen and airflow ranges are limited. SIBAL uses five
                  reported rates with transferred PMMA responses. Nomex and
                  Ultem use temporary multipliers. Results are not validated
                  material models.
                </p>
                <p>
                  <a
                    href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-26"
                    rel="noreferrer"
                    target="_blank"
                  >
                    NASA BASS (PSI-26)
                  </a>
                  {" · "}
                  <a
                    href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-100"
                    rel="noreferrer"
                    target="_blank"
                  >
                    NASA SAFFIRE-III (PSI-100)
                  </a>
                </p>
              </details>
            </div>
        </aside>

        <section aria-label="Simulation display" className="simulation-stage">
          <div className="simulation-stage-heading">
            <span
              className={`simulation-status simulation-status-${simulation.status}`}
              role="status"
            >
              {getStatusLabel(simulation)}
            </span>
            <span className="simulation-timer">
              Timer <strong>{formatClock(elapsedRunMs)}</strong>
            </span>
            <span className="simulation-fsr">
              Potential FSR <strong>{predictedFsrCmS.toFixed(4)} cm/s</strong>
            </span>
          </div>

          <div aria-label="Simulation views" className="simulation-view-tabs" role="tablist">
            <button
              aria-selected={activeView === "map"}
              aria-controls="simulation-stage-panel"
              className={activeView === "map" ? "active" : ""}
              id="simulation-map-tab"
              onClick={() => setActiveView("map")}
              role="tab"
              type="button"
            >
              Flame map
            </button>
            <button
              aria-selected={activeView === "chart"}
              aria-controls="simulation-stage-panel"
              className={activeView === "chart" ? "active" : ""}
              id="simulation-chart-tab"
              onClick={() => setActiveView("chart")}
              role="tab"
              type="button"
            >
              Spread vs. time
            </button>
            {estimatedModelTime !== null && (
              <span className="estimated-duration">
                Approx. far-edge time {estimatedModelTime.toFixed(0)} s
              </span>
            )}
          </div>

          <div
            aria-labelledby={`simulation-${activeView}-tab`}
            className="simulation-stage-content"
            id="simulation-stage-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {activeView === "map" ? (
              <div className="map-view">
                <div className="map-title-row">
                  <h3>Fuel surface</h3>
                  <p>
                    {simulation.endReason ??
                      "Ignition begins at the selected point."}
                  </p>
                </div>
                <FireMap
                  cells={simulation.cells}
                  ignitionPoint={ignitionPoint}
                  onSelectIgnition={chooseIgnitionPoint}
                  selectable={simulation.status !== "running"}
                />
                <div className="map-footer">
                  <div aria-label="Flame map legend" className="fire-legend">
                    <span><i className="legend-burned" /> Burned</span>
                    <span><i className="legend-unburned" /> Unburned</span>
                    <span><i className="legend-burning" /> Burning</span>
                    <span><i className="legend-vulnerable" /> Vulnerable</span>
                  </div>
                  <div className="progress-summary">
                    <div
                      aria-label={`Burned area ${Math.round(progressPct)} percent`}
                      className="burn-progress"
                      role="progressbar"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={Math.round(progressPct)}
                    >
                      <span style={{ width: `${progressPct}%` }} />
                    </div>
                    <span>{Math.round(progressPct)}% burned</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="chart-view">
                <div className="map-title-row">
                  <h3>Flame-front spread vs. time</h3>
                  <p>Distance from ignition point · model time</p>
                </div>
                {simulation.history.length > 0 ? (
                  <SpreadTimeChart points={simulation.history} />
                ) : (
                  <p className="spread-chart-empty">
                    Run the simulation to create a flame-spread timeline.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
