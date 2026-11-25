import { prisma } from "../../db/prisma.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { AD_FREE_TIERS, POLAR_LIVE_STATUSES, POLAR_PRO_PLANS, accessOf, polarSummary } from "../pro/pro.service.mjs";
import { isCurrency, toMinorUnits } from "../../utils/money.mjs";

const ACCESS = ["normal", "pro", "blocked"];
const NOTE_MAX = 255;
const TIER_MAX = 100;

// The access rule (see accessOf) written as database filters. MySQL compares tier names ignoring case.
const manualActive = (now) => ({ access: "pro", OR: [{ access_until: null }, { access_until: { gt: now } }] });
const notAdFreeTier = (field) => ({ OR: [{ [field]: null }, { [field]: { notIn: AD_FREE_TIERS } }] });
// A Polar subscription that counts today, optionally only for these plans
const polarLive = (plans) => ({
  polar_subscriptions: { some: { status: { in: POLAR_LIVE_STATUSES }, ...(plans && { plan: { in: plans } }) } },
});
const proWhere = (now) => ({
  access: { not: "blocked" },
  OR: [
    { AND: [manualActive(now), notAdFreeTier("access_tier")] },
    { patreon_link: { is: { is_active_patron: true, ...notAdFreeTier("membership_tier") } } },
    polarLive(POLAR_PRO_PLANS),
  ],
});
// Paying in any tier: PRO or ad-free only
const payingWhere = (now) => ({
  access: { not: "blocked" },
  OR: [manualActive(now), { patreon_link: { is: { is_active_patron: true } } }, polarLive()],
});
const adFreeWhere = (now) => ({ AND: [payingWhere(now), { NOT: proWhere(now) }] });

const FILTERS = {
  all: () => ({}),
  pro: proWhere,
  adfree: adFreeWhere,
  free: (now) => ({ NOT: payingWhere(now) }),
  patreon: () => ({ patreon_link: { isNot: null } }),
  manual: () => ({ access: "pro" }),
  blocked: () => ({ access: "blocked" }),
};

// What the admin panel sees about one account. Never includes passwords or Patreon tokens.
function memberShape(user, now = new Date()) {
  const link = user.patreon_link;
  const { isPro, adFree, proSource } = accessOf(user, link, now);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: Boolean(user.email_verified_at),
    createdAt: user.created_at,
    signInMethods: [user.password && "email", user.google_id && "google", link && "patreon"].filter(Boolean),
    access: user.access,
    accessTier: user.access_tier,
    accessUntil: user.access_until,
    accessNote: user.access_note,
    manualExpired: user.access === "pro" && Boolean(user.access_until) && user.access_until <= now,
    isPro,
    adFree,
    proSource,
    polar: polarSummary(user.polar_subscriptions),
    patreon: link
      ? {
          patreonId: link.patreon_id,
          isActivePatron: link.is_active_patron,
          tier: link.membership_tier,
          pledgeCents: link.pledge_amount_cents,
          lastVerifiedAt: link.last_verified_at,
          linkedAt: link.created_at,
        }
      : null,
  };
}

export async function listMembers({ page = 1, limit = 20, search = "", filter = "all" } = {}) {
  const now = new Date();
  const q = String(search || "").trim();
  const where = {
    AND: [(FILTERS[filter] || FILTERS.all)(now), ...(q ? [{ OR: [{ name: { contains: q } }, { email: { contains: q } }] }] : [])],
  };

  const take = Math.min(Math.max(parseInt(limit) || 20, 1), 10000); // 10000 = the admin's "View All"
  const safePage = Math.max(parseInt(page) || 1, 1);
  const [users, total] = await Promise.all([
    prisma.siteUser.findMany({
      where,
      include: { patreon_link: true, polar_subscriptions: true },
      orderBy: { created_at: "desc" },
      skip: (safePage - 1) * take,
      take,
    }),
    prisma.siteUser.count({ where }),
  ]);
  return {
    result: users.map((u) => memberShape(u, now)),
    pagination: { total, totalPages: Math.ceil(total / take) || 1, currentPage: safePage, limit: take },
  };
}

async function findMember(id) {
  const user = await prisma.siteUser.findUnique({ where: { id: parseInt(id) || 0 }, include: { patreon_link: true, polar_subscriptions: true } });
  if (!user) throw new AuthError("Member not found", 404);
  return user;
}

export const getMember = async (id) => memberShape(await findMember(id));

export async function setAccess(id, { access, tier = null, until = null, note = null } = {}) {
  if (!ACCESS.includes(access)) throw new AuthError("Access must be normal, pro or blocked.");
  const cleanTier = access === "pro" && typeof tier === "string" ? tier.trim() : "";
  if (cleanTier.length > TIER_MAX) throw new AuthError(`The tier name can be at most ${TIER_MAX} characters.`);
  let accessUntil = null;
  if (access === "pro" && until) {
    accessUntil = new Date(until);
    if (Number.isNaN(accessUntil.getTime())) throw new AuthError("The end date is not a valid date.");
    if (accessUntil <= new Date()) throw new AuthError("The end date must be in the future.");
  }
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > NOTE_MAX) throw new AuthError(`The note can be at most ${NOTE_MAX} characters.`);

  const user = await findMember(id);
  const updated = await prisma.siteUser.update({
    where: { id: user.id },
    data: { access, access_tier: cleanTier || null, access_until: accessUntil, access_note: cleanNote || null },
    include: { patreon_link: true, polar_subscriptions: true },
  });
  return memberShape(updated);
}

// ----- Payments made outside Patreon, recorded by an admin -----

const paymentShape = (p) => ({
  id: p.id,
  amountMinor: p.amount_minor,
  currency: p.currency,
  paidOn: p.paid_on.toISOString().slice(0, 10),
  note: p.note,
  addedBy: p.added_by,
  createdAt: p.created_at,
});

// Totals per currency: different currencies are never added together
export async function listPayments(id) {
  const user = await findMember(id);
  const [payments, sums] = await Promise.all([
    prisma.manualPayment.findMany({ where: { site_user_id: user.id }, orderBy: [{ paid_on: "desc" }, { id: "desc" }] }),
    prisma.manualPayment.groupBy({ by: ["currency"], where: { site_user_id: user.id }, _sum: { amount_minor: true } }),
  ]);
  return {
    payments: payments.map(paymentShape),
    totals: sums
      .map((s) => ({ currency: s.currency, amountMinor: s._sum.amount_minor || 0 }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

// paidOn is a calendar date "YYYY-MM-DD"; a day of slack allows for the admin's time zone being ahead of UTC
function parsePaidOn(value) {
  const text = String(value || "");
  const date = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new AuthError("Choose the date the payment was made.");
  }
  if (date.getTime() > Date.now() + 86400_000) throw new AuthError("The payment date cannot be in the future.");
  if (date.getUTCFullYear() < 2000) throw new AuthError("The payment date is too far in the past.");
  return date;
}

export async function addPayment(id, { amount, currency, paidOn, note } = {}, addedBy = null) {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (!isCurrency(code)) throw new AuthError("Choose a valid currency.");
  let amountMinor;
  try {
    amountMinor = toMinorUnits(amount, code);
  } catch (err) {
    throw new AuthError(err.message);
  }
  const paidDate = parsePaidOn(paidOn);
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > NOTE_MAX) throw new AuthError(`The note can be at most ${NOTE_MAX} characters.`);

  const user = await findMember(id);
  await prisma.manualPayment.create({
    data: {
      site_user_id: user.id,
      amount_minor: amountMinor,
      currency: code,
      paid_on: paidDate,
      note: cleanNote || null,
      added_by: addedBy?.slice(0, 254) || null,
    },
  });
  return listPayments(user.id);
}

// Only removes a payment that belongs to this member
export async function deletePayment(id, paymentId) {
  const user = await findMember(id);
  const { count } = await prisma.manualPayment.deleteMany({
    where: { id: parseInt(paymentId) || 0, site_user_id: user.id },
  });
  if (!count) throw new AuthError("Payment not found", 404);
  return listPayments(user.id);
}

// Dashboard numbers, counted in the database. Patreon figures are only as fresh as each account's last check.
export async function memberStats() {
  const now = new Date();
  const activeLink = { is_active_patron: true };
  const [accounts, confirmed, pro, adFree, manual, blocked, google, email, connected, active, pledge, tiers] = await Promise.all([
    prisma.siteUser.count(),
    prisma.siteUser.count({ where: { email_verified_at: { not: null } } }),
    prisma.siteUser.count({ where: proWhere(now) }),
    prisma.siteUser.count({ where: adFreeWhere(now) }),
    prisma.siteUser.count({ where: { AND: [manualActive(now), notAdFreeTier("access_tier")] } }),
    prisma.siteUser.count({ where: FILTERS.blocked() }),
    prisma.siteUser.count({ where: { google_id: { not: null } } }),
    prisma.siteUser.count({ where: { password: { not: null } } }),
    prisma.patreonLink.count(),
    prisma.patreonLink.count({ where: activeLink }),
    prisma.patreonLink.aggregate({ where: activeLink, _sum: { pledge_amount_cents: true } }),
    prisma.patreonLink.groupBy({
      by: ["membership_tier"],
      where: activeLink,
      _count: { _all: true },
      _sum: { pledge_amount_cents: true },
    }),
  ]);
  return {
    accounts: { total: accounts, confirmed, pro, adFree, free: accounts - pro - adFree, manualPro: manual, blocked },
    signInMethods: { email, google, patreon: connected },
    patreon: {
      connected,
      activePatrons: active,
      estMonthlyCents: pledge._sum.pledge_amount_cents || 0,
      tiers: tiers
        .map((t) => ({ name: t.membership_tier, count: t._count._all, pledgeCents: t._sum.pledge_amount_cents || 0 }))
        .sort((a, b) => b.count - a.count),
    },
  };
}
