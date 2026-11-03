import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalAssetUrl,
  notifyGoogleUrl,
  notifyGoogleAsset,
  isIndexingEnabled,
  getSiteUrl,
} from "./googleIndexer.mjs";

describe("Google Indexer Utility", () => {
  it("builds canonical asset URL with custom slugs", () => {
    const asset = {
      id: 351,
      name: "Hendrick Wall Panel Bed",
      slug: "hendrick-wall-panel-bed",
      sub_category: {
        name: "Bed",
        slug: "bed",
        category: {
          name: "Sketchup 3D Models",
          slug: "sketchup-3d-models",
        },
      },
    };

    const url = buildCanonicalAssetUrl(asset);
    assert.match(url, /^https:\/\/www\.sketchshaper\.com\/sketchup-3d-models\/bed\/hendrick-wall-panel-bed-351$/);
  });

  it("builds canonical asset URL falling back to sanitized names when slugs are null", () => {
    const asset = {
      id: 99,
      name: "Modern Scandinavian Table",
      slug: null,
      sub_category: {
        name: "Table",
        slug: null,
        category: {
          name: "Furniture",
          slug: null,
        },
      },
    };

    const url = buildCanonicalAssetUrl(asset);
    assert.match(url, /^https:\/\/www\.sketchshaper\.com\/furniture\/table\/modern-scandinavian-table-99$/);
  });

  it("dedicated GOOGLE_INDEXING_SITE_URL overrides PUBLIC_SITE_URL (ignoring localhost in dev)", () => {
    const origSiteUrl = process.env.GOOGLE_INDEXING_SITE_URL;
    const origPublicUrl = process.env.PUBLIC_SITE_URL;

    try {
      process.env.PUBLIC_SITE_URL = "http://localhost:3000";
      delete process.env.GOOGLE_INDEXING_SITE_URL;
      // Default should be production domain, NOT localhost
      assert.equal(getSiteUrl(), "https://www.sketchshaper.com");

      // Custom indexing domain if explicitly set
      process.env.GOOGLE_INDEXING_SITE_URL = "https://staging.sketchshaper.com/";
      assert.equal(getSiteUrl(), "https://staging.sketchshaper.com");
    } finally {
      if (origSiteUrl !== undefined) process.env.GOOGLE_INDEXING_SITE_URL = origSiteUrl;
      else delete process.env.GOOGLE_INDEXING_SITE_URL;

      if (origPublicUrl !== undefined) process.env.PUBLIC_SITE_URL = origPublicUrl;
      else delete process.env.PUBLIC_SITE_URL;
    }
  });

  it("skips automatic asset indexing in dev mode when override is not set", () => {
    const origMode = process.env.MODE;
    const origOverride = process.env.ENABLE_GOOGLE_INDEXING;

    try {
      process.env.MODE = "dev";
      delete process.env.ENABLE_GOOGLE_INDEXING;

      assert.equal(isIndexingEnabled(), false);
      const res = notifyGoogleAsset({ id: 10, name: "Test Sofa" });
      assert.equal(res.skipped, true);
    } finally {
      if (origMode !== undefined) process.env.MODE = origMode;
      else delete process.env.MODE;

      if (origOverride !== undefined) process.env.ENABLE_GOOGLE_INDEXING = origOverride;
      else delete process.env.ENABLE_GOOGLE_INDEXING;
    }
  });

  it("enables automatic asset indexing when ENABLE_GOOGLE_INDEXING=true or MODE=prod", () => {
    const origMode = process.env.MODE;
    const origOverride = process.env.ENABLE_GOOGLE_INDEXING;

    try {
      process.env.MODE = "dev";
      process.env.ENABLE_GOOGLE_INDEXING = "true";
      assert.equal(isIndexingEnabled(), true);

      process.env.MODE = "prod";
      delete process.env.ENABLE_GOOGLE_INDEXING;
      assert.equal(isIndexingEnabled(), true);
    } finally {
      if (origMode !== undefined) process.env.MODE = origMode;
      else delete process.env.MODE;

      if (origOverride !== undefined) process.env.ENABLE_GOOGLE_INDEXING = origOverride;
      else delete process.env.ENABLE_GOOGLE_INDEXING;
    }
  });

  it("skips submission gracefully and returns structured skipped object without network calls when key path is invalid", async () => {
    const origKeyPath = process.env.GOOGLE_INDEXING_KEY_PATH;

    try {
      // Explicit non-existent path MUST NOT fall back to candidates on disk
      process.env.GOOGLE_INDEXING_KEY_PATH = "/tmp/strictly-nonexistent-key.json";

      const result = await notifyGoogleUrl("https://www.sketchshaper.com/test-url");
      assert.deepEqual(result, { ok: false, skipped: true });
    } finally {
      if (origKeyPath !== undefined) {
        process.env.GOOGLE_INDEXING_KEY_PATH = origKeyPath;
      } else {
        delete process.env.GOOGLE_INDEXING_KEY_PATH;
      }
    }
  });
});
