import type { RadarModel } from "$lib/types";

export type TokenPricedModel = RadarModel & {
  pricingBasis: "token";
  inputPrice: number;
  outputPrice: number;
  blendedPrice: number;
};

export function hasTokenPricing(model: RadarModel): model is TokenPricedModel {
  return (
    model.pricingBasis === "token" &&
    model.inputPrice !== null && Number.isFinite(model.inputPrice) &&
    model.outputPrice !== null && Number.isFinite(model.outputPrice) &&
    model.blendedPrice !== null && Number.isFinite(model.blendedPrice)
  );
}

export function calculateBlendedPrice(inputPrice: number, outputPrice: number) {
  return (inputPrice * 3 + outputPrice) / 4;
}

export function calculatePriceChange(current: number, previous: number | null) {
  return previous === null || previous === 0 ? null : ((current - previous) / previous) * 100;
}

export function rankBudgetModels(models: RadarModel[]) {
  const eligible = models.filter(
    (model): model is TokenPricedModel & { intelligence: number } =>
      hasTokenPricing(model) &&
      model.isCheap &&
      model.intelligence !== null &&
      model.blendedPrice > 0,
  );
  if (eligible.length === 0) return [];

  const intelligence = eligible.map((model) => model.intelligence);
  const logPrices = eligible.map((model) => Math.log10(model.blendedPrice));
  const intelligenceMin = Math.min(...intelligence);
  const intelligenceMax = Math.max(...intelligence);
  const priceMin = Math.min(...logPrices);
  const priceMax = Math.max(...logPrices);
  const scale = (value: number, min: number, max: number) =>
    max === min ? 1 : (value - min) / (max - min);
  const score = (model: TokenPricedModel & { intelligence: number }) => {
    const quality = scale(model.intelligence, intelligenceMin, intelligenceMax);
    const affordability = 1 - scale(Math.log10(model.blendedPrice), priceMin, priceMax);
    return quality * 0.5 + affordability * 0.5;
  };

  return eligible.sort(
    (left, right) =>
      score(right) - score(left) ||
      right.intelligence - left.intelligence ||
      left.blendedPrice - right.blendedPrice,
  );
}
