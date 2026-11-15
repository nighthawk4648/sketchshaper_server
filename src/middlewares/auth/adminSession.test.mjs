import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../../config/config.mjs";
import { prisma } from "../../db/prisma.mjs";
import adminRouter from "../../routes/api/admin.route.mjs";
import { requireAdminForWrites } from "./requireAdminForWrites.mjs";
import { isTrustedAdminOrigin } from "./verifyAdminAuth.mjs";
import { ADMIN_COOKIE, createSession } from "../../utils/session.mjs";

// Uses the local dev database: one throwaway admin, removed (with its sessions) at the end
const email = `session-test-${Date.now()}@example.test`;
const password = "correct horse battery staple";
const admin = await prisma.user.create({
  data: { email, password: await bcrypt.hash(password, 10) },
});

const app = express();
app.use(express.json());
app.use("/api/admins", adminRouter);
app.post("/api/thing", requireAdminForWrites, (req, res) => res.json({ admin: req.admin }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

test.after(async () => {
  server.close();
  await prisma.user.delete({ where: { id: admin.id } });
  await prisma.$disconnect();
});

const login = (pw) =>
  fetch(`${base}/admins/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw }),
  });
const cookieFrom = (res) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
const write = (headers = {}) => fetch(`${base}/thing`, { method: "POST", headers });
const fakeReq = { ip: "127.0.0.1", get: () => "test" };

test("login sets an HttpOnly session cookie and returns no token", async () => {
  const res = await login(password);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.token, undefined);
  const cookie = cookieFrom(res);
  assert.ok(cookie, "session cookie set");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api/);
});

test("a wrong password gets no session", async () => {
  const res = await login("wrong");
  assert.notEqual(res.status, 200);
  assert.equal(cookieFrom(res), undefined);
});

test("the session cookie allows admin writes, and logout ends it on the server", async () => {
  const cookie = cookieFrom(await login(password)).split(";")[0];
  const ok = await write({ Cookie: cookie });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).admin.id, admin.id);

  const out = await fetch(`${base}/admins/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(out.status, 200);
  assert.equal((await write({ Cookie: cookie })).status, 401);
});

test("no cookie, or any Bearer token (the old hole), is refused for admin writes", async () => {
  assert.equal((await write()).status, 401);
  const patreonToken = jwt.sign({ id: admin.id, patreonId: "123" }, config.jwt_secret);
  assert.equal((await write({ Authorization: `Bearer ${patreonToken}` })).status, 401);
  const oldAdminToken = jwt.sign({ id: admin.id, email }, config.jwt_secret);
  assert.equal((await write({ Authorization: `Bearer ${oldAdminToken}` })).status, 401);
});

test("a session of another kind or an expired one is refused", async () => {
  const site = await createSession({ kind: "website", adminId: admin.id, ttlMs: 60_000 }, fakeReq);
  assert.equal((await write({ Cookie: `${ADMIN_COOKIE}=${site.token}` })).status, 401);

  const expired = await createSession({ kind: "admin", adminId: admin.id, ttlMs: -1000 }, fakeReq);
  assert.equal((await write({ Cookie: `${ADMIN_COOKIE}=${expired.token}` })).status, 401);
});

test("password guessing against one admin email is cut off", async () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${base}/admins/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "guess-target@example.test", password: `guess-${i}` }),
    });
    codes.push(res.status);
  }
  assert.ok(codes.slice(0, 8).every((c) => c !== 429), "first tries are answered normally");
  assert.equal(codes[8], 429);
  assert.equal(codes[9], 429);
});

test("only the admin site may send admin writes in production", () => {
  assert.equal(isTrustedAdminOrigin("https://admin.sketchshaper.com", "prod"), true);
  assert.equal(isTrustedAdminOrigin("https://evil.example", "prod"), false);
  assert.equal(isTrustedAdminOrigin("https://www.sketchshaper.com", "prod"), false);
  assert.equal(isTrustedAdminOrigin(undefined, "prod"), true);
  assert.equal(isTrustedAdminOrigin("https://evil.example", "dev"), true);
});
