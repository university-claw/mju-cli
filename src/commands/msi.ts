import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { MjuMsiClient } from "../msi/client.js";
import { resolveMsiRuntimeConfig } from "../msi/config.js";
import {
  getMsiCourseScores,
  getMsiCurrentTermGrades,
  getMsiGradeHistory,
  getMsiGraduationRequirements,
  getMsiLastClassTimes,
  getMsiTimetable,
  listMsiLectureEvaluations,
  previewMsiLectureEvaluationSubmit,
  submitMsiLectureEvaluations
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
    "Timetable, grades, graduation requirements, and lecture evaluations"
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
            timetable: ["get", "+last-class-times"],
            grades: ["current", "history", "course-scores"],
            graduation: ["requirements"],
            lectureEvaluations: ["list", "preview", "submit"],
            session: ["logout"]
          },
          planned: {}
        },
        globals.format
      );
    });

  msi
    .command("logout")
    .description("Delete saved MSI session only")
    .action(async () => {
      const globals = getGlobals();
      const config = resolveMsiRuntimeConfig({ appDataDir: globals.appDir });
      const client = new MjuMsiClient(config);
      const deletedSession = await client.clearSavedSession();

      printData(
        {
          service: "msi",
          sessionFile: config.sessionFile,
          deletedSession
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
    .command("+last-class-times")
    .description("Get the last class ending time for each weekday")
    .option("--year <year>", "target year")
    .option("--term-code <code>", "target term code")
    .action(async (options: { year?: string; termCode?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const year = parseOptionalInt(options.year, "year");
      const termCode = parseOptionalInt(options.termCode, "term-code");
      const result = await getMsiLastClassTimes(client, credentials, {
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
    .command("course-scores")
    .description("Get in-progress course scores")
    .option("--year <year>", "target year")
    .option("--term-code <code>", "target term code")
    .action(async (options: { year?: string; termCode?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const year = parseOptionalInt(options.year, "year");
      const result = await getMsiCourseScores(client, credentials, {
        ...(year !== undefined ? { year } : {}),
        ...(options.termCode !== undefined ? { termCode: options.termCode } : {})
      });

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

  const lectureEvaluations = new Command("lecture-evaluations").description(
    "List, preview, and submit MSI lecture evaluations"
  );

  lectureEvaluations
    .command("list")
    .description("List available MSI lecture evaluation targets")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createMsiClientWithCredentials(globals);
      const result = await listMsiLectureEvaluations(client, credentials);

      printData(result, globals.format);
    });

  lectureEvaluations
    .command("preview")
    .description("Preview inferred MSI lecture evaluation answers")
    .option("--instruction <text>", "natural-language instruction such as 보통으로")
    .option(
      "--satisfaction <value>",
      "매우만족, 만족, 보통, 불만족, 매우불만족"
    )
    .option("--target <id-or-title>", "target evaluation id or title fragment")
    .option("--all", "select all available evaluation targets")
    .action(
      async (options: {
        instruction?: string;
        satisfaction?: string;
        target?: string;
        all?: boolean;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createMsiClientWithCredentials(globals);
        const result = await previewMsiLectureEvaluationSubmit(client, credentials, {
          ...(options.instruction ? { instruction: options.instruction } : {}),
          ...(options.satisfaction ? { satisfaction: options.satisfaction } : {}),
          ...(options.target ? { target: options.target } : {}),
          ...(options.all ? { all: true } : {})
        });

        printData(result, globals.format);
      }
    );

  lectureEvaluations
    .command("submit")
    .description("Submit MSI lecture evaluations")
    .option("--instruction <text>", "natural-language instruction such as 보통으로")
    .option(
      "--satisfaction <value>",
      "매우만족, 만족, 보통, 불만족, 매우불만족"
    )
    .option("--target <id-or-title>", "target evaluation id or title fragment")
    .option("--all", "submit all available evaluation targets")
    .option("--comment <text>", "optional free-text evaluation comment")
    .action(
      async (options: {
        instruction?: string;
        satisfaction?: string;
        target?: string;
        all?: boolean;
        comment?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createMsiClientWithCredentials(globals);
        const result = await submitMsiLectureEvaluations(client, credentials, {
          ...(options.instruction ? { instruction: options.instruction } : {}),
          ...(options.satisfaction ? { satisfaction: options.satisfaction } : {}),
          ...(options.target ? { target: options.target } : {}),
          ...(options.all ? { all: true } : {}),
          ...(options.comment ? { comment: options.comment } : {})
        });

        printData(result, globals.format);
      }
    );

  msi.addCommand(lectureEvaluations);

  return msi;
}
