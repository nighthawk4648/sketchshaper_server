import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import assetService from "./asset.service.mjs";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { config } from "../../config/config.mjs";
import { prisma } from "../../db/prisma.mjs";

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
  });

  createAsset = catchError(async (req, res, next) => {
    const asset = await assetService.createAsset({
      ...req.body,
      files: req.files,
    });
    const resDoc = responseHandler(201, "Asset created successfully", asset);
    res.status(201).json(resDoc);
  });

  updateAsset = catchError(async (req, res, next) => {
    const { id } = req.params;

    // Validate that ID is numeric
    if (!/^\d+$/.test(id)) {
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
      delete_file,
    } = req.body;

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
      if (key.startsWith("removedImageIds[") || key.startsWith("removedImageIds")) {
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
      delete_file,
      removedImageIds,
      files: req.files,
    });
    const resDoc = responseHandler(200, "Asset updated successfully", asset);
    res.status(200).json(resDoc);
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

    const result = await assetService.bulkUpdateAssetAccessType(
      ids,
      access_type,
    );
    const resDoc = responseHandler(
      200,
      `Updated ${result.count} assets to ${access_type}`,
      result,
    );
    res.status(200).json(resDoc);
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

    await assetService.deleteAsset(id);
    const resDoc = responseHandler(200, "Asset deleted successfully");
    res.status(200).json(resDoc);
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
