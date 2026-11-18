import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { startFakeGoogle } from "./fakeGoogle.mjs";

// The fake Google and the settings must exist before the app code reads its config
const fake = await startFakeGoogle();
Object.assign(process.env, {
  GOOGLE_BASE_URL: fake.url,
  GOOGLE_CLIENT_ID: "g-client",
  GOOGLE_CLIENT_SECRET: "g-secret",
  GOOGLE_REDIRECT_URI: "http://127.0.0.1:1/api/google/callback",
  FRONTEND_URL: "http://site.test",
});
const { prisma } = await import("../../db/prisma.mjs");
const { default: googleRouter } = await import("../../routes/api/google.route.mjs");
const { default: authRouter } = await import("../../routes/api/auth.route.mjs");
const { default: globalErrorHandler } = await import("../../middlewares/errors/globalErrorHandler.mjs");
const { createSession, SITE_COOKIE } = await import("../../utils/session.mjs");

const stamp = Date.now();
const mail = (n) => `g-test-${stamp}-${n}@example.test`;
let counter = 0;
const person = (over = {}) => {
  counter += 1;
  return { sub: `g-${stamp}-${counter}`, email: mail(counter), name: "Gina Google", verified: true, ...over };
};

const app = express();
app.use(express.json());
app.use("/api/google", googleRouter);
app.use("/api/auth", authRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
console.error = () => {};

test.after(async () => {
  server.close();
  fake.close();
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `g-test-${stamp}-` } } });
  await prisma.$disconnect();
});

const cookie = (res, name) => res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`));
const fakeReq = { ip: "1.1.1.1", get: () => "t" };

// Plays the browser: start -> Google (fake) -> back to our callback
async function browserLogin(profile, { next, siteCookie, tamperState } = {}) {
  const start = await fetch(`${base}/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`, { redirect: "manual" });
  assert.equal(start.status, 302);
  fake.nextLogin(profile);
  const toGoogle = await fetch(start.headers.get("location"), { redirect: "manual" });
  const back = new URL(toGoogle.headers.get("location"));
  if (tamperState) back.searchParams.set("state", "forged");
  const headers = { Cookie: [cookie(start, "ss_oauth_google"), siteCookie].filter(Boolean).join("; ") };
  const res = await fetch(`${base}/google/callback${back.search}`, { redirect: "manual", headers });
  return { res, location: res.headers.get("location"), session: cookie(res, SITE_COOKIE), start };
}
const me = async (session) => (await (await fetch(`${base}/auth/me`, { headers: { Cookie: session } })).json()).data.user;

test("start sends the visitor to Google with a random state in an HttpOnly cookie", async () => {
  const start = await fetch(`${base}/google/start`, { redirect: "manual" });
  const to = new URL(start.headers.get("location"));
  assert.equal(to.origin, fake.url);
  assert.equal(to.searchParams.get("client_id"), "g-client");
  assert.equal(to.searchParams.get("scope"), "openid email profile");
  assert.ok(to.searchParams.get("state").length >= 20);
  const raw = start.headers.getSetCookie().find((c) => c.startsWith("ss_oauth_google="));
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /Path=\/api\/google/);
});

test("a new visitor is created already confirmed, signed in, with no token in the URL", async () => {
  const who = person();
  const { res, location, session } = await browserLogin(who, { next: "/blog/a-1" });
  assert.equal(res.status, 302);
  assert.equal(location, "http://site.test/blog/a-1");
  assert.doesNotMatch(location, /token/i);
  const user = await me(session);
  assert.equal(user.email, who.email);
  assert.equal(user.emailVerified, true);
  assert.equal(user.name, "Gina Google");
  assert.equal(user.isPro, false);
});

test("coming back with the same Google account gives the same visitor, even if their email changed", async () => {
  const who = person();
  await browserLogin(who);
  const first = await prisma.siteUser.findUnique({ where: { google_id: who.sub } });
  const { session } = await browserLogin({ ...who, email: mail("changed") });
  assert.equal((await me(session)).id, first.id);
  assert.equal(await prisma.siteUser.count({ where: { google_id: who.sub } }), 1);
});

test("a confirmed email account with the same address is connected, not duplicated", async () => {
  const who = person();
  const existing = await prisma.siteUser.create({ data: { email: who.email, password: "$2b$10$x", email_verified_at: new Date() } });
  const { session } = await browserLogin(who);
  assert.equal((await me(session)).id, existing.id);
  const after = await prisma.siteUser.findUnique({ where: { id: existing.id } });
  assert.equal(after.google_id, who.sub);
  assert.ok(after.password, "their password still works");
});

test("an UNconfirmed account with that address loses the password someone set without proof", async () => {
  const who = person();
  const squatter = await prisma.siteUser.create({ data: { email: who.email, password: "$2b$10$attacker" } });
  const { token } = await createSession({ kind: "website", siteUserId: squatter.id, ttlMs: 60_000 }, fakeReq);
  await browserLogin(who);
  const after = await prisma.siteUser.findUnique({ where: { id: squatter.id } });
  assert.equal(after.password, null);
  assert.ok(after.email_verified_at);
  assert.equal(await me(`${SITE_COOKIE}=${token}`), null, "attacker's session ended");
});

test("a Google email that Google itself does not vouch for never takes over an account", async () => {
  const who = person({ verified: false });
  const existing = await prisma.siteUser.create({ data: { email: who.email, email_verified_at: new Date() } });
  const { location, session } = await browserLogin(who);
  assert.equal(location, "http://site.test/login?error=google_email_unverified");
  assert.equal(session, undefined);
  assert.equal((await prisma.siteUser.findUnique({ where: { id: existing.id } })).google_id, null);
});

test("someone already signed in can connect Google; a Google already used by someone else is refused", async () => {
  const mine = await prisma.siteUser.create({ data: { email: mail("mine"), email_verified_at: new Date() } });
  const { token } = await createSession({ kind: "website", siteUserId: mine.id, ttlMs: 60_000 }, fakeReq);
  const who = person({ email: mail("other-address") });
  const { res, location } = await browserLogin(who, { siteCookie: `${SITE_COOKIE}=${token}`, next: "/account" });
  assert.equal(location, "http://site.test/account");
  assert.equal(cookie(res, SITE_COOKIE), undefined, "no second session needed");
  assert.equal((await prisma.siteUser.findUnique({ where: { id: mine.id } })).google_id, who.sub);

  const other = await prisma.siteUser.create({ data: { email: mail("thief"), email_verified_at: new Date() } });
  const o = await createSession({ kind: "website", siteUserId: other.id, ttlMs: 60_000 }, fakeReq);
  const stolen = await browserLogin(who, { siteCookie: `${SITE_COOKIE}=${o.token}` });
  assert.equal(stolen.location, "http://site.test/login?error=google_in_use");
});

test("a wrong or missing state is refused and creates nothing", async () => {
  const who = person();
  const forged = await browserLogin(who, { tamperState: true });
  assert.equal(forged.location, "http://site.test/login?error=google_failed");
  assert.equal(forged.session, undefined);
  const noCookie = await fetch(`${base}/google/callback?code=x&state=y`, { redirect: "manual" });
  assert.equal(noCookie.headers.get("location"), "http://site.test/login?error=google_failed");
  assert.equal(await prisma.siteUser.count({ where: { email: who.email } }), 0);
});

test("denying access on Google comes back as a clear message", async () => {
  const start = await fetch(`${base}/google/start`, { redirect: "manual" });
  const res = await fetch(`${base}/google/callback?error=access_denied`, { redirect: "manual", headers: { Cookie: cookie(start, "ss_oauth_google") } });
  assert.equal(res.headers.get("location"), "http://site.test/login?error=google_denied");
});

test("an outside link in next is ignored", async () => {
  assert.equal((await browserLogin(person(), { next: "https://evil.example/x" })).location, "http://site.test/");
  assert.equal((await browserLogin(person(), { next: "//evil.example" })).location, "http://site.test/");
});

test("when Google is not set up the visitor gets a clear message instead of a broken page", async () => {
  const { config } = await import("../../config/config.mjs");
  const saved = config.google_client_id;
  config.google_client_id = undefined;
  try {
    const res = await fetch(`${base}/google/start`, { redirect: "manual" });
    assert.equal(res.headers.get("location"), "http://site.test/login?error=google_unavailable");
    assert.equal(cookie(res, "ss_oauth_google"), undefined);
  } finally {
    config.google_client_id = saved;
  }
});
