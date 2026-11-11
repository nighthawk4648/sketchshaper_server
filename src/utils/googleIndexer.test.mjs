import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalAssetUrl,
  notifyGoogleUrl,
  notifyGoogleAsset,
  isIndexingEnabled,
  isGoogleAuthAvailable,
  getGoogleAuthClient,
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

  it("loads credentials directly from GOOGLE_SERVICE_ACCOUNT_KEY in env (JSON and Base64)", () => {
    const origKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const dummyCreds = {
      client_email: "test-sa@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n",
    };

    try {
      // 1. Raw JSON string
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify(dummyCreds);
      assert.equal(isGoogleAuthAvailable(), true);
      const auth1 = getGoogleAuthClient();
      assert.equal(auth1.email, dummyCreds.client_email);

      // 2. Base64-encoded string
      const b64 = Buffer.from(JSON.stringify(dummyCreds)).toString("base64");
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = b64;
      assert.equal(isGoogleAuthAvailable(), true);
    } finally {
      if (origKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = origKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
  });

  it("loads credentials directly from individual GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY env vars", () => {
    const origEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const origKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const dummyEmail = "env-sa@project.iam.gserviceaccount.com";
    const dummyKey = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n";

    try {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = dummyEmail;
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = dummyKey;

      assert.equal(isGoogleAuthAvailable(), true);
      const auth = getGoogleAuthClient();
      assert.equal(auth.email, dummyEmail);
    } finally {
      if (origEmail !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

      if (origKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = origKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    }
  });

  it("skips submission gracefully and returns structured skipped object without network calls when key path is invalid and no env credentials", async () => {
    const origKeyPath = process.env.GOOGLE_INDEXING_KEY_PATH;
    const origKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const origEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const origPrivKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    try {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

      // Explicit non-existent path MUST NOT fall back to candidates on disk
      process.env.GOOGLE_INDEXING_KEY_PATH = "/tmp/strictly-nonexistent-key.json";

      const result = await notifyGoogleUrl("https://www.sketchshaper.com/test-url");
      assert.deepEqual(result, { ok: false, skipped: true });
    } finally {
      if (origKeyPath !== undefined) process.env.GOOGLE_INDEXING_KEY_PATH = origKeyPath;
      else delete process.env.GOOGLE_INDEXING_KEY_PATH;

      if (origKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = origKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

      if (origEmail !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

      if (origPrivKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = origPrivKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    }
  });
});
