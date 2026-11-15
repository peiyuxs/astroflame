"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BASS_INPUT_RANGES } from "@/lib/bass-model";
import {
  advanceSimulation,
  CONCURRENT_MULTIPLIER_RANGE,
  createInitialSimulation,
  DEFAULT_CONCURRENT_MULTIPLIER,
  DEFAULT_IGNITION_POINT,
  estimateOpposedFsrCmS,
  estimateFullSpreadTime,
  getDefaultIgnitionPoint,
  getAverageAreaGrowthCm2S,
  getDirectionalRates,
  getScenarioGeometry,
  getSaffireRibWidthRange,
  GRID_COLUMNS,
  type FlameCell,
  type FlameSimulationState,
  type IgnitionPoint,
  type ScenarioId,
  type SimulationSettings,
  startSimulation,
  VISUALIZATION_ACCELERATION,
} from "@/lib/flame-simulation";

const CELL_PIXELS = 10;

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return `${seconds.toFixed(1)} s (${(seconds / 60).toFixed(2)} min)`;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds - minutes * 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function getBurnedArea(simulation: FlameSimulationState) {
  return simulation.history.at(-1)?.burnedAreaCm2 ?? 0;
}

function getBurnedPercent(simulation: FlameSimulationState) {
  return simulation.history.at(-1)?.burnedPct ?? 0;
}

function FireMap({
  cells,
  ignitionPoint,
  geometry,
  onSelectIgnition,
  selectable,
}: {
  cells: FlameCell[];
  ignitionPoint: IgnitionPoint;
  geometry: ReturnType<typeof getScenarioGeometry>;
  onSelectIgnition: (point: IgnitionPoint) => void;
  selectable: boolean;
}) {
  const gridWidth = GRID_COLUMNS * CELL_PIXELS;
  const gridHeight = geometry.gridRows * CELL_PIXELS;
  const gridLines = [
    ...Array.from(
      { length: GRID_COLUMNS + 1 },
      (_, column) => `M${column * CELL_PIXELS} 0V${gridHeight}`,
    ),
    ...Array.from(
      { length: geometry.gridRows + 1 },
      (_, row) => `M0 ${row * CELL_PIXELS}H${gridWidth}`,
    ),
  ].join("");

  return (
    <figure className={`fire-map-figure${selectable ? " can-select-ignition" : ""}`}>
      <svg
        aria-label={`Fuel surface, ${geometry.lengthCm} by ${geometry.widthCm} centimeters. Click a cell to choose ignition.`}
        className="fire-map"
        role="img"
        style={{ aspectRatio: `${geometry.lengthCm} / ${geometry.widthCm}` }}
        viewBox={`0 0 ${GRID_COLUMNS * CELL_PIXELS} ${geometry.gridRows * CELL_PIXELS}`}
      >
        {cells.map((cell) => (
          <rect
            className={`fire-cell fire-cell-${cell.state}`}
            height={CELL_PIXELS}
            key={`${cell.x}-${cell.y}`}
            width={CELL_PIXELS}
            x={cell.x * CELL_PIXELS}
            y={cell.y * CELL_PIXELS}
            onClick={() => {
              if (selectable) onSelectIgnition({ x: cell.x, y: cell.y });
            }}
          />
        ))}
        <path className="fire-grid-lines" d={gridLines} />
        <circle
          aria-hidden="true"
          className="ignition-marker"
          cx={ignitionPoint.x * CELL_PIXELS + CELL_PIXELS / 2}
          cy={ignitionPoint.y * CELL_PIXELS + CELL_PIXELS / 2}
          r={CELL_PIXELS * 0.42}
        />
      </svg>
      <figcaption className="fire-map-caption">
        {selectable ? "Click a cell to place ignition" : "Ignition location"} ·{" "}
        {geometry.lengthCm} × {geometry.widthCm} cm
      </figcaption>
    </figure>
  );
}

function SpreadGrowthChart({ points }: { points: FlameSimulationState["history"] }) {
  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const width = 780;
    const height = 270;
    const left = 72;
    const right = 66;
    const top = 18;
    const bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxTime = Math.max(1, points[points.length - 1].timeSeconds);
    const maxGrowth = Math.max(
      0.001,
      ...points.map((point) => point.areaGrowthCm2S),
    );
    const x = (time: number) => left + (time / maxTime) * plotWidth;
    const growthY = (value: number) =>
      top + (1 - value / maxGrowth) * plotHeight;
    const percentY = (value: number) =>
      top + (1 - value / 100) * plotHeight;
    const growthPath = points
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${x(point.timeSeconds).toFixed(2)},${growthY(point.areaGrowthCm2S).toFixed(2)}`;
      })
      .join(" ");
    const percentPath = points
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${x(point.timeSeconds).toFixed(2)},${percentY(point.burnedPct).toFixed(2)}`;
      })
      .join(" ");
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      maxTime,
      maxGrowth,
      growthPath,
      percentPath,
    };
  }, [points]);

  if (!chart) return null;
  return (
    <figure className="spread-time-figure">
      <svg
        aria-label="Instantaneous burned-area growth rate and burned surface percentage over simulated time"
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
        <line
          className="chart-axis"
          x1={chart.width - chart.right}
          x2={chart.width - chart.right}
          y1={chart.top}
          y2={chart.height - chart.bottom}
        />
        <path className="spread-time-line" d={chart.growthPath} />
        <path className="burn-percent-line" d={chart.percentPath} />
        <text className="chart-label" x={chart.left} y={chart.top + 6}>
          {chart.maxGrowth.toFixed(3)} cm²/s
        </text>
        <text
          className="chart-label"
          textAnchor="end"
          x={chart.width - chart.right}
          y={chart.top + 6}
        >
          100%
        </text>
        <text className="chart-label" x={chart.left} y={chart.height - 14}>
          0 s
        </text>
        <text
          className="chart-label"
          textAnchor="end"
          x={chart.width - chart.right}
          y={chart.height - 14}
        >
          {chart.maxTime.toFixed(1)} s
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
      <figcaption className="chart-legend">
        <span><i className="growth-legend-mark" /> Instantaneous area growth (left axis)</span>
        <span><i className="percent-legend-mark" /> Surface burned (right axis)</span>
      </figcaption>
    </figure>
  );
}

function getStatusLabel(simulation: FlameSimulationState) {
  switch (simulation.status) {
    case "running":
      return "Flame spreading";
    case "burned":
      return "Full surface spread";
    case "extinguished":
      return "Extinguished";
    default:
      return "Ready";
  }
}

export default function FlameSimulator() {
  const [settings, setSettings] = useState<SimulationSettings>({
    scenario: "bass",
    oxygenPct: 20.8,
    airflowCmS: 10,
    thicknessCm: 0.3,
    ribWidthCm: 0.5,
    concurrentMultiplier: DEFAULT_CONCURRENT_MULTIPLIER,
  });
  const [ignitionPoint, setIgnitionPoint] =
    useState<IgnitionPoint>(DEFAULT_IGNITION_POINT);
  const [simulation, setSimulation] = useState(() =>
    createInitialSimulation(settings),
  );
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const simulatorRef = useRef<HTMLDivElement>(null);
  const hasAutoCollapsedControls = useRef(false);
  const opposedFsrCmS = estimateOpposedFsrCmS(settings);
  const directionalRates = getDirectionalRates(
    opposedFsrCmS,
    settings.concurrentMultiplier,
  );
  const geometry = getScenarioGeometry(settings);
  const estimatedFullSpreadTime =
    simulation.status === "idle" || simulation.status === "extinguished"
      ? estimateFullSpreadTime(
          ignitionPoint,
          geometry,
          opposedFsrCmS,
          settings.concurrentMultiplier,
        )
      : simulation.fullSpreadTimeSeconds;
  const burnedPercent = getBurnedPercent(simulation);
  const burnedAreaCm2 = getBurnedArea(simulation);
  const instantaneousGrowth =
    simulation.history.at(-1)?.areaGrowthCm2S ?? 0;
  const averageGrowth = getAverageAreaGrowthCm2S(simulation);
  const ribWidthRange =
    settings.scenario === "saffire-5"
      ? getSaffireRibWidthRange(settings.airflowCmS)
      : null;

  useEffect(() => {
    if (simulation.status !== "running") return;
    const timeStep =
      simulation.timeStepSeconds /
      VISUALIZATION_ACCELERATION;
    const intervalMs = Math.max(25, Math.min(750, timeStep * 1000));
    const runner = window.setInterval(() => {
      setSimulation((current) => advanceSimulation(current, settings));
    }, intervalMs);
    return () => window.clearInterval(runner);
  }, [settings, simulation.status, simulation.timeStepSeconds]);

  useEffect(() => {
    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === simulatorRef.current);
    }
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    const simulator = simulatorRef.current;
    if (!simulator || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          entry.intersectionRatio >= 0.5 &&
          !hasAutoCollapsedControls.current
        ) {
          hasAutoCollapsedControls.current = true;
          setSettingsOpen(false);
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(simulator);
    return () => observer.disconnect();
  }, []);

  function updateSetting<Key extends keyof SimulationSettings>(
    key: Key,
    value: SimulationSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSimulation(createInitialSimulation(settings));
  }

  function changeScenario(scenario: ScenarioId) {
    const scenarioSettings = {
      ...settings,
      scenario,
      airflowCmS: scenario === "bass" ? 10 : 20,
      oxygenPct: scenario === "bass" ? 20.8 : 26.9,
      thicknessCm: scenario === "bass" ? 0.3 : 1,
      ribWidthCm: scenario === "bass" ? 0.5 : 0.1,
    };
    setSettings(scenarioSettings);
    setIgnitionPoint(getDefaultIgnitionPoint(scenario));
    setSimulation(createInitialSimulation(scenarioSettings));
  }

  function run() {
    setSimulation(startSimulation(settings, ignitionPoint));
  }

  function reset() {
    setSimulation(createInitialSimulation(settings));
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
          <h2 id="simulation-title">Microgravity flame spread simulator</h2>
        </div>
        <div className="simulation-actions">
          <button
            aria-controls="simulation-settings"
            aria-expanded={settingsOpen}
            className="simulation-toolbar-button"
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
          >
            {settingsOpen ? "Hide controls" : "Test controls"}
          </button>
          <button
            className="simulation-run-button"
            disabled={simulation.status === "running"}
            onClick={run}
            type="button"
          >
            {simulation.status === "running" ? (
              "Running…"
            ) : (
              <>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run
              </>
            )}
          </button>
          <button
            className="simulation-toolbar-button simulation-reset-button"
            onClick={reset}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M20 7v5h-5M20 12a8 8 0 1 1-2.34-5.66L20 9" />
            </svg>
            <span>Reset</span>
          </button>
          <button
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="simulation-toolbar-button fullscreen-icon-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              {isFullscreen ? (
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              ) : (
                <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <p className="range-warning simulation-warning" role="alert">
        <strong>Experimental-range warning:</strong> Predictions near or outside
        the validated experimental dataset range are physically uncertain.
        Controls are constrained to the source data; intermediate settings are
        interpolations, not new measurements.
      </p>

      {fullscreenError && (
        <p className="fullscreen-error" role="alert">
          Fullscreen could not be changed: {fullscreenError}
        </p>
      )}

      <div
        className={`simulation-workbench${settingsOpen ? " with-settings" : " collapsed-settings"}`}
      >
        <aside
          aria-label="Simulation settings"
          className="simulation-settings-panel"
          aria-hidden={!settingsOpen}
          inert={!settingsOpen}
          id="simulation-settings"
        >
          <div className="settings-panel-inner">
            <div className="settings-panel-heading">
              <h3>Test controls</h3>
              <button
                aria-label="Collapse test controls"
                className="settings-panel-toggle"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                ‹
              </button>
            </div>
            <div className="settings-panel-content">
            <label className="material-select" htmlFor="simulation-scenario">
              Test / scenario
              <select
                disabled={simulation.status === "running"}
                id="simulation-scenario"
                onChange={(event) =>
                  changeScenario(
                    event.currentTarget.value === "saffire-5"
                      ? "saffire-5"
                      : "bass",
                  )
                }
                value={settings.scenario}
              >
                <option value="bass">BASS — smooth PMMA</option>
                <option value="saffire-5">SAFFIRE-5 — ribbed PMMA</option>
              </select>
            </label>

            {settings.scenario === "bass" ? (
              <>
                <p className="scenario-assumption">
                  Assumption: BASS sample geometry is modeled as smooth PMMA
                  for this simulation.
                </p>
                <label className="simulation-range" htmlFor="simulation-airflow">
                  <span>Airflow / oxygen velocity</span>
                  <output>{settings.airflowCmS.toFixed(0)} cm/s</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="simulation-airflow"
                    max={BASS_INPUT_RANGES.airflowCmS.max}
                    min={BASS_INPUT_RANGES.airflowCmS.min}
                    onChange={(event) =>
                      updateSetting("airflowCmS", event.currentTarget.valueAsNumber)
                    }
                    step="1"
                    type="range"
                    value={settings.airflowCmS}
                  />
                  <span className="range-endpoints">
                    <span>{BASS_INPUT_RANGES.airflowCmS.min} cm/s</span>
                    <span>{BASS_INPUT_RANGES.airflowCmS.max} cm/s</span>
                  </span>
                </label>
                <label className="simulation-range" htmlFor="simulation-oxygen">
                  <span>Oxygen content</span>
                  <output>{settings.oxygenPct.toFixed(1)}%</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="simulation-oxygen"
                    max={BASS_INPUT_RANGES.oxygenInitialPct.max}
                    min={BASS_INPUT_RANGES.oxygenInitialPct.min}
                    onChange={(event) =>
                      updateSetting("oxygenPct", event.currentTarget.valueAsNumber)
                    }
                    step="0.1"
                    type="range"
                    value={settings.oxygenPct}
                  />
                  <span className="range-endpoints">
                    <span>{BASS_INPUT_RANGES.oxygenInitialPct.min}%</span>
                    <span>{BASS_INPUT_RANGES.oxygenInitialPct.max}%</span>
                  </span>
                </label>
                <label className="simulation-range" htmlFor="simulation-thickness">
                  <span>Fuel block thickness</span>
                  <output>{settings.thicknessCm.toFixed(1)} cm</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="simulation-thickness"
                    max={BASS_INPUT_RANGES.thicknessCm.max}
                    min={BASS_INPUT_RANGES.thicknessCm.min}
                    onChange={(event) =>
                      updateSetting("thicknessCm", event.currentTarget.valueAsNumber)
                    }
                    step="0.1"
                    type="range"
                    value={settings.thicknessCm}
                  />
                  <span className="range-endpoints">
                    <span>{BASS_INPUT_RANGES.thicknessCm.min} cm</span>
                    <span>{BASS_INPUT_RANGES.thicknessCm.max} cm</span>
                  </span>
                </label>
              </>
            ) : (
              <>
                <label className="material-select" htmlFor="simulation-airflow">
                  Airflow velocity
                  <select
                    disabled={simulation.status === "running"}
                    id="simulation-airflow"
                    onChange={(event) => {
                      const airflow = Number(event.currentTarget.value);
                      const nextSettings = {
                        ...settings,
                        airflowCmS: airflow,
                        ribWidthCm: airflow === 5 ? 0.2 : 0.1,
                      };
                      setSettings(nextSettings);
                      setSimulation(createInitialSimulation(nextSettings));
                    }}
                    value={settings.airflowCmS}
                  >
                    <option value={5}>5 cm/s</option>
                    <option value={20}>20 cm/s</option>
                  </select>
                </label>
                <label className="simulation-range" htmlFor="simulation-rib-width">
                  <span>Rib width</span>
                  <output>{settings.ribWidthCm.toFixed(1)} cm</output>
                  <input
                    disabled={simulation.status === "running"}
                    id="simulation-rib-width"
                    max={ribWidthRange?.max}
                    min={ribWidthRange?.min}
                    onChange={(event) =>
                      updateSetting("ribWidthCm", event.currentTarget.valueAsNumber)
                    }
                    step={ribWidthRange?.step}
                    type="range"
                    value={settings.ribWidthCm}
                  />
                  <span className="range-endpoints">
                    <span>{ribWidthRange?.min.toFixed(1)} cm</span>
                    <span>{ribWidthRange?.max.toFixed(1)} cm</span>
                  </span>
                </label>
                <div className="material-evidence">
                  <strong>3 cm rib height · 1 cm base thickness</strong>
                  <span>40 × 20 cm specimen · 800 cm² planform</span>
                  <span>26.9% oxygen · 76.1 kPa reported pressure</span>
                  <span>
                    FSR values are approximate plot digitizations from one burn;
                    widths are interpolated between observations.
                  </span>
                </div>
              </>
            )}

            <label
              className="simulation-range"
              htmlFor="simulation-concurrent-multiplier"
              title="Concurrent-to-opposed spread multiplier."
            >
              <span>
                Concurrent multiplier <abbr title="Concurrent-to-opposed spread ratio">k</abbr>
              </span>
              <output>{settings.concurrentMultiplier.toFixed(1)}×</output>
              <input
                disabled={simulation.status === "running"}
                id="simulation-concurrent-multiplier"
                max={CONCURRENT_MULTIPLIER_RANGE.max}
                min={CONCURRENT_MULTIPLIER_RANGE.min}
                onChange={(event) =>
                  updateSetting(
                    "concurrentMultiplier",
                    event.currentTarget.valueAsNumber,
                  )
                }
                step={CONCURRENT_MULTIPLIER_RANGE.step}
                title="Concurrent-to-opposed spread multiplier. See the Physics, data limits, and references section."
                type="range"
                value={settings.concurrentMultiplier}
              />
              <span className="range-endpoints">
                <span>0.5× low-flow exploration</span>
                <span>4.0×</span>
              </span>
              <small>
                Default 2.1; recommended 1.5–4.0. 0.5 is available for
                low-flow oxygen-shadow exploration. See the Physics, data
                limits, and references section for sources.
              </small>
            </label>

            <fieldset className="ignition-controls">
              <legend>Ignition point</legend>
              <p>Click a cell on the map or adjust the coordinates.</p>
              <label htmlFor="ignition-column">
                Column {ignitionPoint.x + 1}
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
                Row {ignitionPoint.y + 1}
                <input
                  disabled={simulation.status === "running"}
                  id="ignition-row"
                  max={geometry.gridRows}
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
              <strong>Experiment metadata</strong>
              {settings.scenario === "bass" ? (
                <>
                  <span>Material / flow: PMMA flat slab / opposed flow</span>
                  <span>Surface geometry shown: 10 × 2.2 cm (assumed length)</span>
                  <span>Reported BASS widths: 1.2 or 2.2 cm</span>
                  <span>
                    Thickness: {settings.thicknessCm.toFixed(1)} cm · pressure
                    not reported
                  </span>
                  <span>
                    Planform: {geometry.lengthCm * geometry.widthCm} cm² ·
                    airflow {settings.airflowCmS} cm/s · oxygen{" "}
                    {settings.oxygenPct.toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <span>Material / flow: structured ribbed PMMA / opposed flow</span>
                  <span>Surface geometry: 40 × 20 cm · thickness 1 cm</span>
                  <span>Rib height 3 cm · width {settings.ribWidthCm.toFixed(1)} cm</span>
                  <span>Pressure 76.1 kPa · oxygen 26.9%</span>
                  <span>Planform: 800 cm² · airflow {settings.airflowCmS} cm/s</span>
                </>
              )}
            </div>

            <details className="simulation-method">
              <summary>Physics, data limits, and references</summary>
              <p>
                The BASS regression is an opposed-flow rate: it advances against
                the airflow vector, not uniformly in all directions. Lateral
                rate is 0.85× opposed rate; concurrent rate is k× opposed rate.
                The angular front interpolates smoothly between these rates.
                Negative regression outputs are clamped to 0 cm/s.
              </p>
              <p>
                BASS airflow and thickness slider bounds are 2–21 cm/s and
                0.1–0.5 cm; oxygen is 17.9–22.2%. SAFFIRE-5 uses only 5 or
                20 cm/s, 0.1–1.0 cm ribs where observed, fixed 1 cm thickness,
                and fixed 26.9% oxygen. Its digitized observations represent
                one experiment and are not independent validation.
              </p>
              <p>
                The BASS airflow-inclusive regression is the comparison model
                used for the required airflow control. It had slightly higher
                grouped validation error than the thickness-plus-oxygen
                equation in the reference analysis.
              </p>
              <p>
                Airflow and concurrent spread point right (downstream); opposed
                spread points left, against the incoming airflow. Lateral spread
                is cross-flow.
              </p>
              <p>
                Olson &amp; Ferkul (NASA Glenn Research Center, BASS-II / POIWG)
                reported 2.55 mm/s concurrent versus 1.21 mm/s opposed spread at
                about 10 cm/s forced flow (k ≈ 2.11), with concurrent spread
                increasing with flow speed. Olson et al., <cite>Microgravity
                Flame Spread in Exploration Atmospheres</cite> (NASA), reports
                concurrent/opposed correlations across 5–20 cm/s ventilation
                speeds and oxygen concentrations.
              </p>
            </details>
            </div>
          </div>
        </aside>
        {!settingsOpen && (
          <button
            aria-controls="simulation-settings"
            aria-expanded={false}
            aria-label="Show test controls"
            className="settings-peek-button"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}

        <section aria-label="Simulation display" className="simulation-stage">
          <div className="simulation-stage-heading">
            <span className={`simulation-status simulation-status-${simulation.status}`} role="status">
              {getStatusLabel(simulation)}
            </span>
            <span className="simulation-fsr">
              Opposed FSR <strong>{opposedFsrCmS.toFixed(4)} cm/s</strong>
            </span>
            <span className="simulation-timer" aria-label="Model time elapsed">
              Model time <strong>{formatClock(simulation.simulatedSeconds)}</strong>
            </span>
            <span className="simulation-fsr">
              {simulation.status === "burned"
                ? "Total simulated spread time"
                : "Estimated full-spread time"}{" "}
              <strong>
                {formatDuration(
                  simulation.status === "burned"
                    ? simulation.simulatedSeconds
                    : estimatedFullSpreadTime,
                )}
              </strong>
            </span>
          </div>

          <div className="directional-rate-summary" aria-label="Directional front velocities">
            <span>Opposed <strong>{directionalRates.opposedCmS.toFixed(4)} cm/s</strong></span>
            <span>Lateral <strong>{directionalRates.lateralCmS.toFixed(4)} cm/s</strong></span>
            <span>Concurrent <strong>{directionalRates.concurrentCmS.toFixed(4)} cm/s</strong></span>
          </div>

          <div className="simulation-metrics">
            <div>
              <span>Surface burned</span>
              <strong>{burnedPercent.toFixed(1)}% · {burnedAreaCm2.toFixed(2)} cm²</strong>
            </div>
            <div>
              <span>Instantaneous dA/dt</span>
              <strong>{instantaneousGrowth.toFixed(4)} cm²/s</strong>
            </div>
            <div>
              <span>Average dA/dt</span>
              <strong>{averageGrowth.toFixed(4)} cm²/s</strong>
            </div>
          </div>

          <div className="simulation-stage-content">
            <div className="map-view">
              <div className="map-title-row">
                <h3>Fuel surface · {geometry.lengthCm} × {geometry.widthCm} cm</h3>
                <p>Airflow → right; opposed spread ← left</p>
              </div>
              <FireMap
                cells={simulation.cells}
                geometry={geometry}
                ignitionPoint={ignitionPoint}
                onSelectIgnition={chooseIgnitionPoint}
                selectable={simulation.status !== "running"}
              />
              <div className="fire-legend" aria-label="Flame map legend">
                <span><i className="legend-burned" /> Burned</span>
                <span><i className="legend-unburned" /> Unburned</span>
                <span><i className="legend-burning" /> Active front</span>
              </div>
            </div>
            <div className="chart-view">
              <div className="map-title-row">
                <h3>Fire growth over model time</h3>
                <p>Area-growth rate and percentage burned</p>
              </div>
              {simulation.history.length > 1 ? (
                <SpreadGrowthChart points={simulation.history} />
              ) : (
                <p className="spread-chart-empty">
                  Run the simulation to plot fire growth over time.
                </p>
              )}
            </div>
          </div>
          <p className="simulation-acceleration-note">
            Animation runs at {VISUALIZATION_ACCELERATION}×; all reported times
            and growth rates use simulated seconds.
          </p>
        </section>
      </div>
    </div>
  );
}
