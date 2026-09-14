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
indexRouter.use("/sliders", sliderRouter);
indexRouter.use("/categories", categoryRouter);
indexRouter.use("/sub-categories", subcategoryRouter);
indexRouter.use("/assets", assetRouter);
indexRouter.use("/pages", pageRouter);
indexRouter.use("/general", generalRouter);
indexRouter.use("/social", socialRouter);
indexRouter.use("/innovative", innovativeFurnituresRouter);
indexRouter.use("/supportedBy", supportedByRouter);
indexRouter.use("/blogs", blogsRouter);
indexRouter.use("/gallery", galleryRouter);
indexRouter.use("/patreon", patreonRouter);
indexRouter.use("/protected", protectedRouter);

indexRouter.use("/extension-downloads", extensionDownloadRouter);
indexRouter.use("/contact", contactRouter);

export default indexRouter;
