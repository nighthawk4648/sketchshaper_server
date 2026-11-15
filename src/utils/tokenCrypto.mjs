import crypto from "crypto";
import { config } from "../config/config.mjs";

// AES-256-GCM. Stored form: v1.<iv>.<tag>.<ciphertext>, each base64url.
function key() {
  const raw = Buffer.from(config.token_encryption_key || "", "base64");
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 (create one with: openssl rand -base64 32)");
  }
  return raw;
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (Buffer.isBuffer(p) ? p.toString("base64url") : p)).join(".");
}

// Throws if the value was changed or the key is wrong
export function decryptToken(stored) {
  const [version, iv, tag, data] = String(stored).split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
