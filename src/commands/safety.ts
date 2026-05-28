import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { CliError } from "../errors.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { printData } from "../output/print.js";
import {
  checkSafetyEducationCompletion,
  runSafetyEducationIncompleteVideoLog,
  runSafetyEducationIncompleteVideoLogs,
  selectSafetyEducationCourses
} from "../safety/education.js";
import type { GlobalOptions } from "../types.js";

async function createSafetyCredentials(globals: GlobalOptions): Promise<
  Awaited<ReturnType<AuthManager["resolveCredentials"]>>
> {
  const authManager = new AuthManager(
    resolveLmsRuntimeConfig({ appDataDir: globals.appDir })
  );
  return authManager.resolveCredentials();
}

export function createSafetyCommand(getGlobals: () => GlobalOptions): Command {
  const safety = new Command("safety").description("Safety education services");

  safety
    .command("summary")
    .description("Show the planned command surface for Safety")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: "safety",
          implemented: {
            education: [
              "select-courses",
              "check-completion",
              "run-incomplete-video",
              "run-incomplete-videos"
            ]
          }
        },
        globals.format
      );
    });

  const education = new Command("education").description("Research lab safety education");

  education
    .command("select-courses")
    .description("Select default latest safety education courses if course selection is required")
    .option("--dry-run", "show courses that would be selected without saving")
    .option("--show-browser", "show the browser window while selecting courses")
    .action(async (options: { dryRun?: boolean; showBrowser?: boolean }) => {
      const globals = getGlobals();
      const credentials = await createSafetyCredentials(globals);
      const result = await selectSafetyEducationCourses({
        userId: credentials.userId,
        password: credentials.password,
        dryRun: options.dryRun === true,
        headless: options.showBrowser !== true
      });

      printData(result, globals.format);
    });

  education
    .command("check-completion")
    .description("Check whether every video in the default safety education course is completed")
    .option("--show-browser", "show the browser window while checking completion")
    .action(async (options: { showBrowser?: boolean }) => {
      const globals = getGlobals();
      const credentials = await createSafetyCredentials(globals);
      const result = await checkSafetyEducationCompletion({
        userId: credentials.userId,
        password: credentials.password,
        headless: options.showBrowser !== true
      });

      printData(result, globals.format);
    });

  education
    .command("run-incomplete-video")
    .description(
      "Open an incomplete safety education video and run the fixed console.log probe"
    )
    .option("--row <number>", "target a specific incomplete course row number")
    .option("--show-browser", "show the browser window while running the probe")
    .action(async (options: { row?: string; showBrowser?: boolean }) => {
      const globals = getGlobals();
      const credentials = await createSafetyCredentials(globals);
      let rowNumber: number | undefined;
      if (options.row !== undefined) {
        const parsedRowNumber = Number.parseInt(options.row, 10);
        if (!Number.isInteger(parsedRowNumber) || parsedRowNumber <= 0) {
          throw new CliError("--row 값은 1 이상의 정수여야 합니다.");
        }

        rowNumber = parsedRowNumber;
      }
      const result = await runSafetyEducationIncompleteVideoLog({
        userId: credentials.userId,
        password: credentials.password,
        ...(rowNumber !== undefined ? { rowNumber } : {}),
        headless: options.showBrowser !== true
      });

      printData(result, globals.format);
    });

  education
    .command("run-incomplete-videos")
    .description(
      "Select courses if needed, run the fixed console.log probe for every incomplete video, then return completion"
    )
    .option("--show-browser", "show the browser window while running the flow")
    .action(async (options: { showBrowser?: boolean }) => {
      const globals = getGlobals();
      const credentials = await createSafetyCredentials(globals);
      const result = await runSafetyEducationIncompleteVideoLogs({
        userId: credentials.userId,
        password: credentials.password,
        headless: options.showBrowser !== true
      });

      printData(result, globals.format);
    });

  safety.addCommand(education);

  return safety;
}
