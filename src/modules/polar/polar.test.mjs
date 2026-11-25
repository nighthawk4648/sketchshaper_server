import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import { startFakePolar } from "./fakePolar.mjs";

// The fake Polar and the settings must exist before the app code reads its config
const fake = await startFakePolar();
const SECRET = "test-webhook-secret-value";
Object.assign(process.env, {
  MODE: "prod", // so the trusted-Origin rule is the real one
  POLAR_API_URL: fake.url,
  POLAR_ACCESS_TOKEN: "test-token",
  POLAR_WEBHOOK_SECRET: SECRET,
  FRONTEND_URL: "http://site.test",
});
const { prisma } = await import("../../db/prisma.mjs");
const { default: polarRouter } = await import("../../routes/api/polar.route.mjs");
const { default: authRouter } = await import("../../routes/api/auth.route.mjs");
const { default: globalErrorHandler } = await import("../../middlewares/errors/globalErrorHandler.mjs");
const { keepWebhookBody, verifySignature } = await import("./polar.webhook.mjs");
const { accessOf, isPro } = await import("../pro/pro.service.mjs");
const { listMembers } = await import("../members/members.service.mjs");
const { createSession, SITE_COOKIE } = await import("../../utils/session.mjs");

const stamp = Date.now();
let counter = 0;
const app = express();
app.use(express.json({ verify: keepWebhookBody }));
app.use("/api/polar", polarRouter);
app.use("/api/auth", authRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
console.error = () => {};

test.after(async () => {
  server.close();
  fake.close();
  const users = await prisma.siteUser.findMany({ where: { email: { startsWith: `polar-test-${stamp}-` } }, select: { id: true } });
  await prisma.polarSubscription.deleteMany({ where: { site_user_id: { in: users.map((u) => u.id) } } });
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `polar-test-${stamp}-` } } });
  await prisma.$disconnect();
});

// A member with a signed-in session
async function member(data = {}) {
  counter += 1;
  const user = await prisma.siteUser.create({ data: { email: `polar-test-${stamp}-${counter}@example.test`, email_verified_at: new Date(), ...data } });
  const { token } = await createSession({ kind: "website", siteUserId: user.id, ttlMs: 60_000 }, { ip: "1.1.1.1", get: () => "t" });
  return { user, cookie: `${SITE_COOKIE}=${token}` };
}
const me = async (cookie) => (await (await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } })).json()).data.user;

// ---- what Polar sends ----
const T0 = Date.parse("2026-11-24T12:00:00Z");
const at = (minutes) => new Date(T0 + minutes * 60_000).toISOString();
const event = (type, { id, userId, plan = "pro", period = "monthly", status = "active", minute = 0, cancel = false } = {}) => ({
  type,
  timestamp: at(minute),
  data: {
    id,
    status,
    recurring_interval: period === "yearly" ? "year" : "month",
    current_period_end: "2027-01-01T00:00:00Z",
    cancel_at_period_end: cancel,
    customer_id: `cus-${id}`,
    customer: { id: `cus-${id}`, external_id: userId == null ? null : String(userId) },
    product: { id: `prod-${plan}`, metadata: { plan, period } },
  },
});
const sign = (id, timestamp, body, secret = SECRET) =>
  `v1,${crypto.createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
async function deliver(payload, { secret, timestamp = String(Math.floor(Date.now() / 1000)), signature } = {}) {
  const body = JSON.stringify(payload);
  const id = `msg-${Math.random()}`;
  return fetch(`${base}/polar/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature ?? sign(id, timestamp, body, secret),
    },
    body,
  });
}
let subCounter = 0;
const subId = () => `sub-${stamp}-${++subCounter}`;
const rows = (userId) => prisma.polarSubscription.findMany({ where: { site_user_id: userId } });

// ---- the signature check ----
test("a signature only passes when id, time, body and secret all match", () => {
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const good = { id: "m1", timestamp: ts, body: Buffer.from('{"a":1}'), secret: SECRET, now };
  const ok = (over) => verifySignature({ ...good, signature: sign("m1", ts, '{"a":1}'), ...over });
  assert.equal(ok(), true);
  assert.equal(ok({ secret: "another-secret" }), false, "wrong secret");
  assert.equal(ok({ body: Buffer.from('{"a":2}') }), false, "changed body");
  assert.equal(ok({ id: "m2" }), false, "changed id");
  assert.equal(ok({ signature: "v1,AAAA" }), false, "garbage signature");
  assert.equal(ok({ signature: sign("m1", ts, '{"a":1}').replace("v1,", "v2,") }), false, "unknown version");
  assert.equal(ok({ signature: `v1,AAAA ${sign("m1", ts, '{"a":1}')}` }), true, "one valid among several");
  assert.equal(ok({ now: now + 10 * 60_000 }), false, "too old: a captured delivery cannot be replayed");
  assert.equal(ok({ timestamp: "abc" }), false, "timestamp is not a number");
  assert.equal(ok({ secret: undefined }), false, "no secret configured");
});

test("a dashboard secret (whsec_ + base64) signs with its decoded bytes; a plain secret with its text", () => {
  const raw = crypto.randomBytes(32);
  const dashboard = `whsec_${raw.toString("base64")}`;
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const body = Buffer.from('{"type":"product.updated"}');
  const signWith = (key) => `v1,${crypto.createHmac("sha256", key).update(`m1.${ts}.`).update(body).digest("base64")}`;
  const check = (secret, signature) => verifySignature({ id: "m1", timestamp: ts, signature, body, secret, now });
  assert.equal(check(dashboard, signWith(raw)), true, "how Polar signs for a dashboard secret");
  assert.equal(check(dashboard, signWith(Buffer.from(dashboard))), true, "the secret's own text is still accepted");
  assert.equal(check(dashboard, signWith(crypto.randomBytes(32))), false, "another key");
  assert.equal(check(`whsec_${crypto.randomBytes(32).toString("base64")}`, signWith(raw)), false, "another dashboard secret");
  assert.equal(check("plain-secret-text", signWith(Buffer.from("plain-secret-text"))), true, "a plain secret, as before");
  assert.equal(check("whsec_", signWith(Buffer.alloc(0))), false, "an empty dashboard secret never validates");
});

// ---- webhooks ----
test("a delivery with a bad signature is refused and changes nothing", async () => {
  const { user } = await member();
  const payload = event("subscription.created", { id: subId(), userId: user.id });
  assert.equal((await deliver(payload, { secret: "forged" })).status, 403);
  assert.equal((await deliver(payload, { signature: "v1,AAAA" })).status, 403);
  assert.equal((await deliver(payload, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) })).status, 403);
  assert.equal((await rows(user.id)).length, 0);
});

test("a paid PRO plan makes the member PRO and ad-free; the site and downloads both see it", async () => {
  const { user, cookie } = await member();
  assert.equal((await me(cookie)).isPro, false);
  const res = await deliver(event("subscription.created", { id: subId(), userId: user.id, plan: "pro", period: "yearly" }));
  assert.equal(res.status, 200);
  const status = await me(cookie);
  assert.deepEqual([status.isPro, status.adFree, status.proSource], [true, true, "polar"]);
  assert.deepEqual([status.polar.plan, status.polar.period, status.polar.status], ["pro", "yearly", "active"]);
  assert.equal(await isPro(user.id), true, "PRO downloads open without asking Patreon");
});

test("Sponsor is PRO too, Early Access only removes ads", async () => {
  const sponsor = await member();
  await deliver(event("subscription.created", { id: subId(), userId: sponsor.user.id, plan: "sponsor", period: "monthly" }));
  assert.equal((await me(sponsor.cookie)).isPro, true);

  const early = await member();
  await deliver(event("subscription.created", { id: subId(), userId: early.user.id, plan: "early_access", period: "monthly" }));
  const status = await me(early.cookie);
  assert.deepEqual([status.isPro, status.adFree, status.proSource], [false, true, "polar"]);
  assert.equal(await isPro(early.user.id), false);
});

test("the website gets the highest plan and its name, whichever source it comes from", async () => {
  const sponsor = await member();
  await deliver(event("subscription.created", { id: subId(), userId: sponsor.user.id, plan: "sponsor" }));
  const s = await me(sponsor.cookie);
  assert.deepEqual([s.plan, s.membershipTier], ["sponsor", "Sponsor"]);

  // Set by hand as Early Access, paying PRO on Polar: PRO wins and is named after the Polar plan
  const mixed = await member({ access: "pro", access_tier: "Early Access" });
  await deliver(event("subscription.created", { id: subId(), userId: mixed.user.id, plan: "pro" }));
  const m = await me(mixed.cookie);
  assert.deepEqual([m.isPro, m.plan, m.membershipTier], [true, "pro", "Sketch shaper PRO"]);

  // Blocked shows no plan at all
  const blocked = await member({ access: "blocked" });
  await deliver(event("subscription.created", { id: subId(), userId: blocked.user.id, plan: "sponsor" }));
  const b = await me(blocked.cookie);
  assert.deepEqual([b.plan, b.membershipTier], [null, null]);
});

test("a cancelled plan keeps working until Polar ends it, then stops", async () => {
  const { user, cookie } = await member();
  const id = subId();
  await deliver(event("subscription.created", { id, userId: user.id, minute: 0 }));
  await deliver(event("subscription.canceled", { id, userId: user.id, minute: 1, cancel: true }));
  const waiting = await me(cookie);
  assert.equal(waiting.isPro, true, "paid period not over yet");
  assert.equal(waiting.polar.cancelsAtPeriodEnd, true);

  await deliver(event("subscription.revoked", { id, userId: user.id, minute: 2, status: "canceled", cancel: true }));
  const ended = await me(cookie);
  assert.deepEqual([ended.isPro, ended.adFree, ended.proSource], [false, false, null]);
  assert.equal(ended.polar.status, "canceled", "the website can still show the plan ended");
});

test("a late or repeated delivery cannot undo a newer one", async () => {
  const { user, cookie } = await member();
  const id = subId();
  await deliver(event("subscription.revoked", { id, userId: user.id, minute: 10, status: "canceled" }));
  // the older "created" event arrives after the newer "revoked" one
  await deliver(event("subscription.created", { id, userId: user.id, minute: 5 }));
  assert.equal((await me(cookie)).isPro, false);

  // the same event twice is one row
  const again = event("subscription.updated", { id, userId: user.id, minute: 10, status: "canceled" });
  await deliver(again);
  await deliver(again);
  assert.equal((await rows(user.id)).length, 1);
});

test("events we cannot place are accepted but ignored", async () => {
  const { user } = await member();
  for (const payload of [
    event("subscription.created", { id: subId(), userId: null }), // bought outside our site
    event("subscription.created", { id: subId(), userId: 2_000_000_000 }), // no such account
    event("subscription.created", { id: subId(), userId: user.id, plan: "free-for-all" }), // not one of our plans
    event("order.paid", { id: subId(), userId: user.id }), // not a subscription event
  ]) {
    assert.equal((await deliver(payload)).status, 200, "Polar must get a 200 or it keeps retrying");
  }
  assert.equal((await rows(user.id)).length, 0);
});

test("a subscription cannot be moved to another account by a later event", async () => {
  const a = await member();
  const b = await member();
  const id = subId();
  await deliver(event("subscription.created", { id, userId: a.user.id, minute: 0 }));
  await deliver(event("subscription.updated", { id, userId: b.user.id, minute: 1 }));
  assert.equal((await rows(a.user.id)).length, 1);
  assert.equal((await rows(b.user.id)).length, 0);
});

test("an admin block beats a paid plan, and a manual or Patreon source is not hidden by Polar", async () => {
  const blocked = await member({ access: "blocked" });
  await deliver(event("subscription.created", { id: subId(), userId: blocked.user.id }));
  assert.equal((await me(blocked.cookie)).isPro, false);
  assert.equal(await isPro(blocked.user.id), false);

  const early = await prisma.siteUser.create({
    data: { email: `polar-test-${stamp}-rule@example.test`, access: "pro", access_tier: "Early Access" },
  });
  await deliver(event("subscription.created", { id: subId(), userId: early.id, plan: "pro" }));
  const full = await prisma.siteUser.findUnique({ where: { id: early.id }, include: { polar_subscriptions: true } });
  assert.deepEqual(accessOf(full, null), { isPro: true, adFree: true, proSource: "polar" }, "an ad-free manual tier plus a paid PRO plan is PRO");
});

test("the admin member list and filters count Polar members", async () => {
  const pro = await member();
  const early = await member();
  const free = await member();
  await deliver(event("subscription.created", { id: subId(), userId: pro.user.id, plan: "pro" }));
  await deliver(event("subscription.created", { id: subId(), userId: early.user.id, plan: "early_access" }));
  const ids = async (filter) =>
    new Set((await listMembers({ filter, search: `polar-test-${stamp}-`, limit: 100 })).result.map((m) => m.id));
  assert.ok((await ids("pro")).has(pro.user.id) && !(await ids("pro")).has(early.user.id));
  assert.ok((await ids("adfree")).has(early.user.id) && !(await ids("adfree")).has(pro.user.id));
  assert.ok((await ids("free")).has(free.user.id) && !(await ids("free")).has(pro.user.id) && !(await ids("free")).has(early.user.id));
  const polar = await ids("polar");
  assert.ok(polar.has(pro.user.id) && polar.has(early.user.id) && !polar.has(free.user.id), "the Polar tab lists everyone who paid on Polar");
  const shown = (await listMembers({ search: pro.user.email })).result[0];
  assert.deepEqual([shown.proSource, shown.polar.plan], ["polar", "pro"]);
});

// ---- checkout and billing ----
const post = (path, cookie, body, origin = "https://www.sketchshaper.com") =>
  fetch(`${base}/polar/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie && { Cookie: cookie }), ...(origin && { Origin: origin }) },
    body: JSON.stringify(body ?? {}),
  });

test("checkout needs a signed-in member, a trusted origin and a real plan", async () => {
  const { cookie } = await member();
  assert.equal((await post("checkout", null, { plan: "pro", period: "monthly" })).status, 401);
  assert.equal((await post("checkout", cookie, { plan: "pro", period: "monthly" }, "https://evil.test")).status, 403);
  assert.equal((await post("checkout", cookie, { plan: "gold", period: "monthly" })).status, 400);
  assert.equal((await post("checkout", cookie, { plan: "pro", period: "weekly" })).status, 400);
  assert.equal(fake.calls.checkouts.length, 0, "nothing reached Polar");
});

test("checkout asks Polar for the right product and ties the payment to this account", async () => {
  const { user, cookie } = await member();
  const res = await post("checkout", cookie, { plan: "pro", period: "monthly" });
  assert.equal(res.status, 200);
  const { url } = (await res.json()).data;
  assert.equal(url, "https://polar.test/checkout/prod-pro-monthly", "the live product, not the archived duplicate");
  const sent = fake.calls.checkouts.at(-1);
  assert.deepEqual(sent.products, ["prod-pro-monthly"]);
  assert.equal(sent.external_customer_id, String(user.id));
  assert.equal(sent.customer_email, user.email);
  assert.equal(sent.success_url, "http://site.test/pricing?checkout=success");
  assert.ok(fake.calls.auth.every((a) => a === "Bearer test-token"));
});

test("a plan Polar does not sell, or Polar being down, gives a clear error", async () => {
  const { cookie } = await member();
  assert.equal((await post("checkout", cookie, { plan: "sponsor", period: "yearly" })).status, 503);
  fake.state.fail = true;
  try {
    // the product list is already kept, so it is the checkout call itself that fails
    const down = await post("checkout", cookie, { plan: "early_access", period: "yearly" });
    assert.equal(down.status, 502);
    assert.match((await down.json()).message, /payment provider/);
  } finally {
    fake.state.fail = false;
  }
});

test("someone with a live plan is sent to billing instead of being charged twice", async () => {
  const { user, cookie } = await member();
  await deliver(event("subscription.created", { id: subId(), userId: user.id }));
  const before = fake.calls.checkouts.length;
  const res = await post("checkout", cookie, { plan: "sponsor", period: "monthly" });
  assert.equal(res.status, 409);
  assert.equal(fake.calls.checkouts.length, before);
});

test("the billing page opens for members who bought a plan, and only for them", async () => {
  const none = await member();
  assert.equal((await post("portal", none.cookie)).status, 404);
  assert.equal((await post("portal", null)).status, 401);

  const { user, cookie } = await member();
  await deliver(event("subscription.created", { id: subId(), userId: user.id }));
  const res = await post("portal", cookie);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.url, `https://polar.test/portal/${user.id}`);
  assert.equal(fake.calls.sessions.at(-1).return_url, "http://site.test/pricing");
});
