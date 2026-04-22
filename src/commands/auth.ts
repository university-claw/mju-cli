import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";
import { createMigrateUsersCommand } from "./migrate-users.js";

export function createAuthCommand(getGlobals: () => GlobalOptions): Command {
  const auth = new Command("auth").description("Authenticate and manage saved LMS credentials");

  auth.addCommand(createMigrateUsersCommand(getGlobals));

  auth
    .command("login")
    .description("Log in to LMS and save credentials")
    .requiredOption("--id <id>", "MJU user id")
    .requiredOption("--password <password>", "MJU password")
    .action(async (options: { id: string; password: string }) => {
      const globals = getGlobals();
      const config = resolveLmsRuntimeConfig({
        appDataDir: globals.appDir,
        userId: options.id,
        password: options.password
      });
      const authManager = new AuthManager(config);
      const result = await authManager.loginAndStore(options.id, options.password);

      printData(
        {
          profile: result.profile,
          profileFile: result.profileFile,
          credentialTarget: result.credentialTarget,
          sessionFile: result.sessionFile,
          snapshot: result.snapshot
        },
        globals.format
      );
    });

  auth
    .command("status")
    .description("Show stored authentication status")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.status(), globals.format);
    });

  auth
    .command("logout")
    .description("Delete saved LMS session only")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.logout(), globals.format);
    });

  auth
    .command("forget")
    .description("Delete saved credentials and LMS session")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.forget(), globals.format);
    });

  return auth;
}
