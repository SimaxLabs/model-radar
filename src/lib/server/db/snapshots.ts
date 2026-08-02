import type { Client, InStatement } from "@libsql/client";
import { PRICE_CHANGE_RETENTION_DAYS } from "$lib/types";
import { getDatabase } from "$lib/server/db/client";
import { syncRuns } from "$lib/server/db/schema";

interface SnapshotInput {
  modelId: string;
  inputPrice: number;
  outputPrice: number;
  blendedPrice: number;
}

export interface ActivePriceMovement {
  baselinePrice: number;
  currentPrice: number;
  changedAt: string;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

async function getLatestPrices(client: Client, modelIds: string[]) {
  const prices = new Map<string, number>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT current.model_id, current.blended_price
        FROM price_snapshots current
        INNER JOIN (
          SELECT model_id, MAX(captured_on) AS captured_on
          FROM price_snapshots
          WHERE model_id IN (${placeholders})
          GROUP BY model_id
        ) latest
        ON current.model_id = latest.model_id
        AND current.captured_on = latest.captured_on`,
      args: modelIdChunk,
    });

    for (const row of result.rows) {
      prices.set(String(row.model_id), Number(row.blended_price));
    }
  }

  return prices;
}

async function getActiveMovements(client: Client, modelIds: string[], cutoffAt: string) {
  const movements = new Map<string, ActivePriceMovement>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT model_id, baseline_price, current_price, changed_at
        FROM price_movements
        WHERE changed_at >= ? AND model_id IN (${placeholders})`,
      args: [cutoffAt, ...modelIdChunk],
    });

    for (const row of result.rows) {
      movements.set(String(row.model_id), {
        baselinePrice: Number(row.baseline_price),
        currentPrice: Number(row.current_price),
        changedAt: String(row.changed_at),
      });
    }
  }

  return movements;
}

export async function syncPriceHistory(
  models: SnapshotInput[],
  capturedAt: Date,
  rankedCount: number,
) {
  const { client, db } = await getDatabase();
  const capturedOn = capturedAt.toISOString().slice(0, 10);
  const capturedAtIso = capturedAt.toISOString();
  const cutoff = new Date(
    capturedAt.getTime() - PRICE_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const cutoffAtIso = cutoff.toISOString();
  const cutoffOn = cutoffAtIso.slice(0, 10);
  const modelIds = models.map((model) => model.modelId);
  const latestPrices = await getLatestPrices(client, modelIds);
  const movements = await getActiveMovements(client, modelIds, cutoffAtIso);
  const movementStatements: InStatement[] = [];

  for (const model of models) {
    const latestPrice = latestPrices.get(model.modelId);
    if (latestPrice === undefined || latestPrice === model.blendedPrice) continue;

    const baselinePrice = movements.get(model.modelId)?.baselinePrice ?? latestPrice;
    if (baselinePrice === model.blendedPrice) {
      movements.delete(model.modelId);
      movementStatements.push({
        sql: "DELETE FROM price_movements WHERE model_id = ?",
        args: [model.modelId],
      });
      continue;
    }

    const movement = {
      baselinePrice,
      currentPrice: model.blendedPrice,
      changedAt: capturedAtIso,
    };
    movements.set(model.modelId, movement);
    movementStatements.push({
      sql: `INSERT INTO price_movements (
        model_id, baseline_price, current_price, changed_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        baseline_price = excluded.baseline_price,
        current_price = excluded.current_price,
        changed_at = excluded.changed_at`,
      args: [model.modelId, baselinePrice, model.blendedPrice, capturedAtIso],
    });
  }

  for (const statementChunk of chunks(movementStatements, 100)) {
    await client.batch(statementChunk, "write");
  }

  const snapshotStatements: InStatement[] = models.map((model) => ({
    sql: `INSERT INTO price_snapshots (
      model_id, captured_on, input_price, output_price, blended_price, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, captured_on) DO UPDATE SET
      input_price = excluded.input_price,
      output_price = excluded.output_price,
      blended_price = excluded.blended_price,
      captured_at = excluded.captured_at
    WHERE price_snapshots.input_price != excluded.input_price
       OR price_snapshots.output_price != excluded.output_price
       OR price_snapshots.blended_price != excluded.blended_price`,
    args: [
      model.modelId,
      capturedOn,
      model.inputPrice,
      model.outputPrice,
      model.blendedPrice,
      capturedAtIso,
    ],
  }));
  let changedRows = 0;

  for (const statementChunk of chunks(snapshotStatements, 100)) {
    const results = await client.batch(statementChunk, "write");
    changedRows += results.reduce((total, result) => total + result.rowsAffected, 0);
  }

  await client.batch(
    [
      {
        sql: "DELETE FROM price_movements WHERE changed_at < ?",
        args: [cutoffAtIso],
      },
      {
        sql: "DELETE FROM price_snapshots WHERE captured_on < ?",
        args: [cutoffOn],
      },
    ],
    "write",
  );

  if (changedRows > 0) {
    await db.insert(syncRuns).values({
      capturedAt: capturedAtIso,
      modelCount: models.length,
      rankedCount,
    });
  }

  return movements;
}
