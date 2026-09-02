import { describe, expect, it } from "vitest";
import { calculateBlendedPrice, calculatePriceChange, rankBudgetModels } from "$lib/scoring";
import type { RadarModel } from "$lib/types";

function radarModel(
  id: string,
  intelligence: number | null,
  blendedPrice: number,
  isCheap = true,
): RadarModel {
  return {
    id,
    name: id,
    provider: "test",
    contextLength: 128_000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    maxCompletionTokens: 8_192,
    pricingBasis: "token",
    specializedPricing: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    inputPrice: blendedPrice,
    outputPrice: blendedPrice,
    blendedPrice,
    previousInputPrice: null,
    previousOutputPrice: null,
    priceChangeRecordedAt: null,
    inputPriceChangePercent: null,
    outputPriceChangePercent: null,
    intelligence,
    coding: null,
    agentic: null,
    intelligenceRank: null,
    segment: isCheap ? "cheap" : "standard",
    isCheap,
    valueScore: null,
  };
}

describe("price scoring", () => {
  it("uses the documented three-to-one input/output blend", () => {
    expect(calculateBlendedPrice(1, 5)).toBe(2);
  });

  it("reports increases and drops relative to the prior snapshot", () => {
    expect(calculatePriceChange(1.25, 1)).toBe(25);
    expect(calculatePriceChange(0.75, 1)).toBe(-25);
  });

  it("does not invent a trend without a valid baseline", () => {
    expect(calculatePriceChange(1, null)).toBeNull();
    expect(calculatePriceChange(1, 0)).toBeNull();
  });

  it("balances intelligence and affordability for budget recommendations", () => {
    const ranked = rankBudgetModels([
      radarModel("high-quality", 90, 0.9),
      radarModel("balanced-budget", 80, 0.1),
      radarModel("lowest-price", 45, 0.01),
      radarModel("unbenchmarked", null, 0.001),
      radarModel("over-budget", 100, 2, false),
    ]);

    expect(ranked.map((model) => model.id)).toEqual([
      "balanced-budget",
      "high-quality",
      "lowest-price",
    ]);
  });
});
