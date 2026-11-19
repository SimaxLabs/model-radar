import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "../src/routes/api/sync/+server";

const { env, refresh } = vi.hoisted(() => ({
  env: { CRON_SECRET: "" }, refresh: vi.fn(),
}));
vi.mock("$env/dynamic/private", () => ({ env }));
vi.mock("$lib/server/radar", () => ({ getRadarData: refresh }));

const secret = "x".repeat(32);
function sync(authorization?: string) {
  type SyncEvent = Parameters<typeof POST>[0];
  const event: Pick<SyncEvent, "request" | "getClientAddress" | "setHeaders"> = {
    request: new Request("http://localhost/api/sync", {
      method: "POST", headers: authorization ? { authorization } : {},
    }),
    getClientAddress: () => crypto.randomUUID(),
    setHeaders: vi.fn(),
  };
  return POST(event as SyncEvent);
}

beforeEach(() => {
  refresh.mockReset();
  env.CRON_SECRET = secret;
});

it.each([
  ["", undefined, 503],
  ["short", "Bearer short", 503],
  ["x".repeat(32), undefined, 401],
  ["x".repeat(32), `Bearer ${"y".repeat(32)}`, 401],
] as const)("rejects an unconfigured or unauthorized request before refreshing", async (configured, header, status) => {
  env.CRON_SECRET = configured;
  expect((await sync(header)).status).toBe(status);
  expect(refresh).not.toHaveBeenCalled();
});

it.each([["live", 200], ["unavailable", 503]] as const)("reports database state %s to the scheduler", async (state, status) => {
  refresh.mockResolvedValue({
    sources: { database: { state } }, summary: { paidModels: 1 },
    generatedAt: "2026-09-01T01:00:00.000Z", snapshotDate: "2026-09-01",
  });
  const response = await sync(`Bearer ${env.CRON_SECRET}`);
  expect(response.status).toBe(status);
  expect(refresh).toHaveBeenCalledExactlyOnceWith(true);
  const body = await response.json();
  if (status === 200) expect(body.snapshotDate).toBe("2026-09-01");
  else expect(body).not.toHaveProperty("syncedAt");
});
