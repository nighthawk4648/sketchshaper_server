import crypto from "crypto";
import { prisma } from "../../db/prisma.mjs";
import { createSession } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { isPro, proStatus } from "../pro/pro.service.mjs";

const LOGIN_MS = 10 * 60 * 1000; // long enough to create an account and confirm its email
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const FORCED_RECHECK_MS = 60 * 1000; // "I've joined" may ask Patreon again, at most once a minute

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export async function startLogin() {
  await prisma.extensionLogin.deleteMany({ where: { expires_at: { lte: new Date() } } });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nonce = crypto.randomBytes(32).toString("base64url");
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    try {
      await prisma.extensionLogin.create({
        data: { nonce_hash: hash(nonce), code, expires_at: new Date(Date.now() + LOGIN_MS) },
      });
      return { nonce, code, expiresIn: LOGIN_MS / 1000 };
    } catch (err) {
      if (err.code !== "P2002") throw err; // the same code is in use right now: draw another
    }
  }
  throw new AuthError("Sign-in could not start. Please try again.", 503);
}

// The person pressed Connect on the website while signed in
export async function approveLogin(rawCode, siteUserId) {
  const code = String(rawCode || "").trim().toUpperCase();
  const { count } = /^[0-9A-F]{6}$/.test(code)
    ? await prisma.extensionLogin.updateMany({
        where: { code, site_user_id: null, expires_at: { gt: new Date() } },
        data: { site_user_id: siteUserId },
      })
    : { count: 0 };
  if (!count) throw new AuthError("This code has expired. In SketchUp, click Sign in again to get a new one.");
}

// What the extension shows about the person. It never sees their email address or password.
export async function extensionUser(siteUserId, { forceRecheck = false } = {}) {
  await isPro(siteUserId, { refresh: true, ...(forceRecheck && { maxAgeMs: FORCED_RECHECK_MS }) });
  const [user, status] = await Promise.all([
    prisma.siteUser.findUnique({ where: { id: siteUserId }, select: { name: true, email: true, access_tier: true } }),
    proStatus(siteUserId),
  ]);
  return {
    name: user.name || user.email.split("@")[0],
    isPro: status.isPro,
    blocked: status.proSource === "blocked",
    proSource: status.proSource,
    proUntil: status.proUntil,
    tier: status.membershipTier || (status.proSource === "manual" ? user.access_tier : null),
    patreonLinked: status.patreonLinked,
  };
}

export async function pollLogin(nonce, req) {
  const row = /^[A-Za-z0-9_-]{20,64}$/.test(String(nonce))
    ? await prisma.extensionLogin.findUnique({ where: { nonce_hash: hash(nonce) } })
    : null;
  if (!row || row.expires_at <= new Date()) return { status: "expired" };
  if (!row.site_user_id) return { status: "pending" };

  // Handed over once: of two polls at the same moment, only the one that removes the row gets the key
  const { count } = await prisma.extensionLogin.deleteMany({ where: { id: row.id, site_user_id: row.site_user_id } });
  if (!count) return { status: "expired" };
  const { token, expiresAt } = await createSession(
    { kind: "extension", siteUserId: row.site_user_id, ttlMs: SESSION_MS },
    req,
  );
  return { status: "done", result: { token, expiresAt, user: await extensionUser(row.site_user_id) } };
}
