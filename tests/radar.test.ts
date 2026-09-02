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
        imagePricing: [
          { billable: "input_text", unit: "token", cost_usd: 0.000002 },
          { billable: "input_image", unit: "image", cost_usd: 0.003 },
          { billable: "output_image", unit: "token", cost_usd: 0.00001 },
        ],
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

  it("reports text-to-speech prompt pricing per character", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      {
        ...openRouterModel("x-ai/grok-voice-tts-1.0", "0.000015", "0", ["speech"]),
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["speech"],
        },
      },
    ]);

    const radar = await getRadarData(true);

    expect(radar.models[0]).toMatchObject({
      id: "x-ai/grok-voice-tts-1.0",
      segment: "specialized",
      pricingBasis: "specialized",
      specializedPricing: {
        input: [{ label: "Text", price: 15, unit: "1M characters" }],
        output: [],
      },
    });
  });

  it("reports dedicated video pricing for H3", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      {
        ...openRouterModel("minimax/hailuo-3", "0", "0", ["video"]),
        pricing_skus: { duration_seconds: "0.13", reference_images: "0.04" },
      },
    ]);

    const radar = await getRadarData(true);

    expect(radar.models[0]).toMatchObject({
      id: "minimax/hailuo-3",
      specializedPricing: {
        input: [{ label: "Reference image", price: 0.04, unit: "image" }],
        output: [{ label: "Video", price: 0.13, unit: "second" }],
      },
    });
  });

  it("reports video minimum charges", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      {
        ...openRouterModel("runway/aleph-2", "0", "0", ["video"]),
        pricing_skus: {
          cents_per_second_output: "28",
          minimum_cents_per_generation: "56",
        },
      },
    ]);

    const radar = await getRadarData(true);

    expect(radar.models[0]?.specializedPricing?.output).toEqual([
      { label: "Video output", price: 0.28, unit: "second" },
      { label: "Minimum charge", price: 0.56, unit: "generation" },
    ]);
  });

  it("uses native image rates and variants", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      {
        ...openRouterModel("recraft/recraft-v4-styles-pro", "0", "0", ["image"]),
        imagePricing: [
          { billable: "input_reference", unit: "request", cost_usd: 0.005 },
          { billable: "output_image", unit: "image", cost_usd: 0.1, variant: "high_resolution" },
          { billable: "output_image", unit: "megapixel", cost_usd: 0.014 },
        ],
      },
    ]);

    const radar = await getRadarData(true);

    expect(radar.models[0]?.specializedPricing).toEqual({
      input: [{ label: "Reference", price: 0.005, unit: "request" }],
      output: [
        { label: "Image (high resolution)", price: 0.1, unit: "output image" },
        { label: "Image", price: 0.014, unit: "output megapixel" },
      ],
    });
  });

  it("retains text pricing for hybrid image models", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      {
        ...openRouterModel("google/hybrid-image", "0.0000005", "0.000003", ["image", "text"]),
        imagePricing: [
          { billable: "output_image", unit: "image", cost_usd: 0.04 },
        ],
        mediaPricingComplete: false,
      },
    ]);

    const radar = await getRadarData(true);

    expect(radar.models[0]?.specializedPricing).toEqual({
      input: [{ label: "Text", price: 0.5, unit: "1M text tokens" }],
      output: [
        { label: "Image", price: 0.04, unit: "output image" },
        { label: "Text", price: 3, unit: "1M text tokens" },
      ],
    });
    expect(radar.sources.openRouter).toMatchObject({
      state: "unavailable",
      label: "Some pricing unavailable",
    });
  });

  it("uses modality-specific audio, speech, transcription, and embedding units", async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      openRouterModel("fish-audio/s2-pro", "0.000015", "0", ["speech"]),
      openRouterModel("google/gemini-3.1-flash-tts-preview", "0.000001", "0.00002", ["speech"]),
      openRouterModel("openai/whisper-1", "0.006", "0", ["transcription"]),
      openRouterModel("openai/gpt-4o-transcribe", "0.0000025", "0.00001", ["transcription"]),
      {
        ...openRouterModel("google/gemini-embedding-2", "0.0000002", "0", ["embeddings"]),
        architecture: {
          input_modalities: ["text", "image", "audio"],
          output_modalities: ["embeddings"],
        },
        pricing: {
          prompt: "0.0000002",
          completion: "0",
          image: "0.00000045",
          audio: "0.0000065",
        },
      },
      {
        ...openRouterModel("openai/gpt-audio", "0.0000025", "0.00001", ["audio"]),
        pricing: {
          prompt: "0.0000025",
          completion: "0.00001",
          audio: "0.000032",
          audio_output: "0.000064",
        },
      },
      openRouterModel("google/lyria-3-pro-preview", "0", "0", ["audio"]),
    ]);

    const radar = await getRadarData(true);
    const models = new Map(radar.models.map((model) => [model.id, model]));

    expect(models.get("fish-audio/s2-pro")?.specializedPricing).toEqual({
      input: [{ label: "Text", price: 15, unit: "1M UTF-8 bytes" }],
      output: [],
    });
    expect(models.get("google/gemini-3.1-flash-tts-preview")?.specializedPricing).toEqual({
      input: [{ label: "Text", price: 1, unit: "1M text tokens" }],
      output: [{ label: "Audio", price: 20, unit: "1M audio tokens" }],
    });
    expect(models.get("openai/whisper-1")?.specializedPricing).toEqual({
      input: [{ label: "Audio", price: 0.006, unit: "minute" }],
      output: [],
    });
    expect(models.get("openai/gpt-4o-transcribe")?.specializedPricing).toEqual({
      input: [{ label: "Input", price: 2.5, unit: "1M text tokens" }],
      output: [{ label: "Output", price: 10, unit: "1M text tokens" }],
    });
    expect(models.get("google/gemini-embedding-2")?.specializedPricing).toEqual({
      input: [
        { label: "Text", price: expect.closeTo(0.2), unit: "1M text tokens" },
        { label: "Image", price: expect.closeTo(0.45), unit: "1M image tokens" },
        { label: "Audio", price: 6.5, unit: "1M audio tokens" },
      ],
      output: [],
    });
    expect(models.get("openai/gpt-audio")?.specializedPricing).toEqual({
      input: [
        { label: "Text", price: 2.5, unit: "1M text tokens" },
        { label: "Audio", price: 32, unit: "1M audio tokens" },
      ],
      output: [
        { label: "Text", price: 10, unit: "1M text tokens" },
        { label: "Audio", price: 64, unit: "1M audio tokens" },
      ],
    });
    expect(models.get("google/lyria-3-pro-preview")?.specializedPricing).toEqual({ input: [], output: [] });
  });
});
