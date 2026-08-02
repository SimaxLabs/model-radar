import { createClient, type Client } from "@libsql/client/node";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "$env/dynamic/private";
import fs from "node:fs";
import path from "node:path";
import { schema } from "$lib/server/db/schema";

interface DatabaseConnection {
  client: Client;
  db: LibSQLDatabase<typeof schema>;
  kind: "local" | "turso";
}

let connection: DatabaseConnection | null = null;
let schemaPromise: Promise<void> | null = null;

const migrations = [
  {
    id: "0000_model_radar",
    statements: [
      `CREATE TABLE IF NOT EXISTS price_snapshots (
        model_id TEXT NOT NULL,
        captured_on TEXT NOT NULL,
        input_price REAL NOT NULL,
        output_price REAL NOT NULL,
        blended_price REAL NOT NULL,
        captured_at TEXT NOT NULL,
        PRIMARY KEY (model_id, captured_on)
      )`,
      `CREATE INDEX IF NOT EXISTS price_snapshots_model_date
        ON price_snapshots (model_id, captured_on DESC)`,
      `CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        model_count INTEGER NOT NULL,
        ranked_count INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "0001_active_price_movements",
    statements: [
      `CREATE TABLE IF NOT EXISTS price_movements (
        model_id TEXT PRIMARY KEY,
        baseline_price REAL NOT NULL,
        current_price REAL NOT NULL,
        changed_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS price_movements_changed_at
        ON price_movements (changed_at)`,
    ],
  },
  {
    id: "0002_price_movement_baseline_time",
    statements: [
      "ALTER TABLE price_movements ADD COLUMN baseline_captured_at TEXT",
      `UPDATE price_movements
        SET baseline_captured_at = COALESCE(
          (
            SELECT captured_at
            FROM price_snapshots
            WHERE price_snapshots.model_id = price_movements.model_id
              AND price_snapshots.blended_price = price_movements.baseline_price
            ORDER BY captured_on DESC
            LIMIT 1
          ),
          changed_at
        )
        WHERE baseline_captured_at IS NULL`,
    ],
  },
  {
    id: "0003_direct_price_movements",
    statements: [
      "ALTER TABLE price_movements ADD COLUMN baseline_input_price REAL",
      "ALTER TABLE price_movements ADD COLUMN baseline_output_price REAL",
      "ALTER TABLE price_movements ADD COLUMN current_input_price REAL",
      "ALTER TABLE price_movements ADD COLUMN current_output_price REAL",
      `UPDATE price_movements
        SET baseline_input_price = (
          SELECT input_price
          FROM price_snapshots
          WHERE price_snapshots.model_id = price_movements.model_id
            AND price_snapshots.blended_price = price_movements.baseline_price
          ORDER BY captured_on DESC
          LIMIT 1
        ),
        baseline_output_price = (
          SELECT output_price
          FROM price_snapshots
          WHERE price_snapshots.model_id = price_movements.model_id
            AND price_snapshots.blended_price = price_movements.baseline_price
          ORDER BY captured_on DESC
          LIMIT 1
        ),
        current_input_price = (
          SELECT input_price
          FROM price_snapshots
          WHERE price_snapshots.model_id = price_movements.model_id
            AND price_snapshots.blended_price = price_movements.current_price
          ORDER BY captured_on DESC
          LIMIT 1
        ),
        current_output_price = (
          SELECT output_price
          FROM price_snapshots
          WHERE price_snapshots.model_id = price_movements.model_id
            AND price_snapshots.blended_price = price_movements.current_price
          ORDER BY captured_on DESC
          LIMIT 1
        )`,
    ],
  },
] as const;

function createConnection(): DatabaseConnection {
  const url = env.DATABASE_URL || "file:.data/model-radar.db";
  const remote = !url.startsWith("file:") && url !== ":memory:";
  if (remote && !env.DATABASE_AUTH_TOKEN) {
    throw new Error("DATABASE_AUTH_TOKEN is required for a remote database");
  }

  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }

  const client = createClient({
    url,
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  });

  return {
    client,
    db: drizzle(client, { schema }),
    kind: remote ? "turso" : "local",
  };
}

async function ensureSchema(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS model_radar_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = await client.execute("SELECT id FROM model_radar_migrations");
  const appliedIds = new Set(applied.rows.map((row) => String(row.id)));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    await client.batch(
      [
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        {
          sql: "INSERT OR IGNORE INTO model_radar_migrations (id, applied_at) VALUES (?, ?)",
          args: [migration.id, new Date().toISOString()],
        },
      ],
      "write",
    );
  }
}

export async function getDatabase() {
  connection ??= createConnection();
  schemaPromise ??= ensureSchema(connection.client);
  await schemaPromise;
  return connection;
}
