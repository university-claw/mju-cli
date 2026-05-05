import { AuthProfileStore } from "../auth/profile-store.js";
import { FilePasswordVault } from "../auth/file-vault.js";
import { MacOsKeychainVault } from "../auth/macos-keychain-vault.js";
import { WindowsCredentialVault } from "../auth/windows-credential-vault.js";
import type { PasswordVault } from "../auth/password-vault.js";
import { LibrarySessionStore } from "../library/session-store.js";
import { SessionStore as FileLmsSessionStore } from "../lms/session-store.js";
import { getUserDataPool } from "./pool.js";
import { resolveStorageMode, resolveUserKey, type StorageMode } from "./mode.js";
import { PostgresAuthProfileStore } from "./postgres/profile-store.js";
import { PostgresLibrarySessionStore } from "./postgres/library-session-store.js";
import { PostgresCookieSessionStore } from "./postgres/cookie-session-store.js";
import { PostgresPasswordVault } from "./postgres/vault.js";
import type {
  AuthProfileStorage,
  LibrarySessionStorage,
  LmsSessionStorage
} from "./types.js";

// 기존 파일 기반 stores 를 structural typing 으로 AuthProfileStorage
// 등으로 받아들이기 위해 wrapper 는 쓰지 않는다. class 의 method
// 시그니처가 interface 와 동일하므로 그대로 return.

// 중요한 설계 포인트:
//   - 파일 모드: FilePasswordVault 가 appDataDir 밑에 .key 를 자동 생성하며 동작
//   - Postgres 모드: MJU_VAULT_KEY env 필수, user_key 는 --app-dir basename
//   모드 결정은 호출 시점에 한 번, 이후 동일 프로세스 내에서는 동일하다.

class UnsupportedPasswordVault implements PasswordVault {
  readonly authMode = "unsupported" as const;

  async savePassword(): Promise<void> {
    throw new Error("현재 운영체제에서는 저장 로그인을 지원하지 않습니다.");
  }

  async getPassword(): Promise<string | null> {
    throw new Error("현재 운영체제에서는 저장된 비밀번호 읽기를 지원하지 않습니다.");
  }

  async deletePassword(): Promise<boolean> {
    return false;
  }

  async hasPassword(): Promise<boolean> {
    return false;
  }
}

function createDefaultFilePasswordVault(appDataDir?: string): PasswordVault {
  if (process.platform === "win32") {
    return new WindowsCredentialVault();
  }

  if (process.platform === "darwin") {
    return new MacOsKeychainVault();
  }

  if (appDataDir) {
    return new FilePasswordVault(appDataDir);
  }

  return new UnsupportedPasswordVault();
}

export interface StorageContext {
  mode: StorageMode;
  userKey: string;
  appDataDir: string;
}

export function resolveStorageContext(appDataDir: string): StorageContext {
  return {
    mode: resolveStorageMode(),
    userKey: resolveUserKey(appDataDir),
    appDataDir
  };
}

export function createPasswordVault(
  context: StorageContext
): PasswordVault {
  if (context.mode === "postgres") {
    return new PostgresPasswordVault(getUserDataPool(), context.userKey);
  }
  return createDefaultFilePasswordVault(context.appDataDir);
}

export function createAuthProfileStore(
  context: StorageContext,
  filePath: string
): AuthProfileStorage {
  if (context.mode === "postgres") {
    return new PostgresAuthProfileStore(getUserDataPool(), context.userKey);
  }
  return new AuthProfileStore(filePath);
}

export type CookieSessionService = "lms" | "msi" | "ucheck";

export function createCookieSessionStore(
  context: StorageContext,
  service: CookieSessionService,
  filePath: string
): LmsSessionStorage {
  if (context.mode === "postgres") {
    return new PostgresCookieSessionStore(getUserDataPool(), context.userKey, service);
  }
  return new FileLmsSessionStore(filePath);
}

// LMS 전용 편의 함수. MSI/UCheck 는 createCookieSessionStore 를 직접 쓴다.
export function createLmsSessionStore(
  context: StorageContext,
  filePath: string
): LmsSessionStorage {
  return createCookieSessionStore(context, "lms", filePath);
}

export function createLibrarySessionStore(
  context: StorageContext,
  filePath: string
): LibrarySessionStorage {
  if (context.mode === "postgres") {
    return new PostgresLibrarySessionStore(getUserDataPool(), context.userKey);
  }
  return new LibrarySessionStore(filePath);
}
