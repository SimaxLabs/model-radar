import { describe, expect, it, vi } from "vitest";
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

  it("removes one-time visitors on new traffic without disturbing active windows", () => {
    vi.useFakeTimers();
    const deleted = vi.spyOn(Map.prototype, "delete");
    try {
      const short = crypto.randomUUID();
      const long = crypto.randomUUID();
      consumeRateLimit(short, 1, 60_000);
      consumeRateLimit(long, 1, 120_000);
      vi.advanceTimersByTime(60_001);
      consumeRateLimit(crypto.randomUUID(), 1, 60_000);
      expect(deleted).toHaveBeenCalledWith(short);
      expect(consumeRateLimit(short, 1, 60_000).allowed).toBe(true);
      expect(consumeRateLimit(long, 1, 120_000)).toEqual({ allowed: false, retryAfter: 60 });
    } finally {
      deleted.mockRestore();
      vi.useRealTimers();
    }
  });
});
