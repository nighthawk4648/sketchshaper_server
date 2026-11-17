import { prisma } from "../../db/prisma.mjs";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto.mjs";
import { SignInError, resolveAccount } from "../auth/accountLinking.mjs";
import * as client from "./patreon.client.mjs";


const tokenFields = (tokens) => ({
  access_token_enc: encryptToken(tokens.access_token),
  refresh_token_enc: encryptToken(tokens.refresh_token),
  token_expires_at: new Date(Date.now() + (tokens.expires_in || 0) * 1000),
});

const statusFields = (identity) => ({
  is_active_patron: identity.isActivePatron,
  pledge_amount_cents: identity.pledgeCents,
  membership_tier: identity.tier,
  last_verified_at: new Date(),
});

// Finds or creates the visitor for this Patreon account and keeps the link, tokens and patron status current.
// currentUserId is set when someone who is already signed in is connecting Patreon.
export async function signInWithPatreon({ tokens, identity, currentUserId = null }) {
  if (!identity.patreonId || !identity.email) throw new SignInError("patreon_no_email");

  try {
    const existing = await prisma.patreonLink.findUnique({ where: { patreon_id: identity.patreonId } });
    if (existing) {
      if (currentUserId && currentUserId !== existing.site_user_id) {
        throw new SignInError("patreon_in_use");
      }
      await prisma.patreonLink.update({
        where: { id: existing.id },
        data: { ...tokenFields(tokens), ...statusFields(identity) },
      });
      const owner = await prisma.siteUser.findUnique({ where: { id: existing.site_user_id } });
      // e.g. people imported from the old system: confirmed once Patreon vouches for the same address
      if (!owner.email_verified_at && identity.emailVerified && owner.email === identity.email) {
        return prisma.siteUser.update({ where: { id: owner.id }, data: { email_verified_at: new Date() } });
      }
      return owner;
    }

    const user = await resolveAccount({
      currentUserId,
      email: identity.email,
      name: identity.fullName,
      emailVerified: identity.emailVerified,
      unverifiedCode: "patreon_email_unverified",
    });

    const data = { patreon_id: identity.patreonId, ...tokenFields(tokens), ...statusFields(identity) };
    await prisma.patreonLink.upsert({
      where: { site_user_id: user.id },
      create: { site_user_id: user.id, ...data },
      update: data,
    });
    return user;
  } catch (err) {
    if (err.code === "P2002") throw new SignInError("patreon_failed"); // two sign-ins raced
    throw err;
  }
}

// Asks Patreon again about this person. If Patreon rejects our access they are no longer a patron;
// if Patreon is just unreachable we keep the last known state.
export async function refreshLinkStatus(link) {
  try {
    let access = decryptToken(link.access_token_enc);
    let renewed = {};
    if (link.token_expires_at <= new Date()) {
      const tokens = await client.refreshTokens(decryptToken(link.refresh_token_enc));
      access = tokens.access_token;
      renewed = tokenFields(tokens);
    }
    const identity = await client.fetchIdentity(access);
    return await prisma.patreonLink.update({ where: { id: link.id }, data: { ...renewed, ...statusFields(identity) } });
  } catch (err) {
    if (err.authFailed) {
      return prisma.patreonLink.update({
        where: { id: link.id },
        data: { is_active_patron: false, pledge_amount_cents: 0, membership_tier: null, last_verified_at: new Date() },
      });
    }
    console.error("Could not refresh Patreon status:", err.message);
    return link;
  }
}

// ----- Admin dashboard (same response shape as before) -----

const adminShape = (link) => ({
  id: link.id,
  patreon_id: link.patreon_id,
  email: link.site_user.email,
  full_name: link.site_user.name,
  membership_tier: link.membership_tier,
  is_active_patron: link.is_active_patron,
  pledge_amount_cents: link.pledge_amount_cents,
  pledge_amount: link.pledge_amount_cents / 100,
  last_verified_at: link.last_verified_at,
  created_at: link.created_at,
  updated_at: link.updated_at,
});

export async function listPatreonUsers({ page = 1, limit = 10, order = "desc", search = "", status = "" } = {}) {
  const where = {};
  const q = String(search || "").trim();
  if (q) where.site_user = { OR: [{ name: { contains: q } }, { email: { contains: q } }] };
  if (status === "active") where.is_active_patron = true;
  else if (status === "inactive") where.is_active_patron = false;

  const take = Math.min(Math.max(parseInt(limit) || 10, 1), 1000);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const [links, total] = await Promise.all([
    prisma.patreonLink.findMany({
      where,
      include: { site_user: { select: { email: true, name: true } } },
      orderBy: { created_at: order === "asc" ? "asc" : "desc" },
      skip: (safePage - 1) * take,
      take,
    }),
    prisma.patreonLink.count({ where }),
  ]);
  return {
    result: links.map(adminShape),
    pagination: { total, totalPages: Math.ceil(total / take) || 1, currentPage: safePage, limit: take },
  };
}

export async function getPatreonUser(id) {
  const link = await prisma.patreonLink.findUnique({
    where: { id: parseInt(id) },
    include: { site_user: { select: { email: true, name: true } } },
  });
  if (!link) throw Object.assign(new Error("Patreon user not found"), { status: 404 });
  return adminShape(link);
}

export const revokeUserAccess = (id) =>
  prisma.patreonLink.update({ where: { id: parseInt(id) }, data: { is_active_patron: false } });

// One-time: copy people from the old PatreonUser table (Patreon-only sign-ins) into accounts. Safe to run twice.
export async function importLegacyUsers() {
  const legacy = await prisma.patreonUser.findMany();
  let imported = 0;
  for (const old of legacy) {
    const email = old.email.trim().toLowerCase();
    if (await prisma.patreonLink.findUnique({ where: { patreon_id: old.patreon_id } })) continue;
    // Patreon never told us whether this address was verified, so it stays unconfirmed until they sign in again
    const user =
      (await prisma.siteUser.findUnique({ where: { email } })) ||
      (await prisma.siteUser.create({ data: { email, name: old.full_name?.slice(0, 100) || null } }));
    if (await prisma.patreonLink.findUnique({ where: { site_user_id: user.id } })) continue;
    await prisma.patreonLink.create({
      data: {
        site_user_id: user.id,
        patreon_id: old.patreon_id,
        access_token_enc: encryptToken(old.access_token),
        refresh_token_enc: encryptToken(old.refresh_token),
        token_expires_at: old.token_expires_at,
        membership_tier: old.membership_tier,
        is_active_patron: old.is_active_patron,
        pledge_amount_cents: old.pledge_amount_cents || 0,
        last_verified_at: old.last_verified_at,
      },
    });
    imported += 1;
  }
  return { found: legacy.length, imported };
}
