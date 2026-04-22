import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { buildCredentialTarget } from "../auth/password-vault.js";
import type { StoredAuthProfile } from "../auth/types.js";
import { getUserDataPool } from "../storage/pool.js";
import { resolveStorageMode } from "../storage/mode.js";
import { encryptPassword } from "../storage/postgres/crypto.js";
import type { GlobalOptions } from "../types.js";

interface UserReport {
  userKey: string;
  profile: "imported" | "updated" | "missing" | "error";
  credentials: number;
  sessions: number;
  warnings: string[];
}

interface MigrateReport {
  source: string;
  dryRun: boolean;
  users: UserReport[];
  totalUsers: number;
  totalProfiles: number;
  totalCredentials: number;
  totalSessions: number;
}

// FilePasswordVault 와 동일한 safe-name 변환. 그런데 `:` 가 `_` 로 바뀌면
// 되돌릴 수 없으므로 마이그레이션 시에는 profile 의 userId 로부터 정식
// target 이름을 직접 구성하고, 그 이름을 safe-name 화해서 파일을 찾는다.
function fileSafeName(targetName: string): string {
  return targetName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readVaultKey(userDir: string): Promise<Buffer | null> {
  const keyPath = path.join(userDir, "vault", ".key");
  try {
    const key = await fs.readFile(keyPath);
    if (key.length !== 32) {
      throw new Error(`${keyPath} 의 길이가 32바이트가 아닙니다 (${key.length}).`);
    }
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function decryptFileVault(
  payloadBase64: string,
  key: Buffer
): string {
  const buf = Buffer.from(payloadBase64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString("utf8");
}

interface PersistedLmsSession {
  savedAt?: string;
  cookies?: unknown;
}

const SESSION_FILE_MAP: Array<{ file: string; service: string; kind: "cookie" | "library" }> = [
  { file: "lms-session.json", service: "lms", kind: "cookie" },
  { file: "msi-session.json", service: "msi", kind: "cookie" },
  { file: "ucheck-session.json", service: "ucheck", kind: "cookie" },
  { file: "library-session.json", service: "library", kind: "library" }
];

export function createMigrateUsersCommand(
  getGlobals: () => GlobalOptions
): Command {
  return new Command("migrate-users")
    .description(
      "파일 기반 /data/users/* 디렉토리를 스캔해 user_data 스키마로 일회성 이관합니다."
    )
    .requiredOption(
      "--source <dir>",
      "유저 디렉토리 루트 (예: /data/users)"
    )
    .option(
      "--dry-run",
      "DB 쓰기 없이 무엇을 이관할지만 출력",
      false
    )
    .option(
      "--credential-service <name>",
      "credentials target 접두사 (기본: mju-cli)",
      "mju-cli"
    )
    .action(
      async (options: {
        source: string;
        dryRun: boolean;
        credentialService: string;
      }) => {
        const globals = getGlobals();

        if (resolveStorageMode() !== "postgres") {
          throw new Error(
            "migrate-users 는 MJU_STORAGE=postgres 환경에서만 실행할 수 있습니다."
          );
        }

        const pool = getUserDataPool();
        const report: MigrateReport = {
          source: options.source,
          dryRun: options.dryRun,
          users: [],
          totalUsers: 0,
          totalProfiles: 0,
          totalCredentials: 0,
          totalSessions: 0
        };

        const entries = await fs.readdir(options.source, { withFileTypes: true });
        for (const dirent of entries) {
          if (!dirent.isDirectory()) continue;
          const userKey = dirent.name;
          const userDir = path.join(options.source, userKey);
          const userReport: UserReport = {
            userKey,
            profile: "missing",
            credentials: 0,
            sessions: 0,
            warnings: []
          };
          report.totalUsers++;

          try {
            const profile = await readOptionalJson<StoredAuthProfile>(
              path.join(userDir, "state", "profile.json")
            );

            if (profile) {
              if (!options.dryRun) {
                const result = await pool.query(
                  `
                  INSERT INTO user_data.profiles (user_key, payload, created_at, updated_at)
                  VALUES ($1, $2::jsonb, now(), now())
                  ON CONFLICT (user_key)
                  DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
                  RETURNING (xmax = 0) AS inserted
                  `,
                  [userKey, JSON.stringify(profile)]
                );
                const row = result.rows[0] as { inserted: boolean } | undefined;
                userReport.profile = row?.inserted ? "imported" : "updated";
              } else {
                userReport.profile = "imported";
              }
              report.totalProfiles++;

              // credentials: profile.userId 로부터 정식 target 이름 계산 후
              // 파일명 변환해 해당 .enc 만 이관.
              const vaultKey = await readVaultKey(userDir);
              if (!vaultKey) {
                userReport.warnings.push(
                  "vault/.key 파일이 없음 → credentials 이관 스킵"
                );
              } else {
                const target = buildCredentialTarget(
                  options.credentialService,
                  profile.userId
                );
                const encPath = path.join(
                  userDir,
                  "vault",
                  `${fileSafeName(target)}.enc`
                );
                try {
                  const ciphertextBase64 = await fs.readFile(encPath, "utf8");
                  const plain = decryptFileVault(ciphertextBase64, vaultKey);
                  const reencrypted = encryptPassword(plain);
                  if (!options.dryRun) {
                    await pool.query(
                      `
                      INSERT INTO user_data.credentials
                        (user_key, target_name, ciphertext, iv, auth_tag, key_version, updated_at)
                      VALUES ($1, $2, $3, $4, $5, 1, now())
                      ON CONFLICT (user_key, target_name)
                      DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
                                    iv         = EXCLUDED.iv,
                                    auth_tag   = EXCLUDED.auth_tag,
                                    key_version = EXCLUDED.key_version,
                                    updated_at = now()
                      `,
                      [
                        userKey,
                        target,
                        reencrypted.ciphertext,
                        reencrypted.iv,
                        reencrypted.authTag
                      ]
                    );
                  }
                  userReport.credentials++;
                  report.totalCredentials++;
                } catch (err) {
                  const code = (err as NodeJS.ErrnoException).code;
                  if (code === "ENOENT") {
                    userReport.warnings.push(
                      `${encPath} 없음 → 크리덴셜 이관 스킵`
                    );
                  } else {
                    userReport.warnings.push(
                      `크리덴셜 복호화/이관 실패: ${(err as Error).message}`
                    );
                  }
                }
              }
            }

            // sessions
            for (const def of SESSION_FILE_MAP) {
              const payload = await readOptionalJson<PersistedLmsSession>(
                path.join(userDir, "state", def.file)
              );
              if (!payload) continue;

              let toStore: unknown;
              if (def.kind === "cookie") {
                // 파일은 { savedAt, cookies } 래퍼. PG 는 cookies 만 저장.
                if (!payload.cookies) {
                  userReport.warnings.push(
                    `${def.file} 에 cookies 필드 없음 → 스킵`
                  );
                  continue;
                }
                toStore = payload.cookies;
              } else {
                // library 는 payload 전체를 그대로 저장
                toStore = payload;
              }

              if (!options.dryRun) {
                await pool.query(
                  `
                  INSERT INTO user_data.sessions (user_key, service, payload, saved_at)
                  VALUES ($1, $2, $3::jsonb, now())
                  ON CONFLICT (user_key, service)
                  DO UPDATE SET payload = EXCLUDED.payload, saved_at = now()
                  `,
                  [userKey, def.service, JSON.stringify(toStore)]
                );
              }
              userReport.sessions++;
              report.totalSessions++;
            }
          } catch (err) {
            userReport.profile = "error";
            userReport.warnings.push(`이관 중 오류: ${(err as Error).message}`);
          }

          report.users.push(userReport);
        }

        if (globals.format === "json") {
          process.stdout.write(`${JSON.stringify(report)}\n`);
        } else {
          process.stdout.write(
            `migrated users=${report.totalUsers} profiles=${report.totalProfiles} credentials=${report.totalCredentials} sessions=${report.totalSessions}${options.dryRun ? " (dry-run)" : ""}\n`
          );
          for (const u of report.users) {
            process.stdout.write(
              `  ${u.userKey}: profile=${u.profile} creds=${u.credentials} sessions=${u.sessions}${u.warnings.length ? ` warn=${u.warnings.length}` : ""}\n`
            );
          }
        }
      }
    );
}
