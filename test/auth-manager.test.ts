import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AuthManager } from "../src/auth/auth-manager.ts";
import type { PasswordVault } from "../src/auth/password-vault.ts";
import { resolveLmsRuntimeConfig } from "../src/lms/config.ts";
import type { LoginSnapshotResult } from "../src/lms/types.ts";

class MemoryPasswordVault implements PasswordVault {
  readonly authMode = "windows-credential-manager" as const;
  private readonly passwords = new Map<string, string>();

  async savePassword(targetName: string, _userName: string, password: string): Promise<void> {
    this.passwords.set(targetName, password);
  }

  async getPassword(targetName: string): Promise<string | null> {
    return this.passwords.get(targetName) ?? null;
  }

  async deletePassword(targetName: string): Promise<boolean> {
    return this.passwords.delete(targetName);
  }

  async hasPassword(targetName: string): Promise<boolean> {
    return this.passwords.has(targetName);
  }
}

function createSnapshot(sessionPath: string, mainHtmlPath: string, coursesPath: string): LoginSnapshotResult {
  return {
    loggedIn: true,
    usedSavedSession: false,
    mainFinalUrl: "https://lms.example.com/main",
    cookieCount: 3,
    courseCandidatesCount: 2,
    sessionPath,
    mainHtmlPath,
    coursesPath
  };
}

test("AuthManager.status reports unauthenticated before login", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-auth-status-initial-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const config = resolveLmsRuntimeConfig({ appDataDir: tempDir });
  const authManager = new AuthManager(config, {
    passwordVault: new MemoryPasswordVault()
  });

  const status = await authManager.status();

  assert.equal(status.authenticated, false);
  assert.equal(status.profileExists, false);
  assert.equal(status.passwordStored, false);
  assert.equal(status.sessionFileExists, false);
});

test("AuthManager.status stays authenticated after logout when stored credentials remain", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-auth-logout-status-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const config = resolveLmsRuntimeConfig({ appDataDir: tempDir });
  const vault = new MemoryPasswordVault();
  const authManager = new AuthManager(config, {
    passwordVault: vault,
    clientFactory: () =>
      ({
        async authenticateAndSnapshot() {
          return createSnapshot(config.sessionFile, config.mainHtmlFile, config.coursesFile);
        },
        async clearSavedSession() {
          await fs.rm(config.sessionFile);
          return true;
        }
      }) as never
  });

  await authManager.loginAndStore("60123456", "logout-secret");
  await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
  await fs.writeFile(config.sessionFile, "saved-session", "utf8");

  await authManager.logout();

  const status = await authManager.status();

  assert.equal(status.authenticated, true);
  assert.equal(status.profileExists, true);
  assert.equal(status.passwordStored, true);
  assert.equal(status.sessionFileExists, false);
});

test("AuthManager.forget clears authenticated state", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-auth-forget-status-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const config = resolveLmsRuntimeConfig({ appDataDir: tempDir });
  const vault = new MemoryPasswordVault();
  const authManager = new AuthManager(config, {
    passwordVault: vault,
    clientFactory: () =>
      ({
        async authenticateAndSnapshot() {
          return createSnapshot(config.sessionFile, config.mainHtmlFile, config.coursesFile);
        },
        async clearSavedSession() {
          await fs.rm(config.sessionFile);
          return true;
        }
      }) as never
  });

  await authManager.loginAndStore("60123456", "forget-secret");
  await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
  await fs.writeFile(config.sessionFile, "saved-session", "utf8");

  await authManager.forget();

  const status = await authManager.status();

  assert.equal(status.authenticated, false);
  assert.equal(status.profileExists, false);
  assert.equal(status.passwordStored, false);
  assert.equal(status.sessionFileExists, false);
});
