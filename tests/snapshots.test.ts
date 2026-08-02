import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: { DATABASE_URL: ":memory:" },
}));

let database: typeof import("$lib/server/db/client");
let snapshots: typeof import("$lib/server/db/snapshots");

beforeAll(async () => {
  database = await import("$lib/server/db/client");
  snapshots = await import("$lib/server/db/snapshots");
});

describe("price movement retention", () => {
  it("tracks cumulative changes immediately and expires unchanged data after 30 days", async () => {
    const model = {
      modelId: "example/model",
      inputPrice: 1,
      outputPrice: 5,
      blendedPrice: 2,
    };

    const initial = await snapshots.syncPriceHistory(
      [model],
      new Date("2026-06-01T00:00:00Z"),
      1,
    );
    expect(initial.size).toBe(0);

    const firstChange = await snapshots.syncPriceHistory(
      [{ ...model, inputPrice: 2, outputPrice: 2, blendedPrice: 2 }],
      new Date("2026-06-02T00:00:00Z"),
      1,
    );
    expect(firstChange.get(model.modelId)).toEqual({
      baselineInputPrice: 1,
      baselineOutputPrice: 5,
      baselineCapturedAt: "2026-06-01T00:00:00.000Z",
      currentInputPrice: 2,
      currentOutputPrice: 2,
      changedAt: "2026-06-02T00:00:00.000Z",
    });

    const secondChange = await snapshots.syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-06-20T00:00:00Z"),
      1,
    );
    expect(secondChange.get(model.modelId)).toEqual({
      baselineInputPrice: 1,
      baselineOutputPrice: 5,
      baselineCapturedAt: "2026-06-01T00:00:00.000Z",
      currentInputPrice: 0.7,
      currentOutputPrice: 1.7,
      changedAt: "2026-06-20T00:00:00.000Z",
    });

    const retained = await snapshots.syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-07-10T00:00:00Z"),
      1,
    );
    expect(retained.get(model.modelId)?.baselineInputPrice).toBe(1);

    const expired = await snapshots.syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-07-21T00:00:00Z"),
      1,
    );
    expect(expired.size).toBe(0);

    const { client } = await database.getDatabase();
    const movementRows = await client.execute("SELECT model_id FROM price_movements");
    const snapshotRows = await client.execute(
      "SELECT captured_on FROM price_snapshots ORDER BY captured_on",
    );
    expect(movementRows.rows).toHaveLength(0);
    expect(snapshotRows.rows.map((row) => String(row.captured_on))).toEqual([
      "2026-07-10",
      "2026-07-21",
    ]);
  });
});
