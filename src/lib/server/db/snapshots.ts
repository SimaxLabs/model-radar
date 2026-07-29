import type { InStatement } from "@libsql/client";
import { getDatabase } from "$lib/server/db/client";
import { syncRuns } from "$lib/server/db/schema";

interface SnapshotInput {
  modelId: string;
  inputPrice: number;
  outputPrice: number;
  blendedPrice: number;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

export async function getPreviousPrices(modelIds: string[], beforeDate: string) {
  const previous = new Map<string, number>();
  if (modelIds.length === 0) return previous;
  const { client } = await getDatabase();

  for (const modelIdChunk of chunks(modelIds, 200)) {
    const placeholders = modelIdChunk.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT current.model_id, current.blended_price
        FROM price_snapshots current
        INNER JOIN (
          SELECT model_id, MAX(captured_on) AS captured_on
          FROM price_snapshots
          WHERE captured_on < ? AND model_id IN (${placeholders})
          GROUP BY model_id
        ) previous
        ON current.model_id = previous.model_id
        AND current.captured_on = previous.captured_on`,
      args: [beforeDate, ...modelIdChunk],
    });

    for (const row of result.rows) {
      previous.set(String(row.model_id), Number(row.blended_price));
    }
  }

  return previous;
}

export async function saveDailySnapshot(
  models: SnapshotInput[],
  capturedAt: Date,
  rankedCount: number,
) {
  const { client, db } = await getDatabase();
  const capturedOn = capturedAt.toISOString().slice(0, 10);
  const capturedAtIso = capturedAt.toISOString();
  let changedRows = 0;

  const statements: InStatement[] = models.map((model) => ({
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

  for (const statementChunk of chunks(statements, 100)) {
    const results = await client.batch(statementChunk, "write");
    changedRows += results.reduce((total, result) => total + result.rowsAffected, 0);
  }

  if (changedRows > 0) {
    await db.insert(syncRuns).values({
      capturedAt: capturedAtIso,
      modelCount: models.length,
      rankedCount,
    });
  }
}
