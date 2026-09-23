import { prisma } from "../../db/prisma.mjs";
import isArrayElementExist from "../../utils/isArrayElementExist.mjs";
import chunkUploadHelper from "../../utils/chunkUploadHelper.mjs";
import fs from "fs";
import path from "path";

/**
 * Convert BigInt values to strings for JSON serialization
 */
function convertBigIntToString(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  if (Array.isArray(obj)) return obj.map(convertBigIntToString);
  if (typeof obj === "object") {
    const converted = {};
    for (const key in obj) {
      converted[key] = convertBigIntToString(obj[key]);
    }
    return converted;
  }
  return obj;
}

class AssetService {
  /**
   * Initialize a new upload session for an existing asset
   */
  async initializeUpload(payload) {
    const { assetId, totalChunks, totalSize, originalFilename } = payload;

    // Validate asset ID is provided
    if (!assetId) {
      throw new Error(
        "Asset ID is required. Please create the asset first via POST /api/assets",
      );
    }

    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: parseInt(assetId) },
    });

    if (!asset) {
      throw new Error(`Asset with ID ${assetId} does not exist`);
    }

    // Validate file type
    if (!chunkUploadHelper.isValidFileType(originalFilename)) {
      throw new Error(
        "Invalid file type. Allowed types: .skp, .zip, .png, .jpeg, .jpg",
      );
    }

    const finalAssetId = parseInt(assetId);

    // Generate upload session ID
    const uploadSessionId = chunkUploadHelper.generateSessionId();
    const fileType = chunkUploadHelper.getFileExtension(originalFilename);

    // Create AssetFile record to track the upload
    await prisma.assetFile.upsert({
      where: { asset_id: finalAssetId },
      update: {
        upload_session_id: uploadSessionId,
        upload_status: "pending",
        upload_progress: 0,
        uploaded_chunks: 0,
        total_chunks: parseInt(totalChunks),
        file_type: fileType,
        file_size: BigInt(totalSize),
      },
      create: {
        asset_id: finalAssetId,
        upload_session_id: uploadSessionId,
        upload_status: "pending",
        upload_progress: 0,
        uploaded_chunks: 0,
        total_chunks: parseInt(totalChunks),
        file_type: fileType,
        file_size: BigInt(totalSize),
        main_file: "",
      },
    });

    // Auto-update Asset.size from the browser-reported total file size
    await prisma.asset.update({
      where: { id: finalAssetId },
      data: { size: chunkUploadHelper.formatBytes(parseInt(totalSize)) },
    });

    return {
      assetId: finalAssetId,
      uploadSessionId,
      fileType,
      totalChunks: parseInt(totalChunks),
      totalSize: parseInt(totalSize),
      message: "Upload session initialized",
    };
  }

  /**
   * Upload a single chunk
   */
  async uploadChunk(payload) {
    const { uploadSessionId, chunkIndex, chunkData } = payload;

    // Check if chunk already exists (for resume functionality)
    const chunkExists = await chunkUploadHelper.chunkExists(
      uploadSessionId,
      parseInt(chunkIndex),
    );
    if (chunkExists) {
      return {
        message: "Chunk already uploaded",
        chunkIndex: parseInt(chunkIndex),
      };
    }

    // Save the chunk
    await chunkUploadHelper.saveChunk(
      uploadSessionId,
      parseInt(chunkIndex),
      chunkData,
    );

    return {
      message: "Chunk uploaded successfully",
      chunkIndex: parseInt(chunkIndex),
    };
  }

  /**
   * Complete the upload by merging all chunks
   */
  async completeUpload(payload) {
    const { uploadSessionId, assetId, totalChunks, originalFilename } = payload;

    let finalAssetId = assetId;
    let totalChunksInt = parseInt(totalChunks) || 0;

    // If assetId not provided, try to find it from existing AssetFile with same uploadSessionId
    if (!assetId || totalChunksInt === 0) {
      const existingFile = await prisma.assetFile.findUnique({
        where: { upload_session_id: uploadSessionId },
      });

      if (existingFile) {
        finalAssetId = existingFile.asset_id;
        // Use totalChunks from AssetFile if not provided
        if (totalChunksInt === 0) {
          totalChunksInt = existingFile.total_chunks;
        }
      } else {
        throw new Error("Asset ID is required or upload session not found");
      }
    }

    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: parseInt(finalAssetId) },
    });

    if (!asset) {
      throw new Error(`Asset with ID ${finalAssetId} does not exist`);
    }

    const mergedFile = await chunkUploadHelper.mergeChunks(
      uploadSessionId,
      totalChunksInt,
      originalFilename,
    );

    const fileType = chunkUploadHelper.getFileExtension(originalFilename);
    const fileSizeInt = parseInt(mergedFile.size || 0) || 0;
    const assetIdInt = parseInt(finalAssetId);

    // Create or update AssetFile record
    const assetFile = await prisma.assetFile.upsert({
      where: { asset_id: assetIdInt },
      update: {
        main_file: mergedFile.relativePath,
        file_type: fileType,
        file_size: BigInt(fileSizeInt),
        upload_status: "completed",
        upload_progress: 100,
        uploaded_chunks: totalChunksInt,
        total_chunks: totalChunksInt,
        upload_session_id: uploadSessionId,
      },
      create: {
        main_file: mergedFile.relativePath,
        file_type: fileType,
        file_size: BigInt(fileSizeInt),
        upload_status: "completed",
        upload_progress: 100,
        uploaded_chunks: totalChunksInt,
        total_chunks: totalChunksInt,
        upload_session_id: uploadSessionId,
        asset: {
          connect: { id: assetIdInt },
        },
      },
    });

    // Auto-update Asset.size with the actual on-disk merged file size (ground truth)
    await prisma.asset.update({
      where: { id: assetIdInt },
      data: { size: chunkUploadHelper.formatBytes(fileSizeInt) },
    });

    // Convert BigInt to string for JSON serialization
    const fileResponse = {
      ...assetFile,
      file_size: assetFile.file_size.toString(),
    };

    return {
      message: "File upload completed successfully",
      file: fileResponse,
    };
  }

  /**
   * Get upload status
   */
  async getUploadStatus(uploadSessionId) {
    // Get list of uploaded chunks
    const uploadedChunksList =
      await chunkUploadHelper.getUploadedChunks(uploadSessionId);

    return {
      uploadSessionId,
      uploadedChunksList,
      message: "Upload status retrieved",
    };
  }

  /**
   * Update asset preview image
   */
  async updatePreviewImage(id, payload) {
    const images = {};
    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        images[file.fieldname] = file.filename;
      });
    }

    const asset = await prisma.asset.update({
      where: { id: parseInt(id) },
      data: {
        cover: images.cover || payload.cover,
      },
    });

    return asset;
  }

  /**
   * Cancel upload
   */
  async cancelUpload(uploadSessionId) {
    // Clean up chunks
    await chunkUploadHelper.cleanupSession(uploadSessionId);

    return { message: "Upload cancelled successfully" };
  }

  async createAsset(payload) {
    const cover = {};
    const images = [];
    const uploadSessionIds = [];

    // Extract upload session IDs from payload
    Object.keys(payload).forEach((key) => {
      if (key.startsWith("uploadSessionIds[")) {
        uploadSessionIds.push(payload[key]);
        delete payload[key];
      }
    });

    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        if (file.fieldname === "cover") {
          cover[file.fieldname] = file.filename;
        } else {
          images.push({
            image: file.filename,
          });
        }
      });
    }

    delete payload.files;

    // create asset
    const asset = await prisma.asset.create({
      data: {
        ...payload,
        ...cover,
        size: payload.size || "", // default to "" if not provided (auto-set later by upload)
        access_type: payload.access_type || "free",
        sub_category_id: parseInt(payload.sub_category_id),
      },
    });

    // create asset images
    const assetImages = images.map((image) => ({
      image: image.image,
      asset_id: asset.id,
    }));

    if (assetImages.length > 0) {
      await prisma.assetImage.createMany({
        data: assetImages,
      });
    }

    // Link uploaded files to the asset
    if (uploadSessionIds.length > 0) {
      for (const uploadSessionId of uploadSessionIds) {
        await prisma.assetFile.update({
          where: { upload_session_id: uploadSessionId },
          data: { asset_id: asset.id },
        });
      }
    }

    // Return asset with file info
    return await prisma.asset.findUnique({
      where: { id: asset.id },
      include: {
        sub_category: true,
        images: true,
        file: true,
      },
    });
  }

  async updateAsset(id, payload) {
    const cover = {};
    const images = [];
    const uploadSessionIds = [];

    // Extract upload session IDs from payload
    Object.keys(payload).forEach((key) => {
      if (key.startsWith("uploadSessionIds[")) {
        uploadSessionIds.push(payload[key]);
        delete payload[key];
      }
    });

    if (isArrayElementExist(payload.files)) {
      payload.files.forEach((file) => {
        if (file.fieldname === "cover") {
          cover[file.fieldname] = file.filename;
        } else {
          images.push({
            image: file.filename,
          });
        }
      });
    }

    const assetId = parseInt(id);

    await prisma.asset.update({
      where: {
        id: assetId,
      },
      data: {
        name: payload.name,
        resolution: payload.resolution,
        size: payload.size,
        download_link: payload.download_link,
        short_description: payload.short_description,
        sub_category_id: parseInt(payload.sub_category_id),
        access_type: payload.access_type || undefined,
        meta_title: payload.meta_title,
        meta_description: payload.meta_description,
        ...cover,
      },
    });

    // Delete additional images that were removed in the UI before saving
    const removedImageIds = Array.isArray(payload.removedImageIds)
      ? payload.removedImageIds.filter((n) => !isNaN(n))
      : [];

    if (removedImageIds.length > 0) {
      const imagesToDelete = await prisma.assetImage.findMany({
        where: { id: { in: removedImageIds } },
      });
      for (const img of imagesToDelete) {
        const imgPath = path.join(process.cwd(), "uploads", img.image);
        try {
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        } catch (e) {
          console.error("Error deleting asset image from disk:", e);
        }
      }
      await prisma.assetImage.deleteMany({
        where: { id: { in: removedImageIds } },
      });
    }

    // Delete the existing 3D model file if the user removed it before saving
    if (payload.delete_file === "true") {
      const assetFile = await prisma.assetFile.findUnique({
        where: { asset_id: assetId },
      });
      if (assetFile?.main_file) {
        const filePath = path.join(
          process.cwd(),
          "uploads",
          assetFile.main_file,
        );
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.error("Error deleting 3D file from disk:", e);
        }
      }
      if (assetFile) {
        await prisma.assetFile.delete({ where: { asset_id: assetId } });
      }
    }

    const assetImages = images.map((image) => ({
      image: image.image,
      asset_id: assetId,
    }));

    if (assetImages.length > 0) {
      await prisma.assetImage.createMany({
        data: assetImages,
      });
    }

    // Link uploaded files to the asset
    if (uploadSessionIds.length > 0) {
      for (const uploadSessionId of uploadSessionIds) {
        await prisma.assetFile.update({
          where: { upload_session_id: uploadSessionId },
          data: { asset_id: assetId },
        });
      }
    }

    // Return updated asset with file info
    return await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        sub_category: true,
        images: true,
        file: true,
      },
    });
  }

  async getAssets() {
    // const assets = await Asset.find().populate('sub_category');
    const assets = await prisma.asset.findMany({
      include: {
        sub_category: true,
        images: true,
        file: true,
      },
      orderBy: {
        id: "desc",
      },
    });
    return convertBigIntToString(assets);
  }

  async getAssetsByPagination({
    page = 1,
    limit = 10,
    order = "desc",
    search = "",
    access_type = "",
  }) {
    const where = {};

    if (search && search.trim() !== "") {
      where.name = {
        contains: search.trim(),
      };
    }

    if (access_type && access_type !== "all" && access_type.trim() !== "") {
      where.access_type = access_type.trim();
    }

    const assetsPromise = prisma.asset.findMany({
      where,
      include: {
        sub_category: true,
        images: true,
        file: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        id: order === "asc" ? "asc" : "desc",
      },
    });

    const countPromise = prisma.asset.count({ where });

    const [assets, total] = await Promise.all([assetsPromise, countPromise]);

    const totalPage = Math.ceil(total / limit);
    const currentPage = page;

    return {
      result: convertBigIntToString(assets),
      pagination: {
        total,
        totalPage,
        currentPage,
      },
    };
  }

  async updateAssetAccessType(id, access_type) {
    const assetId = parseInt(id);
    const updated = await prisma.asset.update({
      where: { id: assetId },
      data: { access_type },
      include: {
        sub_category: true,
        images: true,
        file: true,
      },
    });
    return convertBigIntToString(updated);
  }

  async bulkUpdateAssetAccessType(ids, access_type) {
    const numericIds = ids.map((id) => parseInt(id)).filter((id) => !isNaN(id));
    const result = await prisma.asset.updateMany({
      where: {
        id: { in: numericIds },
      },
      data: {
        access_type,
      },
    });
    return result;
  }

  async getAsset(id) {
    // const asset = await Asset.findById(id).populate('sub_category');
    const asset = await prisma.asset.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        sub_category: {
          include: {
            category: true,
          },
        },
        images: true,
        file: true,
      },
    });
    return convertBigIntToString(asset);
  }

  async deleteAsset(id) {
    const assetId = parseInt(id);

    // Get asset with file info
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { file: true },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }

    // Delete the actual file from disk if it exists
    if (asset.file && asset.file.main_file) {
      const filePath = path.join(
        process.cwd(),
        "uploads",
        asset.file.main_file,
      );
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error("Error deleting file from disk:", error);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete cover image if it exists
    if (asset.cover) {
      const coverPath = path.join(process.cwd(), "uploads", asset.cover);
      try {
        if (fs.existsSync(coverPath)) {
          fs.unlinkSync(coverPath);
        }
      } catch (error) {
        console.error("Error deleting cover image from disk:", error);
      }
    }

    // Delete from database (this will cascade delete related AssetFile and AssetImage records)
    await prisma.asset.delete({
      where: { id: assetId },
    });
  }

  /**
   * Download asset file
   */
  async downloadAsset(id) {
    const asset = await prisma.asset.findUnique({
      where: { id: parseInt(id) },
      include: { file: true },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }

    if (!asset.file || !asset.file.main_file) {
      throw new Error("No file available for download");
    }

    // Extract the actual filename from the stored path
    const mainFile = asset.file.main_file;
    const actualFilename = mainFile.includes("/")
      ? mainFile.split("/").pop()
      : mainFile;

    return {
      assetId: asset.id,
      assetName: asset.name,
      accessType: asset.access_type,
      filePath: asset.file.main_file,
      fileName: actualFilename,
      fileType: asset.file.file_type || "",
    };
  }
}

export default new AssetService();
