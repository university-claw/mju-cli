import { createUserDataPool, type PgPool } from "../db/client.js";
import { resolveUserDataDbConfig, type UserDataDbConfig } from "../db/config.js";

// mju-cli 프로세스 수명 내에서 한 번만 만들어지는 lazy pool.
// 프로세스가 오래 떠 있지 않으므로 main() 종료 직전에 closeUserDataPool() 로
// 명시 종료해 줘야 Node event loop 가 자연스럽게 끝난다.

let pool: PgPool | null = null;
let config: UserDataDbConfig | null = null;

export function getUserDataPool(): PgPool {
  if (pool) return pool;
  config = resolveUserDataDbConfig();
  pool = createUserDataPool(config);
  return pool;
}

export function getUserDataDbConfigIfInitialized(): UserDataDbConfig | null {
  return config;
}

export async function closeUserDataPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  config = null;
  await current.end();
}
