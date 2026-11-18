import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { prisma } from "../../db/prisma.mjs";
import membersRouter from "../../routes/api/members.route.mjs";
import globalErrorHandler from "../../middlewares/errors/globalErrorHandler.mjs";
import { createSession, ADMIN_COOKIE } from "../../utils/session.mjs";
import { accessOf, isPro, proStatus } from "../pro/pro.service.mjs";

// Uses the local dev database: throwaway accounts tagged with this run's stamp, removed at the end
const stamp = Date.now();
const mail = (n) => `mb-test-${stamp}-${n}@example.test`;
const TIER = `Tier ${stamp}`;
const fakeReq = { ip: "1.1.1.1", get: () => "test" };
const DAY = 86400_000;

const admin = await prisma.user.create({ data: { email: mail("admin"), password: "x" } });
const { token: adminToken } = await createSession({ kind: "admin", adminId: admin.id, ttlMs: 60_000 }, fakeReq);
const adminCookie = `${ADMIN_COOKIE}=${adminToken}`;

const plain = await prisma.siteUser.create({ data: { email: mail("plain"), password: "hash", email_verified_at: new Date() } });
const googler = await prisma.siteUser.create({ data: { email: mail("google"), google_id: `g-${stamp}` } });
const patron = await prisma.siteUser.create({
  data: {
    email: mail("patron"),
    name: "Pat Ron",
    patreon_link: {
      create: {
        patreon_id: `mb-${stamp}`,
        access_token_enc: "unused",
        refresh_token_enc: "unused",
        token_expires_at: new Date(Date.now() + DAY),
        is_active_patron: true,
        pledge_amount_cents: 700,
        membership_tier: TIER,
        last_verified_at: new Date(), // fresh, so no Patreon call is made
      },
    },
  },
});

const app = express();
app.use(express.json());
app.use("/api/members", membersRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/members`;

test.after(async () => {
  server.close();
  const ours = { site_user: { email: { startsWith: `mb-test-${stamp}-` } } };
  await prisma.manualPayment.deleteMany({ where: ours }); // payments protect their account, so they go first
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `mb-test-${stamp}-` } } });
  await prisma.user.delete({ where: { id: admin.id } });
  await prisma.$disconnect();
});

const call = async (path, { method = "GET", body, cookie = adminCookie } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie && { Cookie: cookie }), ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const list = async (query) => (await call(`?search=${encodeURIComponent(`mb-test-${stamp}`)}&${query}`)).body.data;
const emailsOf = (data) => data.result.map((m) => m.email).sort();
const setAccess = (id, body) => call(`/${id}/access`, { method: "PATCH", body });

test("only an admin session gets in: no cookie, or a visitor's session, is refused", async () => {
  assert.equal((await call("", { cookie: null })).status, 401);
  const { token } = await createSession({ kind: "website", siteUserId: plain.id, ttlMs: 60_000 }, fakeReq);
  assert.equal((await call("", { cookie: `${ADMIN_COOKIE}=${token}` })).status, 401);
  const write = await call(`/${plain.id}/access`, { method: "PATCH", body: { access: "pro" }, cookie: `${ADMIN_COOKIE}=${token}` });
  assert.equal(write.status, 401);
  assert.equal(await isPro(plain.id), false, "the refused change did nothing");
});

test("the list shows every kind of account, how they sign in and where PRO comes from, and no secrets", async () => {
  const data = await list("filter=all");
  assert.deepEqual(emailsOf(data), [mail("google"), mail("patron"), mail("plain")]);
  const byEmail = Object.fromEntries(data.result.map((m) => [m.email, m]));
  assert.deepEqual(byEmail[mail("plain")].signInMethods, ["email"]);
  assert.deepEqual(byEmail[mail("google")].signInMethods, ["google"]);
  assert.deepEqual(byEmail[mail("patron")].signInMethods, ["patreon"]);
  assert.equal(byEmail[mail("patron")].proSource, "patreon");
  assert.equal(byEmail[mail("patron")].patreon.tier, TIER);
  assert.equal(byEmail[mail("plain")].isPro, false);
  const raw = JSON.stringify(data);
  assert.doesNotMatch(raw, /password|token_enc|"hash"/);
});

test("filters: pro, free, patreon", async () => {
  assert.deepEqual(emailsOf(await list("filter=pro")), [mail("patron")]);
  assert.deepEqual(emailsOf(await list("filter=free")), [mail("google"), mail("plain")]);
  assert.deepEqual(emailsOf(await list("filter=patreon")), [mail("patron")]);
});

test("manual PRO makes an email or Google account PRO, shows on the website, and ends on its end date", async () => {
  const set = await setAccess(googler.id, { access: "pro", tier: " Sponsor ", note: "  Paid via WhatsApp  " });
  assert.equal(set.status, 200);
  assert.equal(set.body.data.proSource, "manual");
  assert.equal(set.body.data.accessTier, "Sponsor");
  assert.equal(set.body.data.accessNote, "Paid via WhatsApp");
  assert.equal(await isPro(googler.id, { refresh: true }), true);
  assert.equal((await proStatus(googler.id)).isPro, true);
  assert.deepEqual(emailsOf(await list("filter=manual")), [mail("google")]);

  const until = new Date(Date.now() + 30 * DAY).toISOString();
  const dated = await setAccess(googler.id, { access: "pro", until });
  assert.equal(dated.body.data.accessUntil, until);
  assert.equal((await proStatus(googler.id)).proUntil.toISOString(), until);

  // An end date that has passed: back to free, and the admin sees it expired
  await prisma.siteUser.update({ where: { id: googler.id }, data: { access_until: new Date(Date.now() - 1000) } });
  assert.equal(await isPro(googler.id), false);
  const member = (await call(`/${googler.id}`)).body.data;
  assert.equal(member.manualExpired, true);
  assert.equal(member.isPro, false);

  const back = await setAccess(googler.id, { access: "normal", tier: "Sponsor" });
  assert.equal(back.body.data.accessTier, null, "the tier only belongs to manual PRO");
  assert.equal(await isPro(googler.id), false);
});

test("blocked beats an active Patreon pledge, survives a Patreon re-check, and normal gives it back", async () => {
  await setAccess(patron.id, { access: "blocked" });
  assert.equal(await isPro(patron.id, { refresh: true }), false);
  const status = await proStatus(patron.id);
  assert.equal(status.isPro, false);
  assert.equal(status.proSource, "blocked");
  assert.equal(status.membershipTier, null);
  assert.deepEqual(emailsOf(await list("filter=blocked")), [mail("patron")]);
  assert.deepEqual(emailsOf(await list("filter=pro")), []);

  // Patreon still says active (as a re-check would): still blocked
  await prisma.patreonLink.update({ where: { patreon_id: `mb-${stamp}` }, data: { is_active_patron: true } });
  assert.equal(await isPro(patron.id), false);

  await setAccess(patron.id, { access: "normal" });
  assert.equal(await isPro(patron.id), true);
});

test("bad input is refused with a clear message", async () => {
  assert.equal((await setAccess(plain.id, { access: "admin" })).status, 400);
  assert.equal((await setAccess(plain.id, { access: "pro", until: "not a date" })).status, 400);
  assert.equal((await setAccess(plain.id, { access: "pro", until: new Date(Date.now() - DAY).toISOString() })).status, 400);
  assert.equal((await setAccess(plain.id, { access: "pro", note: "x".repeat(256) })).status, 400);
  assert.equal((await setAccess(plain.id, { access: "pro", tier: "x".repeat(101) })).status, 400);
  assert.equal((await setAccess(999999999, { access: "pro" })).status, 404);
  assert.equal((await call("/999999999")).status, 404);
  assert.equal(await isPro(plain.id), false, "nothing changed");
});

test("dashboard numbers come from the database and use the real tier names", async () => {
  const stats = (await call("/stats")).body.data;
  const tier = stats.patreon.tiers.find((t) => t.name === TIER);
  assert.equal(tier.count, 1);
  assert.equal(tier.pledgeCents, 700);
  assert.ok(stats.accounts.total >= 3);
  assert.ok(stats.patreon.activePatrons >= 1);
  assert.equal(stats.accounts.free, stats.accounts.total - stats.accounts.pro);
});

test("the PRO rule itself", () => {
  const now = new Date();
  const later = new Date(now.getTime() + DAY);
  const earlier = new Date(now.getTime() - DAY);
  const active = { is_active_patron: true };
  assert.deepEqual(accessOf({ access: "normal" }, null, now), { isPro: false, proSource: null });
  assert.deepEqual(accessOf({ access: "normal" }, active, now), { isPro: true, proSource: "patreon" });
  assert.deepEqual(accessOf({ access: "pro" }, null, now), { isPro: true, proSource: "manual" });
  assert.deepEqual(accessOf({ access: "pro", access_until: later }, null, now), { isPro: true, proSource: "manual" });
  assert.deepEqual(accessOf({ access: "pro", access_until: earlier }, null, now), { isPro: false, proSource: null });
  assert.deepEqual(accessOf({ access: "pro", access_until: earlier }, active, now), { isPro: true, proSource: "patreon" });
  assert.deepEqual(accessOf({ access: "blocked" }, active, now), { isPro: false, proSource: "blocked" });
});

// ----- Payments made outside Patreon -----

const pay = (id, body) => call(`/${id}/payments`, { method: "POST", body });
const today = new Date().toISOString().slice(0, 10);

test("payments: recorded in any currency, newest first, totals per currency never mixed", async () => {
  const a = await pay(plain.id, { amount: "10", currency: "usd", paidOn: "2026-09-17", note: " WhatsApp " });
  assert.equal(a.status, 200);
  await pay(plain.id, { amount: "10.50", currency: "USD", paidOn: "2026-10-17" });
  const c = await pay(plain.id, { amount: "1,250", currency: "BDT", paidOn: today });
  const { payments, totals } = c.body.data;
  assert.deepEqual(payments.map((p) => [p.paidOn, p.amountMinor, p.currency]), [
    [today, 125000, "BDT"],
    ["2026-10-17", 1050, "USD"],
    ["2026-09-17", 1000, "USD"],
  ]);
  assert.equal(payments[2].note, "WhatsApp");
  assert.equal(payments[2].addedBy, mail("admin"), "who entered it");
  assert.deepEqual(totals, [
    { currency: "BDT", amountMinor: 125000 },
    { currency: "USD", amountMinor: 2050 },
  ]);
  assert.deepEqual((await call(`/${plain.id}/payments`)).body.data.totals, totals, "the same when read back");
});

test("payments: a payment changes nothing about PRO access", async () => {
  assert.equal(await isPro(plain.id), false);
  assert.equal((await call(`/${plain.id}`)).body.data.access, "normal");
});

test("payments: wrong input is refused with a message the admin can act on", async () => {
  const refused = async (body, pattern) => {
    const res = await pay(plain.id, { amount: "10", currency: "USD", paidOn: today, ...body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.message, pattern);
  };
  await refused({ currency: "XYZ" }, /valid currency/);
  await refused({ currency: "" }, /valid currency/);
  await refused({ amount: "10.555" }, /at most 2 decimals/);
  await refused({ amount: "500.5", currency: "JPY" }, /no decimals/);
  await refused({ amount: "0" }, /more than 0/);
  await refused({ amount: "ten" }, /as a number/);
  await refused({ paidOn: "2026-02-30" }, /date/);
  await refused({ paidOn: "" }, /date/);
  await refused({ paidOn: "2999-01-01" }, /future/);
  await refused({ note: "x".repeat(256) }, /at most 255/);
  assert.equal((await pay(999999999, { amount: "10", currency: "USD", paidOn: today })).status, 404);
});

test("payments: delete removes only that member's payment, and only admins can touch payments", async () => {
  const before = (await call(`/${plain.id}/payments`)).body.data.payments;
  const target = before.find((p) => p.currency === "BDT");

  // Someone else's id in the URL does not reach this payment
  assert.equal((await call(`/${googler.id}/payments/${target.id}`, { method: "DELETE" })).status, 404);
  // Visitors and signed-out callers are refused
  const { token } = await createSession({ kind: "website", siteUserId: plain.id, ttlMs: 60_000 }, fakeReq);
  const visitor = `${ADMIN_COOKIE}=${token}`;
  assert.equal((await call(`/${plain.id}/payments`, { cookie: visitor })).status, 401);
  assert.equal((await call(`/${plain.id}/payments`, { method: "POST", cookie: null, body: { amount: "1", currency: "USD", paidOn: today } })).status, 401);
  assert.equal((await call(`/${plain.id}/payments/${target.id}`, { method: "DELETE", cookie: visitor })).status, 401);

  const res = await call(`/${plain.id}/payments/${target.id}`, { method: "DELETE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.payments.length, before.length - 1);
  assert.deepEqual(res.body.data.totals, [{ currency: "USD", amountMinor: 2050 }]);
  assert.equal((await call(`/${plain.id}/payments/${target.id}`, { method: "DELETE" })).status, 404, "already gone");
});

test("payments: an account with payments cannot be deleted, so money records never vanish by accident", async () => {
  assert.ok((await prisma.manualPayment.count({ where: { site_user_id: plain.id } })) > 0);
  await assert.rejects(prisma.siteUser.delete({ where: { id: plain.id } }));
  assert.ok(await prisma.siteUser.findUnique({ where: { id: plain.id } }), "account still there");
});
