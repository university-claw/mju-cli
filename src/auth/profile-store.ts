import fs from "node:fs/promises";
import path from "node:path";

import type { StoredAuthProfile } from "./types.js";

export class AuthProfileStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<StoredAuthProfile | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as StoredAuthProfile;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(profile: StoredAuthProfile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    // 원자적 쓰기 + 제한된 퍼미션
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(profile, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch {}
      throw err;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await fs.rm(this.filePath);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }
}
