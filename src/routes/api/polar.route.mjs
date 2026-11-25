import { Router } from "express";
import polarController from "../../modules/polar/polar.controller.mjs";
import { requireTrustedOrigin } from "../../middlewares/auth/trustedOrigin.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";

const polarRouter = Router();

const limit = rateLimiter({ windowMs: 10 * 60 * 1000, max: 20, key: (req) => `polar:${req.path}:${clientIp(req)}` });

// Browser calls from the website: a trusted Origin is needed, as for the other cookie-signed writes
polarRouter.post("/checkout", limit, requireTrustedOrigin, polarController.checkout);
polarRouter.post("/portal", limit, requireTrustedOrigin, polarController.portal);

// Polar's own calls: no cookie and no Origin, protected by the signature instead
polarRouter.post("/webhook", polarController.webhook);

export default polarRouter;
