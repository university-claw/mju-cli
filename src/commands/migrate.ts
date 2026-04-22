import { Command } from "commander";

import { resolveUserDataDbConfig } from "../db/config.js";
import { createUserDataPool } from "../db/client.js";
import { runMigrations } from "../db/migrator.js";
import type { GlobalOptions } from "../types.js";

export function createMigrateCommand(
  getGlobals: () => GlobalOptions
): Command {
  const command = new Command("migrate")
    .description(
      "user_data 스키마 DB 마이그레이션을 실행합니다 (MJU_STORAGE=postgres 용)"
    )
    .action(async () => {
      const globals = getGlobals();
      const config = resolveUserDataDbConfig();
      const pool = createUserDataPool(config);

      try {
        const result = await runMigrations(pool, config.schema);
        const payload = {
          ok: true,
          schema: config.schema,
          host: config.host,
          database: config.database,
          applied: result.applied,
          alreadyApplied: result.alreadyApplied
        };

        if (globals.format === "json") {
          process.stdout.write(`${JSON.stringify(payload)}\n`);
        } else {
          process.stdout.write(
            `schema=${config.schema} applied=${result.applied.length} skipped=${result.alreadyApplied.length}\n`
          );
          for (const file of result.applied) {
            process.stdout.write(`  + ${file}\n`);
          }
        }
      } finally {
        await pool.end();
      }
    });

  return command;
}
