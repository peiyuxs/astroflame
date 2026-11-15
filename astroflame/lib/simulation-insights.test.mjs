import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateFullSpreadTime,
  estimateOpposedFsrCmS,
  getScenarioGeometry,
} from "./flame-simulation.ts";
import {
  parseGeminiResponse,
  validateSimulationInsightRequest,
} from "./simulation-insights.ts";

const settings = {
  scenario: "bass",
  oxygenPct: 20.8,
  airflowCmS: 10,
  thicknessCm: 0.3,
  ribWidthCm: 0.5,
  concurrentMultiplier: 2.1,
};
const ignitionPoint = { x: 0, y: 11 };
const geometry = getScenarioGeometry(settings);
const fullSpreadTimeSeconds = estimateFullSpreadTime(
  ignitionPoint,
  geometry,
  estimateOpposedFsrCmS(settings),
  settings.concurrentMultiplier,
);

function createRequest(overrides = {}) {
  return {
    settings,
    ignitionPoint,
    result: {
      status: "burned",
      modelTimeSeconds: fullSpreadTimeSeconds,
      burnedAreaCm2: geometry.lengthCm * geometry.widthCm,
      instantaneousGrowthCm2S: 0.2,
      averageGrowthCm2S:
        (geometry.lengthCm * geometry.widthCm) / fullSpreadTimeSeconds,
    },
    ...overrides,
  };
}

test("validates a completed BASS run and derives trusted summary values", () => {
  const validation = validateSimulationInsightRequest(createRequest());

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.context.scenarioLabel, "BASS smooth-PMMA assumption");
  assert.equal(validation.context.burnedPercent, 100);
  assert.equal(
    validation.context.fullSpreadTimeSeconds,
    fullSpreadTimeSeconds,
  );
  assert.match(validation.context.evidenceNote, /18 experiment IDs/);
});

test("rejects out-of-range settings and mismatched completed results", () => {
  const outOfRange = validateSimulationInsightRequest(
    createRequest({
      settings: { ...settings, airflowCmS: 30 },
    }),
  );
  assert.equal(outOfRange.ok, false);

  const incompleteBurn = validateSimulationInsightRequest(
    createRequest({
      result: { ...createRequest().result, burnedAreaCm2: 1 },
    }),
  );
  assert.equal(incompleteBurn.ok, false);
});

test("parses structured Gemini notes and rejects unsafe response shapes", () => {
  const parsed = parseGeminiResponse({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                summary: "The model reached the full specimen boundary.",
                observations: ["This is a modeled result."],
                applicationIdea:
                  "Use this run to motivate a bounded laboratory comparison.",
                researchQuestion: "How would another airflow setting compare?",
                limitations: "This is not a fire-safety prediction.",
              }),
            },
          ],
        },
      },
    ],
  });

  assert.equal(
    parsed?.summary,
    "The model reached the full specimen boundary.",
  );
  assert.equal(
    parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "not JSON" }] } }],
    }),
    null,
  );
});