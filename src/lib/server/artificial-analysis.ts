import { env } from "$env/dynamic/private";
import type { ArtificialAnalysisModel, SourceStatus } from "$lib/types";

const ARTIFICIAL_ANALYSIS_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const CACHE_TTL = 12 * 60 * 60 * 1000;

interface ArtificialAnalysisResponse {
  data: ArtificialAnalysisModel[];
}

export interface ArtificialAnalysisResult {
  models: ArtificialAnalysisModel[];
  status: SourceStatus;
}

let cache: { key: string; data: ArtificialAnalysisResult; expiresAt: number } | null = null;
let pending: Promise<ArtificialAnalysisResult> | null = null;

function isValidModel(model: unknown): model is ArtificialAnalysisModel {
  if (!model || typeof model !== "object") return false;
  const candidate = model as Partial<ArtificialAnalysisModel>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.slug === "string" &&
    !!candidate.model_creator &&
    typeof candidate.model_creator.name === "string" &&
    !!candidate.evaluations &&
    typeof candidate.evaluations.artificial_analysis_intelligence_index === "number"
  );
}

async function requestModels(apiKey: string): Promise<ArtificialAnalysisResult> {
  try {
    const response = await fetch(ARTIFICIAL_ANALYSIS_URL, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Artificial Analysis returned ${response.status}`);

    const payload = (await response.json()) as ArtificialAnalysisResponse;
    if (!payload || !Array.isArray(payload.data)) {
      throw new Error("Artificial Analysis returned an invalid models payload");
    }

    const result: ArtificialAnalysisResult = {
      models: payload.data.filter(isValidModel),
      status: {
        state: "live",
        label: "Rankings live",
        detail: "Artificial Analysis benchmarks are up to date.",
      },
    };
    cache = { key: apiKey, data: result, expiresAt: Date.now() + CACHE_TTL };
    return result;
  } catch (error) {
    return {
      models: [],
      status: {
        state: "unavailable",
        label: "Rankings unavailable",
        detail: error instanceof Error ? error.message : "Unknown source error",
      },
    };
  }
}

export async function fetchArtificialAnalysisModels(force = false) {
  const apiKey = env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (!apiKey) {
    return {
      models: [],
      status: {
        state: "needs-key",
        label: "API key needed",
        detail: "Add ARTIFICIAL_ANALYSIS_API_KEY to rank models.",
      },
    } satisfies ArtificialAnalysisResult;
  }

  if (!force && cache?.key === apiKey && cache.expiresAt > Date.now()) return cache.data;
  if (!force && pending) return pending;

  pending = requestModels(apiKey);
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
