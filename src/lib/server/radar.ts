import { env } from "$env/dynamic/private";
import { getDatabase } from "$lib/server/db/client";
import { syncPriceHistory } from "$lib/server/db/snapshots";
import { fetchOpenRouterModels } from "$lib/server/openrouter";
import {
  calculateBlendedPrice,
  calculatePriceChange,
  hasTokenPricing,
  type TokenPricedModel,
} from "$lib/scoring";
import type {
  OpenRouterModel,
  RadarData,
  RadarModel,
  SpecializedPricing,
  SpecializedRate,
} from "$lib/types";

const MILLION = 1_000_000;
const STATE_OF_THE_ART_COUNT = 10;
const RADAR_CACHE_TTL = 60 * 60 * 1000;

let cache: { data: RadarData; expiresAt: number } | null = null;
let pending: Promise<RadarData> | null = null;

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function scale(value: number, min: number, max: number) {
  return max === min ? 1 : clamp((value - min) / (max - min));
}

function addValueScores(models: TokenPricedModel[]) {
  const ranked = models.filter(
    (model): model is TokenPricedModel & { intelligence: number } => model.intelligence !== null,
  );
  if (ranked.length === 0) return;

  const intelligence = ranked.map((model) => model.intelligence);
  const logPrices = ranked.map((model) => Math.log10(model.blendedPrice));
  const intelligenceMin = Math.min(...intelligence);
  const intelligenceMax = Math.max(...intelligence);
  const priceMin = Math.min(...logPrices);
  const priceMax = Math.max(...logPrices);

  for (const model of ranked) {
    const quality = scale(model.intelligence, intelligenceMin, intelligenceMax);
    const affordability = 1 - scale(Math.log10(model.blendedPrice), priceMin, priceMax);
    model.valueScore = Math.round((quality * 0.75 + affordability * 0.25) * 100);
  }
}

function finiteScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positivePrice(value: string | undefined) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function getSpecializedPricing(model: OpenRouterModel): SpecializedPricing {
  const input: SpecializedRate[] = [];
  const output: SpecializedRate[] = [];
  const hasSpeechOutput = model.architecture.output_modalities.includes("speech");
  const hasTranscriptionOutput = model.architecture.output_modalities.includes("transcription");
  const prompt = positivePrice(model.pricing.prompt);
  const completion = positivePrice(model.pricing.completion);
  const audio = positivePrice(model.pricing.audio);
  const audioOutput = positivePrice(model.pricing.audio_output);
  const image = positivePrice(model.pricing.image);
  const imageToken = positivePrice(model.pricing.image_token);
  const imageOutput = positivePrice(model.pricing.image_output);
  const request = positivePrice(model.pricing.request);

  if (prompt !== null) {
    if (hasSpeechOutput) {
      input.push({ label: "Text", price: prompt * MILLION, unit: "1M characters" });
    } else if (!hasTranscriptionOutput) {
      input.push({ label: "Text", price: prompt * MILLION, unit: "1M text tokens" });
    }
  }
  if (audio !== null) {
    input.push({ label: "Audio", price: audio * MILLION, unit: "1M audio tokens" });
  }
  if (image !== null) {
    input.push({ label: "Image", price: image, unit: "input image" });
  }
  if (request !== null) {
    input.push({ label: "Request", price: request, unit: "request" });
  }
  if (completion !== null) {
    output.push({ label: "Text", price: completion * MILLION, unit: "1M text tokens" });
  }
  if (audioOutput !== null) {
    output.push({ label: "Audio", price: audioOutput * MILLION, unit: "1M audio tokens" });
  }
  if (imageToken !== null && imageOutput === imageToken) {
    output.push({ label: "Image", price: imageToken * MILLION, unit: "1M image tokens" });
  } else {
    if (imageToken !== null) {
      output.push({ label: "Image", price: imageToken * MILLION, unit: "1M image tokens" });
    }
    if (imageOutput !== null) {
      output.push({ label: "Image", price: imageOutput, unit: "output image" });
    }
  }

  return { input, output };
}

async function buildRadarData(force: boolean): Promise<RadarData> {
  const capturedAt = new Date();
  const generatedAt = capturedAt.toISOString();
  const snapshotDate = generatedAt.slice(0, 10);
  const cheapThreshold = positiveNumber(env.CHEAP_MODEL_MAX_PRICE, 1);
  const openRouterModels = await fetchOpenRouterModels(force);

  let databaseStatus: RadarData["sources"]["database"];

  const models: RadarModel[] = openRouterModels.map((model) => {
    const rawInputPrice = Number(model.pricing.prompt) * MILLION;
    const rawOutputPrice = Number(model.pricing.completion) * MILLION;
    const isSpecializedOutput = model.architecture.output_modalities.some(
      (modality) => modality.toLowerCase() !== "text",
    );
    const pricingBasis = isSpecializedOutput ? "specialized" : "token";
    const inputPrice = pricingBasis === "token" ? rawInputPrice : null;
    const outputPrice = pricingBasis === "token" ? rawOutputPrice : null;
    const blendedPrice = inputPrice === null || outputPrice === null
      ? null
      : calculateBlendedPrice(inputPrice, outputPrice);
    const isFree = model.id.endsWith(":free");
    const isBatch = model.id.endsWith(":batch");
    const isSpecialized = !isFree && !isBatch && pricingBasis === "specialized";
    const isCheap = !isFree && !isBatch && blendedPrice !== null && blendedPrice <= cheapThreshold;
    const benchmarks = model.benchmarks?.artificial_analysis;

    return {
      id: model.id,
      name: model.name,
      provider: model.id.split("/")[0],
      contextLength: model.context_length,
      inputModalities: [...model.architecture.input_modalities],
      outputModalities: [...model.architecture.output_modalities],
      maxCompletionTokens: finiteScore(model.top_provider?.max_completion_tokens),
      pricingBasis,
      specializedPricing: pricingBasis === "specialized" ? getSpecializedPricing(model) : null,
      createdAt: new Date(model.created * 1000).toISOString(),
      expiresAt: model.expiration_date ?? null,
      inputPrice,
      outputPrice,
      blendedPrice,
      previousInputPrice: null,
      previousOutputPrice: null,
      priceChangeBaselineAt: null,
      priceChangeRecordedAt: null,
      inputPriceChangePercent: null,
      outputPriceChangePercent: null,
      intelligence: finiteScore(benchmarks?.intelligence_index),
      coding: finiteScore(benchmarks?.coding_index),
      agentic: finiteScore(benchmarks?.agentic_index),
      intelligenceRank: null,
      segment: isFree ? "free" : isBatch ? "batch" : isSpecialized ? "specialized" : isCheap ? "cheap" : "standard",
      isCheap,
      isStateOfTheArt: false,
      valueScore: null,
    };
  });

  const paidModels = models.filter(
    (model) => model.segment !== "free" && model.segment !== "batch",
  );
  const tokenPricedPaidModels = paidModels.filter(hasTokenPricing);
  const rankedModels = tokenPricedPaidModels
    .filter((model): model is TokenPricedModel & { intelligence: number } => model.intelligence !== null)
    .sort((left, right) => right.intelligence - left.intelligence);

  for (const [index, model] of rankedModels.entries()) {
    model.intelligenceRank = index + 1;
    if (index < STATE_OF_THE_ART_COUNT) {
      model.isStateOfTheArt = true;
      model.segment = "state-of-the-art";
    }
  }

  const rankedCount = rankedModels.length;
  try {
    const databaseKind = (await getDatabase()).kind;
    const priceTrackedModels = models.filter(hasTokenPricing);
    const movements = await syncPriceHistory(
      priceTrackedModels.map((model) => ({
        modelId: model.id,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        blendedPrice: model.blendedPrice,
      })),
      capturedAt,
      rankedCount,
    );
    for (const model of models) {
      if (!hasTokenPricing(model)) continue;
      const movement = movements.get(model.id);
      const baselineInputPrice = movement?.baselineInputPrice ?? null;
      const baselineOutputPrice = movement?.baselineOutputPrice ?? null;
      model.previousInputPrice = baselineInputPrice;
      model.previousOutputPrice = baselineOutputPrice;
      model.priceChangeBaselineAt = movement?.baselineCapturedAt ?? null;
      model.priceChangeRecordedAt = movement?.changedAt ?? null;
      model.inputPriceChangePercent = calculatePriceChange(model.inputPrice, baselineInputPrice);
      model.outputPriceChangePercent = calculatePriceChange(model.outputPrice, baselineOutputPrice);
    }
    databaseStatus = {
      state: "live",
      label: databaseKind === "turso" ? "Turso connected" : "Local history",
      detail:
        databaseKind === "turso"
          ? "Token-price movements and daily prices are retained for 15 days in Turso."
          : "Token-price movements and daily prices are retained for 15 days in local libSQL.",
    };
  } catch (error) {
    console.error("Price history sync failed", error);
    databaseStatus = {
      state: "unavailable",
      label: "History unavailable",
      detail: "Live pricing works, but price movements could not be synchronized.",
    };
  }

  addValueScores(tokenPricedPaidModels);
  models.sort((left, right) => {
    if (left.intelligenceRank === null && right.intelligenceRank === null) {
      return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    }
    if (left.intelligenceRank === null) return 1;
    if (right.intelligenceRank === null) return -1;
    return left.intelligenceRank - right.intelligenceRank;
  });
  const modelPriceDirections = tokenPricedPaidModels.map((model) => {
    const changes = [model.inputPriceChangePercent, model.outputPriceChangePercent].filter(
      (change): change is number => change !== null && Math.abs(change) >= 0.001,
    );
    return {
      increased: changes.some((change) => change > 0),
      dropped: changes.some((change) => change < 0),
    };
  });
  const priceChangedModels = modelPriceDirections.filter(
    ({ increased, dropped }) => increased || dropped,
  ).length;

  return {
    generatedAt,
    snapshotDate,
    models,
    summary: {
      paidModels: paidModels.length,
      specializedModels: models.filter((model) => model.segment === "specialized").length,
      freeModels: models.filter((model) => model.segment === "free").length,
      batchModels: models.filter((model) => model.segment === "batch").length,
      rankedModels: rankedCount,
      cheapModels: models.filter((model) => model.isCheap).length,
      stateOfTheArtModels: models.filter((model) => model.isStateOfTheArt).length,
      priceChangedModels,
      priceIncreases: modelPriceDirections.filter(({ increased, dropped }) => increased && !dropped)
        .length,
      priceDrops: modelPriceDirections.filter(({ increased, dropped }) => dropped && !increased)
        .length,
      priceMixed: modelPriceDirections.filter(({ increased, dropped }) => increased && dropped)
        .length,
      cheapThreshold,
    },
    sources: {
      openRouter: {
        state: "live",
        label: "Pricing live",
        detail: "Current token-priced and specialized models from OpenRouter.",
      },
      benchmarks:
        rankedCount > 0
          ? {
              state: "live",
              label: "Benchmarks live",
              detail: "Artificial Analysis indices supplied by OpenRouter.",
            }
          : {
              state: "unavailable",
              label: "Benchmarks unavailable",
              detail: "OpenRouter returned no AA Index data.",
            },
      database: databaseStatus,
    },
  };
}

export async function getRadarData(force = false) {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.data;
  if (!force && pending) return pending;

  const request = buildRadarData(force);
  if (!force) pending = request;
  try {
    const data = await request;
    cache = { data, expiresAt: Date.now() + RADAR_CACHE_TTL };
    return data;
  } finally {
    if (!force) pending = null;
  }
}

export function unavailableRadarData(): RadarData {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    snapshotDate: generatedAt.slice(0, 10),
    models: [],
    summary: {
      paidModels: 0,
      specializedModels: 0,
      freeModels: 0,
      batchModels: 0,
      rankedModels: 0,
      cheapModels: 0,
      stateOfTheArtModels: 0,
      priceChangedModels: 0,
      priceIncreases: 0,
      priceDrops: 0,
      priceMixed: 0,
      cheapThreshold: positiveNumber(env.CHEAP_MODEL_MAX_PRICE, 1),
    },
    sources: {
      openRouter: {
        state: "unavailable",
        label: "Pricing unavailable",
        detail: "OpenRouter could not be reached.",
      },
      benchmarks: {
        state: "unavailable",
        label: "Benchmarks unavailable",
        detail: "Waiting for pricing data.",
      },
      database: {
        state: "unavailable",
        label: "History unavailable",
        detail: "Waiting for pricing data.",
      },
    },
  };
}
