import { Router } from "express";
import extensionController from "../../modules/extension/extension.controller.mjs";
import { requireTrustedOrigin } from "../../middlewares/auth/trustedOrigin.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";

const TEN_MIN = 10 * 60 * 1000;
const byIp = (name) => (req) => `extension:${name}:${clientIp(req)}`;

const extensionRouter = Router();

// SketchUp sign-in: the extension starts and polls, the website approves while signed in
extensionRouter.post("/start", rateLimiter({ windowMs: TEN_MIN, max: 10, key: byIp("start") }), extensionController.start);
// Polled every few seconds, and many people can share one office address
extensionRouter.get("/poll/:nonce", rateLimiter({ windowMs: TEN_MIN, max: 1500, key: byIp("poll") }), extensionController.poll);
extensionRouter.post(
  "/approve",
  requireTrustedOrigin,
  rateLimiter({ windowMs: TEN_MIN, max: 20, key: byIp("approve") }),
  extensionController.approve,
);
extensionRouter.get("/me", rateLimiter({ windowMs: TEN_MIN, max: 120, key: byIp("me") }), extensionController.me);
extensionRouter.post("/logout", rateLimiter({ windowMs: TEN_MIN, max: 30, key: byIp("logout") }), extensionController.logout);

export default extensionRouter;
