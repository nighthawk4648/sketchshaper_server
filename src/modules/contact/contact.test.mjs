import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { verifyMagicBytes } from "../../middlewares/uploads/contactUpload.mjs";
import {
  normalizeReferenceUrl,
  buildContactWhere,
  toOptionalString,
  VALID_SERVICE_TYPES,
} from "./contact.validation.mjs";

describe("Contact Module & Upload Security Tests", () => {
  describe("verifyMagicBytes file validation", () => {
    it("validates genuine JPEG magic bytes", () => {
      const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.jpg`);
      fs.writeFileSync(tempPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));
      try {
        assert.equal(verifyMagicBytes(tempPath, ".jpg"), true);
        assert.equal(verifyMagicBytes(tempPath, ".jpeg"), true);
      } finally {
        fs.unlinkSync(tempPath);
      }
    });

    it("validates genuine PNG magic bytes", () => {
      const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.png`);
      fs.writeFileSync(tempPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      try {
        assert.equal(verifyMagicBytes(tempPath, ".png"), true);
      } finally {
        fs.unlinkSync(tempPath);
      }
    });

    it("validates genuine PDF magic bytes", () => {
      const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, Buffer.from("%PDF-1.4\n%...\n"));
      try {
        assert.equal(verifyMagicBytes(tempPath, ".pdf"), true);
      } finally {
        fs.unlinkSync(tempPath);
      }
    });

    it("accepts genuine AVIF but rejects MP4/HEIC renamed to .avif", () => {
      const write = (bytes) => {
        const tempPath = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}.avif`);
        fs.writeFileSync(tempPath, Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(bytes, "latin1")]));
        return tempPath;
      };
      const avif = write("ftypavif");
      const avis = write("ftypavis");
      const mp4 = write("ftypisom");
      const heic = write("ftypheic");
      try {
        assert.equal(verifyMagicBytes(avif, ".avif"), true);
        assert.equal(verifyMagicBytes(avis, ".avif"), true);
        assert.equal(verifyMagicBytes(mp4, ".avif"), false);
        assert.equal(verifyMagicBytes(heic, ".avif"), false);
      } finally {
        [avif, avis, mp4, heic].forEach((f) => fs.unlinkSync(f));
      }
    });

    it("rejects disguised/spoofed files (e.g. html or script renamed to .png)", () => {
      const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.png`);
      fs.writeFileSync(tempPath, Buffer.from("<html><script>alert(1)</script></html>"));
      try {
        assert.equal(verifyMagicBytes(tempPath, ".png"), false);
      } finally {
        fs.unlinkSync(tempPath);
      }
    });
  });

  describe("Reference URL normalization & validation logic", () => {
    const normalizeAndValidateUrl = normalizeReferenceUrl;

    it("auto-prefixes bare URLs with https://", () => {
      assert.equal(
        normalizeAndValidateUrl("drive.google.com/drive/folders/abc123"),
        "https://drive.google.com/drive/folders/abc123"
      );
      assert.equal(
        normalizeAndValidateUrl("dropbox.com/sh/xyz"),
        "https://dropbox.com/sh/xyz"
      );
    });

    it("preserves already fully qualified http and https URLs", () => {
      assert.equal(
        normalizeAndValidateUrl("https://pinterest.com/pin/123"),
        "https://pinterest.com/pin/123"
      );
      assert.equal(
        normalizeAndValidateUrl("http://example.com/folder"),
        "http://example.com/folder"
      );
    });

    it("rejects malicious or invalid URLs like javascript: and junk strings", () => {
      assert.equal(normalizeAndValidateUrl("javascript:alert(1)"), null);
      assert.equal(normalizeAndValidateUrl("drive google com"), null);
      assert.equal(normalizeAndValidateUrl("localhost"), null);
    });
  });

  describe("buildContactWhere (admin list filters)", () => {
    it("applies no service filter when service_type is undefined", () => {
      assert.deepEqual(buildContactWhere({}), {});
      assert.deepEqual(buildContactWhere({ status: "NEW" }), { status: "NEW" });
    });

    it("filters for messages with no service type when service_type is null", () => {
      assert.deepEqual(buildContactWhere({ service_type: null }), { service_type: null });
    });

    it("filters by a specific service type and combines with status", () => {
      assert.deepEqual(
        buildContactWhere({ status: "READ", service_type: "textures" }),
        { status: "READ", service_type: "textures" },
      );
    });
  });

  describe("toOptionalString & service types", () => {
    it("returns null for empty or non-string input and trims/limits strings", () => {
      assert.equal(toOptionalString(""), null);
      assert.equal(toOptionalString("   "), null);
      assert.equal(toOptionalString(undefined), null);
      assert.equal(toOptionalString("  hi  "), "hi");
      assert.equal(toOptionalString("abcdef", 3), "abc");
    });

    it("exposes the five valid service types", () => {
      assert.deepEqual(VALID_SERVICE_TYPES, ["architecture", "single-model", "textures", "extension", "support"]);
    });
  });
});
