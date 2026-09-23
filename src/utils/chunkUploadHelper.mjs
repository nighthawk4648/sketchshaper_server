import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const rename = promisify(fs.rename);

class ChunkUploadHelper {
  constructor() {
    this.tempDir = path.join(process.cwd(), "uploads", "temp");
    this.finalDir = path.join(process.cwd(), "uploads", "sketchshaper-pro");
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await mkdir(this.tempDir, { recursive: true });
      await mkdir(this.finalDir, { recursive: true });
    } catch (error) {
      console.error("Error creating directories:", error);
    }
  }

  /**
   * Generate a unique upload session ID
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Get the temporary directory path for a specific upload session
   */
  getSessionDir(sessionId) {
    return path.join(this.tempDir, sessionId);
  }

  /**
   * Get the chunk file path
   */
  getChunkPath(sessionId, chunkIndex) {
    return path.join(this.getSessionDir(sessionId), `chunk_${chunkIndex}`);
  }

  /**
   * Save a chunk to the temporary directory
   */
  async saveChunk(sessionId, chunkIndex, chunkData) {
    const sessionDir = this.getSessionDir(sessionId);
    await mkdir(sessionDir, { recursive: true });

    const chunkPath = this.getChunkPath(sessionId, chunkIndex);
    await writeFile(chunkPath, chunkData);

    return chunkPath;
  }

  /**
   * Check if a chunk already exists
   */
  async chunkExists(sessionId, chunkIndex) {
    const chunkPath = this.getChunkPath(sessionId, chunkIndex);
    try {
      await stat(chunkPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of uploaded chunks for a session
   */
  async getUploadedChunks(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    try {
      const files = await readdir(sessionDir);
      const chunks = files
        .filter((file) => file.startsWith("chunk_"))
        .map((file) => parseInt(file.split("_")[1]))
        .sort((a, b) => a - b);
      return chunks;
    } catch (error) {
      return [];
    }
  }

  /**
   * Merge all chunks into a single file
   */
  async mergeChunks(sessionId, totalChunks, originalFilename) {
    const safeFilename = path
      .basename(originalFilename || "model.skp")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalFilename = `${Date.now()}-${safeFilename}`;
    const finalPath = path.join(this.finalDir, finalFilename);

    // Create write stream for the final file
    const writeStream = fs.createWriteStream(finalPath);

    return new Promise(async (resolve, reject) => {
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = this.getChunkPath(sessionId, i);

          // Check if chunk exists
          try {
            await stat(chunkPath);
          } catch (error) {
            throw new Error(`Missing chunk ${i}`);
          }

          // Read chunk data
          const chunkData = fs.readFileSync(chunkPath);

          // Write chunk and handle backpressure
          const canContinue = writeStream.write(chunkData);
          if (!canContinue) {
            // Wait for drain event before continuing to prevent data loss
            await new Promise((resolveDrain) =>
              writeStream.once("drain", resolveDrain),
            );
          }
        }

        writeStream.end();
        writeStream.on("finish", async () => {
          // Get the actual file size
          const fileStats = await stat(finalPath);

          // Clean up temporary chunks
          await this.cleanupSession(sessionId);
          resolve({
            filename: finalFilename,
            path: finalPath,
            relativePath: `sketchshaper-pro/${finalFilename}`,
            size: fileStats.size,
          });
        });

        writeStream.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clean up temporary chunks for a session
   */
  async cleanupSession(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    try {
      const files = await readdir(sessionDir);
      await Promise.all(
        files.map((file) => unlink(path.join(sessionDir, file))),
      );
      fs.rmdirSync(sessionDir);
    } catch (error) {
      console.error("Error cleaning up session:", error);
    }
  }

  /**
   * Calculate file size from chunks
   */
  async calculateTotalSize(sessionId, totalChunks) {
    let totalSize = 0;
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = this.getChunkPath(sessionId, i);
      try {
        const stats = await stat(chunkPath);
        totalSize += stats.size;
      } catch (error) {
        // Chunk doesn't exist yet
      }
    }
    return totalSize;
  }

  /**
   * Format bytes to human readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Validate file type
   */
  isValidFileType(filename) {
    const allowedExtensions = [".skp", ".zip", ".png", ".jpeg", ".jpg"];
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  /**
   * Get file extension
   */
  getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }
}

export default new ChunkUploadHelper();
