import path from "node:path";

// 전역 storage mode 결정. 기본은 file — 외부 단독 사용자(노트북 macOS/Windows)
// 는 keyring/FilePasswordVault 경로를 그대로 쓰게 된다.
// 컨테이너(Docker) 의 agent 는 MJU_STORAGE=postgres 로 띄워 user_data
// 스키마에 저장.

export type StorageMode = "file" | "postgres";

export function resolveStorageMode(): StorageMode {
  const raw = process.env.MJU_STORAGE?.trim().toLowerCase();
  if (raw === "postgres" || raw === "pg") return "postgres";
  if (raw === "file" || raw === "" || raw === undefined) return "file";
  throw new Error(
    `MJU_STORAGE 값이 올바르지 않습니다: "${raw}". file 또는 postgres 만 허용됩니다.`
  );
}

// --app-dir 경로의 basename 을 user key 로 해석한다.
// 컨테이너 관례상 /data/users/<discord_id> 형태이므로 basename 이 곧 Discord user id.
// 외부 단독 사용자는 ~/.mju-cli → basename ".mju-cli" 가 되므로 "default" 로 치환.
export function resolveUserKey(appDir: string): string {
  const base = path.basename(path.resolve(appDir));
  if (!base || base === "." || base.startsWith(".mju-cli")) {
    return "default";
  }
  return base;
}
