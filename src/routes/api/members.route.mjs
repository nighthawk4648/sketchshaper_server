import { Router } from "express";
import membersController from "../../modules/members/members.controller.mjs";
import { verifyAdminAuth } from "../../middlewares/auth/verifyAdminAuth.mjs";

const membersRouter = Router();
membersRouter.use(verifyAdminAuth);

membersRouter.get("/", membersController.list);
membersRouter.get("/stats", membersController.stats);
membersRouter.get("/:id", membersController.get);
membersRouter.patch("/:id/access", membersController.setAccess);
membersRouter.get("/:id/payments", membersController.payments);
membersRouter.post("/:id/payments", membersController.addPayment);
membersRouter.delete("/:id/payments/:paymentId", membersController.deletePayment);

export default membersRouter;
