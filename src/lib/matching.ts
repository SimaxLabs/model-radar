import type { ArtificialAnalysisModel, OpenRouterModel } from "$lib/types";

const PROVIDER_ALIASES: Record<string, string> = {
  alibaba: "alibaba",
  anthropic: "anthropic",
  cohere: "cohere",
  deepseek: "deepseek",
  google: "google",
  kimi: "kimi",
  meta: "meta",
  metaai: "meta",
  metallama: "meta",
  microsoft: "microsoft",
  minimax: "minimax",
  mistral: "mistral",
  mistralai: "mistral",
  moonshotai: "kimi",
  nvidia: "nvidia",
  openai: "openai",
  qwen: "alibaba",
  spacexai: "xai",
  xai: "xai",
  xiaomi: "xiaomi",
  zai: "zai",
  zhipuai: "zai",
};

const NOISE_TOKENS = new Set(["ai", "beta", "latest", "model", "preview", "the"]);
const QUALIFIER_TOKENS = new Set([
  "high",
  "low",
  "max",
  "medium",
  "minimal",
  "nonreasoning",
  "thinking",
  "xhigh",
]);

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function providerKey(value: string) {
  const normalized = compact(value);
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

export function modelTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/non[\s-]?reasoning/g, " nonreasoning ")
    .replace(/\b(19|20)\d{2}[-/]?\d{0,2}[-/]?\d{0,2}\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !NOISE_TOKENS.has(token));
}

function nameSimilarity(left: string, right: string) {
  const leftTokens = new Set(modelTokens(left));
  const rightTokens = new Set(modelTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  let score = intersection.length / union.size;
  const leftCompact = compact(left);
  const rightCompact = compact(right);

  if (leftCompact === rightCompact) score = 1;
  else if (
    leftCompact.length > 5 &&
    rightCompact.length > 5 &&
    (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact))
  ) {
    score = Math.max(score, 0.88);
  }

  const leftQualifiers = [...leftTokens].filter((token) => QUALIFIER_TOKENS.has(token));
  const rightQualifiers = [...rightTokens].filter((token) => QUALIFIER_TOKENS.has(token));
  const hasQualifierConflict =
    leftQualifiers.length > 0 &&
    rightQualifiers.length > 0 &&
    !leftQualifiers.some((token) => rightQualifiers.includes(token));

  return hasQualifierConflict ? score * 0.72 : score;
}

export interface ModelMatch {
  model: ArtificialAnalysisModel;
  confidence: number;
}

export function matchArtificialAnalysisModel(
  openRouterModel: OpenRouterModel,
  leaderboard: ArtificialAnalysisModel[],
): ModelMatch | null {
  const [provider, modelId = openRouterModel.id] = openRouterModel.id.split("/");
  const expectedProvider = providerKey(provider);
  const names = [modelId, openRouterModel.name, openRouterModel.canonical_slug];

  const candidates = leaderboard
    .filter((entry) => providerKey(entry.model_creator.name) === expectedProvider)
    .map((entry) => ({
      model: entry,
      confidence: Math.max(
        ...names.flatMap((name) => [
          nameSimilarity(name, entry.name),
          nameSimilarity(name, entry.slug),
        ]),
      ),
    }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const scoreA = a.model.evaluations.artificial_analysis_intelligence_index ?? 0;
      const scoreB = b.model.evaluations.artificial_analysis_intelligence_index ?? 0;
      return scoreB - scoreA;
    });

  return candidates[0]?.confidence >= 0.62 ? candidates[0] : null;
}
