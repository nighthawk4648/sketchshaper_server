import { Router } from "express";
import adminController from "../../modules/admin/admin.controller.mjs";
import { verifyAdminAuth } from "../../middlewares/auth/verifyAdminAuth.mjs";
import { clientIp, rateLimiter } from "../../utils/rateLimit.mjs";

const adminRouter = Router();

// Login and logout are the only public admin routes
// Slows down password guessing: per visitor address and per admin email
const TEN_MIN = 10 * 60 * 1000;
adminRouter.post(
  "/login",
  rateLimiter({ windowMs: TEN_MIN, max: 20, key: (req) => `admin-login:${clientIp(req)}` }),
  rateLimiter({ windowMs: TEN_MIN, max: 8, key: (req) => `admin-login:${String(req.body?.email || "").trim().toLowerCase()}` }),
  adminController.loginAdmin,
);
adminRouter.post("/logout", adminController.logoutAdmin);

adminRouter.use(verifyAdminAuth);

adminRouter
  .route("/:id")
  .get(adminController.getAdmin)
  .put(adminController.updateAdmin)
  .delete(adminController.deleteAdmin);

adminRouter
  .route("/")
  .post(adminController.createAdmin)
  .get(adminController.getAdmins);

export default adminRouter;