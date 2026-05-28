import type { StoredAuthProfile } from "../auth/types.js";
import type { AuthProfileStorage } from "../storage/types.js";

export interface PreferredNameView {
  ok: true;
  userKey: string;
  profileExists: boolean;
  storedUserId: string | null;
  hasPreferredName: boolean;
  preferredName: string | null;
}

export function normalizePreferredName(input: string): string {
  const normalized = input.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("선호 호칭은 비워둘 수 없습니다.");
  }
  if (normalized.length > 80) {
    throw new Error("선호 호칭은 80자 이하여야 합니다.");
  }
  return normalized;
}

export class PreferredNameManager {
  constructor(
    private readonly profileStore: AuthProfileStorage,
    private readonly userKey: string
  ) {}

  async get(): Promise<PreferredNameView> {
    return this.toView(await this.profileStore.load());
  }

  async setPreferredName(name: string): Promise<PreferredNameView> {
    const profile = await this.requireProfile();
    const next: StoredAuthProfile = {
      ...profile,
      preferredName: normalizePreferredName(name),
      updatedAt: new Date().toISOString()
    };
    await this.profileStore.save(next);
    return this.toView(next);
  }

  async clearPreferredName(): Promise<PreferredNameView> {
    const profile = await this.requireProfile();
    const { preferredName: _preferredName, ...rest } = profile;
    const next: StoredAuthProfile = {
      ...rest,
      updatedAt: new Date().toISOString()
    };
    await this.profileStore.save(next);
    return this.toView(next);
  }

  private async requireProfile(): Promise<StoredAuthProfile> {
    const profile = await this.profileStore.load();
    if (!profile) {
      throw new Error("저장된 인증 프로필이 없습니다. 로그인 후 다시 시도하세요.");
    }
    return profile;
  }

  private toView(profile: StoredAuthProfile | null): PreferredNameView {
    const preferredName =
      typeof profile?.preferredName === "string" && profile.preferredName.trim()
        ? profile.preferredName.trim()
        : null;

    return {
      ok: true,
      userKey: this.userKey,
      profileExists: profile !== null,
      storedUserId: profile?.userId ?? null,
      hasPreferredName: preferredName !== null,
      preferredName
    };
  }
}
