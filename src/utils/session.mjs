import crypto from "crypto";
import { config } from "../config/config.mjs";
import { prisma } from "../db/prisma.mjs";
import { clientIp } from "./rateLimit.mjs";

export const ADMIN_COOKIE = "ss_admin";
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000;
export const SITE_COOKIE = "ss_site";
export const SITE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// Only a hash is stored, so a database leak does not hand out working sessions
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// Express does not parse cookies by itself; this reads one by name
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// The key the SketchUp extension sends instead of a cookie
export const readBearer = (req) => /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || "")?.[1] || null;

export async function createSession({ kind, adminId = null, siteUserId = null, ttlMs }, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);

  // Housekeeping so the table does not grow forever
  await prisma.session.deleteMany({ where: { expires_at: { lt: new Date() } } });
  await prisma.session.create({
    data: {
      token_hash: hashToken(token),
      kind,
      admin_id: adminId,
      site_user_id: siteUserId,
      expires_at: expiresAt,
      ip: clientIp(req).slice(0, 45),
      user_agent: req.get("user-agent")?.slice(0, 255) || null,
    },
  });
  return { token, expiresAt };
}

// The session (with its admin) only if it exists, has not expired and is of the expected kind
export async function findSession(token, kind) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token_hash: hashToken(token) },
    include: {
      admin: { select: { id: true, email: true } },
      site_user: { select: { id: true, email: true, name: true, email_verified_at: true } },
    },
  });
  if (!session || session.kind !== kind || session.expires_at <= new Date()) {
    return null;
  }
  return session;
}

// Signs a visitor in: creates the session and sets its cookie
export async function startSiteSession(req, res, siteUserId) {
  const { token, expiresAt } = await createSession({ kind: "website", siteUserId, ttlMs: SITE_SESSION_MS }, req);
  setSessionCookie(res, SITE_COOKIE, token, expiresAt);
}

// Sign a visitor out everywhere, e.g. after a password reset
export const deleteSiteUserSessions = (siteUserId) =>
  prisma.session.deleteMany({ where: { site_user_id: siteUserId } });

export const deleteSession = (token) =>
  token
    ? prisma.session.deleteMany({ where: { token_hash: hashToken(token) } })
    : Promise.resolve();

// HttpOnly: page scripts cannot read it. Secure is off only for local http development.
const cookieOptions = {
  httpOnly: true,
  secure: config.mode !== "dev",
  sameSite: "lax",
  path: "/api",
};

export const setSessionCookie = (res, name, token, expiresAt) =>
  res.cookie(name, token, { ...cookieOptions, expires: expiresAt });

export const clearSessionCookie = (res, name) =>
  res.clearCookie(name, cookieOptions);
