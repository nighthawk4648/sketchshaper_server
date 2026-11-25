import { prisma } from "../../db/prisma.mjs";
import { SITE_COOKIE, findSession, readBearer, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { refreshLinkStatus } from "../patreon/patreon.service.mjs";

const RECHECK_MS = 60 * 60 * 1000;

// Tiers that only remove ads: PRO models stay locked. Matched by tier name (manual or Patreon), ignoring case
export const AD_FREE_TIERS = ["Early Access"];
export const isAdFreeTier = (name) =>
  AD_FREE_TIERS.some((tier) => tier.toLowerCase() === String(name || "").trim().toLowerCase());

// Plans bought on Polar: Early Access only removes ads, the others also unlock PRO models.
// Polar keeps a cancelled subscription "active" until its paid period ends, so these statuses are the ones that count.
export const POLAR_PRO_PLANS = ["pro", "sponsor"];
export const POLAR_LIVE_STATUSES = ["active", "trialing"];
const polarRank = (s) => (POLAR_LIVE_STATUSES.includes(s.status) ? (POLAR_PRO_PLANS.includes(s.plan) ? 2 : 1) : 0);

// "pro" | "adfree" | null from someone's Polar subscriptions
export function polarAccess(subs = []) {
  const best = Math.max(0, ...subs.map(polarRank));
  return best === 2 ? "pro" : best === 1 ? "adfree" : null;
}

// What the website shows about the best subscription (a live one first, else the newest), or null
export function polarSummary(subs = []) {
  const [best] = [...subs].sort((a, b) => polarRank(b) - polarRank(a) || b.last_event_at - a.last_event_at);
  return best
    ? { plan: best.plan, period: best.period, status: best.status, renewsAt: best.current_period_end, cancelsAtPeriodEnd: best.cancel_at_period_end }
    : null;
}

// Plans from low to high. Patreon and hand-set tiers are matched by name; Polar plans carry their own.
const PLAN_RANK = { early_access: 1, pro: 2, sponsor: 3 };
export const POLAR_PLAN_NAMES = { early_access: "Early Access", pro: "Sketch shaper PRO", sponsor: "Sponsor" };
const planOfTier = (name) => (isAdFreeTier(name) ? "early_access" : /sponsor/i.test(String(name || "")) ? "sponsor" : "pro");
const manualActive = (user, now) => user.access === "pro" && (!user.access_until || user.access_until > now);

// The highest plan someone has today, from every source that counts, and the tier name to show for it.
// A tie keeps the first source: manual, then Patreon, then Polar.
export function membershipOf(user, link, now = new Date()) {
  if (!user || user.access === "blocked") return { plan: null, tier: null };
  const options = [];
  if (manualActive(user, now)) options.push({ plan: planOfTier(user.access_tier), tier: user.access_tier || null });
  if (link?.is_active_patron) options.push({ plan: planOfTier(link.membership_tier), tier: link.membership_tier });
  for (const s of user.polar_subscriptions || []) {
    if (POLAR_LIVE_STATUSES.includes(s.status)) options.push({ plan: s.plan, tier: POLAR_PLAN_NAMES[s.plan] || null });
  }
  const best = options.reduce((a, b) => (!a || PLAN_RANK[b.plan] > PLAN_RANK[a.plan] ? b : a), null);
  return best || { plan: null, tier: null };
}

// The access rule. isPro = PRO models (and PRO in the extension); adFree = no ads, true for every paying member.
// Blocked is never anything; manual PRO counts until its end date; otherwise an active Patreon pledge or Polar plan.
// An ad-free-only manual tier does not hide a PRO pledge on Patreon. proSource: "blocked" | "manual" | "patreon" | "polar" | null
// `user.polar_subscriptions` must be loaded for Polar to count.
export function accessOf(user, link, now = new Date()) {
  if (user.access === "blocked") return { isPro: false, adFree: false, proSource: "blocked" };
  const manual = manualActive(user, now);
  const patron = Boolean(link?.is_active_patron);
  const polar = polarAccess(user.polar_subscriptions);
  if (manual && !isAdFreeTier(user.access_tier)) return { isPro: true, adFree: true, proSource: "manual" };
  if (patron && !isAdFreeTier(link.membership_tier)) return { isPro: true, adFree: true, proSource: "patreon" };
  if (polar === "pro") return { isPro: true, adFree: true, proSource: "polar" };
  if (manual) return { isPro: false, adFree: true, proSource: "manual" };
  if (patron) return { isPro: false, adFree: true, proSource: "patreon" };
  if (polar) return { isPro: false, adFree: true, proSource: "polar" };
  return { isPro: false, adFree: false, proSource: null };
}

const withAccessData = { patreon_link: true, polar_subscriptions: true };

// What the website shows about someone's access, from what we already know (never calls Patreon or Polar)
export async function proStatus(siteUserId) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: withAccessData });
  const link = user?.patreon_link;
  const { isPro, adFree, proSource } = user ? accessOf(user, link) : { isPro: false, adFree: false, proSource: null };
  const { plan, tier } = membershipOf(user, link);
  return {
    isPro,
    adFree,
    proSource,
    proUntil: proSource === "manual" ? user.access_until : null,
    patreonLinked: Boolean(link),
    plan, // "early_access" | "pro" | "sponsor" | null: the highest plan across Patreon, Polar and manual
    membershipTier: tier,
    polar: user ? polarSummary(user.polar_subscriptions) : null,
  };
}

// Whether this person may download PRO models. With `refresh`, a Patreon status older than an hour is checked
// with Patreon first. A blocked, manual or Polar account never needs Patreon, so it is decided before that.
export async function isPro(siteUserId, { refresh = false, maxAgeMs = RECHECK_MS } = {}) {
  const user = await prisma.siteUser.findUnique({ where: { id: siteUserId }, include: withAccessData });
  if (!user) return false;
  const decided = accessOf(user, user.patreon_link);
  if (decided.proSource === "blocked") return false;
  if (decided.isPro && decided.proSource !== "patreon") return true;

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
