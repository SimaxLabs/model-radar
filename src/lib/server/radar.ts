import { env } from "$env/dynamic/private";
import { fetchArtificialAnalysisModels } from "$lib/server/artificial-analysis";
import { getDatabase } from "$lib/server/db/client";
import { getPreviousPrices, saveDailySnapshot } from "$lib/server/db/snapshots";
import { fetchOpenRouterModels } from "$lib/server/openrouter";
import { matchArtificialAnalysisModel } from "$lib/matching";
import { calculateBlendedPrice, calculatePriceChange } from "$lib/scoring";
import type { ArtificialAnalysisModel, RadarData, RadarModel } from "$lib/types";

const MILLION = 1_000_000;
const STATE_OF_THE_ART_COUNT = 10;
const RADAR_CACHE_TTL = 5 * 60 * 1000;

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

function addValueScores(models: RadarModel[]) {
  const ranked = models.filter(
    (model): model is RadarModel & { intelligence: number } => model.intelligence !== null,
  );
  if (ranked.length === 0) return;

  const intelligence = ranked.map((model) => model.intelligence);
  const logPrices = ranked.map((model) => Math.log10(model.blendedPrice));
  const speeds = ranked.map((model) => model.speed ?? 0);
  const intelligenceMin = Math.min(...intelligence);
  const intelligenceMax = Math.max(...intelligence);
  const priceMin = Math.min(...logPrices);
  const priceMax = Math.max(...logPrices);
  const speedMin = Math.min(...speeds);
  const speedMax = Math.max(...speeds);

  for (const model of ranked) {
    const quality = scale(model.intelligence, intelligenceMin, intelligenceMax);
    const affordability = 1 - scale(Math.log10(model.blendedPrice), priceMin, priceMax);
    const speed = model.speed === null ? 0.5 : scale(model.speed, speedMin, speedMax);
    model.valueScore = Math.round((quality * 0.68 + affordability * 0.22 + speed * 0.1) * 100);
  }
}

function createRankMap(leaderboard: ArtificialAnalysisModel[]) {
  const sorted = [...leaderboard].sort(
    (left, right) =>
      (right.evaluations.artificial_analysis_intelligence_index ?? -Infinity) -
      (left.evaluations.artificial_analysis_intelligence_index ?? -Infinity),
  );
  return new Map(sorted.map((model, index) => [model.id, index + 1]));
}

async function buildRadarData(force: boolean): Promise<RadarData> {
  const capturedAt = new Date();
  const snapshotDate = capturedAt.toISOString().slice(0, 10);
  const cheapThreshold = positiveNumber(env.CHEAP_MODEL_MAX_PRICE, 1);
  const [openRouterModels, artificialAnalysis] = await Promise.all([
    fetchOpenRouterModels(force),
    fetchArtificialAnalysisModels(force),
  ]);

  let previousPrices = new Map<string, number>();
  let databaseStatus: RadarData["sources"]["database"] = {
    state: "live",
    label: "History connected",
    detail: "Daily model prices are being stored.",
  };
  let databaseKind: "local" | "turso" = "local";

  try {
    databaseKind = (await getDatabase()).kind;
    previousPrices = await getPreviousPrices(
      openRouterModels.map((model) => model.id),
      snapshotDate,
    );
  } catch (error) {
    console.error("Price history read failed", error);
    databaseStatus = {
      state: "unavailable",
      label: "History unavailable",
      detail: "Live pricing works, but price history could not be read.",
    };
  }

  const rankMap = createRankMap(artificialAnalysis.models);
  const models: RadarModel[] = openRouterModels.map((model) => {
    const inputPrice = Number(model.pricing.prompt) * MILLION;
    const outputPrice = Number(model.pricing.completion) * MILLION;
    const blendedPrice = calculateBlendedPrice(inputPrice, outputPrice);
    const previousBlendedPrice = previousPrices.get(model.id) ?? null;
    const match = matchArtificialAnalysisModel(model, artificialAnalysis.models);
    const isCheap = blendedPrice <= cheapThreshold;
    const artificialAnalysisRank = match ? (rankMap.get(match.model.id) ?? null) : null;

    return {
      id: model.id,
      name: model.name,
      provider: model.id.split("/")[0],
      contextLength: model.context_length,
      createdAt: new Date(model.created * 1000).toISOString(),
      expiresAt: model.expiration_date ?? null,
      inputPrice,
      outputPrice,
      blendedPrice,
      previousBlendedPrice,
      priceChangePercent: calculatePriceChange(blendedPrice, previousBlendedPrice),
      intelligence:
        match?.model.evaluations.artificial_analysis_intelligence_index ?? null,
      coding: match?.model.evaluations.artificial_analysis_coding_index ?? null,
      math: match?.model.evaluations.artificial_analysis_math_index ?? null,
      speed: match?.model.median_output_tokens_per_second ?? null,
      latency: match?.model.median_time_to_first_token_seconds ?? null,
      artificialAnalysisRank,
      artificialAnalysisName: match?.model.name ?? null,
      artificialAnalysisSlug: match?.model.slug ?? null,
      matchConfidence: match ? Math.round(match.confidence * 100) : null,
      segment: isCheap ? "cheap" : "standard",
      isCheap,
      isStateOfTheArt: false,
      valueScore: null,
    };
  });

  const matchedByRank = models
    .filter((model) => model.artificialAnalysisRank !== null)
    .sort(
      (left, right) =>
        (left.artificialAnalysisRank ?? Infinity) -
        (right.artificialAnalysisRank ?? Infinity),
    );

  for (const model of matchedByRank.slice(0, STATE_OF_THE_ART_COUNT)) {
    model.isStateOfTheArt = true;
    model.segment = "state-of-the-art";
  }

  addValueScores(models);
  models.sort((left, right) => {
    if (left.artificialAnalysisRank === null) return 1;
    if (right.artificialAnalysisRank === null) return -1;
    return left.artificialAnalysisRank - right.artificialAnalysisRank;
  });

  const rankedCount = models.filter((model) => model.artificialAnalysisRank !== null).length;
  if (databaseStatus.state === "live") {
    try {
      await saveDailySnapshot(
        models.map((model) => ({
          modelId: model.id,
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
          blendedPrice: model.blendedPrice,
        })),
        capturedAt,
        rankedCount,
      );
      databaseStatus = {
        state: "live",
        label: databaseKind === "turso" ? "Turso connected" : "Local history",
        detail:
          databaseKind === "turso"
            ? "Daily prices are persisted in Turso."
            : "Daily prices are persisted in local libSQL.",
      };
    } catch (error) {
      console.error("Price history write failed", error);
      databaseStatus = {
        state: "unavailable",
        label: "History unavailable",
        detail: "Live pricing works, but today's snapshot could not be saved.",
      };
    }
  }

  return {
    generatedAt: capturedAt.toISOString(),
    snapshotDate,
    models,
    summary: {
      paidModels: models.length,
      rankedModels: rankedCount,
      cheapModels: models.filter((model) => model.isCheap).length,
      stateOfTheArtModels: models.filter((model) => model.isStateOfTheArt).length,
      priceIncreases: models.filter((model) => (model.priceChangePercent ?? 0) > 0.001).length,
      priceDrops: models.filter((model) => (model.priceChangePercent ?? 0) < -0.001).length,
      cheapThreshold,
    },
    sources: {
      openRouter: {
        state: "live",
        label: "Pricing live",
        detail: "Current paid model prices from OpenRouter.",
      },
      artificialAnalysis: artificialAnalysis.status,
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
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    snapshotDate: now.toISOString().slice(0, 10),
    models: [],
    summary: {
      paidModels: 0,
      rankedModels: 0,
      cheapModels: 0,
      stateOfTheArtModels: 0,
      priceIncreases: 0,
      priceDrops: 0,
      cheapThreshold: positiveNumber(env.CHEAP_MODEL_MAX_PRICE, 1),
    },
    sources: {
      openRouter: {
        state: "unavailable",
        label: "Pricing unavailable",
        detail: "OpenRouter could not be reached.",
      },
      artificialAnalysis: {
        state: "unavailable",
        label: "Rankings unavailable",
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
