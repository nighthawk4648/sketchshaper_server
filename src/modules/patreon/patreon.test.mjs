import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import { startFakePatreon } from "./fakePatreon.mjs";

// The fake Patreon and the settings must exist before the app code reads its config
const fake = await startFakePatreon();
const CAMPAIGN = "campaign-1";
Object.assign(process.env, {
  PATREON_BASE_URL: fake.url,
  PATREON_CLIENT_ID: "test-client",
  PATREON_CLIENT_SECRET: "test-secret",
  PATREON_REDIRECT_URI: "http://127.0.0.1:1/api/patreon/callback",
  PATREON_CAMPAIGN_ID: CAMPAIGN,
  FRONTEND_URL: "http://site.test",
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
});
const { prisma } = await import("../../db/prisma.mjs");
const { default: patreonRouter } = await import("../../routes/api/patreon.route.mjs");
const { default: authRouter } = await import("../../routes/api/auth.route.mjs");
const { default: globalErrorHandler } = await import("../../middlewares/errors/globalErrorHandler.mjs");
const { decryptToken, encryptToken } = await import("../../utils/tokenCrypto.mjs");
const { assertProDownload, isPro } = await import("../pro/pro.service.mjs");
const { importLegacyUsers } = await import("./patreon.service.mjs");
const { createSession, SITE_COOKIE } = await import("../../utils/session.mjs");

const stamp = Date.now();
const mail = (n) => `pt-test-${stamp}-${n}@example.test`;
let counter = 0;
const person = (over = {}) => {
  counter += 1;
  return { id: `pt-${stamp}-${counter}`, email: mail(counter), name: "Pat Ron", verified: true, patron: null, ...over };
};
const patron = (cents = 500, campaignId = CAMPAIGN, tier = "Pro") => ({ campaignId, cents, status: "active_patron", tier });

const app = express();
app.use(express.json());
app.use("/api/patreon", patreonRouter);
app.use("/api/auth", authRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
console.error = () => {};

test.after(async () => {
  server.close();
  fake.close();
  await prisma.patreonUser.deleteMany({ where: { patreon_id: { startsWith: `pt-${stamp}-` } } });
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `pt-test-${stamp}-` } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `pt-test-${stamp}-` } } });
  await prisma.$disconnect();
});

const cookiesOf = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]);
const cookie = (res, name) => cookiesOf(res).find((c) => c.startsWith(`${name}=`));

// Plays the browser: start -> Patreon (fake) -> back to our callback. Returns the callback's answer.
async function browserLogin(identity, { next, siteCookie, tamperState } = {}) {
  const start = await fetch(`${base}/patreon/start${next ? `?next=${encodeURIComponent(next)}` : ""}`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const oauthCookie = cookie(start, "ss_oauth");
  fake.nextLogin(identity);
  const toPatreon = await fetch(start.headers.get("location"), { redirect: "manual" });
  const back = new URL(toPatreon.headers.get("location"));
  if (tamperState) back.searchParams.set("state", "forged");
  const headers = { Cookie: [oauthCookie, siteCookie].filter(Boolean).join("; ") };
  const res = await fetch(`${base}/patreon/callback${back.search}`, { redirect: "manual", headers });
  return { res, location: res.headers.get("location"), session: cookie(res, SITE_COOKIE), start };
}
const me = async (sessionCookie) =>
  (await (await fetch(`${base}/auth/me`, { headers: { Cookie: sessionCookie } })).json()).data.user;
const linkFor = (patreonId) =>
  prisma.patreonLink.findUnique({ where: { patreon_id: patreonId }, include: { site_user: true } });

test("the start step sends the visitor to Patreon with a random state, remembered in an HttpOnly cookie", async () => {
  const start = await fetch(`${base}/patreon/start`, { redirect: "manual" });
  const to = new URL(start.headers.get("location"));
  assert.equal(to.origin, fake.url);
  assert.equal(to.pathname, "/oauth2/authorize");
  assert.equal(to.searchParams.get("client_id"), "test-client");
  assert.ok(to.searchParams.get("state").length >= 20);
  const raw = start.headers.getSetCookie().find((c) => c.startsWith("ss_oauth="));
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, /Path=\/api\/patreon/);
});

test("a new visitor who is not a patron is signed in as a free user, with no token in the URL", async () => {
  const who = person();
  const { res, location, session } = await browserLogin(who, { next: "/blog/some-post-9" });
  assert.equal(res.status, 302);
  assert.equal(location, "http://site.test/blog/some-post-9");
  assert.ok(session, "session cookie set");
  assert.doesNotMatch(location, /token/i);

  const user = await me(session);
  assert.equal(user.email, who.email);
  assert.equal(user.emailVerified, true);
  assert.equal(user.isPro, false);
  assert.equal(user.patreonLinked, true);
});

test("patrons of our campaign are PRO; a patron of someone else's campaign is not", async () => {
  const ours = person({ patron: patron(1200) });
  const theirs = person({ patron: patron(1200, "someone-else") });
  const a = await browserLogin(ours);
  const b = await browserLogin(theirs);
  assert.equal((await me(a.session)).isPro, true);
  assert.equal((await me(a.session)).membershipTier, "Pro");
  assert.equal((await me(b.session)).isPro, false);
  assert.equal((await me(b.session)).membershipTier, null);
  const link = await linkFor(ours.id);
  assert.equal(link.membership_tier, "Pro");
  assert.equal(link.pledge_amount_cents, 1200);
});

test("tokens are stored encrypted and can be read back", async () => {
  const who = person();
  await browserLogin(who);
  const link = await linkFor(who.id);
  assert.match(link.access_token_enc, /^v1\./);
  assert.doesNotMatch(link.access_token_enc, /^at-/);
  assert.match(decryptToken(link.access_token_enc), /^at-/);
  assert.match(decryptToken(link.refresh_token_enc), /^rt-/);
});

test("a wrong or missing state is refused and creates nothing", async () => {
  const who = person();
  const forged = await browserLogin(who, { tamperState: true });
  assert.equal(forged.location, "http://site.test/login?error=patreon_failed");
  assert.equal(forged.session, undefined);
  const noCookie = await fetch(`${base}/patreon/callback?code=x&state=y`, { redirect: "manual" });
  assert.equal(noCookie.headers.get("location"), "http://site.test/login?error=patreon_failed");
  assert.equal(await prisma.siteUser.count({ where: { email: who.email } }), 0);
});

test("denying access on Patreon comes back as a clear message", async () => {
  const start = await fetch(`${base}/patreon/start`, { redirect: "manual" });
  const res = await fetch(`${base}/patreon/callback?error=access_denied`, {
    redirect: "manual",
    headers: { Cookie: cookie(start, "ss_oauth") },
  });
  assert.equal(res.headers.get("location"), "http://site.test/login?error=patreon_denied");
});

test("an outside link in next is ignored", async () => {
  const { location } = await browserLogin(person(), { next: "https://evil.example/x" });
  assert.equal(location, "http://site.test/");
  const { location: l2 } = await browserLogin(person(), { next: "//evil.example" });
  assert.equal(l2, "http://site.test/");
});

test("coming back with the same Patreon account gives the same visitor", async () => {
  const who = person();
  await browserLogin(who);
  const first = await linkFor(who.id);
  await browserLogin(who);
  const again = await linkFor(who.id);
  assert.equal(again.site_user_id, first.site_user_id);
  assert.equal(await prisma.siteUser.count({ where: { email: who.email } }), 1);
});

test("a confirmed account with the same email is connected, not duplicated", async () => {
  const who = person();
  const existing = await prisma.siteUser.create({
    data: { email: who.email, password: "$2b$10$x", email_verified_at: new Date() },
  });
  const { session } = await browserLogin(who);
  assert.equal((await linkFor(who.id)).site_user_id, existing.id);
  assert.equal((await me(session)).id, existing.id);
  assert.ok((await prisma.siteUser.findUnique({ where: { id: existing.id } })).password, "password kept");
});

test("an UNconfirmed account with that email loses its unproven password and sessions", async () => {
  const who = person();
  const squatter = await prisma.siteUser.create({ data: { email: who.email, password: "$2b$10$attacker" } });
  const { token } = await createSession({ kind: "website", siteUserId: squatter.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
  await browserLogin(who);
  const after = await prisma.siteUser.findUnique({ where: { id: squatter.id } });
  assert.equal(after.password, null, "attacker's password removed");
  assert.ok(after.email_verified_at, "now confirmed by Patreon");
  assert.equal((await me(`${SITE_COOKIE}=${token}`)), null, "attacker's session ended");
});

test("an unverified Patreon email never takes over an existing account", async () => {
  const who = person({ verified: false });
  const existing = await prisma.siteUser.create({
    data: { email: who.email, password: "$2b$10$x", email_verified_at: new Date() },
  });
  const { location, session } = await browserLogin(who);
  assert.equal(location, "http://site.test/login?error=patreon_email_unverified");
  assert.equal(session, undefined);
  assert.equal(await prisma.patreonLink.count({ where: { site_user_id: existing.id } }), 0);
});

test("someone already signed in can connect Patreon to their own account", async () => {
  const mine = await prisma.siteUser.create({ data: { email: mail("mine"), email_verified_at: new Date() } });
  const { token } = await createSession({ kind: "website", siteUserId: mine.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
  const who = person({ email: mail("different"), patron: patron() });
  const { res, location } = await browserLogin(who, { siteCookie: `${SITE_COOKIE}=${token}`, next: "/account" });
  assert.equal(location, "http://site.test/account");
  assert.equal(cookie(res, SITE_COOKIE), undefined, "no second session needed");
  assert.equal((await linkFor(who.id)).site_user_id, mine.id);
  assert.equal((await me(`${SITE_COOKIE}=${token}`)).isPro, true);

  // a second person cannot take over a Patreon that is already connected to someone else
  const other = await prisma.siteUser.create({ data: { email: mail("other"), email_verified_at: new Date() } });
  const o = await createSession({ kind: "website", siteUserId: other.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
  const stolen = await browserLogin(who, { siteCookie: `${SITE_COOKIE}=${o.token}` });
  assert.equal(stolen.location, "http://site.test/login?error=patreon_in_use");
});

test("an imported (unconfirmed) Patreon user becomes confirmed when Patreon vouches for the same email", async () => {
  const who = person();
  const imported = await prisma.siteUser.create({ data: { email: who.email } });
  await prisma.patreonLink.create({
    data: { site_user_id: imported.id, patreon_id: who.id, access_token_enc: encryptToken("a"), refresh_token_enc: encryptToken("r"), token_expires_at: new Date() },
  });
  const { session } = await browserLogin(who);
  const user = await me(session);
  assert.equal(user.id, imported.id);
  assert.equal(user.emailVerified, true);
});

test("a tampered return path in the cookie still cannot send the visitor off the site", async () => {
  fake.nextLogin(person());
  const authorize = `${fake.url}/oauth2/authorize?redirect_uri=${encodeURIComponent("http://x/cb")}&state=known-state`;
  const back = new URL((await fetch(authorize, { redirect: "manual" })).headers.get("location"));
  const forged = Buffer.from(JSON.stringify({ state: "known-state", next: "@evil.example/x" })).toString("base64url");
  const res = await fetch(`${base}/patreon/callback${back.search}`, { redirect: "manual", headers: { Cookie: `ss_oauth=${forged}` } });
  assert.equal(res.headers.get("location"), "http://site.test/");
});

// ----- PRO checks -----

const reqWith = (sessionToken) => ({ headers: { cookie: sessionToken ? `${SITE_COOKIE}=${sessionToken}` : "" } });
const tokenOf = (s) => s.split("=")[1];

test("downloads: signed out is 401, signed-in non-patron is 403, patron is allowed", async () => {
  await assert.rejects(assertProDownload(reqWith(null)), (e) => e.status === 401);
  const free = await browserLogin(person());
  await assert.rejects(assertProDownload(reqWith(tokenOf(free.session))), (e) => e.status === 403);
  const pro = await browserLogin(person({ patron: patron() }));
  await assertProDownload(reqWith(tokenOf(pro.session)));
});

test("downloads: a pledge cancelled on Patreon stops working once the hourly re-check runs", async () => {
  const who = person({ patron: patron() });
  const { session } = await browserLogin(who);
  const userId = (await linkFor(who.id)).site_user_id;
  assert.equal(await isPro(userId, { refresh: true }), true);

  fake.setPatron(who.id, null); // they cancelled
  const before = fake.calls.identity;
  assert.equal(await isPro(userId, { refresh: true }), true, "fresh check is trusted, Patreon not asked");
  assert.equal(fake.calls.identity, before);

  await prisma.patreonLink.update({ where: { patreon_id: who.id }, data: { last_verified_at: new Date(Date.now() - 2 * 3600_000) } });
  await assert.rejects(assertProDownload(reqWith(tokenOf(session))), (e) => e.status === 403);
  assert.equal((await linkFor(who.id)).is_active_patron, false);
});

test("an expired Patreon token is renewed, and a revoked one means no longer a patron", async () => {
  const who = person({ patron: patron() });
  await browserLogin(who);
  const link = await linkFor(who.id);
  const old = link.access_token_enc;
  const stale = { last_verified_at: new Date(Date.now() - 2 * 3600_000), token_expires_at: new Date(Date.now() - 1000) };
  await prisma.patreonLink.update({ where: { id: link.id }, data: stale });
  assert.equal(await isPro(link.site_user_id, { refresh: true }), true);
  assert.notEqual((await linkFor(who.id)).access_token_enc, old, "new tokens stored");

  fake.revoke(who.id);
  await prisma.patreonLink.update({ where: { id: link.id }, data: stale });
  assert.equal(await isPro(link.site_user_id, { refresh: true }), false);
});

test("if Patreon is unreachable the last known status is kept", async () => {
  const who = person({ patron: patron() });
  await browserLogin(who);
  const link = await linkFor(who.id);
  await prisma.patreonLink.update({ where: { id: link.id }, data: { last_verified_at: new Date(Date.now() - 2 * 3600_000) } });
  fake.failIdentityWith(500);
  assert.equal(await isPro(link.site_user_id, { refresh: true }), true);
  fake.failIdentityWith(null);
});

// ----- Admin, old routes, crypto, import -----

test("the old Patreon token routes are gone, and the admin list needs an admin", async () => {
  for (const path of ["auth", "me", "verify", "check-download/1"]) {
    assert.equal((await fetch(`${base}/patreon/${path}`)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/patreon/users`)).status, 401);
});

test("the admin list shows connected Patreon users in the shape the dashboard expects", async () => {
  const admin = await prisma.user.create({ data: { email: mail("admin"), password: "x" } });
  const { token } = await createSession({ kind: "admin", adminId: admin.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
  const who = person({ patron: patron(500) });
  await browserLogin(who);
  const res = await fetch(`${base}/patreon/users?search=${encodeURIComponent(who.email)}`, { headers: { Cookie: `ss_admin=${token}` } });
  const { data } = await res.json();
  assert.equal(data.result.length, 1);
  const row = data.result[0];
  assert.equal(row.email, who.email);
  assert.equal(row.is_active_patron, true);
  assert.equal(row.pledge_amount, 5);
  assert.equal(row.membership_tier, "Pro");
  assert.equal(row.access_token_enc, undefined, "no tokens in the list");

  const revoke = await fetch(`${base}/patreon/users/${row.id}/revoke`, { method: "POST", headers: { Cookie: `ss_admin=${token}` } });
  assert.equal(revoke.status, 200);
  const after = await linkFor(who.id);
  assert.equal(after.site_user.access, "blocked", "revoke blocks the account");
  assert.equal(await isPro(after.site_user_id, { refresh: true }), false, "and Patreon cannot undo it");
});

test("token encryption: round trip, fresh each time, and tampering is detected", () => {
  const a = encryptToken("secret-token");
  assert.notEqual(a, encryptToken("secret-token"));
  assert.equal(decryptToken(a), "secret-token");
  const parts = a.split(".");
  const flipped = [...parts.slice(0, 3), Buffer.from("x" + Buffer.from(parts[3], "base64url").toString("latin1").slice(1), "latin1").toString("base64url")].join(".");
  assert.throws(() => decryptToken(flipped));
  assert.throws(() => decryptToken("garbage"));
});

test("importing old Patreon users keeps their account, tokens (now encrypted) and status, and can run twice", async () => {
  const legacy = await prisma.patreonUser.create({
    data: {
      patreon_id: `pt-${stamp}-legacy`,
      email: mail("legacy").toUpperCase(),
      full_name: "Old Timer",
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_expires_at: new Date(Date.now() + 86400_000),
      is_active_patron: true,
      pledge_amount_cents: 700,
      membership_tier: "Pro",
    },
  });
  const run1 = await importLegacyUsers();
  assert.ok(run1.imported >= 1);
  const link = await linkFor(legacy.patreon_id);
  assert.equal(link.site_user.email, mail("legacy"));
  assert.equal(link.is_active_patron, true);
  assert.equal(decryptToken(link.access_token_enc), "old-access");
  const run2 = await importLegacyUsers();
  assert.equal(await prisma.patreonLink.count({ where: { patreon_id: legacy.patreon_id } }), 1);
  assert.ok(run2.imported <= run1.imported);
});
