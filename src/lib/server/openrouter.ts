import type { OpenRouterModel } from "$lib/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const OPENROUTER_VIDEO_MODELS_URL = "https://openrouter.ai/api/v1/videos/models";
const CACHE_TTL = 60 * 60 * 1000;

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

interface OpenRouterVideoModel {
  id: string;
  pricing_skus: Record<string, string>;
}

interface OpenRouterVideoResponse {
  data: OpenRouterVideoModel[];
}

let cache: { data: OpenRouterModel[]; expiresAt: number } | null = null;
let pending: Promise<OpenRouterModel[]> | null = null;

function isValidModel(model: unknown): model is OpenRouterModel {
  if (!model || typeof model !== "object") return false;
  const candidate = model as Partial<OpenRouterModel>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.canonical_slug === "string" &&
    typeof candidate.context_length === "number" &&
    typeof candidate.created === "number" &&
    !!candidate.architecture &&
    Array.isArray(candidate.architecture.input_modalities) &&
    candidate.architecture.input_modalities.length > 0 &&
    candidate.architecture.input_modalities.every(
      (modality) => typeof modality === "string" && modality.length > 0,
    ) &&
    Array.isArray(candidate.architecture.output_modalities) &&
    candidate.architecture.output_modalities.length > 0 &&
    candidate.architecture.output_modalities.every(
      (modality) => typeof modality === "string" && modality.length > 0,
    ) &&
    !!candidate.pricing &&
    typeof candidate.pricing.prompt === "string" &&
    typeof candidate.pricing.completion === "string"
  );
}

function isValidVideoModel(model: unknown): model is OpenRouterVideoModel {
  if (!model || typeof model !== "object") return false;
  const candidate = model as Partial<OpenRouterVideoModel>;
  return (
    typeof candidate.id === "string" &&
    !!candidate.pricing_skus &&
    typeof candidate.pricing_skus === "object" &&
    Object.values(candidate.pricing_skus).every((price) => typeof price === "string")
  );
}

async function requestModels() {
  const options = {
    headers: {
      Accept: "application/json",
      "X-OpenRouter-Title": "Model Radar",
    },
    signal: AbortSignal.timeout(10_000),
  };
  const [response, videoResponse] = await Promise.all([
    fetch(OPENROUTER_MODELS_URL, options),
    fetch(OPENROUTER_VIDEO_MODELS_URL, options),
  ]);

  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  if (!videoResponse.ok) throw new Error(`OpenRouter video models returned ${videoResponse.status}`);
  const [payload, videoPayload] = (await Promise.all([
    response.json(),
    videoResponse.json(),
  ])) as [OpenRouterResponse, OpenRouterVideoResponse];
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an invalid models payload");
  }
  if (!videoPayload || !Array.isArray(videoPayload.data)) {
    throw new Error("OpenRouter returned an invalid video models payload");
  }

  const videoPricing = new Map(
    videoPayload.data
      .filter(isValidVideoModel)
      .map((model) => [model.id, model.pricing_skus]),
  );
  const models = payload.data.filter(isValidModel).map((model) => ({
    ...model,
    pricing_skus: videoPricing.get(model.id),
  })).filter((model) => {
    const inputPrice = Number(model.pricing.prompt);
    const outputPrice = Number(model.pricing.completion);
    const isFreeVariant = model.id.endsWith(":free");
    const isBatchVariant = model.id.endsWith(":batch");
    const isSpecializedOutput = model.architecture.output_modalities.some(
      (modality) => modality.toLowerCase() !== "text",
    );
    if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) return false;
    if (inputPrice < 0 || outputPrice < 0) return false;
    return (
      model.id !== "openrouter/free" &&
      ((isFreeVariant && !isSpecializedOutput && inputPrice === 0 && outputPrice === 0) ||
        (isBatchVariant && !isSpecializedOutput && inputPrice > 0 && outputPrice > 0) ||
        (!isFreeVariant && !isBatchVariant && isSpecializedOutput) ||
        (!isFreeVariant && !isBatchVariant && !isSpecializedOutput && inputPrice > 0 && outputPrice > 0))
    );
  });

  cache = { data: models, expiresAt: Date.now() + CACHE_TTL };
  return models;
}

export async function fetchOpenRouterModels(force = false) {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.data;
  if (!force && pending) return pending;

  pending = requestModels();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
