import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import type { PasswordVault } from "./password-vault.js";

// 파일 기반 vault — Linux/컨테이너 환경에서 OS keyring 없이 동작.
// AES-256-GCM으로 암호화, 키는 env(MJU_VAULT_KEY) 또는 로컬 키 파일에서 유도.
//
// Security note:
// - 컨테이너 내부 파일 시스템 접근 권한이 있는 프로세스는 복호화 가능
// - 프로덕션에서는 MJU_VAULT_KEY를 명시적으로 설정하고 Docker secret으로 관리 권장
// - 로컬 개발 시 랜덤 키 파일이 자동 생성되며 컨테이너 재생성 시 초기화됨

export class FilePasswordVault implements PasswordVault {
  readonly authMode = "file-encrypted" as const;

  constructor(private readonly baseDir: string) {}

  private vaultDir(): string {
    return path.join(this.baseDir, "vault");
  }

  private entryPath(targetName: string): string {
    // 파일명에 특수문자 방지
    const safe = targetName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.vaultDir(), `${safe}.enc`);
  }

  private async getKey(): Promise<Buffer> {
    const envKey = process.env.MJU_VAULT_KEY;
    if (envKey) {
      const buf = Buffer.from(envKey, "hex");
      if (buf.length !== 32) {
        throw new Error("MJU_VAULT_KEY must be 64 hex characters (32 bytes)");
      }
      return buf;
    }
    // 로컬 키 파일 (없으면 생성)
    const keyPath = path.join(this.vaultDir(), ".key");
    try {
      const data = await fs.readFile(keyPath);
      if (data.length === 32) return data;
    } catch {
      // 키 파일 없음
    }
    await fs.mkdir(this.vaultDir(), { recursive: true, mode: 0o700 });
    const newKey = crypto.randomBytes(32);
    await fs.writeFile(keyPath, newKey, { mode: 0o600 });
    return newKey;
  }

  async savePassword(targetName: string, _userName: string, password: string): Promise<void> {
    const key = await this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, ciphertext]).toString("base64");

    await fs.mkdir(this.vaultDir(), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.entryPath(targetName), payload, { mode: 0o600 });
  }

  async getPassword(targetName: string): Promise<string | null> {
    try {
      const payload = await fs.readFile(this.entryPath(targetName), "utf8");
      const buf = Buffer.from(payload, "base64");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ciphertext = buf.subarray(28);
      const key = await this.getKey();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async deletePassword(targetName: string): Promise<boolean> {
    try {
      await fs.unlink(this.entryPath(targetName));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  async hasPassword(targetName: string): Promise<boolean> {
    try {
      await fs.access(this.entryPath(targetName));
      return true;
    } catch {
      return false;
    }
  }
}
