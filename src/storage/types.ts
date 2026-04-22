import type { CookieJar } from "tough-cookie";

import type { StoredAuthProfile } from "../auth/types.js";
import type { LibrarySessionPayload } from "../library/types.js";

// 파일/Postgres 두 구현 모두가 만족해야 하는 계약.
// 동일한 시그니처를 유지하기 위해 기존 파일 기반 클래스들도 그대로
// 적용 가능하도록 최소 교집합만 정의한다.

export interface AuthProfileStorage {
  load(): Promise<StoredAuthProfile | null>;
  save(profile: StoredAuthProfile): Promise<void>;
  clear(): Promise<boolean>;
}

export interface LmsSessionStorage {
  load(): Promise<CookieJar | null>;
  save(jar: CookieJar): Promise<void>;
  remove(): Promise<boolean>;
}

export interface LibrarySessionStorage {
  load(): Promise<LibrarySessionPayload | null>;
  save(payload: LibrarySessionPayload): Promise<void>;
  remove(): Promise<boolean>;
}
