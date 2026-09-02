import type { OpenRouterModel } from "$lib/types";

export function openRouterModel(
  id: string,
  prompt: string,
  completion: string,
  outputModalities = ["text"],
): OpenRouterModel {
  return {
    id,
    canonical_slug: "example/model-2026-01-01",
    name: id,
    context_length: 128_000,
    architecture: {
      input_modalities: ["text", "image"],
      output_modalities: outputModalities,
    },
    top_provider: { max_completion_tokens: 16_384 },
    created: 1_700_000_000,
    expiration_date: null,
    pricing: { prompt, completion },
    benchmarks: {
      artificial_analysis: {
        intelligence_index: 80,
        coding_index: 75,
        agentic_index: 70,
      },
    },
  };
}
