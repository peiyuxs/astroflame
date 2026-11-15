"use client";

import type { SimulationInsight } from "@/lib/simulation-insights";

type InsightStatus = "idle" | "loading" | "ready" | "error";

type SimulationInsightsProps = {
  status: InsightStatus;
  insight: SimulationInsight | null;
  error: string | null;
};

export default function SimulationInsights({
  status,
  insight,
  error,
}: SimulationInsightsProps) {
  return (
    <section
      aria-labelledby="simulation-insights-title"
      className={`simulation-insights simulation-insights-${status}`}
    >
      <header className="simulation-insights-header">
        <div>
          <h3 id="simulation-insights-title">AI learning notes</h3>
          <p>Gemini-generated · educational context, not safety advice</p>
        </div>
        <span aria-live="polite" className="simulation-insights-status">
          {status === "loading"
            ? "Writing notes…"
            : status === "ready"
              ? "Ready"
              : status === "error"
                ? "Unavailable"
                : "After each run"}
        </span>
      </header>

      {status === "idle" && (
        <p className="simulation-insights-message">
          Run a simulation to get a short summary, observations, and a
          non-operational research idea.
        </p>
      )}
      {status === "loading" && (
        <p aria-live="polite" className="simulation-insights-message">
          Your simulation is complete. Gemini is preparing learning notes;
          your model results are already available.
        </p>
      )}
      {status === "error" && (
        <p className="simulation-insights-message" role="status">
          {error ?? "Learning notes could not be generated."} You can still use
          the simulation results above.
        </p>
      )}
      {status === "ready" && insight && (
        <div className="simulation-insights-content">
          <p className="simulation-insight-summary">{insight.summary}</p>
          <div>
            <h4>What to notice</h4>
            <ul>
              {insight.observations.map((observation, index) => (
                <li key={`${index}-${observation}`}>{observation}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Possible research application</h4>
            <p>{insight.applicationIdea}</p>
          </div>
          <div>
            <h4>Research question</h4>
            <p>{insight.researchQuestion}</p>
          </div>
          <div>
            <h4>Evidence limits</h4>
            <p>{insight.limitations}</p>
          </div>
        </div>
      )}
    </section>
  );
}