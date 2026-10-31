import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFileName } from "./upload.mjs";

test("sanitizeFileName converts spaces and uppercase to clean lowercase slug with timestamp", () => {
  const result = sanitizeFileName("Modern Scandinavian Sofa.PNG", "cover");
  assert.match(result, /^modern-scandinavian-sofa-\d+\.png$/);
});

test("sanitizeFileName strips unsafe symbols, parentheses and hashes", () => {
  const result = sanitizeFileName("Armchair (Oak Wood) #3 & Pillow!.jpg", "cover");
  assert.match(result, /^armchair-oak-wood-3-pillow-\d+\.jpg$/);
});

test("sanitizeFileName normalizes unicode accents to plain ASCII", () => {
  const result = sanitizeFileName("Canapé Élégant.jpeg", "cover");
  assert.match(result, /^canape-elegant-\d+\.jpeg$/);
});

test("sanitizeFileName falls back to fieldname when filename has only special symbols", () => {
  const result = sanitizeFileName("$$$###.png", "cover");
  assert.match(result, /^cover-\d+\.png$/);
});

test("sanitizeFileName blocks path traversal attempts", () => {
  const result = sanitizeFileName("../../etc/passwd.png", "cover");
  assert.match(result, /^passwd-\d+\.png$/);
});

test("sanitizeFileName caps long slugs to 80 chars", () => {
  const longName = "a".repeat(120) + ".png";
  const result = sanitizeFileName(longName, "cover");
  const baseName = result.replace(/-\d+\.png$/, "");
  assert.equal(baseName.length, 80);
});

