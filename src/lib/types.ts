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
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
    image_output?: string;
    image_token?: string;
    audio?: string;
    audio_output?: string;
  };
  pricing_skus?: Record<string, string>;
  imagePricing?: OpenRouterImagePrice[];
  mediaPricingComplete?: boolean;
  top_provider?: {
    max_completion_tokens: number | null;
  };
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index: number | null;
      coding_index: number | null;
      agentic_index: number | null;
    };
  };
}

export interface OpenRouterImagePrice {
  billable: string;
  unit: string;
  cost_usd: number;
  variant?: string;
  provider?: string;
}

export type ModelSegment = "state-of-the-art" | "cheap" | "standard" | "specialized" | "free" | "batch";
export type PricingBasis = "token" | "specialized";

export interface SpecializedRate {
  label: string;
  price: number;
  unit:
    | "1M text tokens"
    | "1M characters"
    | "1M audio tokens"
    | "1M image tokens"
    | "1M video tokens"
    | "1M UTF-8 bytes"
    | "input image"
    | "output image"
    | "input megapixel"
    | "output megapixel"
    | "image"
    | "second"
    | "minute"
    | "hour"
    | "generation"
    | "megapixel-second"
    | "request";
}

export interface SpecializedPricing {
  input: SpecializedRate[];
  output: SpecializedRate[];
}

export interface RadarModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputModalities: string[];
  outputModalities: string[];
  maxCompletionTokens: number | null;
  pricingBasis: PricingBasis;
  specializedPricing: SpecializedPricing | null;
  createdAt: string;
  expiresAt: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  blendedPrice: number | null;
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
  specializedModels: number;
  freeModels: number;
  batchModels: number;
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
