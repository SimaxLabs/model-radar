import { describe, expect, it } from "vitest";
import { providerName } from "$lib/format";

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
