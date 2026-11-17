import { prisma } from "../../db/prisma.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { accessOf } from "../pro/pro.service.mjs";

const ACCESS = ["normal", "pro", "blocked"];
const NOTE_MAX = 255;

// The PRO rule (see accessOf) written as a database filter
const proWhere = (now) => ({
  access: { not: "blocked" },
  OR: [
    { access: "pro", OR: [{ access_until: null }, { access_until: { gt: now } }] },
    { patreon_link: { is: { is_active_patron: true } } },
  ],
});

const FILTERS = {
  all: () => ({}),
  pro: proWhere,
  free: (now) => ({ NOT: proWhere(now) }),
  patreon: () => ({ patreon_link: { isNot: null } }),
  manual: () => ({ access: "pro" }),
  blocked: () => ({ access: "blocked" }),
};

// What the admin panel sees about one account. Never includes passwords or Patreon tokens.
function memberShape(user, now = new Date()) {
  const link = user.patreon_link;
  const { isPro, proSource } = accessOf(user, link, now);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: Boolean(user.email_verified_at),
    createdAt: user.created_at,
    signInMethods: [user.password && "email", user.google_id && "google", link && "patreon"].filter(Boolean),
    access: user.access,
    accessUntil: user.access_until,
    accessNote: user.access_note,
    manualExpired: user.access === "pro" && Boolean(user.access_until) && user.access_until <= now,
    isPro,
    proSource,
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

export async function listMembers({ page = 1, limit = 20, search = "", filter = "all", order = "desc" } = {}) {
  const now = new Date();
  const where = { ...(FILTERS[filter] || FILTERS.all)(now) };
  const q = String(search || "").trim();
  if (q) where.AND = [{ OR: [{ name: { contains: q } }, { email: { contains: q } }] }];

  const take = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const [users, total] = await Promise.all([
    prisma.siteUser.findMany({
      where,
      include: { patreon_link: true },
      orderBy: { created_at: order === "asc" ? "asc" : "desc" },
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
  const user = await prisma.siteUser.findUnique({ where: { id: parseInt(id) || 0 }, include: { patreon_link: true } });
  if (!user) throw new AuthError("Member not found", 404);
  return user;
}

export const getMember = async (id) => memberShape(await findMember(id));

// The admin's PRO switch: normal (Patreon decides), pro (by hand, optional end date) or blocked
export async function setAccess(id, { access, until = null, note = null } = {}) {
  if (!ACCESS.includes(access)) throw new AuthError("Access must be normal, pro or blocked.");
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
    data: { access, access_until: accessUntil, access_note: cleanNote || null },
    include: { patreon_link: true },
  });
  return memberShape(updated);
}

// Dashboard numbers, counted in the database. Patreon figures are only as fresh as each account's last check.
export async function memberStats() {
  const now = new Date();
  const activeLink = { is_active_patron: true };
  const [accounts, confirmed, pro, manual, blocked, google, email, connected, active, pledge, tiers] = await Promise.all([
    prisma.siteUser.count(),
    prisma.siteUser.count({ where: { email_verified_at: { not: null } } }),
    prisma.siteUser.count({ where: proWhere(now) }),
    prisma.siteUser.count({ where: { access: "pro", OR: [{ access_until: null }, { access_until: { gt: now } }] } }),
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
    accounts: { total: accounts, confirmed, pro, free: accounts - pro, manualPro: manual, blocked },
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
