import { describe, expect, it } from "vitest";
import { calculateBlendedPrice, calculatePriceChange } from "$lib/scoring";

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
});
