// user_data DB 접속용 환경변수 해석.
//
// 공개/개인 경계 원칙에 따라 worker 가 쓰는 PG* 와는 분리된 네이밍을 쓴다.
// 같은 Postgres 클러스터를 공유하더라도 USER/PASSWORD 는 반드시 달라야 한다
// (worker ROLE 은 user_data 스키마 접근 금지).

export interface UserDataDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function required(name: string): string {
  const value = clean(process.env[name]);
  if (!value) {
    throw new Error(
      `환경변수 ${name} 이(가) 필요합니다. MJU_STORAGE=postgres 모드에서는 user_data DB 접속 정보가 모두 설정되어야 합니다.`
    );
  }
  return value;
}

export function resolveUserDataDbConfig(): UserDataDbConfig {
  const host = clean(process.env.MJU_PGHOST) ?? "host.docker.internal";
  const portRaw = clean(process.env.MJU_PGPORT) ?? "5432";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`MJU_PGPORT 값이 올바르지 않습니다: ${portRaw}`);
  }

  const database = clean(process.env.MJU_PGDATABASE) ?? "mjuclaw";
  const schema = clean(process.env.MJU_PGSCHEMA) ?? "user_data";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`MJU_PGSCHEMA 값이 스키마 이름으로 안전하지 않습니다: ${schema}`);
  }

  return {
    host,
    port,
    database,
    user: required("MJU_PGUSER"),
    password: required("MJU_PGPASSWORD"),
    schema
  };
}
