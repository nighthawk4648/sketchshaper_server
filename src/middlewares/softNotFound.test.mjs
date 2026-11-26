import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { softNotFound } from "./softNotFound.mjs";
import globalErrorHandler from "./errors/globalErrorHandler.mjs";

console.error = () => {};
const app = express();
app.use(softNotFound);
app.get("/missing", (req, res) => res.status(404).json({ message: "Category not found" }));
app.get("/thrown", () => { throw Object.assign(new Error("Asset not found"), { status: 404 }); });
app.get("/found", (req, res) => res.status(200).json({ data: { id: 1 } }));
app.get("/broken", (req, res) => res.status(500).json({ message: "boom" }));
app.use(globalErrorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const get = (path, soft) => fetch(base + path, { headers: soft ? { "x-soft-404": "1" } : {} });

test("the website gets a missing item as a cacheable 200 marked x-not-found", async () => {
  for (const path of ["/missing", "/thrown"]) {
    const res = await get(path, true);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-not-found"), "1");
  }
});

test("other callers (admin panel) still get a real 404", async () => {
  const res = await get("/missing", false);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("x-not-found"), null);
});

test("found items and real errors are untouched", async () => {
  const found = await get("/found", true);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("x-not-found"), null);
  assert.equal((await get("/broken", true)).status, 500);
});
