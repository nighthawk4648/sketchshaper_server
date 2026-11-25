import crypto from "crypto";

const TOLERANCE_S = 5 * 60;
export const WEBHOOK_PATH = "/api/polar/webhook";

// express.json's `verify` hook: keeps the exact bytes of the webhook body, because the signature covers them
export function keepWebhookBody(req, _res, buf) {
  if (req.originalUrl.startsWith(WEBHOOK_PATH)) req.rawBody = buf;
}

// The same two keys Polar's own SDK tries (@polar-sh/sdk validateWebhook): the secret's text, and the bytes of
// its base64 part (after "whsec_", the Standard Webhooks format of dashboard secrets). Polar signs dashboard
// webhooks with the decoded bytes, and `polar webhook listen` with the text. Both come from the same secret.
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function signingKeys(secret) {
  const text = Buffer.from(secret);
  const rest = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const decoded = BASE64.test(rest) ? Buffer.from(rest, "base64") : Buffer.alloc(0);
  // an empty key is still a valid HMAC key, so a broken secret like "whsec_" must not produce one
  return decoded.length && !decoded.equals(text) ? [text, decoded] : [text];
}

// The signature is HMAC-SHA256 of "id.timestamp.body" in base64, sent as "v1,<signature>" (several, space
// separated, while a secret is being rotated). The timestamp must be recent so a captured delivery cannot be
// replayed later.
export function verifySignature({ id, timestamp, signature, body, secret, now = Date.now() }) {
  if (!secret || !body || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_S) return false;
  const given = signature.split(" ").flatMap((part) => {
    const [version, sig = ""] = part.split(",");
    return version === "v1" ? [Buffer.from(sig, "base64")] : [];
  });
  return signingKeys(secret).some((key) => {
    const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();
    return given.some((g) => g.length === expected.length && crypto.timingSafeEqual(g, expected));
  });
}
