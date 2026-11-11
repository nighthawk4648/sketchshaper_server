import { Router } from "express";
import adminController from "../../modules/admin/admin.controller.mjs";
import { verifyAdminAuth } from "../../middlewares/auth/verifyAdminAuth.mjs";

const adminRouter = Router();

// Login is the only public admin route
adminRouter.post("/login", adminController.loginAdmin);

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