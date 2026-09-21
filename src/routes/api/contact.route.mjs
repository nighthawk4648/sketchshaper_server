import { Router } from "express";
import { verifyAdminAuth } from "../../middlewares/auth/verifyAdminAuth.mjs";
import contactController from "../../modules/contact/contact.controller.mjs";

const contactRouter = Router();

// Anyone visiting the website may submit a message.
contactRouter.post("/", contactController.createContactMessage);

// Reading or changing messages is restricted to signed-in administrators.
contactRouter.use(verifyAdminAuth);
contactRouter.get("/", contactController.getContactMessages);
contactRouter.get("/:id", contactController.getContactMessage);
contactRouter.patch(
  "/:id/status",
  contactController.updateContactMessageStatus,
);
contactRouter.delete("/:id", contactController.deleteContactMessage);

export default contactRouter;
