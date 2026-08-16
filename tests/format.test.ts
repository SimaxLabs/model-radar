import { describe, expect, it } from "vitest";
import { displayModelName, formatTokenCount, formatUnitPrice, providerName } from "$lib/format";

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

describe("model name formatting", () => {
  it("removes the OpenRouter provider prefix from display names", () => {
    expect(displayModelName("OpenAI: GPT-5")).toBe("GPT-5");
    expect(displayModelName("SpaceXAI: Grok 4")).toBe("Grok 4");
    expect(displayModelName("Claude 4 Sonnet")).toBe("Claude 4 Sonnet");
  });
});

describe("specialized price formatting", () => {
  it("preserves small model-specific unit prices", () => {
    expect(formatUnitPrice(32)).toBe("$32.00");
    expect(formatUnitPrice(0.003)).toBe("$0.003");
    expect(formatUnitPrice(0.00000958)).toBe("$0.00000958");
  });
});
