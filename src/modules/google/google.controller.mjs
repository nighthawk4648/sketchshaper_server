import catchError from "../../middlewares/errors/catchError.mjs";
import { config } from "../../config/config.mjs";
import { safeNext } from "../../utils/safeNext.mjs";
import { oauthCookie, sameValue } from "../../utils/oauthState.mjs";
import { SITE_COOKIE, findSession, readCookie, startSiteSession } from "../../utils/session.mjs";
import { SignInError } from "../auth/accountLinking.mjs";
import * as client from "./google.client.mjs";
import * as service from "./google.service.mjs";

const oauth = oauthCookie({ name: "ss_oauth_google", path: "/api/google" });
const siteUrl = () => (config.frontend_url || "https://www.sketchshaper.com").replace(/\/+$/, "");

class GoogleController {
  // Step 1: remember a random check value, then send the visitor to Google
  start = catchError(async (req, res) => {
    if (!client.isConfigured()) return res.redirect(`${siteUrl()}/login?error=google_unavailable`);
    res.redirect(client.authorizeUrl(oauth.begin(res, req.query.next)));
  });

  // Step 2: Google sends the visitor back here. Every outcome ends as a redirect to the website, never a token in a URL.
  callback = catchError(async (req, res) => {
    const fail = (code) => res.redirect(`${siteUrl()}/login?error=${code}`);
    const saved = oauth.take(req, res, readCookie);

    const { code, state, error } = req.query;
    if (error) return fail(error === "access_denied" ? "google_denied" : "google_failed");
    if (!saved || typeof state !== "string" || typeof code !== "string" || !sameValue(saved.state, state)) {
      return fail("google_failed");
    }

    try {
      const tokens = await client.exchangeCode(code);
      const profile = await client.fetchProfile(tokens.access_token);
      const current = await findSession(readCookie(req, SITE_COOKIE), "website");
      const user = await service.signInWithGoogle({ profile, currentUserId: current?.site_user?.id ?? null });
      if (current?.site_user?.id !== user.id) await startSiteSession(req, res, user.id);
      res.redirect(`${siteUrl()}${safeNext(saved.next)}`);
    } catch (err) {
      if (err instanceof SignInError) return fail(err.code);
      console.error("Google sign-in failed:", err.message);
      fail("google_failed");
    }
  });
}

export default new GoogleController();
