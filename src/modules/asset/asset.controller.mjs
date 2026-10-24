import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import assetService from "./asset.service.mjs";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { config } from "../../config/config.mjs";
import { prisma } from "../../db/prisma.mjs";
import { revalidateFrontend } from "../../utils/revalidateFrontend.mjs";
import { buildCatalogTags } from "../../utils/revalidateTags.mjs";

const cleanupUploadedFiles = (files) => {
  if (Array.isArray(files)) {
    for (const file of files) {
      if (file?.path) {
        try {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) {
          console.error("Failed to clean up uploaded file:", e);
        }
      }
    }
  }
};

class AssetController {
  /**
   * Initialize upload session
   * POST /api/assets/initialize
   */
  initializeUpload = catchError(async (req, res, next) => {
    const result = await assetService.initializeUpload(req.body);
    const resDoc = responseHandler(201, result.message, {
      uploadSessionId: result.uploadSessionId,
      fileId: result.assetId,
    });
    res.status(201).json(resDoc);
  });

  /**
   * Initialize upload session with asset ID in URL
   * POST /api/assets/:id/initialize
   */
  initializeUploadWithId = catchError(async (req, res, next) => {
    const { id } = req.params;
    const result = await assetService.initializeUpload({
      ...req.body,
      assetId: id,
    });
    const resDoc = responseHandler(201, result.message, {
      uploadSessionId: result.uploadSessionId,
      fileId: result.assetId,
    });
    res.status(201).json(resDoc);
  });

  /**
   * Upload a chunk
   * POST /api/assets/upload-chunk
   */
  uploadChunk = catchError(async (req, res, next) => {
    const { uploadSessionId, chunkIndex } = req.body;

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        code: 400,
        message: "No chunk file provided",
      });
    }

    const result = await assetService.uploadChunk({
      uploadSessionId,
      chunkIndex,
      chunkData: req.file.buffer,
    });

    const resDoc = responseHandler(200, result.message, result);
    res.status(200).json(resDoc);
  });

  /**
   * Complete upload (merge chunks)
   * POST /api/assets/complete
   */
  completeUpload = catchError(async (req, res, next) => {
    const result = await assetService.completeUpload(req.body);
    const resDoc = responseHandler(200, result.message, result.file);
    res.status(200).json(resDoc);
  });

  /**
   * Get upload status
   * GET /api/assets/status/:uploadSessionId
   */
  getUploadStatus = catchError(async (req, res, next) => {
    const { uploadSessionId } = req.params;
    const result = await assetService.getUploadStatus(uploadSessionId);
    const resDoc = responseHandler(
      200,
      "Upload status retrieved successfully",
      result,
    );
    res.status(200).json(resDoc);
  });

  /**
   * Cancel upload
   * DELETE /api/assets/cancel/:uploadSessionId
   */
  cancelUpload = catchError(async (req, res, next) => {
    const { uploadSessionId } = req.params;
    const result = await assetService.cancelUpload(uploadSessionId);
    const resDoc = responseHandler(200, result.message);
    res.status(200).json(resDoc);
  });

  /**
   * Update preview image
   * PUT /api/assets/:id/preview
   */
  updatePreviewImage = catchError(async (req, res, next) => {
    const asset = await assetService.updatePreviewImage(req.params.id, {
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(
      200,
      "Preview image updated successfully",
      asset,
    );
    res.status(200).json(resDoc);

    const assetId = req.params.id;
    const subCatId = asset?.sub_category_id || asset?.sub_category?.id;
    let catId = asset?.sub_category?.category_id;
    if (!catId && subCatId) {
      const sub = await prisma.subCategory
        .findUnique({
          where: { id: parseInt(subCatId) },
          select: { category_id: true },
        })
        .catch(() => null);
      catId = sub?.category_id;
    }
    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: assetId,
        subCategoryIds: subCatId,
        categoryIds: catId,
      }),
    });
  });

  createAsset = catchError(async (req, res, next) => {
    // 1. Validate Asset Name
    if (!req.body.name || !req.body.name.trim()) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "Asset name is required",
      });
    }

    // 2. Validate Sub-Category ID
    const subCategoryId = parseInt(req.body.sub_category_id);
    if (
      !req.body.sub_category_id ||
      isNaN(subCategoryId) ||
      subCategoryId <= 0
    ) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "Valid sub-category is required",
      });
    }

    const subCategory = await prisma.subCategory.findUnique({
      where: { id: subCategoryId },
    });
    if (!subCategory) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "Selected sub-category does not exist",
      });
    }

    // 3. Validate Primary Cover Image
    const hasCover =
      Array.isArray(req.files) &&
      req.files.some((f) => f.fieldname === "cover");
    if (!hasCover) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "Primary cover image is required",
      });
    }

    const asset = await assetService.createAsset({
      ...req.body,
      cover_alt: req.body.cover_alt?.trim()
        ? req.body.cover_alt.trim().slice(0, 125)
        : null,
      files: req.files,
    });
    const resDoc = responseHandler(201, "Asset created successfully", asset);
    res.status(201).json(resDoc);

    const subCatId =
      asset?.sub_category_id ||
      asset?.sub_category?.id ||
      req.body?.sub_category_id;
    let catId = asset?.sub_category?.category_id;
    if (!catId && subCatId) {
      const sub = await prisma.subCategory
        .findUnique({
          where: { id: parseInt(subCatId) },
          select: { category_id: true },
        })
        .catch(() => null);
      catId = sub?.category_id;
    }
    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: asset?.id,
        subCategoryIds: subCatId,
        categoryIds: catId,
      }),
    });
  });

  updateAsset = catchError(async (req, res, next) => {
    const { id } = req.params;

    // Validate that ID is numeric
    if (!/^\d+$/.test(id)) {
      cleanupUploadedFiles(req.files);
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const parsedAssetId = parseInt(id);
    const existingAsset = await prisma.asset.findUnique({
      where: { id: parsedAssetId },
      include: {
        sub_category: {
          select: { id: true, category_id: true },
        },
      },
    });
    if (!existingAsset) {
      cleanupUploadedFiles(req.files);
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const {
      name,
      resolution,
      size,
      download_link,
      short_description,
      sub_category_id,
      access_type,
      meta_title,
      meta_description,
      keywords,
      delete_file,
      cover_alt,
      newImageAlts,
      existingImageAlts,
    } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "Asset name cannot be empty",
      });
    }

    if (sub_category_id !== undefined) {
      const parsedSubId = parseInt(sub_category_id);
      if (isNaN(parsedSubId) || parsedSubId <= 0) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          statusCode: 400,
          status: "error",
          message: "Valid sub-category is required",
        });
      }
      const subCategory = await prisma.subCategory.findUnique({
        where: { id: parsedSubId },
      });
      if (!subCategory) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          statusCode: 400,
          status: "error",
          message: "Selected sub-category does not exist",
        });
      }
    }

    // Parse removedImageIds sent from FormData (handles removedImageIds[0], removedImageIds[], or arrays)
    const removedImageIds = [];
    if (Array.isArray(req.body.removedImageIds)) {
      req.body.removedImageIds.forEach((val) => {
        const parsed = parseInt(val);
        if (!isNaN(parsed) && !removedImageIds.includes(parsed)) {
          removedImageIds.push(parsed);
        }
      });
    } else if (req.body.removedImageIds) {
      const parsed = parseInt(req.body.removedImageIds);
      if (!isNaN(parsed)) removedImageIds.push(parsed);
    }
    Object.keys(req.body).forEach((key) => {
      if (
        key.startsWith("removedImageIds[") ||
        key.startsWith("removedImageIds")
      ) {
        const parsed = parseInt(req.body[key]);
        if (!isNaN(parsed) && !removedImageIds.includes(parsed)) {
          removedImageIds.push(parsed);
        }
      }
    });

    const asset = await assetService.updateAsset(id, {
      name,
      resolution,
      size,
      download_link,
      short_description,
      sub_category_id,
      access_type,
      meta_title,
      meta_description,
      keywords,
      delete_file,
      cover_alt:
        cover_alt !== undefined
          ? cover_alt?.trim()
            ? cover_alt.trim().slice(0, 125)
            : null
          : undefined,
      newImageAlts,
      existingImageAlts,
      removedImageIds,
      files: req.files,
    });
    const resDoc = responseHandler(200, "Asset updated successfully", asset);
    res.status(200).json(resDoc);

    const oldSubCatId = existingAsset?.sub_category_id;
    const oldCatId = existingAsset?.sub_category?.category_id;
    const newSubCatId = asset?.sub_category_id || asset?.sub_category?.id;
    const newCatId = asset?.sub_category?.category_id;

    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: id,
        subCategoryIds: [oldSubCatId, newSubCatId],
        categoryIds: [oldCatId, newCatId],
      }),
    });
  });

  updateAssetAccessType = catchError(async (req, res, next) => {
    const { id } = req.params;
    const { access_type } = req.body;

    if (!/^\d+$/.test(id)) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    if (!["free", "paid"].includes(access_type)) {
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "access_type must be either free or paid",
      });
    }

    const asset = await assetService.updateAssetAccessType(id, access_type);
    const resDoc = responseHandler(
      200,
      `Asset marked as ${access_type} successfully`,
      asset,
    );
    res.status(200).json(resDoc);

    const subCatId = asset?.sub_category_id || asset?.sub_category?.id;
    let catId = asset?.sub_category?.category_id;
    if (!catId && subCatId) {
      const sub = await prisma.subCategory
        .findUnique({
          where: { id: parseInt(subCatId) },
          select: { category_id: true },
        })
        .catch(() => null);
      catId = sub?.category_id;
    }
    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: id,
        subCategoryIds: subCatId,
        categoryIds: catId,
      }),
    });
  });

  bulkUpdateAssetAccessType = catchError(async (req, res, next) => {
    const { ids, access_type } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "ids array is required",
      });
    }

    if (!["free", "paid"].includes(access_type)) {
      return res.status(400).json({
        statusCode: 400,
        status: "error",
        message: "access_type must be either free or paid",
      });
    }

    const { affectedAssets, ...responseResult } =
      await assetService.bulkUpdateAssetAccessType(ids, access_type);
    const resDoc = responseHandler(
      200,
      `Updated ${responseResult.count} assets to ${access_type}`,
      responseResult,
    );
    res.status(200).json(resDoc);

    const assetIds = [];
    const subCategoryIds = [];
    const categoryIds = [];
    for (const a of affectedAssets || []) {
      if (a.id) assetIds.push(a.id);
      if (a.sub_category_id) subCategoryIds.push(a.sub_category_id);
      const catId = a.sub_category?.category_id;
      if (catId) categoryIds.push(catId);
    }

    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds,
        subCategoryIds,
        categoryIds,
      }),
    });
  });

  getAssets = catchError(async (req, res, next) => {
    const assets = await assetService.getAssets();
    const resDoc = responseHandler(
      200,
      "Assets retrieved successfully",
      assets,
    );
    res.status(200).json(resDoc);
  });

  getAssetsByPagination = catchError(async (req, res, next) => {
    const { page, limit, order, search, access_type } = req.query;
    const assets = await assetService.getAssetsByPagination({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      order,
      search,
      access_type,
    });
    const resDoc = responseHandler(
      200,
      "Assets retrieved successfully",
      assets,
    );
    res.status(200).json(resDoc);
  });

  getAsset = catchError(async (req, res, next) => {
    const { id } = req.params;

    // Validate that ID is numeric
    if (!/^\d+$/.test(id)) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const asset = await assetService.getAsset(id);

    if (!asset) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const resDoc = responseHandler(200, "Asset retrieved successfully", asset);
    res.status(200).json(resDoc);
  });

  deleteAsset = catchError(async (req, res, next) => {
    const { id } = req.params;

    // Validate that ID is numeric
    if (!/^\d+$/.test(id)) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const existing = await prisma.asset
      .findUnique({
        where: { id: parseInt(id) },
        select: {
          id: true,
          sub_category_id: true,
          sub_category: {
            select: { id: true, category_id: true },
          },
        },
      })
      .catch(() => null);

    await assetService.deleteAsset(id);
    const resDoc = responseHandler(200, "Asset deleted successfully");
    res.status(200).json(resDoc);

    const subCatId = existing?.sub_category_id || existing?.sub_category?.id;
    const catId = existing?.sub_category?.category_id;

    revalidateFrontend({
      tags: buildCatalogTags({
        assetIds: id,
        subCategoryIds: subCatId,
        categoryIds: catId,
      }),
    });
  });

  /**
   * Get content type based on file extension
   */
  getContentType(fileType) {
    const contentTypes = {
      ".skp": "application/octet-stream",
      ".zip": "application/zip",
      ".png": "image/png",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
    };
    return contentTypes[fileType] || "application/octet-stream";
  }

  /**
   * Download asset file with streaming support and resume capability
   * Conditional Patreon gating for paid assets
   * GET /api/assets/:id/download
   */
  downloadAsset = catchError(async (req, res, next) => {
    const { id } = req.params;

    // Validate that ID is numeric
    if (!/^\d+$/.test(id)) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "Asset not found",
      });
    }

    const fileInfo = await assetService.downloadAsset(id);

    // Conditional Patreon Gating: If asset is marked as paid, enforce active patron status
    if (fileInfo.accessType === "paid") {
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else if (req.query.token) {
        token = req.query.token;
      }

      if (!token) {
        return res.status(401).json({
          status: "error",
          code: 401,
          message:
            "No token provided. Please login with Patreon to download this paid asset.",
        });
      }

      try {
        const decoded = jwt.verify(token, config.jwt_secret);
        const user = await prisma.patreonUser.findUnique({
          where: { id: decoded.id },
        });

        if (!user) {
          return res.status(401).json({
            status: "error",
            code: 401,
            message: "User not found. Please login with Patreon.",
          });
        }

        if (!user.is_active_patron) {
          return res.status(403).json({
            status: "error",
            code: 403,
            message:
              "Your Patreon subscription is not active. Please subscribe to unlock paid assets.",
          });
        }

        req.user = {
          id: user.id,
          patreonId: user.patreon_id,
          membershipTier: user.membership_tier,
          isActivePatron: user.is_active_patron,
        };
      } catch (authError) {
        if (authError.name === "JsonWebTokenError") {
          return res.status(401).json({
            status: "error",
            code: 401,
            message: "Invalid Patreon token.",
          });
        }
        if (authError.name === "TokenExpiredError") {
          return res.status(401).json({
            status: "error",
            code: 401,
            message: "Token expired. Please login again.",
          });
        }
        return res.status(500).json({
          status: "error",
          code: 500,
          message: "Patreon authentication failed.",
        });
      }
    }

    // Construct full file path
    const fullPath = path.join(process.cwd(), "uploads", fileInfo.filePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        statusCode: 404,
        status: "error",
        message: "File not found on server",
      });
    }

    // Get file stats
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    // Parse range header for resume support
    const range = req.headers.range;

    if (range) {
      // Handle range request (resume download)
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const fileStream = fs.createReadStream(fullPath, { start, end });

      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, Content-Length, Content-Type, Content-Range",
      );
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": this.getContentType(fileInfo.fileType),
        "Content-Disposition": `attachment; filename="${fileInfo.fileName}"`,
      });

      fileStream.pipe(res);
    } else {
      // Handle full file download
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, Content-Length, Content-Type",
      );
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": this.getContentType(fileInfo.fileType),
        "Content-Disposition": `attachment; filename="${fileInfo.fileName}"`,
        "Accept-Ranges": "bytes",
      });

      const fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(res);
    }
  });
}

export default new AssetController();
