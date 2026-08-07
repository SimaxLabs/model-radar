import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenRouterModels } from "$lib/server/openrouter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouter models", () => {
  it("preserves embedded Artificial Analysis benchmark indices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "example/model",
                canonical_slug: "example/model-2026-01-01",
                name: "Example: Model",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                pricing: { prompt: "0.000001", completion: "0.000005" },
                benchmarks: {
                  artificial_analysis: {
                    intelligence_index: 72.4,
                    coding_index: 68.1,
                    agentic_index: 61.5,
                  },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenRouterModels(true);

    expect(models[0]?.benchmarks?.artificial_analysis).toEqual({
      intelligence_index: 72.4,
      coding_index: 68.1,
      agentic_index: 61.5,
    });
  });

  it("excludes batch model variants", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "example/model",
                canonical_slug: "example/model-2026-01-01",
                name: "Example: Model",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                pricing: { prompt: "0.000002", completion: "0.00001" },
              },
              {
                id: "example/model:batch",
                canonical_slug: "example/model-2026-01-01",
                name: "Example: Model (batch)",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                pricing: { prompt: "0.000001", completion: "0.000005" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenRouterModels(true);

    expect(models.map((model) => model.id)).toEqual(["example/model"]);
  });
});
