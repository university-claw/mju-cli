-- mju-cli user_data 스키마 초기화.
--
-- CLAUDE.md의 공개/개인 경계 원칙에 따라 이 스키마는 mju-cli 전용이며,
-- worker가 쓰는 public_data 스키마와 분리된다. 동일 Postgres 클러스터를
-- 공유하되 schema-level 격리로 운영한다.
--
-- 필요 권한: 이 마이그레이션을 실행하는 ROLE 은 대상 DB 에 CREATE
-- 권한이 있어야 한다. 권장: mjuclaw_user_app 같은 전용 ROLE 을 만들고
-- 이 ROLE 로 CONNECT / schema owner 권한을 준 상태에서 실행한다.
--
-- 암호화 정책:
--   credentials.ciphertext/iv/auth_tag 는 앱 측 envelope encryption 결과.
--   pgcrypto 는 쓰지 않는다. key 관리는 환경변수(MJU_VAULT_KEY) 에서 한다.

CREATE SCHEMA IF NOT EXISTS user_data;

-- 프로필: mju-cli StoredAuthProfile 의 JSON 본체를 그대로 payload 에 담는다.
--   user_key      = agent 컨테이너에선 Discord user id, 로컬 단독 사용 시
--                   임의 문자열(기본 "default").
--   payload       = { userId, authMode, createdAt, updatedAt, lastLoginAt, ... }
CREATE TABLE IF NOT EXISTS user_data.profiles (
  user_key    TEXT PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 크리덴셜(암호화된 SSO 비번 등): 한 유저가 여러 target 을 가질 수 있어
-- (현재는 "mju-cli:<studentId>" 하나지만 향후 확장 여지를 둔다) target_name
-- 과 복합 PK.
--   key_version   = 향후 마스터 키 회전을 지원하기 위한 버전 표식.
--                   초기에는 1 고정.
CREATE TABLE IF NOT EXISTS user_data.credentials (
  user_key    TEXT NOT NULL,
  target_name TEXT NOT NULL,
  ciphertext  BYTEA NOT NULL,
  iv          BYTEA NOT NULL,
  auth_tag    BYTEA NOT NULL,
  key_version INT   NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_key, target_name)
);

CREATE INDEX IF NOT EXISTS credentials_by_user
  ON user_data.credentials (user_key);

-- 세션: LMS/Library 등 서비스별 세션 payload. 서비스마다 포맷이 달라
-- payload 는 JSONB 로 열어둔다.
--   LMS     : tough-cookie CookieJar.serializeSync() 결과
--   Library : { accessToken, expiresAt, ... } LibrarySessionPayload
CREATE TABLE IF NOT EXISTS user_data.sessions (
  user_key  TEXT NOT NULL,
  service   TEXT NOT NULL,
  payload   JSONB NOT NULL,
  saved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_key, service)
);

CREATE INDEX IF NOT EXISTS sessions_by_user
  ON user_data.sessions (user_key);
