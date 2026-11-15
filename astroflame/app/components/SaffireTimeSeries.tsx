"use client";

import { useEffect, useMemo, useState } from "react";

type Measurement = {
  observed_at: string;
  value: number;
  unit: string | null;
  relative_seconds: number | null;
};

type SeriesResponse = {
  investigationId: string;
  channels: string[];
  channel: string | null;
  measurements: Measurement[];
  limit: number;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function TimeSeriesChart({ measurements }: { measurements: Measurement[] }) {
  const chart = useMemo(() => {
    if (measurements.length === 0) return null;

    const width = 900;
    const height = 300;
    const left = 74;
    const right = 18;
    const top = 20;
    const bottom = 54;
    const times = measurements.map((point) => new Date(point.observed_at).getTime());
    const values = measurements.map((point) => point.value);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valuePadding = (maxValue - minValue) * 0.08 || Math.abs(maxValue) * 0.08 || 1;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = (time: number) =>
      left + ((time - minTime) / (maxTime - minTime || 1)) * plotWidth;
    const y = (value: number) =>
      top + ((maxValue + valuePadding - value) / (maxValue - minValue + valuePadding * 2)) * plotHeight;
    const path = measurements
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${x(new Date(point.observed_at).getTime()).toFixed(2)},${y(point.value).toFixed(2)}`;
      })
      .join(" ");

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      path,
      firstTime: measurements[0].observed_at,
      lastTime: measurements[measurements.length - 1].observed_at,
      minValue: minValue - valuePadding,
      maxValue: maxValue + valuePadding,
      singlePoint: measurements.length === 1
        ? { x: x(times[0]), y: y(values[0]) }
        : null,
    };
  }, [measurements]);

  if (!chart) return null;
  const unit = measurements[0]?.unit;

  return (
    <figure className="timeseries-chart">
      <svg
        aria-label={`SAFFIRE telemetry over time, ${measurements.length} readings`}
        className="chart-svg"
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
        <text className="chart-label" x={chart.left - 8} y={chart.top + 5} textAnchor="end">
          {chart.maxValue.toPrecision(4)}{unit ? ` ${unit}` : ""}
        </text>
        <text
          className="chart-label"
          x={chart.left - 8}
          y={chart.height - chart.bottom}
          textAnchor="end"
        >
          {chart.minValue.toPrecision(4)}{unit ? ` ${unit}` : ""}
        </text>
        <path className="timeseries-line" d={chart.path} />
        {chart.singlePoint && (
          <circle className="chart-point" cx={chart.singlePoint.x} cy={chart.singlePoint.y} r="5" />
        )}
        <text className="chart-label" x={chart.left} y={chart.height - 18}>
          {formatTime(chart.firstTime)}
        </text>
        <text
          className="chart-label"
          textAnchor="end"
          x={chart.width - chart.right}
          y={chart.height - 18}
        >
          {formatTime(chart.lastTime)}
        </text>
      </svg>
      <figcaption>
        Showing {measurements.length} most recent available readings in time order.
      </figcaption>
    </figure>
  );
}

export default function SaffireTimeSeries() {
  const [channel, setChannel] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSeries() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ limit: "500" });
        if (channel) query.set("channel", channel);
        const response = await fetch(
          `/api/investigations/PSI-100/timeseries?${query}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as SeriesResponse | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : `The SAFFIRE API returned HTTP ${response.status}.`,
          );
        }

        const data = result as SeriesResponse;
        setSeries(data);
        if (channel === null && data.channel !== null) {
          setChannel(data.channel);
        }
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load SAFFIRE telemetry.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSeries();
    return () => controller.abort();
  }, [channel]);

  return (
    <div className="saffire-panel">
      <p className="eyebrow">SAFFIRE-III · PSI-100</p>
      <h3>Telemetry time series</h3>
      <p>
        This chart reads imported sensor measurements from TigerData. It does
        not substitute BASS estimates for missing SAFFIRE measurements.
      </p>

      {series?.channels.length ? (
        <label className="channel-control" htmlFor="saffire-channel">
          Sensor channel
          <select
            id="saffire-channel"
            onChange={(event) => setChannel(event.currentTarget.value)}
            value={channel ?? series.channel ?? ""}
          >
            {series.channels.map((availableChannel) => (
              <option key={availableChannel} value={availableChannel}>
                {availableChannel}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {loading && <p role="status">Loading SAFFIRE readings from TigerData…</p>}
      {error && (
        <p className="data-message data-error" role="alert">
          Could not load SAFFIRE data: {error}
        </p>
      )}
      {!loading && !error && series && series.measurements.length === 0 && (
        <p className="data-message" role="status">
          No SAFFIRE measurements are available in TigerData yet. After valid
          PSI-100 data is imported, choose a sensor channel here to see its
          timeline. No values are being fabricated.
        </p>
      )}
      {!loading && !error && series && series.measurements.length > 0 && (
        <TimeSeriesChart measurements={series.measurements} />
      )}
    </div>
  );
}
