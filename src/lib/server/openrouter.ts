import type { OpenRouterImagePrice, OpenRouterModel } from "$lib/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const OPENROUTER_VIDEO_MODELS_URL = "https://openrouter.ai/api/v1/videos/models";
const OPENROUTER_IMAGE_MODELS_URL = "https://openrouter.ai/api/v1/images/models";
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

interface OpenRouterImageModel {
  id: string;
  endpoints: string;
}

interface OpenRouterImageResponse {
  data: OpenRouterImageModel[];
}

interface PricingResult<T> {
  pricing: Map<string, T>;
  complete: boolean;
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
    !Array.isArray(candidate.pricing_skus) &&
    Object.values(candidate.pricing_skus).every((price) => typeof price === "string")
  );
}

function isValidImageModel(model: unknown): model is OpenRouterImageModel {
  if (!model || typeof model !== "object") return false;
  const candidate = model as Partial<OpenRouterImageModel>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.endpoints === "string" &&
    candidate.endpoints.startsWith("/api/v1/images/models/") &&
    candidate.endpoints.endsWith("/endpoints")
  );
}

function isValidImagePrice(price: unknown): price is OpenRouterImagePrice {
  if (!price || typeof price !== "object") return false;
  const candidate = price as Partial<OpenRouterImagePrice>;
  return (
    typeof candidate.billable === "string" &&
    typeof candidate.unit === "string" &&
    typeof candidate.cost_usd === "number" &&
    Number.isFinite(candidate.cost_usd) &&
    candidate.cost_usd >= 0 &&
    (candidate.variant === undefined || typeof candidate.variant === "string")
  );
}

async function requestVideoPricing(options: RequestInit) {
  const response = await fetch(OPENROUTER_VIDEO_MODELS_URL, options);
  if (!response.ok) throw new Error(`OpenRouter video models returned ${response.status}`);
  const payload = (await response.json()) as OpenRouterVideoResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an invalid video models payload");
  }
  const models = payload.data.filter(isValidVideoModel);
  return {
    pricing: new Map(models.map((model) => [model.id, model.pricing_skus])),
    complete: models.length === payload.data.length,
  } satisfies PricingResult<Record<string, string>>;
}

async function requestImagePricing(options: RequestInit) {
  const response = await fetch(OPENROUTER_IMAGE_MODELS_URL, options);
  if (!response.ok) throw new Error(`OpenRouter image models returned ${response.status}`);
  const payload = (await response.json()) as OpenRouterImageResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an invalid image models payload");
  }

  const models = payload.data.filter(isValidImageModel);
  const results: Array<PromiseSettledResult<[string, OpenRouterImagePrice[]] | null>> = [];
  // ponytail: OpenRouter has no aggregate image-pricing endpoint, so keep its required fanout bounded.
  for (let index = 0; index < models.length; index += 10) {
    results.push(...await Promise.allSettled(
      models.slice(index, index + 10).map(async (model) => {
        const endpointResponse = await fetch(new URL(model.endpoints, OPENROUTER_IMAGE_MODELS_URL), options);
        if (!endpointResponse.ok) return null;
        const endpointPayload = (await endpointResponse.json()) as { endpoints?: unknown[] };
        if (!Array.isArray(endpointPayload.endpoints)) return null;

        const endpoints = endpointPayload.endpoints.flatMap((endpoint) => {
          if (!endpoint || typeof endpoint !== "object") return [];
          const candidate = endpoint as { pricing?: unknown; provider_name?: unknown };
          if (!Array.isArray(candidate.pricing) || typeof candidate.provider_name !== "string") return [];
          return [{
            provider: candidate.provider_name,
            prices: candidate.pricing.filter(isValidImagePrice),
          }];
        });
        if (endpoints.length !== endpointPayload.endpoints.length) return null;
        const showProvider = endpoints.length > 1;
        return [
          model.id,
          endpoints.flatMap((endpoint) => endpoint.prices.map((price) =>
            showProvider ? { ...price, provider: endpoint.provider } : price
          )),
        ] as [string, OpenRouterImagePrice[]];
      }),
    ));
  }

  const pricing = new Map<string, OpenRouterImagePrice[]>();
  let complete = models.length === payload.data.length;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      if (result.value[1].length === 0) continue;
      pricing.set(result.value[0], result.value[1]);
    } else {
      complete = false;
    }
  }
  return { pricing, complete } satisfies PricingResult<OpenRouterImagePrice[]>;
}

async function requestModels() {
  const options = {
    headers: {
      Accept: "application/json",
      "X-OpenRouter-Title": "Model Radar",
    },
    signal: AbortSignal.timeout(10_000),
  };
  const response = await fetch(OPENROUTER_MODELS_URL, options);
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  const payload = (await response.json()) as OpenRouterResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an invalid models payload");
  }

  const [videoResult, imageResult] = await Promise.all([
    requestVideoPricing(options).catch((error) => {
      console.error("OpenRouter video pricing unavailable", error);
      return { pricing: new Map<string, Record<string, string>>(), complete: false };
    }),
    requestImagePricing(options).catch((error) => {
      console.error("OpenRouter image pricing unavailable", error);
      return { pricing: new Map<string, OpenRouterImagePrice[]>(), complete: false };
    }),
  ]);
  const mediaPricingComplete = videoResult.complete && imageResult.complete;

  const models = payload.data.filter(isValidModel).map((model) => ({
    ...model,
    pricing_skus: videoResult.pricing.get(model.id),
    imagePricing: imageResult.pricing.get(model.id),
    mediaPricingComplete,
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
