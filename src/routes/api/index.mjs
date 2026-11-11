import { Router } from "express";
import commonController from "../../modules/common/common.controller.mjs";
import adminRouter from "./admin.route.mjs";
import assetRouter from "./asset.route.mjs";
import categoryRouter from "./category.route.mjs";
import generalRouter from "./general.route.mjs";
import pageRouter from "./page.route.mjs";
import sliderRouter from "./slider.route.mjs";
import socialRouter from "./social.route.mjs";
import subcategoryRouter from "./sub.category.route.mjs";
import innovativeFurnituresRouter from "./innovative.furnitures.route.mjs";
import supportedByRouter from "./supported.by.route.mjs";
import blogsRouter from "./blog.route.mjs";
import galleryRouter from "./gallery.route.mjs";
import patreonRouter from "./patreon.route.mjs";
import protectedRouter from "./protected.route.mjs";
import { requireAdminForWrites } from "../../middlewares/auth/requireAdminForWrites.mjs";

import extensionDownloadRouter from "./extension-download.route.mjs";
import contactRouter from "./contact.route.mjs";

const indexRouter = Router();

indexRouter.get("/", (req, res, next) => {
  res.status(200).json({
    status: "success",
    code: 200,
    message: "Welcome to the API",
  });
});

indexRouter.get("/search", commonController.search);

indexRouter.use("/admins", adminRouter);
indexRouter.use("/sliders", requireAdminForWrites, sliderRouter);
indexRouter.use("/categories", requireAdminForWrites, categoryRouter);
indexRouter.use("/sub-categories", requireAdminForWrites, subcategoryRouter);
indexRouter.use("/assets", requireAdminForWrites, assetRouter);
indexRouter.use("/pages", requireAdminForWrites, pageRouter);
indexRouter.use("/general", requireAdminForWrites, generalRouter);
indexRouter.use("/social", requireAdminForWrites, socialRouter);
indexRouter.use("/innovative", requireAdminForWrites, innovativeFurnituresRouter);
indexRouter.use("/supportedBy", requireAdminForWrites, supportedByRouter);
indexRouter.use("/blogs", requireAdminForWrites, blogsRouter);
indexRouter.use("/gallery", requireAdminForWrites, galleryRouter);
indexRouter.use("/patreon", patreonRouter);
indexRouter.use("/protected", protectedRouter);

indexRouter.use("/extension-downloads", extensionDownloadRouter);
indexRouter.use("/contact", contactRouter);

export default indexRouter;
