import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: { DATABASE_URL: ":memory:" },
}));

import { getDatabase } from "$lib/server/db/client";
import { syncPriceHistory } from "$lib/server/db/snapshots";

describe("price movement retention", () => {
  it("tracks cumulative changes immediately and expires unchanged data after 15 days", async () => {
    const model = {
      modelId: "example/model",
      inputPrice: 1,
      outputPrice: 5,
      blendedPrice: 2,
    };

    const initial = await syncPriceHistory(
      [model],
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(initial.size).toBe(0);

    const firstChange = await syncPriceHistory(
      [{ ...model, inputPrice: 2, outputPrice: 2, blendedPrice: 2 }],
      new Date("2026-06-02T00:00:00Z"),
    );
    expect(firstChange.get(model.modelId)).toEqual({
      baselineInputPrice: 1,
      baselineOutputPrice: 5,
      baselineCapturedAt: "2026-06-01T00:00:00.000Z",
      changedAt: "2026-06-02T00:00:00.000Z",
    });

    const secondChange = await syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-06-10T00:00:00Z"),
    );
    expect(secondChange.get(model.modelId)).toEqual({
      baselineInputPrice: 1,
      baselineOutputPrice: 5,
      baselineCapturedAt: "2026-06-01T00:00:00.000Z",
      changedAt: "2026-06-10T00:00:00.000Z",
    });

    const retained = await syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-06-24T00:00:00Z"),
    );
    expect(retained.get(model.modelId)?.baselineInputPrice).toBe(1);

    const expired = await syncPriceHistory(
      [{ ...model, inputPrice: 0.7, outputPrice: 1.7, blendedPrice: 0.95 }],
      new Date("2026-06-26T00:00:00Z"),
    );
    expect(expired.size).toBe(0);

    const { client } = await getDatabase();
    const movementRows = await client.execute("SELECT model_id FROM price_movements");
    const snapshotRows = await client.execute(
      "SELECT captured_on FROM price_snapshots ORDER BY captured_on",
    );
    const syncRunTables = await client.execute("SELECT name FROM sqlite_master WHERE name = 'sync_runs'");
    expect(movementRows.rows).toHaveLength(0);
    expect(syncRunTables.rows).toHaveLength(0);
    expect(snapshotRows.rows.map((row) => String(row.captured_on))).toEqual([
      "2026-06-24",
      "2026-06-26",
    ]);
  });
});
