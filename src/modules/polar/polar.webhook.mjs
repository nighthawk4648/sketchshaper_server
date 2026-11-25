import crypto from "crypto";

const TOLERANCE_S = 5 * 60;
export const WEBHOOK_PATH = "/api/polar/webhook";

// express.json's `verify` hook: keeps the exact bytes of the webhook body, because the signature covers them
export function keepWebhookBody(req, _res, buf) {
  if (req.originalUrl.startsWith(WEBHOOK_PATH)) req.rawBody = buf;
}

// Polar follows Standard Webhooks: the signature is HMAC-SHA256 of "id.timestamp.body", keyed with the secret's
// text as it is, in base64, sent as "v1,<signature>" (several, space separated, while a secret is being rotated).
// The timestamp must be recent so a captured delivery cannot be replayed later.
export function verifySignature({ id, timestamp, signature, body, secret, now = Date.now() }) {
  if (!secret || !body || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_S) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${timestamp}.`).update(body).digest();
  return signature.split(" ").some((part) => {
    const [version, sig = ""] = part.split(",");
    const given = Buffer.from(sig, "base64");
    return version === "v1" && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
