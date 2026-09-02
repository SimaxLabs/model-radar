import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenRouterModels } from "$lib/server/openrouter";
import { openRouterModel } from "./fixtures";

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
              ...openRouterModel("example/model", "0.000001", "0.000005", ["text", "audio"]),
              name: "Example: Model",
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/images/models",
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
              : String(input).includes("/images/models")
                ? { data: [] }
              : {
                  data: [
                    openRouterModel("minimax/hailuo-3", "0", "0", ["video"]),
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

  it("merges definitive image endpoint pricing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const data = url.endsWith("/api/v1/videos/models")
          ? { data: [] }
          : url.endsWith("/api/v1/images/models")
            ? {
                data: [
                  {
                    id: "recraft/recraft-v4-styles-pro",
                    endpoints: "/api/v1/images/models/recraft/recraft-v4-styles-pro/endpoints",
                  },
                ],
              }
            : url.endsWith("/api/v1/images/models/recraft/recraft-v4-styles-pro/endpoints")
              ? {
                  endpoints: [
                    {
                      provider_name: "Recraft",
                      pricing: [
                        { billable: "output_image", unit: "image", cost_usd: 0.1 },
                        { billable: "input_reference", unit: "request", cost_usd: 0.005 },
                      ],
                    },
                  ],
                }
              : {
                  data: [
                    openRouterModel("recraft/recraft-v4-styles-pro", "0", "0", ["image"]),
                  ],
                };
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const models = await fetchOpenRouterModels(true);

    expect(models[0]?.imagePricing).toEqual([
      { billable: "output_image", unit: "image", cost_usd: 0.1 },
      { billable: "input_reference", unit: "request", cost_usd: 0.005 },
    ]);
  });

  it("keeps free and batch variants while excluding other zero-priced routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              openRouterModel("example/model", "0.000002", "0.00001"),
              openRouterModel("example/model:batch", "0.000001", "0.000005"),
              openRouterModel("example/model:free", "0", "0"),
              openRouterModel("example/image-model", "0", "0", ["image"]),
              {
                ...openRouterModel("example/invalid-architecture", "0.000002", "0.00001"),
                architecture: {
                  input_modalities: "text",
                  output_modalities: ["text"],
                },
              },
              openRouterModel("example/dynamic-route", "0", "0"),
              openRouterModel("openrouter/free", "0", "0"),
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
