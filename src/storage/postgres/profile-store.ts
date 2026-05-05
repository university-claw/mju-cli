import type { PgPool } from "../../db/client.js";
import type { StoredAuthProfile } from "../../auth/types.js";
import type { AuthProfileStorage } from "../types.js";

// user_data.profiles 기반 AuthProfileStorage 구현.
// 파일 구현과 동일한 시그니처 (load / save / clear) 를 유지한다.

export class PostgresAuthProfileStore implements AuthProfileStorage {
  constructor(
    private readonly pool: PgPool,
    private readonly userKey: string
  ) {}

  async load(): Promise<StoredAuthProfile | null> {
    const result = await this.pool.query<{ payload: StoredAuthProfile }>(
      `SELECT payload FROM user_data.profiles WHERE user_key = $1`,
      [this.userKey]
    );
    if (result.rowCount === 0) return null;
    return result.rows[0]!.payload;
  }

  async save(profile: StoredAuthProfile): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO user_data.profiles (user_key, payload, created_at, updated_at)
      VALUES ($1, $2::jsonb, now(), now())
      ON CONFLICT (user_key)
      DO UPDATE SET payload = EXCLUDED.payload,
                    updated_at = now()
      `,
      [this.userKey, JSON.stringify(profile)]
    );
  }

  async clear(): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM user_data.profiles WHERE user_key = $1`,
      [this.userKey]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
