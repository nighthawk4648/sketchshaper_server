import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { prisma } from "../../db/prisma.mjs";
import authRouter from "../../routes/api/auth.route.mjs";
import globalErrorHandler from "../../middlewares/errors/globalErrorHandler.mjs";
import { requireAdminForWrites } from "../../middlewares/auth/requireAdminForWrites.mjs";
import { isTrustedSiteOrigin } from "../../middlewares/auth/trustedOrigin.mjs";
import { devOutbox } from "../../utils/mailer.mjs";
import { rateLimiter } from "../../utils/rateLimit.mjs";

// Runs against the local dev database; every user created here is removed at the end
const stamp = Date.now();
const mail = (n) => `auth-test-${stamp}-${n}@example.test`;
const PASSWORD = "a long enough password";

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.post("/api/admin-thing", requireAdminForWrites, (req, res) => res.json({ ok: true }));
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
console.error = () => {}; // expected errors (401s etc.) would only add noise

test.after(async () => {
  server.close();
  await prisma.siteUser.deleteMany({ where: { email: { startsWith: `auth-test-${stamp}-` } } });
  await prisma.$disconnect();
});

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const cookieOf = (res) => res.headers.getSetCookie().find((c) => c.startsWith("ss_site="));
const tokenFromLastMail = (to) => {
  const m = [...devOutbox].reverse().find((x) => x.to === to);
  return m?.text.match(/token=([\w-]+)/)?.[1];
};
const mailsTo = (to) => devOutbox.filter((x) => x.to === to);

test("register stores a hashed password, sends a confirmation mail and signs nobody in", async () => {
  const email = mail("a");
  const res = await post("/auth/register", { email, password: PASSWORD, name: "Ada" });
  assert.equal(res.status, 200);
  assert.equal(cookieOf(res), undefined);
  const user = await prisma.siteUser.findUnique({ where: { email } });
  assert.ok(user.password.startsWith("$2"), "bcrypt hash");
  assert.notEqual(user.password, PASSWORD);
  assert.equal(user.email_verified_at, null);
  assert.equal(mailsTo(email)[0].subject, "Confirm your email");
});

test("bad input is rejected: email, short password, over-long password", async () => {
  assert.equal((await post("/auth/register", { email: "nope", password: PASSWORD })).status, 400);
  assert.equal((await post("/auth/register", { email: mail("x"), password: "short" })).status, 400);
  assert.equal((await post("/auth/register", { email: mail("x"), password: "é".repeat(40) })).status, 400);
  assert.equal(await prisma.siteUser.count({ where: { email: mail("x") } }), 0);
});

test("login works before confirming, sets an HttpOnly cookie, and /me shows unconfirmed", async () => {
  const email = mail("a");
  const res = await post("/auth/login", { email, password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: cookie.split(";")[0] } })).json();
  assert.equal(me.data.user.email, email);
  assert.equal(me.data.user.emailVerified, false);
  assert.equal(me.data.user.password, undefined);
});

test("wrong password and unknown email give the same answer", async () => {
  const a = await post("/auth/login", { email: mail("a"), password: "wrong password" });
  const b = await post("/auth/login", { email: mail("nobody"), password: PASSWORD });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal((await a.json()).message, (await b.json()).message);
  assert.equal(cookieOf(a), undefined);
});

test("/me with no cookie is a clean 'nobody'", async () => {
  const res = await fetch(`${base}/auth/me`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.user, null);
});

test("the confirmation link works once, signs in, and an older link stops working", async () => {
  const email = mail("a");
  const first = tokenFromLastMail(email);
  await post("/auth/register", { email, password: PASSWORD }); // unconfirmed: sends a fresh link
  const second = tokenFromLastMail(email);
  assert.notEqual(first, second);
  assert.equal((await post("/auth/verify-email", { token: first })).status, 400);

  const res = await post("/auth/verify-email", { token: second });
  assert.equal(res.status, 200);
  assert.ok(cookieOf(res));
  assert.equal((await res.json()).data.user.emailVerified, true);
  assert.equal((await post("/auth/verify-email", { token: second })).status, 400);
  assert.equal((await post("/auth/verify-email", { token: "garbage" })).status, 400);
  assert.equal((await post("/auth/verify-email", {})).status, 400);
});

test("an expired link is refused", async () => {
  const email = mail("b");
  await post("/auth/register", { email, password: PASSWORD });
  const token = tokenFromLastMail(email);
  await prisma.emailToken.updateMany({ where: { site_user: { email } }, data: { expires_at: new Date(Date.now() - 1000) } });
  assert.equal((await post("/auth/verify-email", { token })).status, 400);
});

test("signing up with a confirmed email looks the same but tells the owner by email", async () => {
  const email = mail("a");
  const before = mailsTo(email).length;
  const res = await post("/auth/register", { email, password: "another password 1" });
  assert.equal(res.status, 200);
  assert.equal(mailsTo(email).length, before + 1);
  assert.equal(mailsTo(email).at(-1).subject, "You already have an account");
  // and the existing password is untouched
  assert.equal((await post("/auth/login", { email, password: PASSWORD })).status, 200);
});

test("password reset: unknown email looks the same, the link works once, old sessions end", async () => {
  const email = mail("a");
  const ghost = mail("ghost");
  const sent = devOutbox.length;
  assert.equal((await post("/auth/forgot-password", { email: ghost })).status, 200);
  assert.equal(devOutbox.length, sent, "no mail for an unknown email");

  const oldCookie = cookieOf(await post("/auth/login", { email, password: PASSWORD })).split(";")[0];
  assert.equal((await post("/auth/forgot-password", { email })).status, 200);
  const token = tokenFromLastMail(email);
  assert.equal(mailsTo(email).at(-1).subject, "Reset your password");

  assert.equal((await post("/auth/reset-password", { token, password: "short" })).status, 400);
  const NEW = "a brand new password";
  assert.equal((await post("/auth/reset-password", { token, password: NEW })).status, 200);
  assert.equal((await post("/auth/reset-password", { token, password: NEW })).status, 400, "single use");
  assert.equal(mailsTo(email).at(-1).subject, "Your password was changed");

  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: oldCookie } })).json();
  assert.equal(me.data.user, null, "old session ended");
  assert.equal((await post("/auth/login", { email, password: PASSWORD })).status, 401);
  assert.equal((await post("/auth/login", { email, password: NEW })).status, 200);
});

test("a reset link also confirms the email", async () => {
  const email = mail("b");
  await post("/auth/forgot-password", { email });
  await post("/auth/reset-password", { token: tokenFromLastMail(email), password: PASSWORD });
  assert.ok((await prisma.siteUser.findUnique({ where: { email } })).email_verified_at);
});

test("resend sends a new link only for unconfirmed accounts", async () => {
  const unconfirmed = mail("c");
  await post("/auth/register", { email: unconfirmed, password: PASSWORD });
  const n = mailsTo(unconfirmed).length;
  assert.equal((await post("/auth/resend-verification", { email: unconfirmed })).status, 200);
  assert.equal(mailsTo(unconfirmed).length, n + 1);

  const confirmed = mail("a");
  const m = mailsTo(confirmed).length;
  assert.equal((await post("/auth/resend-verification", { email: confirmed })).status, 200);
  assert.equal(mailsTo(confirmed).length, m);
});

test("logout ends the session on the server", async () => {
  const cookie = cookieOf(await post("/auth/login", { email: mail("a"), password: "a brand new password" })).split(";")[0];
  assert.equal((await post("/auth/logout", {}, { Cookie: cookie })).status, 200);
  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } })).json();
  assert.equal(me.data.user, null);
});

test("a visitor session can never open admin routes", async () => {
  const siteToken = cookieOf(await post("/auth/login", { email: mail("a"), password: "a brand new password" })).split(";")[0].split("=")[1];
  const res = await fetch(`${base}/admin-thing`, { method: "POST", headers: { Cookie: `ss_admin=${siteToken}; ss_site=${siteToken}` } });
  assert.equal(res.status, 401);
});

test("someone who signs up with a stranger's email first loses everything when the real owner signs up", async () => {
  const email = mail("victim");
  // the attacker goes first: account, a live session, and a Patreon account attached
  assert.equal((await post("/auth/register", { email, password: "attackers password" }, { "cf-connecting-ip": "10.9.9.1" })).status, 200);
  const attackerCookie = cookieOf(await post("/auth/login", { email, password: "attackers password" })).split(";")[0];
  const squatted = await prisma.siteUser.findUnique({ where: { email } });
  await prisma.patreonLink.create({
    data: { site_user_id: squatted.id, patreon_id: `auth-test-${stamp}-p1`, access_token_enc: "x", refresh_token_enc: "x", token_expires_at: new Date() },
  });

  // the real owner signs up with their own password and confirms
  assert.equal((await post("/auth/register", { email, password: "owners password", name: "Owner" }, { "cf-connecting-ip": "10.9.9.3" })).status, 200);
  assert.equal((await post("/auth/login", { email, password: "attackers password" })).status, 401, "attacker's password is gone");
  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: attackerCookie } })).json();
  assert.equal(me.data.user, null, "attacker's session ended");
  assert.equal(await prisma.patreonLink.count({ where: { site_user_id: squatted.id } }), 0, "attacker's Patreon link removed");

  const confirmed = await post("/auth/verify-email", { token: tokenFromLastMail(email) });
  assert.equal((await confirmed.json()).data.user.name, "Owner");
  assert.equal((await post("/auth/login", { email, password: "owners password" })).status, 200);
});

test("a password reset on a never-confirmed account also drops a Patreon link attached before proof", async () => {
  const email = mail("reset-unconfirmed");
  // its own visitor address, so this file's earlier sign-ups do not use up the hourly limit
  assert.equal((await post("/auth/register", { email, password: PASSWORD }, { "cf-connecting-ip": "10.9.9.2" })).status, 200);
  const user = await prisma.siteUser.findUnique({ where: { email } });
  await prisma.patreonLink.create({
    data: { site_user_id: user.id, patreon_id: `auth-test-${stamp}-p2`, access_token_enc: "x", refresh_token_enc: "x", token_expires_at: new Date() },
  });
  await post("/auth/forgot-password", { email });
  assert.equal((await post("/auth/reset-password", { token: tokenFromLastMail(email), password: "owner sets this one" })).status, 200);
  assert.equal(await prisma.patreonLink.count({ where: { site_user_id: user.id } }), 0);
});

test("a password reset on a confirmed account keeps its Patreon link", async () => {
  const email = mail("reset-confirmed");
  const user = await prisma.siteUser.create({ data: { email, password: "$2b$10$x", email_verified_at: new Date() } });
  await prisma.patreonLink.create({
    data: { site_user_id: user.id, patreon_id: `auth-test-${stamp}-p3`, access_token_enc: "x", refresh_token_enc: "x", token_expires_at: new Date() },
  });
  await post("/auth/forgot-password", { email });
  await post("/auth/reset-password", { token: tokenFromLastMail(email), password: "a new password 123" });
  assert.equal(await prisma.patreonLink.count({ where: { site_user_id: user.id } }), 1);
});

test("writes from other websites are refused in production", () => {
  assert.equal(isTrustedSiteOrigin("https://www.sketchshaper.com", "prod", "https://www.sketchshaper.com"), true);
  assert.equal(isTrustedSiteOrigin("https://evil.example", "prod", "https://www.sketchshaper.com"), false);
  assert.equal(isTrustedSiteOrigin("https://admin.sketchshaper.com", "prod", "https://www.sketchshaper.com"), false);
  assert.equal(isTrustedSiteOrigin(undefined, "prod"), true);
  assert.equal(isTrustedSiteOrigin("https://evil.example", "dev"), true);
});

test("the rate limiter blocks after the limit and tells the client when to retry", async () => {
  const limited = express();
  limited.get("/x", rateLimiter({ windowMs: 60_000, max: 3, key: () => "k" }), (req, res) => res.send("ok"));
  const s = limited.listen(0);
  const url = `http://127.0.0.1:${s.address().port}/x`;
  const codes = [];
  let last;
  for (let i = 0; i < 5; i++) {
    last = await fetch(url);
    codes.push(last.status);
  }
  s.close();
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  assert.ok(Number(last.headers.get("retry-after")) > 0);
});
