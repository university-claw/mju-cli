import fs from "node:fs/promises";
import path from "node:path";

import type { LibrarySessionPayload } from "./types.js";

export class LibrarySessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<LibrarySessionPayload | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const payload = JSON.parse(raw) as LibrarySessionPayload;
      if (!payload.accessToken) {
        return null;
      }
      return payload;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(payload: LibrarySessionPayload): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch {}
      throw err;
    }
  }

  async remove(): Promise<boolean> {
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
