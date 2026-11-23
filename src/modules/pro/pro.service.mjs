import { prisma } from "../../db/prisma.mjs";
import { SITE_COOKIE, findSession, readBearer, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { refreshLinkStatus } from "../patreon/patreon.service.mjs";

const RECHECK_MS = 60 * 60 * 1000;

// Tiers that only remove ads: PRO models stay locked. Matched by tier name (manual or Patreon), ignoring case
export const AD_FREE_TIERS = ["Early Access"];
export const isAdFreeTier = (name) =>
  AD_FREE_TIERS.some((tier) => tier.toLowerCase() === String(name || "").trim().toLowerCase());

// The access rule. isPro = PRO models (and PRO in the extension); adFree = no ads, true for every paying member.
// Blocked is never anything; manual PRO counts until its end date; otherwise an active Patreon pledge.
// An ad-free-only manual tier does not hide a PRO pledge on Patreon. proSource: "blocked" | "manual" | "patreon" | null
export function accessOf(user, link, now = new Date()) {
  if (user.access === "blocked") return { isPro: false, adFree: false, proSource: "blocked" };
  const manual = user.access === "pro" && (!user.access_until || user.access_until > now);
  const patron = Boolean(link?.is_active_patron);
  if (manual && !isAdFreeTier(user.access_tier)) return { isPro: true, adFree: true, proSource: "manual" };
  if (patron && !isAdFreeTier(link.membership_tier)) return { isPro: true, adFree: true, proSource: "patreon" };
  if (manual) return { isPro: false, adFree: true, proSource: "manual" };
  if (patron) return { isPro: false, adFree: true, proSource: "patreon" };
  return { isPro: false, adFree: false, proSource: null };
}

// What the website shows about someone's access, from what we already know (never calls Patreon)
export async function proStatus(siteUserId) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: { patreon_link: true } });
  const link = user?.patreon_link;
  const { isPro, adFree, proSource } = user ? accessOf(user, link) : { isPro: false, adFree: false, proSource: null };
  return {
    isPro,
    adFree,
    proSource,
    proUntil: proSource === "manual" ? user.access_until : null,
    patreonLinked: Boolean(link),
    membershipTier: link?.is_active_patron && proSource !== "blocked" ? link.membership_tier : null,
  };
}

// Whether this person may download PRO models. With `refresh`, a Patreon status older than an hour is checked
// with Patreon first. A blocked or manual PRO account never needs Patreon, so it is decided before that.
export async function isPro(siteUserId, { refresh = false, maxAgeMs = RECHECK_MS } = {}) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: { patreon_link: true } });
  if (!user) return false;
  const decided = accessOf(user, user.patreon_link);
  if (decided.proSource === "blocked") return false;
  if (decided.isPro && decided.proSource === "manual") return true;

  let link = user.patreon_link;
  if (!link) return false;
  if (refresh && Date.now() - link.last_verified_at.getTime() > maxAgeMs) {
    link = await refreshLinkStatus(link);
  }
  return accessOf(user, link).isPro; // an Early Access pledge is not PRO
}

// Used by the download route for PRO models: throws a 401 (not signed in) or 403 (not PRO)
export async function assertProDownload(req) {
  // The website proves who is asking with its cookie, the SketchUp extension with its own key
  const bearer = readBearer(req);
  const session = bearer
    ? await findSession(bearer, "extension")
    : await findSession(readCookie(req, SITE_COOKIE), "website");
  if (!session?.site_user) throw new AuthError("Please sign in to download PRO models.", 401);
  if (!(await isPro(session.site_user.id, { refresh: true }))) {
    throw new AuthError("PRO access is required to download this model.", 403);
  }
}
