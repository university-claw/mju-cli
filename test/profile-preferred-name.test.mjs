import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { AuthManager } from "../dist/auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../dist/lms/config.js";

const execFileAsync = promisify(execFile);

async function makeAppDir() {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-profile-"));
  await fs.mkdir(path.join(appDir, "state"), { recursive: true });
  await fs.writeFile(
    path.join(appDir, "state", "profile.json"),
    JSON.stringify(
      {
        userId: "60210000",
        authMode: "file-encrypted",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        lastLoginAt: "2026-05-14T00:00:00.000Z"
      },
      null,
      2
    )
  );
  return appDir;
}

async function runMju(appDir, args) {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(process.cwd(), "dist", "main.js"),
    "--app-dir",
    appDir,
    "--format",
    "json",
    ...args
  ]);
  return JSON.parse(stdout);
}

async function runMjuExpectFailure(appDir, args) {
  try {
    await runMju(appDir, args);
  } catch (error) {
    return {
      exitCode: error.code,
      message: error.message,
      stderr: error.stderr ?? "",
      stdout: error.stdout ?? ""
    };
  }
  throw new Error("Expected mju command to fail");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

test("profile preferred name is stored inside existing profile payload", async () => {
  const appDir = await makeAppDir();
  try {
    assert.deepEqual(await runMju(appDir, ["profile", "get"]), {
      ok: true,
      userKey: path.basename(appDir),
      profileExists: true,
      storedUserId: "60210000",
      hasPreferredName: false,
      preferredName: null
    });

    const setResult = await runMju(appDir, [
      "profile",
      "set-preferred-name",
      "--name",
      "  병수\n님  "
    ]);
    assert.equal(setResult.ok, true);
    assert.equal(setResult.preferredName, "병수 님");
    assert.equal(setResult.hasPreferredName, true);

    const stored = JSON.parse(
      await fs.readFile(path.join(appDir, "state", "profile.json"), "utf8")
    );
    assert.equal(stored.preferredName, "병수 님");
    assert.equal(stored.userId, "60210000");
    assert.equal(stored.authMode, "file-encrypted");
    assert.notEqual(stored.updatedAt, "2026-05-14T00:00:00.000Z");

    const getResult = await runMju(appDir, ["profile", "get"]);
    assert.equal(getResult.preferredName, "병수 님");
    assert.equal(getResult.hasPreferredName, true);

    const clearResult = await runMju(appDir, ["profile", "clear-preferred-name"]);
    assert.equal(clearResult.ok, true);
    assert.equal(clearResult.hasPreferredName, false);
    assert.equal(clearResult.preferredName, null);

    const cleared = JSON.parse(
      await fs.readFile(path.join(appDir, "state", "profile.json"), "utf8")
    );
    assert.equal(Object.hasOwn(cleared, "preferredName"), false);
  } finally {
    await fs.rm(appDir, { recursive: true, force: true });
  }
});

test("profile preferred name commands report missing profile without creating one", async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-profile-missing-"));
  try {
    const result = await runMju(appDir, ["profile", "get"]);
    assert.deepEqual(result, {
      ok: true,
      userKey: path.basename(appDir),
      profileExists: false,
      storedUserId: null,
      hasPreferredName: false,
      preferredName: null
    });

    const failure = await runMjuExpectFailure(appDir, [
      "profile",
      "set-preferred-name",
      "--name",
      "준현"
    ]);
    assert.equal(failure.exitCode, 1);
    assert.match(`${failure.stderr}\n${failure.stdout}\n${failure.message}`, /프로필이 없습니다/);
    assert.equal(
      await fileExists(path.join(appDir, "state", "profile.json")),
      false
    );
  } finally {
    await fs.rm(appDir, { recursive: true, force: true });
  }
});

test("profile preferred name rejects invalid values", async () => {
  const appDir = await makeAppDir();
  try {
    const blankFailure = await runMjuExpectFailure(appDir, [
      "profile",
      "set-preferred-name",
      "--name",
      "   \n\t   "
    ]);
    assert.equal(blankFailure.exitCode, 1);
    assert.match(blankFailure.stderr, /비워둘 수 없습니다/);

    const longFailure = await runMjuExpectFailure(appDir, [
      "profile",
      "set-preferred-name",
      "--name",
      "a".repeat(81)
    ]);
    assert.equal(longFailure.exitCode, 1);
    assert.match(longFailure.stderr, /80자 이하여야 합니다/);

    const stored = JSON.parse(
      await fs.readFile(path.join(appDir, "state", "profile.json"), "utf8")
    );
    assert.equal(Object.hasOwn(stored, "preferredName"), false);
  } finally {
    await fs.rm(appDir, { recursive: true, force: true });
  }
});

test("auth login preserves an existing preferred name", async () => {
  const appDir = await makeAppDir();
  try {
    const profilePath = path.join(appDir, "state", "profile.json");
    const existing = JSON.parse(await fs.readFile(profilePath, "utf8"));
    await fs.writeFile(
      profilePath,
      JSON.stringify(
        {
          ...existing,
          preferredName: "Captain"
        },
        null,
        2
      )
    );

    const savedPasswords = new Map();
    const passwordVault = {
      authMode: "file-encrypted",
      async savePassword(targetName, _userName, password) {
        savedPasswords.set(targetName, password);
      },
      async getPassword(targetName) {
        return savedPasswords.get(targetName) ?? null;
      },
      async deletePassword(targetName) {
        return savedPasswords.delete(targetName);
      },
      async hasPassword(targetName) {
        return savedPasswords.has(targetName);
      }
    };
    const clientFactory = () => ({
      async authenticateAndSnapshot() {
        return {
          loggedIn: true,
          usedSavedSession: false,
          mainFinalUrl: "https://example.test/lms",
          cookieCount: 1,
          courseCandidatesCount: 0,
          sessionPath: path.join(appDir, "state", "lms-session.json"),
          mainHtmlPath: path.join(appDir, "snapshots", "lms-main.html"),
          coursesPath: path.join(appDir, "snapshots", "lms-courses.json")
        };
      }
    });

    const manager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: appDir }), {
      passwordVault,
      clientFactory
    });

    const result = await manager.loginAndStore("60210000", "test-password");
    assert.equal(result.profile.preferredName, "Captain");

    const stored = JSON.parse(await fs.readFile(profilePath, "utf8"));
    assert.equal(stored.preferredName, "Captain");
  } finally {
    await fs.rm(appDir, { recursive: true, force: true });
  }
});
