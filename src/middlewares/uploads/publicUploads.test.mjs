import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import path from "path";
import express from "express";
import { isPrivateUpload, publicUploads } from "./publicUploads.mjs";

// Real files in the local uploads folder, removed at the end
const stamp = Date.now();
const image = `pu-${stamp}.jpg`;
const model = `pu-${stamp}.skp`;
fs.writeFileSync(path.join("uploads", image), "img");
fs.mkdirSync(path.join("uploads", "sketchshaper-pro"), { recursive: true });
fs.writeFileSync(path.join("uploads", "sketchshaper-pro", model), "model");
fs.mkdirSync(path.join("uploads", "temp"), { recursive: true });
fs.writeFileSync(path.join("uploads", "temp", model), "chunk");

const serve = (handlers) => {
  const app = express();
  app.use("/api/uploads", handlers);
  return app.listen(0);
};
const ours = serve(publicUploads);
const plainStatic = serve(express.static("uploads")); // what server.mjs did before

test.after(() => {
  ours.close();
  plainStatic.close();
  for (const f of [image, `sketchshaper-pro/${model}`, `temp/${model}`]) fs.rmSync(path.join("uploads", f), { force: true });
});

// Sends the path exactly as written (fetch would tidy ../ and %2D away, hiding the trick)
const statusOf = (server, rawPath) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: rawPath }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });

const tricks = [
  `/api/uploads/sketchshaper-pro/${model}`,
  `/api/uploads/sketchshaper%2Dpro/${model}`,
  `/api/uploads/temp/../sketchshaper-pro/${model}`,
  `/api/uploads/./sketchshaper-pro/${model}`,
  `/api/uploads//sketchshaper-pro/${model}`,
  `/api/uploads/%73ketchshaper-pro/${model}`,
  `/api/uploads/temp/${model}`,
];

test("images in uploads stay public", async () => {
  assert.equal(await statusOf(ours, `/api/uploads/${image}`), 200);
});

test("model files and upload pieces are refused, however the address is written", async () => {
  for (const p of tricks) assert.equal(await statusOf(ours, p), 404, p);
  assert.equal(await statusOf(ours, `/api/uploads/${image}%E0%A4`), 404, "undecodable address");
});

test("without the guard these same addresses would hand out the model (proves the tricks are real)", async () => {
  assert.equal(await statusOf(plainStatic, `/api/uploads/sketchshaper-pro/${model}`), 200);
  assert.equal(await statusOf(plainStatic, `/api/uploads/sketchshaper%2Dpro/${model}`), 200);
});

test("isPrivateUpload decides on the normalised path", () => {
  assert.equal(isPrivateUpload("/cover-1.webp"), false);
  assert.equal(isPrivateUpload("/sketchshaper-professional.jpg"), false, "a similar name at the top level is fine");
  assert.equal(isPrivateUpload("/SKETCHSHAPER-PRO/x.skp"), true);
  assert.equal(isPrivateUpload("/a/../temp/x"), true);
});
