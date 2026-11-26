import { Router } from "express";
import authController from "../../modules/auth/auth.controller.mjs";
import { requireTrustedOrigin } from "../../middlewares/auth/trustedOrigin.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";
import { normalizeEmail } from "../../modules/auth/auth.validation.mjs";

const MIN = 60 * 1000;
const byIp = (name) => (req) => `${name}:${clientIp(req)}`;
const byEmail = (name) => (req) => `${name}:${normalizeEmail(req.body?.email)}`;

const authRouter = Router();

// Every write needs a trusted Origin; every route that can be guessed at or can send mail is rate limited
authRouter.use((req, res, next) => (req.method === "POST" ? requireTrustedOrigin(req, res, next) : next()));

authRouter.post(
  "/register",
  rateLimiter({ windowMs: 60 * MIN, max: 10, key: byIp("register") }),
  rateLimiter({ windowMs: 60 * MIN, max: 5, key: byEmail("register") }),
  authController.register,
);
authRouter.post(
  "/login",
  rateLimiter({ windowMs: 10 * MIN, max: 20, key: byIp("login") }),
  rateLimiter({ windowMs: 10 * MIN, max: 8, key: byEmail("login") }),
  authController.login,
);
authRouter.get("/me", authController.me);
authRouter.post("/logout", authController.logout);
authRouter.post(
  "/profile",
  rateLimiter({ windowMs: 10 * MIN, max: 30, key: byIp("profile") }),
  authController.profile,
);
authRouter.post(
  "/change-password",
  rateLimiter({ windowMs: 10 * MIN, max: 10, key: byIp("change-password") }),
  authController.changePassword,
);
authRouter.post(
  "/verify-email",
  rateLimiter({ windowMs: 10 * MIN, max: 30, key: byIp("verify") }),
  authController.verifyEmail,
);
authRouter.post(
  "/resend-verification",
  rateLimiter({ windowMs: 60 * MIN, max: 10, key: byIp("resend") }),
  rateLimiter({ windowMs: 60 * MIN, max: 3, key: byEmail("resend") }),
  authController.resendVerification,
);
authRouter.post(
  "/forgot-password",
  rateLimiter({ windowMs: 60 * MIN, max: 10, key: byIp("forgot") }),
  rateLimiter({ windowMs: 60 * MIN, max: 3, key: byEmail("forgot") }),
  authController.forgotPassword,
);
authRouter.post(
  "/reset-password",
  rateLimiter({ windowMs: 10 * MIN, max: 30, key: byIp("reset") }),
  authController.resetPassword,
);

export default authRouter;
