import pg from "pg";

import type { UserDataDbConfig } from "./config.js";

const { Pool } = pg;
export type PgPool = pg.Pool;

// 단일 프로세스에서 mju-cli 가 짧게 떴다 지는 사용 패턴이라 pool max 는 작게.
// 컨테이너 안에서 동시 호출이 겹쳐도 상한선이 낮아야 worker 커넥션을 압박하지
// 않는다.
const DEFAULT_MAX_CLIENTS = 4;

export function createUserDataPool(config: UserDataDbConfig): PgPool {
  // 모든 쿼리는 fully-qualified 이름(user_data.*)을 쓰므로 search_path 를
  // connect 훅으로 건드리지 않는다. connect 시점 client.query 는 pg 8.x 에서
  // deprecation 경고가 나고 race 여지가 있다.
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: DEFAULT_MAX_CLIENTS,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000
  });
}
