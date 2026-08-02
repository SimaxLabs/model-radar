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
  baselineInputPrice: number;
  baselineOutputPrice: number;
  baselineCapturedAt: string | null;
  currentInputPrice: number;
  currentOutputPrice: number;
  changedAt: string;
}

interface LatestPrice {
  inputPrice: number;
  outputPrice: number;
  capturedAt: string;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

async function getLatestPrices(client: Client, modelIds: string[]) {
  const prices = new Map<string, LatestPrice>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT current.model_id, current.input_price, current.output_price,
          current.captured_at
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
      prices.set(String(row.model_id), {
        inputPrice: Number(row.input_price),
        outputPrice: Number(row.output_price),
        capturedAt: String(row.captured_at),
      });
    }
  }

  return prices;
}

async function getActiveMovements(client: Client, modelIds: string[], cutoffAt: string) {
  const movements = new Map<string, ActivePriceMovement>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT model_id, baseline_input_price, baseline_output_price,
          baseline_captured_at, current_input_price, current_output_price, changed_at
        FROM price_movements
        WHERE changed_at >= ?
          AND baseline_input_price IS NOT NULL
          AND baseline_output_price IS NOT NULL
          AND current_input_price IS NOT NULL
          AND current_output_price IS NOT NULL
          AND model_id IN (${placeholders})`,
      args: [cutoffAt, ...modelIdChunk],
    });

    for (const row of result.rows) {
      movements.set(String(row.model_id), {
        baselineInputPrice: Number(row.baseline_input_price),
        baselineOutputPrice: Number(row.baseline_output_price),
        baselineCapturedAt:
          row.baseline_captured_at === null ? null : String(row.baseline_captured_at),
        currentInputPrice: Number(row.current_input_price),
        currentOutputPrice: Number(row.current_output_price),
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
    if (
      latestPrice === undefined ||
      (latestPrice.inputPrice === model.inputPrice && latestPrice.outputPrice === model.outputPrice)
    ) continue;

    const activeMovement = movements.get(model.modelId);
    const baselineInputPrice = activeMovement?.baselineInputPrice ?? latestPrice.inputPrice;
    const baselineOutputPrice = activeMovement?.baselineOutputPrice ?? latestPrice.outputPrice;
    const baselineCapturedAt = activeMovement?.baselineCapturedAt ?? latestPrice.capturedAt;
    if (
      baselineInputPrice === model.inputPrice &&
      baselineOutputPrice === model.outputPrice
    ) {
      movements.delete(model.modelId);
      movementStatements.push({
        sql: "DELETE FROM price_movements WHERE model_id = ?",
        args: [model.modelId],
      });
      continue;
    }

    const movement = {
      baselineInputPrice,
      baselineOutputPrice,
      baselineCapturedAt,
      currentInputPrice: model.inputPrice,
      currentOutputPrice: model.outputPrice,
      changedAt: capturedAtIso,
    };
    movements.set(model.modelId, movement);
    movementStatements.push({
      sql: `INSERT INTO price_movements (
        model_id, baseline_price, baseline_captured_at,
        baseline_input_price, baseline_output_price,
        current_price, current_input_price, current_output_price, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        baseline_price = excluded.baseline_price,
        baseline_captured_at = excluded.baseline_captured_at,
        baseline_input_price = excluded.baseline_input_price,
        baseline_output_price = excluded.baseline_output_price,
        current_price = excluded.current_price,
        current_input_price = excluded.current_input_price,
        current_output_price = excluded.current_output_price,
        changed_at = excluded.changed_at`,
      args: [
        model.modelId,
        (baselineInputPrice * 3 + baselineOutputPrice) / 4,
        baselineCapturedAt,
        baselineInputPrice,
        baselineOutputPrice,
        model.blendedPrice,
        model.inputPrice,
        model.outputPrice,
        capturedAtIso,
      ],
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
