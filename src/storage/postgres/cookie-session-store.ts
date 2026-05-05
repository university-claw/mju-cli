import { CookieJar } from "tough-cookie";

import type { PgPool } from "../../db/client.js";
import type { LmsSessionStorage } from "../types.js";

// LMS/MSI/UCheck 처럼 tough-cookie CookieJar 를 쓰는 서비스들의 공통 세션
// 저장소. payload 열에 CookieJar.serializeSync() 결과(JSONB) 를 그대로 넣고,
// service 열로 각 서비스("lms", "msi", "ucheck") 를 구분한다.

export class PostgresCookieSessionStore implements LmsSessionStorage {
  constructor(
    private readonly pool: PgPool,
    private readonly userKey: string,
    private readonly service: string
  ) {}

  async load(): Promise<CookieJar | null> {
    const result = await this.pool.query<{ payload: unknown }>(
      `SELECT payload FROM user_data.sessions
       WHERE user_key = $1 AND service = $2`,
      [this.userKey, this.service]
    );
    if (result.rowCount === 0) return null;
    const serialized = result.rows[0]!.payload as Parameters<
      typeof CookieJar.deserializeSync
    >[0];
    return CookieJar.deserializeSync(serialized);
  }

  async save(jar: CookieJar): Promise<void> {
    const serialized = jar.serializeSync();
    await this.pool.query(
      `
      INSERT INTO user_data.sessions (user_key, service, payload, saved_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (user_key, service)
      DO UPDATE SET payload = EXCLUDED.payload, saved_at = now()
      `,
      [this.userKey, this.service, JSON.stringify(serialized ?? null)]
    );
  }

  async remove(): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM user_data.sessions
       WHERE user_key = $1 AND service = $2`,
      [this.userKey, this.service]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
