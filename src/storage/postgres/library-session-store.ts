import type { PgPool } from "../../db/client.js";
import type { LibrarySessionPayload } from "../../library/types.js";
import type { LibrarySessionStorage } from "../types.js";

const SERVICE_KEY = "library";

export class PostgresLibrarySessionStore implements LibrarySessionStorage {
  constructor(
    private readonly pool: PgPool,
    private readonly userKey: string
  ) {}

  async load(): Promise<LibrarySessionPayload | null> {
    const result = await this.pool.query<{ payload: LibrarySessionPayload }>(
      `SELECT payload FROM user_data.sessions
       WHERE user_key = $1 AND service = $2`,
      [this.userKey, SERVICE_KEY]
    );
    if (result.rowCount === 0) return null;
    const payload = result.rows[0]!.payload;
    if (!payload?.accessToken) return null;
    return payload;
  }

  async save(payload: LibrarySessionPayload): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO user_data.sessions (user_key, service, payload, saved_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (user_key, service)
      DO UPDATE SET payload = EXCLUDED.payload, saved_at = now()
      `,
      [this.userKey, SERVICE_KEY, JSON.stringify(payload)]
    );
  }

  async remove(): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM user_data.sessions
       WHERE user_key = $1 AND service = $2`,
      [this.userKey, SERVICE_KEY]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
