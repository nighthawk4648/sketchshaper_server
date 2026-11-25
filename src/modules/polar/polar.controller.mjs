import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { config } from "../../config/config.mjs";
import { SITE_COOKIE, findSession, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { verifySignature } from "./polar.webhook.mjs";
import * as service from "./polar.service.mjs";

// Checkout and billing are for signed-in visitors only; the website's cookie says who is asking
async function signedInUser(req) {
  const session = await findSession(readCookie(req, SITE_COOKIE), "website");
  if (!session?.site_user) throw new AuthError("Please sign in first.", 401);
  return session.site_user;
}

class PolarController {
  checkout = catchError(async (req, res) => {
    const url = await service.startCheckout(await signedInUser(req), req.body?.plan, req.body?.period);
    res.status(200).json(responseHandler(200, "OK", { url }));
  });

  portal = catchError(async (req, res) => {
    const url = await service.startPortal(await signedInUser(req));
    res.status(200).json(responseHandler(200, "OK", { url }));
  });

  // Called by Polar itself. Nothing in the body is trusted until the signature checks out.
  webhook = catchError(async (req, res) => {
    const signed = verifySignature({
      id: req.get("webhook-id"),
      timestamp: req.get("webhook-timestamp"),
      signature: req.get("webhook-signature"),
      body: req.rawBody,
      secret: config.polar_webhook_secret,
    });
    if (!signed) return res.status(403).json({ status: "error", code: 403, message: "Invalid signature." });

    let event;
    try {
      event = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ status: "error", code: 400, message: "Invalid body." });
    }
    await service.applyEvent(event); // an error here answers 500, so Polar tries again later
    res.status(200).json({ received: true });
  });
}

export default new PolarController();
