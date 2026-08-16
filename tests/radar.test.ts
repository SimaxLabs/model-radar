import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchOpenRouterModels: vi.fn(),
  getDatabase: vi.fn(),
  syncPriceHistory: vi.fn(),
}));

vi.mock("$lib/server/openrouter", () => ({
  fetchOpenRouterModels: mocks.fetchOpenRouterModels,
}));
vi.mock("$lib/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("$lib/server/db/snapshots", () => ({ syncPriceHistory: mocks.syncPriceHistory }));

import { getRadarData } from "$lib/server/radar";

function openRouterModel(
  id: string,
  prompt: string,
  completion: string,
  outputModalities = ["text"],
) {
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

beforeEach(() => {
  mocks.fetchOpenRouterModels.mockReset();
  mocks.getDatabase.mockReset().mockResolvedValue({ kind: "local" });
  mocks.syncPriceHistory.mockReset().mockResolvedValue(new Map());
});

describe("radar model variants", () => {
  it("isolates free and batch variants from paid model categories", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      openRouterModel("example/model", "0.000002", "0.000004"),
      openRouterModel("example/model:free", "0", "0"),
      openRouterModel("example/model:batch", "0.000001", "0.000002"),
      {
        ...openRouterModel("example/image-model", "0.000002", "0", ["image"]),
        pricing: {
          prompt: "0.000002",
          completion: "0",
          image: "0.003",
          image_token: "0.00001",
          image_output: "0.00001",
        },
      },
    ]);

    const radar = await getRadarData(true);
    const models = new Map(radar.models.map((model) => [model.id, model]));

    expect(radar.summary).toMatchObject({
      paidModels: 2,
      specializedModels: 1,
      freeModels: 1,
      batchModels: 1,
      rankedModels: 1,
      cheapModels: 0,
      stateOfTheArtModels: 1,
    });
    expect(models.get("example/model")).toMatchObject({
      segment: "state-of-the-art",
      intelligenceRank: 1,
      isStateOfTheArt: true,
    });
    expect(models.get("example/model:free")).toMatchObject({
      segment: "free",
      contextLength: 128_000,
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      maxCompletionTokens: 16_384,
      intelligenceRank: null,
      isCheap: false,
      isStateOfTheArt: false,
      valueScore: null,
    });
    expect(models.get("example/model:batch")).toMatchObject({
      segment: "batch",
      intelligenceRank: null,
      isCheap: false,
      isStateOfTheArt: false,
      valueScore: null,
    });
    expect(models.get("example/image-model")).toMatchObject({
      segment: "specialized",
      pricingBasis: "specialized",
      specializedPricing: {
        input: [
          { label: "Text", price: 2, unit: "1M text tokens" },
          { label: "Image", price: 0.003, unit: "input image" },
        ],
        output: [{ label: "Image", price: 10, unit: "1M image tokens" }],
      },
      inputPrice: null,
      outputPrice: null,
      blendedPrice: null,
      intelligenceRank: null,
      isCheap: false,
      isStateOfTheArt: false,
      valueScore: null,
    });
    expect(mocks.syncPriceHistory).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ modelId: "example/image-model" })]),
      expect.any(Date),
      1,
    );
  });
});
