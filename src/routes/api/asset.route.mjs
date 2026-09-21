import { Router } from "express";
import upload from "../../middlewares/uploads/upload.mjs";
import chunkUpload from "../../middlewares/uploads/chunkUpload.mjs";
import assetController from "../../modules/asset/asset.controller.mjs";

const assetRouter = Router();

// Chunked upload endpoints (specific routes first)
assetRouter.post("/initialize", assetController.initializeUpload);
assetRouter.post("/:id/initialize", assetController.initializeUploadWithId);
assetRouter.post(
  "/upload-chunk",
  chunkUpload.single("chunk"),
  assetController.uploadChunk,
);
assetRouter.post("/complete", assetController.completeUpload);

// Get assets with pagination (must come before /:id route)
assetRouter.get("/pages", assetController.getAssetsByPagination);

// Get upload status and cancel upload
assetRouter.get("/status/:uploadSessionId", assetController.getUploadStatus);
assetRouter.delete("/cancel/:uploadSessionId", assetController.cancelUpload);

// Access type toggle endpoints
assetRouter.patch("/:id/access-type", assetController.updateAssetAccessType);
assetRouter.post(
  "/bulk-access-type",
  assetController.bulkUpdateAssetAccessType,
);

// Download asset file
assetRouter.get("/:id/download", assetController.downloadAsset);

// Update preview image
assetRouter.put(
  "/:id/preview",
  upload.any(),
  assetController.updatePreviewImage,
);

// CRUD operations (parameterized route last)
assetRouter
  .route("/:id")
  .get(assetController.getAsset)
  .put(upload.any(), assetController.updateAsset)
  .delete(assetController.deleteAsset);

assetRouter
  .route("/")
  .post(upload.any(), assetController.createAsset)
  .get(assetController.getAssets);

export default assetRouter;
