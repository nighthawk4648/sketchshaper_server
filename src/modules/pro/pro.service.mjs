import { prisma } from "../../db/prisma.mjs";
import { SITE_COOKIE, findSession, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { refreshLinkStatus } from "../patreon/patreon.service.mjs";

const RECHECK_MS = 60 * 60 * 1000;

// The PRO rule. The admin's setting wins: blocked is never PRO, manual PRO counts until its end date.
// Otherwise PRO comes from an active Patreon pledge. proSource: "blocked" | "manual" | "patreon" | null
export function accessOf(user, link, now = new Date()) {
  if (user.access === "blocked") return { isPro: false, proSource: "blocked" };
  if (user.access === "pro" && (!user.access_until || user.access_until > now)) {
    return { isPro: true, proSource: "manual" };
  }
  if (link?.is_active_patron) return { isPro: true, proSource: "patreon" };
  return { isPro: false, proSource: null };
}

// What the website shows about someone's access, from what we already know (never calls Patreon)
export async function proStatus(siteUserId) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: { patreon_link: true } });
  const link = user?.patreon_link;
  const { isPro, proSource } = user ? accessOf(user, link) : { isPro: false, proSource: null };
  return {
    isPro,
    proSource,
    proUntil: proSource === "manual" ? user.access_until : null,
    patreonLinked: Boolean(link),
    membershipTier: link?.is_active_patron && proSource !== "blocked" ? link.membership_tier : null,
  };
}

// Whether this person may download PRO models. With `refresh`, a Patreon status older than an hour is checked
// with Patreon first. A blocked or manual PRO account never needs Patreon, so it is decided before that.
export async function isPro(siteUserId, { refresh = false } = {}) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: { patreon_link: true } });
  if (!user) return false;
  const decided = accessOf(user, user.patreon_link);
  if (decided.proSource === "blocked" || decided.proSource === "manual") return decided.isPro;

  let link = user.patreon_link;
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
