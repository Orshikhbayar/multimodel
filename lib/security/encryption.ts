import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_SIZE = 12;
const TAG_SIZE = 16;

function getIntegrationKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error("Missing INTEGRATION_ENCRYPTION_KEY environment variable");
  }

  let key: Buffer;

  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be 32 bytes (hex-64 or base64)",
    );
  }

  return key;
}

export function encryptToken(plainText: string): Buffer {
  const key = getIntegrationKey();
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptToken(payload: Buffer | Uint8Array): string {
  const raw = Buffer.from(payload);

  if (raw.length < IV_SIZE + TAG_SIZE) {
    throw new Error("Encrypted token payload is invalid");
  }

  const key = getIntegrationKey();
  const iv = raw.subarray(0, IV_SIZE);
  const tag = raw.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const encrypted = raw.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
