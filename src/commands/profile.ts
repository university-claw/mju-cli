import { Command } from "commander";

import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { printData } from "../output/print.js";
import { PreferredNameManager } from "../profile/preferred-name.js";
import { createAuthProfileStore, resolveStorageContext } from "../storage/resolver.js";
import type { GlobalOptions } from "../types.js";

function createManager(globals: GlobalOptions): PreferredNameManager {
  const config = resolveLmsRuntimeConfig({ appDataDir: globals.appDir });
  const context = resolveStorageContext(config.appDataDir);
  const profileStore = createAuthProfileStore(context, config.profileFile);
  return new PreferredNameManager(profileStore, context.userKey);
}

export function createProfileCommand(getGlobals: () => GlobalOptions): Command {
  const profile = new Command("profile").description(
    "Inspect and manage per-user profile preferences"
  );

  profile
    .command("get")
    .description("Show the current user's saved preferred name")
    .action(async () => {
      const globals = getGlobals();
      printData(await createManager(globals).get(), globals.format);
    });

  profile
    .command("set-preferred-name")
    .description("Save the current user's preferred display name")
    .requiredOption("--name <name>", "preferred display name")
    .action(async (options: { name: string }) => {
      const globals = getGlobals();
      printData(
        await createManager(globals).setPreferredName(options.name),
        globals.format
      );
    });

  profile
    .command("clear-preferred-name")
    .description("Remove the current user's preferred display name")
    .action(async () => {
      const globals = getGlobals();
      printData(await createManager(globals).clearPreferredName(), globals.format);
    });

  return profile;
}
