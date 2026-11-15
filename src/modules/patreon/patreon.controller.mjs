import crypto from "crypto";
import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { config } from "../../config/config.mjs";
import { safeNext } from "../../utils/safeNext.mjs";
import {
  SITE_COOKIE,
  clearSessionCookie,
  findSession,
  readCookie,
  startSiteSession,
} from "../../utils/session.mjs";
import * as client from "./patreon.client.mjs";
import * as service from "./patreon.service.mjs";

const OAUTH_COOKIE = "ss_oauth";
const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.mode !== "dev",
  sameSite: "lax", // Patreon's redirect back is a normal navigation, which Lax allows
  path: "/api/patreon",
};

const siteUrl = () => (config.frontend_url || "https://www.sketchshaper.com").replace(/\/+$/, "");

const sameValue = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function readOAuthCookie(req) {
  try {
    return JSON.parse(Buffer.from(readCookie(req, OAUTH_COOKIE) || "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

class PatreonController {
  // Step 1: remember a random check value, then send the visitor to Patreon
  start = catchError(async (req, res) => {
    const state = crypto.randomBytes(24).toString("base64url");
    const saved = Buffer.from(JSON.stringify({ state, next: safeNext(req.query.next) })).toString("base64url");
    res.cookie(OAUTH_COOKIE, saved, { ...OAUTH_COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
    res.redirect(client.authorizeUrl(state));
  });

  // Step 2: Patreon sends the visitor back here. Every outcome ends as a redirect to the website, never a token in a URL.
  callback = catchError(async (req, res) => {
    const fail = (code) => res.redirect(`${siteUrl()}/login?error=${code}`);
    const saved = readOAuthCookie(req);
    res.clearCookie(OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS);

    const { code, state, error } = req.query;
    if (error) return fail(error === "access_denied" ? "patreon_denied" : "patreon_failed");
    // The state we made in step 1 must come back unchanged, or this is not the sign-in we started
    if (!saved || typeof state !== "string" || typeof code !== "string" || !sameValue(saved.state, state)) {
      return fail("patreon_failed");
    }

    try {
      const tokens = await client.exchangeCode(code);
      const identity = await client.fetchIdentity(tokens.access_token);
      const current = await findSession(readCookie(req, SITE_COOKIE), "website");
      const user = await service.signInWithPatreon({
        tokens,
        identity,
        currentUserId: current?.site_user?.id ?? null,
      });
      if (current?.site_user?.id !== user.id) await startSiteSession(req, res, user.id);
      // Checked again here: the value comes back from a cookie
      res.redirect(`${siteUrl()}${safeNext(saved.next)}`);
    } catch (err) {
      if (err instanceof service.PatreonSignInError) return fail(err.code);
      console.error("Patreon sign-in failed:", err.message);
      fail("patreon_failed");
    }
  });

  // ----- Admin dashboard -----

  getAllUsers = catchError(async (req, res) => {
    const data = await service.listPatreonUsers(req.query);
    res.status(200).json(responseHandler(200, "Patreon users retrieved successfully", data));
  });

  getUser = catchError(async (req, res) => {
    const user = await service.getPatreonUser(req.params.id);
    res.status(200).json(responseHandler(200, "Patreon user retrieved successfully", user));
  });

  revokeAccess = catchError(async (req, res) => {
    await service.revokeUserAccess(req.params.id);
    res.status(200).json(responseHandler(200, "User access revoked successfully"));
  });
}

export default new PatreonController();
