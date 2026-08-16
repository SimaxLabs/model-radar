import type { OpenRouterModel } from "$lib/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const CACHE_TTL = 60 * 60 * 1000;

interface OpenRouterResponse {
  data: OpenRouterModel[];
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

async function requestModels() {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Accept: "application/json",
      "X-OpenRouter-Title": "Model Radar",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  const payload = (await response.json()) as OpenRouterResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an invalid models payload");
  }

  const models = payload.data.filter(isValidModel).filter((model) => {
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
