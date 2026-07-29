import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "$lib/server/rate-limit";

describe("rate limiting", () => {
  it("allows requests up to the configured limit and then blocks", () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(true);

    const blocked = consumeRateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
