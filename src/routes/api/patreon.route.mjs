import { Router } from "express";
import patreonController from "../../modules/patreon/patreon.controller.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";

const patreonRouter = Router();

// Sign in with Patreon. The callback address is the one already registered in Patreon's developer portal.
const limit = rateLimiter({ windowMs: 10 * 60 * 1000, max: 30, key: (req) => `patreon:${req.path}:${clientIp(req)}` });
patreonRouter.get("/start", limit, patreonController.start);
patreonRouter.get("/callback", limit, patreonController.callback);

export default patreonRouter;
