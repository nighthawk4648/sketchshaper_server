import { Router } from "express";
import membersController from "../../modules/members/members.controller.mjs";
import { verifyAdminAuth } from "../../middlewares/auth/verifyAdminAuth.mjs";

// Admin only: website accounts (email, Google, Patreon) and their PRO access
const membersRouter = Router();
membersRouter.use(verifyAdminAuth);

membersRouter.get("/", membersController.list);
membersRouter.get("/stats", membersController.stats);
membersRouter.get("/:id", membersController.get);
membersRouter.patch("/:id/access", membersController.setAccess);

export default membersRouter;
