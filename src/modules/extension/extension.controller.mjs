import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { SITE_COOKIE, deleteSession, findSession, readBearer, readCookie } from "../../utils/session.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import * as service from "./extension.service.mjs";

const ok = (res, message, data) => res.status(200).json(responseHandler(200, message, data));

const extensionSession = async (req) => {
  const session = await findSession(readBearer(req), "extension");
  if (!session?.site_user) throw new AuthError("Please sign in again.", 401);
  return session;
};

class ExtensionController {
  start = catchError(async (req, res) => ok(res, "Sign-in started", await service.startLogin()));

  poll = catchError(async (req, res) => ok(res, "OK", await service.pollLogin(req.params.nonce, req)));

  approve = catchError(async (req, res) => {
    const session = await findSession(readCookie(req, SITE_COOKIE), "website");
    if (!session?.site_user) throw new AuthError("Please sign in first.", 401);
    if (!session.site_user.email_verified_at) throw new AuthError("Please confirm your email address first.", 403);
    await service.approveLogin(req.body?.code, session.site_user.id);
    ok(res, "SketchUp connected");
  });

  me = catchError(async (req, res) => {
    const session = await extensionSession(req);
    ok(res, "OK", { user: await service.extensionUser(session.site_user.id, { forceRecheck: req.query.refresh === "1" }) });
  });

  logout = catchError(async (req, res) => {
    await extensionSession(req);
    await deleteSession(readBearer(req));
    ok(res, "Signed out");
  });
}

export default new ExtensionController();
