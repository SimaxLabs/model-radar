import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    modelId: text("model_id").notNull(),
    capturedOn: text("captured_on").notNull(),
    inputPrice: real("input_price").notNull(),
    outputPrice: real("output_price").notNull(),
    blendedPrice: real("blended_price").notNull(),
    capturedAt: text("captured_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.modelId, table.capturedOn] }),
    index("price_snapshots_model_date").on(table.modelId, table.capturedOn),
  ],
);

export const priceMovements = sqliteTable(
  "price_movements",
  {
    modelId: text("model_id").primaryKey(),
    baselinePrice: real("baseline_price").notNull(),
    currentPrice: real("current_price").notNull(),
    changedAt: text("changed_at").notNull(),
  },
  (table) => [index("price_movements_changed_at").on(table.changedAt)],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  capturedAt: text("captured_at").notNull(),
  modelCount: integer("model_count").notNull(),
  rankedCount: integer("ranked_count").notNull(),
});

export const schema = { priceSnapshots, priceMovements, syncRuns };
