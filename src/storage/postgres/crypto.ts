import crypto from "node:crypto";

// user_data.credentials 는 앱 측 envelope encryption 을 쓴다.
// FilePasswordVault 와 달리 Postgres 모드에서는 랜덤 키 파일 생성 경로가
// 없으므로 MJU_VAULT_KEY 환경변수를 필수로 강제한다.
// 포맷: 64 hex 문자 (= 32 bytes). openssl rand -hex 32 로 생성.

export function getVaultKey(): Buffer {
  const envKey = process.env.MJU_VAULT_KEY?.trim();
  if (!envKey) {
    throw new Error(
      "MJU_VAULT_KEY 환경변수가 필요합니다 (postgres 모드). `openssl rand -hex 32` 로 생성한 64글자 hex 를 설정하세요."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
    throw new Error(
      "MJU_VAULT_KEY 가 64글자 hex 가 아닙니다. AES-256 용 32바이트 키 hex 인코딩이 필요합니다."
    );
  }
  return Buffer.from(envKey, "hex");
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encryptPassword(plain: string): EncryptedPayload {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptPassword(payload: EncryptedPayload): string {
  const key = getVaultKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, payload.iv);
  decipher.setAuthTag(payload.authTag);
  const plain = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final()
  ]);
  return plain.toString("utf8");
}
