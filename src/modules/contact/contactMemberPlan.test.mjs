import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { prisma } from "../../db/prisma.mjs";
import contactRouter from "../../routes/api/contact.route.mjs";
import globalErrorHandler from "../../middlewares/errors/globalErrorHandler.mjs";
import { createSession } from "../../utils/session.mjs";

// Uses the local dev database; the throwaway member and the messages are removed at the end
const stamp = Date.now();
const email = `contact-plan-${stamp}@example.test`;
const fakeReq = { ip: "1.1.1.1", get: () => "test" };

const app = express();
app.use("/api/contact", contactRouter);
app.use(globalErrorHandler);
const server = app.listen(0);
const url = `http://127.0.0.1:${server.address().port}/api/contact`;

test.after(async () => {
  server.close();
  await prisma.contactMessage.deleteMany({ where: { email } });
  await prisma.siteUser.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

// Multipart, like the real contact form; returns the saved row
async function send(headers = {}, extra = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ name: "Tester", email, message: "Hello there", ...extra })) form.append(k, v);
  const res = await fetch(url, { method: "POST", headers, body: form });
  assert.equal(res.status, 201);
  return prisma.contactMessage.findUnique({ where: { id: (await res.json()).data.id } });
}

test("an anonymous message has no member plan", async () => {
  assert.equal((await send()).member_plan, null);
});

test("a signed-in PRO member's message is marked with their plan", async () => {
  const user = await prisma.siteUser.create({ data: { email, access: "pro", email_verified_at: new Date() } });
  const { token } = await createSession({ kind: "website", siteUserId: user.id, ttlMs: 60_000 }, fakeReq);
  assert.equal((await send({ Cookie: `ss_site=${token}` })).member_plan, "pro");
});

test("a plan sent in the form is ignored", async () => {
  assert.equal((await send({}, { member_plan: "sponsor" })).member_plan, null);
});
