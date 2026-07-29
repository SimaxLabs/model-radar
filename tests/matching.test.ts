import { describe, expect, it } from "vitest";
import {
  matchArtificialAnalysisModel,
  modelTokens,
} from "$lib/matching";
import type {
  ArtificialAnalysisModel,
  OpenRouterModel,
} from "$lib/types";

function openRouterModel(
  id: string,
  name: string,
  canonicalSlug = id,
): OpenRouterModel {
  return {
    id,
    name,
    canonical_slug: canonicalSlug,
    context_length: 200_000,
    created: 1_700_000_000,
    expiration_date: null,
    pricing: { prompt: "0.000001", completion: "0.000005" },
  };
}

function leaderboardModel(
  id: string,
  name: string,
  creator: string,
  score: number,
): ArtificialAnalysisModel {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    model_creator: { id: creator, name: creator, slug: creator.toLowerCase() },
    evaluations: {
      artificial_analysis_intelligence_index: score,
      artificial_analysis_coding_index: score,
      artificial_analysis_math_index: score,
    },
    median_output_tokens_per_second: 100,
    median_time_to_first_token_seconds: 1,
  };
}

describe("model matching", () => {
  it("removes release dates and non-semantic labels", () => {
    expect(modelTokens("Claude 3.7 Sonnet Preview 2025-02-19")).toEqual([
      "claude",
      "3",
      "7",
      "sonnet",
    ]);
  });

  it("matches a model only within its creator", () => {
    const match = matchArtificialAnalysisModel(
      openRouterModel("anthropic/claude-3.7-sonnet", "Anthropic: Claude 3.7 Sonnet"),
      [
        leaderboardModel("wrong", "Claude 3.7 Sonnet", "OpenAI", 99),
        leaderboardModel("right", "Claude 3.7 Sonnet", "Anthropic", 70),
      ],
    );

    expect(match?.model.id).toBe("right");
    expect(match?.confidence).toBe(1);
  });

  it("maps OpenRouter provider aliases to leaderboard creators", () => {
    const match = matchArtificialAnalysisModel(
      openRouterModel("qwen/qwen3-max", "Qwen: Qwen3 Max"),
      [leaderboardModel("qwen", "Qwen3 Max", "Alibaba", 55)],
    );

    expect(match?.model.id).toBe("qwen");
  });

  it("rejects unrelated models from the same creator", () => {
    const match = matchArtificialAnalysisModel(
      openRouterModel("openai/gpt-4o-mini", "OpenAI: GPT-4o Mini"),
      [leaderboardModel("o3", "o3", "OpenAI", 80)],
    );

    expect(match).toBeNull();
  });
});
