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

  it("uses only retained earlier UTC dates as baselines and skips repeat writes", async () => {
    const model = { modelId: "daily", inputPrice: 1, outputPrice: 1, blendedPrice: 1 };
    const higher = { ...model, inputPrice: 2, blendedPrice: 1.75 };
    await syncPriceHistory([model], new Date("2026-07-01T00:00Z"));
    expect((await syncPriceHistory([higher], new Date("2026-07-01T23:59Z"))).size).toBe(0);
    const midnight = new Date("2026-07-02T00:00Z");
    const movement = (await syncPriceHistory([model], midnight)).get("daily");
    expect(movement?.baselineInputPrice).toBe(2);
    const { client } = await getDatabase();
    await client.execute(`CREATE TRIGGER no_repeat BEFORE INSERT ON price_snapshots
      WHEN NEW.model_id = 'daily' AND NEW.captured_on = '2026-07-02'
      BEGIN SELECT RAISE(ABORT, 'unnecessary snapshot write'); END`);
    try {
      expect((await syncPriceHistory([model], new Date("2026-07-02T04:00Z"))).get("daily")).toEqual(movement);
    } finally {
      await client.execute("DROP TRIGGER no_repeat");
    }
    expect((await syncPriceHistory([higher], new Date("2026-08-20T00:00Z"))).size).toBe(0);
  });

  it("commits a reversal with its snapshot even at a batch boundary", async () => {
    const model = { modelId: "reversal", inputPrice: 1, outputPrice: 1, blendedPrice: 1 };
    await syncPriceHistory([model], new Date("2026-09-01"));
    await syncPriceHistory([{ ...model, inputPrice: 2, blendedPrice: 1.75 }], new Date("2026-09-02"));
    const models = [...Array.from({ length: 99 }, (_, i) => ({ ...model, modelId: `other/${i}` })), model];
    const { client } = await getDatabase();
    await client.execute(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON price_snapshots
      WHEN NEW.model_id = 'reversal' BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);
    try {
      await expect(syncPriceHistory(models, new Date("2026-09-03"))).rejects.toThrow("snapshot unavailable");
      const result = await client.execute("SELECT current_input_price FROM price_movements WHERE model_id = 'reversal'");
      expect(result.rows[0]?.current_input_price).toBe(2);
    } finally {
      await client.execute("DROP TRIGGER fail_snapshot");
    }
    expect((await syncPriceHistory(models, new Date("2026-09-03"))).size).toBe(0);
    const count = await client.execute("SELECT COUNT(*) AS n FROM price_snapshots WHERE captured_on = '2026-09-03'");
    expect(count.rows[0].n).toBe(100);
  });
});
