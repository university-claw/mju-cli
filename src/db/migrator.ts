import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PgPool } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src → dist 빌드 이후 dist/db/migrator.js 기준 두 단계 상위가 레포 루트.
// tsx 로 src/db/migrator.ts 를 직접 돌려도 같은 상대 구조라 동일하게 동작한다.
const migrationsDir = path.resolve(__dirname, "..", "..", "migrations");

function assertSafeSchemaName(schema: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`unsafe schema name: ${schema}`);
  }
}

async function ensureMigrationTable(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  schema: string
): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export interface RunMigrationsResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrations(
  pool: PgPool,
  schema: string
): Promise<RunMigrationsResult> {
  assertSafeSchemaName(schema);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // 동시에 기동된 두 인스턴스가 마이그레이션을 동시 적용하지 못하도록 advisory lock.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `migrations:${schema}`
    ]);
    await ensureMigrationTable(client, schema);

    const appliedRows = await client.query<{ version: string }>(
      `SELECT version FROM ${schema}.schema_migrations`
    );
    const appliedVersions = new Set(appliedRows.rows.map((row) => row.version));

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    for (const file of files) {
      if (appliedVersions.has(file)) {
        alreadyApplied.push(file);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query(
        `INSERT INTO ${schema}.schema_migrations (version) VALUES ($1)`,
        [file]
      );
      applied.push(file);
    }

    await client.query("COMMIT");
    return { applied, alreadyApplied };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
