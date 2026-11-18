import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import { corsOptionsFor } from "./corsPolicy.mjs";

console.warn = () => {};
const app = express();
app.use(cors((req, callback) => callback(null, corsOptionsFor(req.get("origin"), "prod"))));
app.get("/data", (req, res) => res.json({ ok: true }));
app.post("/data", (req, res) => res.json({ ok: true }));
const server = app.listen(0);
const url = `http://127.0.0.1:${server.address().port}/data`;
test.after(() => server.close());

const headers = async (origin, init = {}) => {
  const res = await fetch(url, { ...init, headers: { Origin: origin, ...init.headers } });
  return { allow: res.headers.get("access-control-allow-origin"), creds: res.headers.get("access-control-allow-credentials") };
};

test("the SketchUp window (Origin: null) can read public data, but never with cookies", async () => {
  assert.deepEqual(await headers("null"), { allow: "null", creds: null });
});

test("the SketchUp window can send its JSON contact form (browser preflight)", async () => {
  const res = await fetch(url, {
    method: "OPTIONS",
    headers: { Origin: "null", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(res.headers.get("access-control-allow-origin"), "null");
  assert.match(res.headers.get("access-control-allow-headers"), /content-type/i);
  assert.equal(res.headers.get("access-control-allow-credentials"), null);
});

test("our own sites keep cookies; unknown sites get nothing", async () => {
  assert.deepEqual(await headers("https://www.sketchshaper.com"), { allow: "https://www.sketchshaper.com", creds: "true" });
  assert.deepEqual(await headers("https://admin.sketchshaper.com"), { allow: "https://admin.sketchshaper.com", creds: "true" });
  assert.deepEqual(await headers("https://evil.example"), { allow: null, creds: null });
});
