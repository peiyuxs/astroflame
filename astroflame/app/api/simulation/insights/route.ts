import { env } from "cloudflare:workers";
import {
  GEMINI_INSIGHT_RESPONSE_SCHEMA,
  parseGeminiResponse,
  validateSimulationInsightRequest,
} from "@/lib/simulation-insights";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_REQUEST_BYTES = 8_000;
const REQUEST_TIMEOUT_MS = 25_000;

const systemInstruction = [
  "You write brief, beginner-friendly learning notes about a completed microgravity flame-spread simulation.",
  "Use only the supplied JSON facts. Do not invent NASA findings, citations, physical mechanisms, or measurements.",
  "Do not recalculate or alter the simulator's numeric results. Clearly distinguish model output from experimental measurement.",
  "Offer one general, non-operational idea for future NASA-related research or classroom investigation, plus one neutral research question. Do not prescribe a spacecraft design, material choice, ventilation change, fire response, or safety action.",
  "State the evidence limitations supplied in the JSON. Do not claim that a modeled relationship proves causation.",
  "The output is educational context only, not fire-safety or mission-operational advice.",
].join(" ");

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: "The simulation summary is too large." },
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Send the completed simulation as JSON." },
      { status: 400 },
    );
  }

  const validated = validateSimulationInsightRequest(payload);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Gemini learning notes are not configured. Your simulation results are still available.",
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(validated.context) }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_INSIGHT_RESPONSE_SCHEMA,
          maxOutputTokens: 700,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    console.error("Simulation insights provider request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      timedOut,
    });
    return Response.json(
      {
        error: timedOut
          ? "Gemini took too long to respond. The simulation results are still available."
          : "Gemini is temporarily unavailable. The simulation results are still available.",
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    console.error("Simulation insights provider returned an error", {
      status: upstream.status,
    });
    return Response.json(
      {
        error:
          "Gemini could not generate learning notes right now. The simulation results are still available.",
      },
      { status: upstream.status === 429 ? 503 : 502 },
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await upstream.json();
  } catch {
    console.error("Simulation insights provider returned invalid JSON.");
    return Response.json(
      { error: "Gemini returned an unreadable response." },
      { status: 502 },
    );
  }

  const insight = parseGeminiResponse(responseBody);
  if (!insight) {
    console.error("Simulation insights provider returned an invalid response.");
    return Response.json(
      { error: "Gemini returned learning notes in an unexpected format." },
      { status: 502 },
    );
  }

  return Response.json(
    { provider: "Gemini", model: GEMINI_MODEL, insight },
    { headers: { "Cache-Control": "no-store" } },
  );
}