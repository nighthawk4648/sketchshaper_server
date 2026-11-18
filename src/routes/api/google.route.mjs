import { Router } from "express";
import googleController from "../../modules/google/google.controller.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";

const googleRouter = Router();

const limit = rateLimiter({ windowMs: 10 * 60 * 1000, max: 30, key: (req) => `google:${req.path}:${clientIp(req)}` });
googleRouter.get("/start", limit, googleController.start);
googleRouter.get("/callback", limit, googleController.callback);

export default googleRouter;
