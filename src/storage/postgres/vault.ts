import type { PgPool } from "../../db/client.js";
import { buildCredentialTarget, type PasswordVault } from "../../auth/password-vault.js";
import { decryptPassword, encryptPassword } from "./crypto.js";

// user_data.credentials 에 암호화된 SSO 비번을 저장하는 vault.
// FilePasswordVault 와 동일하게 target_name 단위 저장이며,
// user_key 는 컨테이너 환경에서 Discord user id 로 고정된다.

export class PostgresPasswordVault implements PasswordVault {
  readonly authMode = "postgres-encrypted" as const;

  constructor(
    private readonly pool: PgPool,
    private readonly userKey: string
  ) {}

  async savePassword(
    targetName: string,
    _userName: string,
    password: string
  ): Promise<void> {
    const { ciphertext, iv, authTag } = encryptPassword(password);
    await this.pool.query(
      `
      INSERT INTO user_data.credentials (user_key, target_name, ciphertext, iv, auth_tag, key_version, updated_at)
      VALUES ($1, $2, $3, $4, $5, 1, now())
      ON CONFLICT (user_key, target_name)
      DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
                    iv         = EXCLUDED.iv,
                    auth_tag   = EXCLUDED.auth_tag,
                    key_version = EXCLUDED.key_version,
                    updated_at = now()
      `,
      [this.userKey, targetName, ciphertext, iv, authTag]
    );
  }

  async getPassword(targetName: string): Promise<string | null> {
    const result = await this.pool.query<{
      ciphertext: Buffer;
      iv: Buffer;
      auth_tag: Buffer;
    }>(
      `SELECT ciphertext, iv, auth_tag FROM user_data.credentials
       WHERE user_key = $1 AND target_name = $2`,
      [this.userKey, targetName]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0]!;
    return decryptPassword({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag
    });
  }

  async deletePassword(targetName: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM user_data.credentials WHERE user_key = $1 AND target_name = $2`,
      [this.userKey, targetName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async hasPassword(targetName: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT 1 AS exists FROM user_data.credentials
       WHERE user_key = $1 AND target_name = $2 LIMIT 1`,
      [this.userKey, targetName]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export { buildCredentialTarget };
