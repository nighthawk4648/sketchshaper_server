import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { requireAdminForWrites } from "./requireAdminForWrites.mjs";

const app = express();
app.use(requireAdminForWrites);
app.all("/thing", (req, res) => res.json({ reached: true }));

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/thing`;
test.after(() => server.close());

const call = (method, headers = {}) => fetch(base, { method, headers });

test("reads need no login", async () => {
  assert.equal((await call("GET")).status, 200);
  assert.equal((await call("OPTIONS")).status, 200);
});

test("writes without a token are rejected", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await call(method)).status, 401, method);
  }
});

test("a garbage token is rejected", async () => {
  const res = await call("DELETE", { Authorization: "Bearer not-a-real-token" });
  assert.equal(res.status, 401);
});

test("a token signed with the wrong secret is rejected", async () => {
  const forged = jwt.sign({ id: 1, email: "x@y.z" }, "some-other-secret");
  const res = await call("POST", { Authorization: `Bearer ${forged}` });
  assert.equal(res.status, 401);
});
