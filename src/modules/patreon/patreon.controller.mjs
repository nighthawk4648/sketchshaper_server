import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { config } from "../../config/config.mjs";
import { safeNext } from "../../utils/safeNext.mjs";
import { oauthCookie, sameValue } from "../../utils/oauthState.mjs";
import {
  SITE_COOKIE,
  findSession,
  readCookie,
  startSiteSession,
} from "../../utils/session.mjs";
import { SignInError } from "../auth/accountLinking.mjs";
import * as client from "./patreon.client.mjs";
import * as service from "./patreon.service.mjs";

const oauth = oauthCookie({ name: "ss_oauth", path: "/api/patreon" });

const siteUrl = () => (config.frontend_url || "https://www.sketchshaper.com").replace(/\/+$/, "");

class PatreonController {
  // Step 1: remember a random check value, then send the visitor to Patreon
  start = catchError(async (req, res) => {
    res.redirect(client.authorizeUrl(oauth.begin(res, req.query.next)));
  });

  // Step 2: Patreon sends the visitor back here. Every outcome ends as a redirect to the website, never a token in a URL.
  callback = catchError(async (req, res) => {
    const fail = (code) => res.redirect(`${siteUrl()}/login?error=${code}`);
    const saved = oauth.take(req, res, readCookie);

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
      if (err instanceof SignInError) return fail(err.code);
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
