import type { Client, InStatement } from "@libsql/client";
import { calculateBlendedPrice } from "$lib/scoring";
import { PRICE_HISTORY_RETENTION_DAYS } from "$lib/types";
import { getDatabase } from "$lib/server/db/client";

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
  changedAt: string;
}

interface LatestPrice {
  inputPrice: number;
  outputPrice: number;
  blendedPrice: number;
  capturedAt: string;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

async function getLatestPrices(client: Client, modelIds: string[], capturedOn: string, cutoffOn: string) {
  const today = new Map<string, LatestPrice>();
  const previous = new Map<string, LatestPrice>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT model_id, input_price, output_price, blended_price, captured_on, captured_at
        FROM price_snapshots WHERE (model_id, captured_on) IN (
          SELECT model_id, MAX(captured_on)
          FROM price_snapshots
          WHERE model_id IN (${placeholders}) AND captured_on BETWEEN ? AND ?
          GROUP BY model_id, (captured_on = ?)
        )`,
      args: [...modelIdChunk, cutoffOn, capturedOn, capturedOn],
    });

    for (const row of result.rows) {
      (row.captured_on === capturedOn ? today : previous).set(String(row.model_id), {
        inputPrice: Number(row.input_price),
        outputPrice: Number(row.output_price),
        blendedPrice: Number(row.blended_price),
        capturedAt: String(row.captured_at),
      });
    }
  }

  return { today, previous };
}

async function getActiveMovements(client: Client, modelIds: string[], cutoffAt: string) {
  const movements = new Map<string, ActivePriceMovement>();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT model_id, baseline_input_price, baseline_output_price,
          baseline_captured_at, changed_at
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
        changedAt: String(row.changed_at),
      });
    }
  }

  return movements;
}

function updateMovement(
  model: SnapshotInput, previous: LatestPrice, capturedAtIso: string,
  movements: Map<string, ActivePriceMovement>,
): InStatement | undefined {
  const active = movements.get(model.modelId);
  const baselineInputPrice = active?.baselineInputPrice ?? previous.inputPrice;
  const baselineOutputPrice = active?.baselineOutputPrice ?? previous.outputPrice;
  const baselineCapturedAt = active?.baselineCapturedAt ?? previous.capturedAt;
  if (baselineInputPrice === model.inputPrice && baselineOutputPrice === model.outputPrice) {
    if (!movements.delete(model.modelId)) return;
    return {
      sql: "DELETE FROM price_movements WHERE model_id = ?",
      args: [model.modelId],
    };
  }

  movements.set(model.modelId, { baselineInputPrice, baselineOutputPrice, baselineCapturedAt, changedAt: capturedAtIso });
  return {
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
      model.modelId, calculateBlendedPrice(baselineInputPrice, baselineOutputPrice), baselineCapturedAt,
      baselineInputPrice, baselineOutputPrice, model.blendedPrice, model.inputPrice, model.outputPrice, capturedAtIso,
    ],
  };
}

export async function syncPriceHistory(models: SnapshotInput[], capturedAt: Date) {
  const { client } = await getDatabase();
  const capturedAtIso = capturedAt.toISOString();
  const capturedOn = capturedAtIso.slice(0, 10);
  const cutoffAtIso = new Date(capturedAt.getTime() - PRICE_HISTORY_RETENTION_DAYS * 86_400_000).toISOString();
  const cutoffOn = cutoffAtIso.slice(0, 10);
  const modelIds = models.map((model) => model.modelId);
  const { today, previous } = await getLatestPrices(client, modelIds, capturedOn, cutoffOn);
  const movements = await getActiveMovements(client, modelIds, cutoffAtIso);
  let statements: InStatement[] = [];

  for (const model of models) {
    const current = today.get(model.modelId);
    const priorDay = previous.get(model.modelId);
    const last = current ?? priorDay;
    const ratesChanged = !last || last.inputPrice !== model.inputPrice || last.outputPrice !== model.outputPrice;
    if (!ratesChanged && current?.blendedPrice === model.blendedPrice) continue;

    const movement = ratesChanged && priorDay ? updateMovement(model, priorDay, capturedAtIso, movements) : undefined;
    if (statements.length + (movement ? 2 : 1) > 100) {
      await client.batch(statements, "write");
      statements = [];
    }
    if (movement) statements.push(movement);
    statements.push({
      sql: `INSERT INTO price_snapshots (
        model_id, captured_on, input_price, output_price, blended_price, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id, captured_on) DO UPDATE SET
        input_price = excluded.input_price,
        output_price = excluded.output_price,
        blended_price = excluded.blended_price,
        captured_at = excluded.captured_at`,
      args: [model.modelId, capturedOn, model.inputPrice, model.outputPrice, model.blendedPrice, capturedAtIso],
    });
  }
  if (statements.length) await client.batch(statements, "write");

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

  return movements;
}
