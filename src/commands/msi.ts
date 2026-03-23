import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { MjuMsiClient } from "../msi/client.js";
import { resolveMsiRuntimeConfig } from "../msi/config.js";
import {
  getMsiCurrentTermGrades,
  getMsiGradeHistory,
  getMsiGraduationRequirements,
  getMsiTimetable
} from "../msi/services.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";

function parseOptionalInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} 는 정수여야 합니다.`);
  }

  return parsed;
}

async function createMsiClientWithCredentials(globals: GlobalOptions): Promise<{
  client: MjuMsiClient;
  credentials: Awaited<ReturnType<AuthManager["resolveCredentials"]>>;
}> {
  const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
  const credentials = await authManager.resolveCredentials();
  const client = new MjuMsiClient(resolveMsiRuntimeConfig({ appDataDir: globals.appDir }));

  return { client, credentials };
}

export function createMsiCommand(getGlobals: () => GlobalOptions): Command {
  const msi = new Command("msi").description(
    "Timetable, grades, and graduation requirements"
  );

  msi
    .command("summary")
    .description("Show the planned command surface for MSI")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: "msi",
          implemented: {
            timetable: ["get"],
            grades: ["current", "history"],
            graduation: ["requirements"]
          },
          planned: {}
        },
        globals.format
      );
    });

  msi
    .command("timetable")
    .description("Get MSI timetable")
    .option("--year <year>", "target year")
    .option("--term-code <code>", "target term code")
    .action(async (options: { year?: string; termCode?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const year = parseOptionalInt(options.year, "year");
      const termCode = parseOptionalInt(options.termCode, "term-code");
      const result = await getMsiTimetable(client, credentials, {
        ...(year !== undefined ? { year } : {}),
        ...(termCode !== undefined ? { termCode } : {})
      });

      printData(result, globals.format);
    });

  msi
    .command("current-grades")
    .description("Get current term grades")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const result = await getMsiCurrentTermGrades(client, credentials);
      printData(result, globals.format);
    });

  msi
    .command("grade-history")
    .description("Get full grade history")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const result = await getMsiGradeHistory(client, credentials);
      printData(result, globals.format);
    });

  msi
    .command("graduation")
    .description("Get graduation requirements")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const result = await getMsiGraduationRequirements(client, credentials);
      printData(result, globals.format);
    });

  return msi;
}
