import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import {
  SITE_COOKIE,
  clearSessionCookie,
  deleteSession,
  findSession,
  readCookie,
  startSiteSession,
} from "../../utils/session.mjs";
import { proStatus } from "../pro/pro.service.mjs";
import authService, { AuthError, publicUser } from "./auth.service.mjs";
import { cleanName, isValidEmail, normalizeEmail, passwordProblem } from "./auth.validation.mjs";

const ok = (res, message, data) => res.status(200).json(responseHandler(200, message, data));

// What the website needs to know about someone: who they are, plus PRO status
const describe = async (user) => ({ ...publicUser(user), ...(await proStatus(user.id)) });

const requireEmail = (body) => {
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) throw new AuthError("Please enter a valid email address.");
  return email;
};

const requireSession = async (req) => {
  const session = await findSession(readCookie(req, SITE_COOKIE), "website");
  if (!session?.site_user) throw new AuthError("Please sign in.", 401);
  return session;
};

class AuthController {
  register = catchError(async (req, res) => {
    const email = requireEmail(req.body);
    const problem = passwordProblem(req.body.password);
    if (problem) throw new AuthError(problem);
    await authService.register({ email, password: req.body.password, name: cleanName(req.body.name) });
    // Identical answer whether or not the email already had an account
    ok(res, "Check your email for a confirmation link.");
  });

  login = catchError(async (req, res) => {
    const user = await authService.login({
      email: normalizeEmail(req.body?.email),
      password: req.body?.password,
    });
    await startSiteSession(req, res, user.id);
    ok(res, "Signed in", { user: await describe(user) });
  });

  // 200 with user: null when nobody is signed in, so the browser console stays clean
  me = catchError(async (req, res) => {
    const session = await findSession(readCookie(req, SITE_COOKIE), "website");
    ok(res, "OK", { user: session?.site_user ? await describe(session.site_user) : null });
  });

  profile = catchError(async (req, res) => {
    const session = await requireSession(req);
    const user = await authService.updateName(session.site_user_id, cleanName(req.body?.name));
    ok(res, "Saved", { user: await describe(user) });
  });

  changePassword = catchError(async (req, res) => {
    const session = await requireSession(req);
    const user = await authService.changePassword({
      siteUserId: session.site_user_id,
      keepSessionId: session.id,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });
    ok(res, "Password changed", { user: await describe(user) });
  });

  logout = catchError(async (req, res) => {
    await deleteSession(readCookie(req, SITE_COOKIE));
    clearSessionCookie(res, SITE_COOKIE);
    ok(res, "Signed out");
  });

  verifyEmail = catchError(async (req, res) => {
    const user = await authService.verifyEmail(req.body?.token);
    await startSiteSession(req, res, user.id);
    ok(res, "Email confirmed", { user: await describe(user) });
  });

  resendVerification = catchError(async (req, res) => {
    await authService.resendVerification(requireEmail(req.body));
    ok(res, "If that account needs confirming, we sent a new link.");
  });

  forgotPassword = catchError(async (req, res) => {
    await authService.forgotPassword(requireEmail(req.body));
    ok(res, "If an account exists for that email, we sent a reset link.");
  });

  resetPassword = catchError(async (req, res) => {
    const problem = passwordProblem(req.body?.password);
    if (problem) throw new AuthError(problem);
    await authService.resetPassword({ token: req.body.token, password: req.body.password });
    ok(res, "Password updated. Please sign in.");
  });
}

export default new AuthController();
