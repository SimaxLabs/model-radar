import { describe, expect, it } from "vitest";
import { formatTokenCount, providerName } from "$lib/format";

describe("provider formatting", () => {
  it("normalizes latest-model aliases to the creator name", () => {
    expect(providerName("~anthropic")).toBe("Anthropic");
    expect(providerName("~openai")).toBe("OpenAI");
  });

  it("uses known creator labels", () => {
    expect(providerName("meta-llama")).toBe("Meta");
    expect(providerName("x-ai")).toBe("xAI");
  });
});

describe("token count formatting", () => {
  it("compacts context windows without losing useful precision", () => {
    expect(formatTokenCount(200_000)).toBe("200K");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });
});
