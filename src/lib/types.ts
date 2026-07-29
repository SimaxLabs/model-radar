export type SourceState = "live" | "needs-key" | "unavailable";

export interface SourceStatus {
  state: SourceState;
  label: string;
  detail: string;
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
}

export interface ArtificialAnalysisModel {
  id: string;
  name: string;
  slug: string;
  model_creator: {
    id: string;
    name: string;
    slug: string;
  };
  evaluations: {
    artificial_analysis_intelligence_index: number | null;
    artificial_analysis_coding_index: number | null;
    artificial_analysis_math_index: number | null;
  };
  median_output_tokens_per_second: number | null;
  median_time_to_first_token_seconds: number | null;
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
  previousBlendedPrice: number | null;
  priceChangePercent: number | null;
  intelligence: number | null;
  coding: number | null;
  math: number | null;
  speed: number | null;
  latency: number | null;
  artificialAnalysisRank: number | null;
  artificialAnalysisName: string | null;
  artificialAnalysisSlug: string | null;
  matchConfidence: number | null;
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
  priceIncreases: number;
  priceDrops: number;
  cheapThreshold: number;
}

export interface RadarData {
  generatedAt: string;
  snapshotDate: string;
  models: RadarModel[];
  summary: RadarSummary;
  sources: {
    openRouter: SourceStatus;
    artificialAnalysis: SourceStatus;
    database: SourceStatus;
  };
}
