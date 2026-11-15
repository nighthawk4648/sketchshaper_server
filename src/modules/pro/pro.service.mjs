import { prisma } from "../../db/prisma.mjs";
import { SITE_COOKIE, findSession, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { refreshLinkStatus } from "../patreon/patreon.service.mjs";

const RECHECK_MS = 60 * 60 * 1000;

// What the website shows about someone's access, from what we already know (never calls Patreon)
export async function proStatus(siteUserId) {
  const link = await prisma.patreonLink.findUnique({ where: { site_user_id: siteUserId } });
  return { isPro: Boolean(link?.is_active_patron), patreonLinked: Boolean(link) };
}

// Whether this person may download PRO models. With `refresh`, anything older than an hour is checked with Patreon first.
export async function isPro(siteUserId, { refresh = false } = {}) {
  let link = await prisma.patreonLink.findUnique({ where: { site_user_id: siteUserId } });
  if (!link) return false;
  if (refresh && Date.now() - link.last_verified_at.getTime() > RECHECK_MS) {
    link = await refreshLinkStatus(link);
  }
  return link.is_active_patron;
}

// Used by the download route for PRO models: throws a 401 (not signed in) or 403 (not PRO)
export async function assertProDownload(req) {
  const session = await findSession(readCookie(req, SITE_COOKIE), "website");
  if (!session?.site_user) throw new AuthError("Please sign in to download PRO models.", 401);
  if (!(await isPro(session.site_user.id, { refresh: true }))) {
    throw new AuthError("PRO access is required to download this model.", 403);
  }
}
