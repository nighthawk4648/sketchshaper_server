import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import { startFakePatreon } from "../patreon/fakePatreon.mjs";

// The fake Patreon and settings must exist before the app code reads its config
const fake = await startFakePatreon();
const CAMPAIGN = "campaign-ext";
Object.assign(process.env, {
  PATREON_BASE_URL: fake.url,
  PATREON_CLIENT_ID: "test-client",
  PATREON_CLIENT_SECRET: "test-secret",
  PATREON_CAMPAIGN_ID: CAMPAIGN,
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
});
const { prisma } = await import("../../db/prisma.mjs");
const { default: extensionRouter } = await import("../../routes/api/extension.route.mjs");
const { default: assetRouter } = await import("../../routes/api/asset.route.mjs");
const { default: globalErrorHandler } = await import("../../middlewares/errors/globalErrorHandler.mjs");
const { createSession, deleteSiteUserSessions, SITE_COOKIE } = await import("../../utils/session.mjs");
const { encryptToken } = await import("../../utils/tokenCrypto.mjs");

// Uses the local dev database and uploads folder: throwaway rows and one small file, removed at the end
const stamp = Date.now();
const mail = (n) => `ext-test-${stamp}-${n}@example.test`;
const fakeReq = { ip: "1.1.1.1", get: () => "t" };
const fileName = `ext-${stamp}.skp`;
const filePath = path.join(process.cwd(), "uploads", "sketchshaper-pro", fileName);
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, "model");

const category = await prisma.category.create({ data: { name: `ext-${stamp}`, short_description: "t" } });
const sub = await prisma.subCategory.create({ data: { name: "t", short_description: "t", category_id: category.id } });
const proAsset = await prisma.asset.create({
  data: {
    name: "pro", cover: "x.jpg", resolution: "x", size: "x", sub_category_id: sub.id, access_type: "paid",
    file: { create: { main_file: `sketchshaper-pro/${fileName}`, file_type: ".skp", upload_status: "completed" } },
  },
});

const makeUser = (name, data = {}) =>
  prisma.siteUser.create({ data: { email: mail(name), email_verified_at: new Date(), ...data } });
const cookieFor = async (user) =>
  `${SITE_COOKIE}=${(await createSession({ kind: "website", siteUserId: user.id, ttlMs: 60_000 }, fakeReq)).token}`;

const app = express();
app.use(express.json());
app.use("/api/extension", extensionRouter);
app.use("/api/assets", assetRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
console.error = () => {};

test.after(async () => {
  server.close();
  fake.close();
  fs.rmSync(filePath, { force: true });
  await prisma.category.delete({ where: { id: category.id } });
  await prisma.polarSubscription.deleteMany({ where: { site_user: { email: { startsWith: `ext-test-${stamp}-` } } } });
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `ext-test-${stamp}-` } } });
  await prisma.$disconnect();
});

let visitor = 0;
const call = async (method, url, { cookie, bearer, body, ip } = {}) => {
  visitor += 1; // each call looks like a new address, so the rate limits only bite where a test asks for it
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      "CF-Connecting-IP": ip || `10.${stamp % 200}.${visitor >> 8}.${visitor & 255}`,
      ...(cookie && { Cookie: cookie }),
      ...(bearer && { Authorization: `Bearer ${bearer}` }),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* a downloaded file */ }
  return { status: res.status, data: json.data, message: json.message };
};
const start = async () => (await call("POST", "/extension/start")).data;
const poll = async (nonce) => (await call("GET", `/extension/poll/${nonce}`)).data;
const approve = (code, cookie) => call("POST", "/extension/approve", { cookie, body: { code } });

// The whole sign-in for one person; returns the extension's key
async function connect(user) {
  const { nonce, code } = await start();
  assert.equal((await approve(code, await cookieFor(user))).status, 200);
  return (await poll(nonce)).result;
}
const download = (bearer) => call("GET", `/assets/${proAsset.id}/download`, { bearer });

test("full sign-in: start, wait, Connect on the website, key handed over exactly once", async () => {
  const user = await makeUser("round", { name: "Round Trip", access: "pro", access_tier: "Sponsor" });
  const { nonce, code, expiresIn } = await start();
  assert.match(code, /^[0-9A-F]{6}$/);
  assert.match(nonce, /^[A-Za-z0-9_-]{20,64}$/);
  assert.equal(expiresIn, 600);
  assert.equal((await poll(nonce)).status, "pending");

  assert.equal((await approve(code.toLowerCase(), await cookieFor(user))).status, 200, "code typed in lower case works");
  const done = await poll(nonce);
  assert.equal(done.status, "done");
  assert.ok(new Date(done.result.expiresAt) > new Date(Date.now() + 29 * 86400_000), "lasts 30 days");
  assert.deepEqual(
    { name: done.result.user.name, isPro: done.result.user.isPro, tier: done.result.user.tier, blocked: done.result.user.blocked },
    { name: "Round Trip", isPro: true, tier: "Sponsor", blocked: false },
  );
  assert.equal(done.result.user.email, undefined, "the extension never receives the email address");
  assert.equal((await poll(nonce)).status, "expired", "the key is only handed over once");

  // Only a hash of the key is stored
  const stored = await prisma.session.findFirst({ where: { site_user_id: user.id, kind: "extension" } });
  assert.notEqual(stored.token_hash, done.result.token);
  assert.equal(stored.token_hash, crypto.createHash("sha256").update(done.result.token).digest("hex"));
});

test("two polls at the same moment: only one receives the key", async () => {
  const user = await makeUser("race");
  const { nonce, code } = await start();
  await approve(code, await cookieFor(user));
  const results = await Promise.all([poll(nonce), poll(nonce), poll(nonce)]);
  assert.equal(results.filter((r) => r.status === "done").length, 1);
  assert.equal(await prisma.session.count({ where: { site_user_id: user.id, kind: "extension" } }), 1);
});

test("Connect needs a signed-in person with a confirmed email and a live code", async () => {
  const { nonce, code } = await start();
  assert.equal((await approve(code)).status, 401, "not signed in");
  const unconfirmed = await makeUser("unconfirmed", { email_verified_at: null });
  const refused = await approve(code, await cookieFor(unconfirmed));
  assert.equal(refused.status, 403);
  assert.match(refused.message, /confirm your email/);
  assert.equal((await poll(nonce)).status, "pending", "nothing was approved");

  const user = await makeUser("codes");
  const cookie = await cookieFor(user);
  assert.equal((await approve("not-a-code", cookie)).status, 400);
  assert.equal((await approve("000000", cookie)).status, 400);

  await prisma.extensionLogin.update({ where: { code }, data: { expires_at: new Date(Date.now() - 1000) } });
  assert.equal((await approve(code, cookie)).status, 400, "expired code");
  assert.equal((await poll(nonce)).status, "expired");
});

test("a code cannot be approved twice, so nobody can take over someone else's sign-in", async () => {
  const first = await makeUser("first");
  const second = await makeUser("second");
  const { nonce, code } = await start();
  assert.equal((await approve(code, await cookieFor(first))).status, 200);
  assert.equal((await approve(code, await cookieFor(second))).status, 400);
  const { result } = await poll(nonce);
  assert.equal((await prisma.session.count({ where: { site_user_id: second.id, kind: "extension" } })), 0);
  assert.ok(result.token);
});

test("PRO download uses the same rules as the website: PRO yes, free no, blocked no, no key no", async () => {
  const pro = await connect(await makeUser("pro", { access: "pro" }));
  assert.equal((await download(pro.token)).status, 200);

  const free = await connect(await makeUser("free"));
  assert.equal(free.user.isPro, false);
  assert.equal((await download(free.token)).status, 403);

  const blockedUser = await makeUser("blocked", { access: "blocked" });
  const blocked = await connect(blockedUser);
  assert.equal(blocked.user.blocked, true);
  assert.equal((await download(blocked.token)).status, 403);

  assert.equal((await download()).status, 401);
  assert.equal((await download("made-up-key")).status, 401);
});

test("keys stay in their lane: a website session is no key, and a key is no website session", async () => {
  const user = await makeUser("lane", { access: "pro" });
  const { token: websiteToken } = await createSession({ kind: "website", siteUserId: user.id, ttlMs: 60_000 }, fakeReq);
  assert.equal((await download(websiteToken)).status, 401, "website session used as a key");
  assert.equal((await call("GET", "/extension/me", { bearer: websiteToken })).status, 401);

  const { token } = await connect(user);
  const asCookie = await call("POST", "/extension/approve", { cookie: `${SITE_COOKIE}=${token}`, body: { code: "AAAAAA" } });
  assert.equal(asCookie.status, 401, "key used as a website cookie");
});

test("signing out, an expired key and a password reset all end the extension's access", async () => {
  const user = await makeUser("end", { access: "pro" });
  const one = await connect(user);
  assert.equal((await call("GET", "/extension/me", { bearer: one.token })).status, 200);
  assert.equal((await call("POST", "/extension/logout", { bearer: one.token })).status, 200);
  assert.equal((await call("GET", "/extension/me", { bearer: one.token })).status, 401);
  assert.equal((await download(one.token)).status, 401);

  const two = await connect(user);
  await prisma.session.updateMany({ where: { site_user_id: user.id, kind: "extension" }, data: { expires_at: new Date(Date.now() - 1000) } });
  assert.equal((await call("GET", "/extension/me", { bearer: two.token })).status, 401, "expired");

  const three = await connect(user);
  await deleteSiteUserSessions(user.id); // what a password reset does
  assert.equal((await call("GET", "/extension/me", { bearer: three.token })).status, 401);
});

test("'I've joined' picks up a new Patreon pledge straight away; a normal check waits", async () => {
  const user = await makeUser("joined", { name: null });
  const identity = { id: `ext-${stamp}`, email: user.email, name: "New Patron", verified: true, patron: null };
  fake.nextLogin(identity);
  const authorize = await fetch(`${fake.url}/oauth2/authorize?redirect_uri=${encodeURIComponent("http://x.test/cb")}&state=s`, { redirect: "manual" });
  const authCode = new URL(authorize.headers.get("location")).searchParams.get("code");
  const tokens = await (await fetch(`${fake.url}/api/oauth2/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code: authCode }),
  })).json();
  await prisma.patreonLink.create({
    data: {
      site_user_id: user.id,
      patreon_id: identity.id,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: encryptToken(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + 3600_000),
      last_verified_at: new Date(Date.now() - 5 * 60_000), // checked 5 minutes ago
    },
  });
  const { token, user: before } = await connect(user);
  assert.equal(before.isPro, false);
  assert.equal(before.patreonLinked, true);
  assert.equal(before.name, user.email.split("@")[0], "falls back when the account has no name");

  fake.setPatron(identity.id, { campaignId: CAMPAIGN, cents: 500, status: "active_patron", tier: "Sketch shaper-Pro" });
  assert.equal((await call("GET", "/extension/me", { bearer: token })).data.user.isPro, false, "normal check: hourly");
  const after = (await call("GET", "/extension/me?refresh=1", { bearer: token })).data.user;
  assert.equal(after.isPro, true);
  assert.equal(after.tier, "Sketch shaper-Pro");

  // Asking again at once does not call Patreon again
  const calls = fake.calls.identity;
  await call("GET", "/extension/me?refresh=1", { bearer: token });
  assert.equal(fake.calls.identity, calls);
});

test("Polar members: the extension gets the real plan name, ad-free state and where billing lives", async () => {
  const polarSub = (user, plan, status = "active") =>
    prisma.polarSubscription.create({
      data: {
        polar_subscription_id: `ext-${stamp}-${user.id}-${plan}`, site_user_id: user.id, polar_customer_id: "c",
        plan, period: "monthly", status, last_event_at: new Date(),
      },
    });
  const me = async (user) => (await call("GET", "/extension/me", { bearer: (await connect(user)).token })).data.user;

  const cases = [["early_access", false, "Early Access"], ["pro", true, "Sketch shaper PRO"], ["sponsor", true, "Sponsor"]];
  for (const [plan, isPro, tier] of cases) {
    const user = await makeUser(`polar-${plan}`);
    await polarSub(user, plan);
    const got = await me(user);
    assert.deepEqual(
      [got.isPro, got.adFree, got.proSource, got.plan, got.tier, got.billing],
      [isPro, true, "polar", plan, tier, "polar"],
      plan,
    );
  }

  // A Patreon Early Access pledge next to a Polar PRO plan shows the higher plan, not the Patreon tier
  const both = await makeUser("both");
  await prisma.patreonLink.create({
    data: {
      site_user_id: both.id, patreon_id: `ext-both-${stamp}`, access_token_enc: encryptToken("a"), refresh_token_enc: encryptToken("r"),
      token_expires_at: new Date(Date.now() + 3600_000), is_active_patron: true, membership_tier: "Early Access", last_verified_at: new Date(),
    },
  });
  await polarSub(both, "pro");
  const mixed = await me(both);
  assert.deepEqual([mixed.isPro, mixed.plan, mixed.tier, mixed.billing], [true, "pro", "Sketch shaper PRO", "polar"]);

  // A failed payment: no access, but billing still points to the website so the card can be fixed
  const late = await makeUser("late");
  await polarSub(late, "pro", "past_due");
  const lapsed = await me(late);
  assert.deepEqual([lapsed.isPro, lapsed.adFree, lapsed.plan, lapsed.tier, lapsed.billing], [false, false, null, null, "polar"]);
});

test("starting sign-ins over and over from one address is cut off", async () => {
  const ip = "203.0.113.77";
  const codes = [];
  for (let i = 0; i < 11; i += 1) codes.push((await call("POST", "/extension/start", { ip })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
  assert.equal(codes[10], 429);
});
