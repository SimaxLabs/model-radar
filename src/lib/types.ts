export type SourceState = "live" | "unavailable";

export const PRICE_HISTORY_RETENTION_DAYS = 15;

export interface SourceStatus {
  state: SourceState;
  label: string;
  detail: string;
}

export interface ArtificialAnalysisArticle {
  title: string;
  url: string;
  publishedDate: string;
}

export interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  name: string;
  context_length: number;
  created: number;
  expiration_date: string | null;
  pricing: {
    prompt: string;
    completion: string;
  };
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index: number | null;
      coding_index: number | null;
      agentic_index: number | null;
    };
  };
}

export type ModelSegment = "state-of-the-art" | "cheap" | "standard";

export interface RadarModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  createdAt: string;
  expiresAt: string | null;
  inputPrice: number;
  outputPrice: number;
  blendedPrice: number;
  previousInputPrice: number | null;
  previousOutputPrice: number | null;
  priceChangeBaselineAt: string | null;
  priceChangeRecordedAt: string | null;
  inputPriceChangePercent: number | null;
  outputPriceChangePercent: number | null;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  intelligenceRank: number | null;
  segment: ModelSegment;
  isCheap: boolean;
  isStateOfTheArt: boolean;
  valueScore: number | null;
}

export interface RadarSummary {
  paidModels: number;
  rankedModels: number;
  cheapModels: number;
  stateOfTheArtModels: number;
  priceChangedModels: number;
  priceIncreases: number;
  priceDrops: number;
  priceMixed: number;
  cheapThreshold: number;
}

export interface RadarData {
  generatedAt: string;
  snapshotDate: string;
  models: RadarModel[];
  summary: RadarSummary;
  sources: {
    openRouter: SourceStatus;
    benchmarks: SourceStatus;
    database: SourceStatus;
  };
}
