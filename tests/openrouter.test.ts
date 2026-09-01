import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenRouterModels } from "$lib/server/openrouter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouter models", () => {
  it("preserves embedded Artificial Analysis benchmark indices", async () => {
    const fetchMock = vi.fn(async () =>
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
              architecture: {
                input_modalities: ["text", "image"],
                output_modalities: ["text", "audio"],
              },
              pricing: {
                prompt: "0.000001",
                completion: "0.000005",
                audio: "0.000032",
                audio_output: "0.000064",
              },
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
    );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const models = await fetchOpenRouterModels(true);

    expect(models[0]?.benchmarks?.artificial_analysis).toEqual({
      intelligence_index: 72.4,
      coding_index: 68.1,
      agentic_index: 61.5,
    });
    expect(models[0]?.architecture).toEqual({
      input_modalities: ["text", "image"],
      output_modalities: ["text", "audio"],
    });
    expect(models[0]?.pricing.audio_output).toBe("0.000064");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=all",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/videos/models",
      expect.any(Object),
    );
  });

  it("merges dedicated video pricing into specialized models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(input).includes("/videos/models")
              ? {
                  data: [
                    {
                      id: "minimax/hailuo-3",
                      pricing_skus: { duration_seconds: "0.13", reference_images: "0.04" },
                    },
                  ],
                }
              : {
                  data: [
                    {
                      id: "minimax/hailuo-3",
                      canonical_slug: "minimax/hailuo-03-20260730",
                      name: "MiniMax: H3",
                      context_length: 0,
                      created: 1_785_366_648,
                      expiration_date: null,
                      architecture: {
                        input_modalities: ["text", "image", "video", "audio"],
                        output_modalities: ["video"],
                      },
                      pricing: { prompt: "0", completion: "0" },
                    },
                  ],
                },
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenRouterModels(true);

    expect(models[0]?.pricing_skus).toEqual({
      duration_seconds: "0.13",
      reference_images: "0.04",
    });
  });

  it("keeps free and batch variants while excluding other zero-priced routes", async () => {
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
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0.000002", completion: "0.00001" },
              },
              {
                id: "example/model:batch",
                canonical_slug: "example/model-2026-01-01",
                name: "Example: Model (batch)",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0.000001", completion: "0.000005" },
              },
              {
                id: "example/model:free",
                canonical_slug: "example/model-2026-01-01",
                name: "Example: Model (free)",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0", completion: "0" },
              },
              {
                id: "example/image-model",
                canonical_slug: "example/image-model",
                name: "Example: Image Model",
                context_length: 32_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: ["text", "image"],
                  output_modalities: ["image"],
                },
                pricing: {
                  prompt: "0",
                  completion: "0",
                },
              },
              {
                id: "example/invalid-architecture",
                canonical_slug: "example/invalid-architecture",
                name: "Example: Invalid Architecture",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: "text",
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0.000002", completion: "0.00001" },
              },
              {
                id: "example/dynamic-route",
                canonical_slug: "example/dynamic-route",
                name: "Example: Dynamic Route",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0", completion: "0" },
              },
              {
                id: "openrouter/free",
                canonical_slug: "openrouter/free",
                name: "OpenRouter: Free Models Router",
                context_length: 128_000,
                created: 1_700_000_000,
                expiration_date: null,
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                pricing: { prompt: "0", completion: "0" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenRouterModels(true);

    expect(models.map((model) => model.id)).toEqual([
      "example/model",
      "example/model:batch",
      "example/model:free",
      "example/image-model",
    ]);
  });
});
