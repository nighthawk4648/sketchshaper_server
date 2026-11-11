import fs from "fs";
import path from "path";
import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import { PRIVATE_CONTACT_DIR } from "../../middlewares/uploads/contactUpload.mjs";
import contactService from "./contact.service.mjs";
import {
  EMAIL_PATTERN,
  PHONE_PATTERN,
  VALID_STATUSES,
  VALID_SERVICE_TYPES,
  toOptionalString,
  normalizeReferenceUrl,
} from "./contact.validation.mjs";

const sendClientError = (res, message) =>
  res.status(400).json({ status: "error", code: 400, message });

const cleanupUploadedFile = async (req) => {
  if (req?.file?.path) {
    try {
      await fs.promises.unlink(req.file.path);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }
};

class ContactController {
  createContactMessage = catchError(async (req, res) => {
    // 1. Honeypot Bot Trap: If hidden "website" field is filled, silently discard
    if (req.body.website && String(req.body.website).trim() !== "") {
      await cleanupUploadedFile(req);
      // Return 201 so bots believe their spam was accepted
      return res
        .status(201)
        .json(responseHandler(201, "Message sent successfully.", { id: 0 }));
    }

    // 2. Validate Required Core Fields
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!name || name.length > 100) {
      await cleanupUploadedFile(req);
      return sendClientError(
        res,
        "Name is required and must be 100 characters or fewer.",
      );
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      await cleanupUploadedFile(req);
      return sendClientError(res, "Please provide a valid email address.");
    }
    if (!message || message.length > 5000) {
      await cleanupUploadedFile(req);
      return sendClientError(
        res,
        "Message is required and must be 5,000 characters or fewer.",
      );
    }

    // 3. Validate Optional Contact & Scope Fields
    const phone = toOptionalString(req.body.phone, 30);
    if (phone && !PHONE_PATTERN.test(phone)) {
      await cleanupUploadedFile(req);
      return sendClientError(
        res,
        "Please provide a valid phone or WhatsApp number.",
      );
    }

    const rawServiceType = toOptionalString(req.body.service_type, 30);
    let service_type = null;
    if (rawServiceType) {
      if (!VALID_SERVICE_TYPES.includes(rawServiceType)) {
        await cleanupUploadedFile(req);
        return sendClientError(res, "Invalid service type category.");
      }
      service_type = rawServiceType;
    }

    const service_scope = toOptionalString(req.body.service_scope, 150);
    const custom_scope = toOptionalString(req.body.custom_scope, 255);

    // 4. Validate and Normalize Reference URL (Google Drive, Dropbox, etc.)
    const rawRefUrl = toOptionalString(req.body.reference_url, 2048);
    const reference_url = normalizeReferenceUrl(rawRefUrl);
    if (rawRefUrl && !reference_url) {
      await cleanupUploadedFile(req);
      return sendClientError(
        res,
        "Please enter a valid cloud link (e.g. https://drive.google.com/...).",
      );
    }

    // 5. Attachment Metadata from Multer
    let attachment_file = null;
    let attachment_name = null;
    let attachment_mime = null;
    let attachment_size = null;

    if (req.file) {
      attachment_file = req.file.filename;
      attachment_name = path.basename(req.file.originalname).slice(0, 255);
      attachment_mime = req.file.mimetype ? req.file.mimetype.slice(0, 100) : null;
      attachment_size = req.file.size;
    }

    try {
      const contactMessage = await contactService.createContactMessage({
        name,
        email,
        phone,
        service_type,
        service_scope,
        custom_scope,
        reference_url,
        attachment_file,
        attachment_name,
        attachment_mime,
        attachment_size,
        message,
      });

      res
        .status(201)
        .json(
          responseHandler(201, "Message sent successfully.", {
            id: contactMessage.id,
            created_at: contactMessage.created_at,
          }),
        );
    } catch (dbError) {
      await cleanupUploadedFile(req);
      throw dbError;
    }
  });

  getContactMessages = catchError(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const status = req.query.status;
    const serviceTypeQuery = req.query.service_type;

    if (page < 1 || (status && !VALID_STATUSES.includes(status))) {
      return sendClientError(res, "Invalid page or status filter.");
    }

    let service_type = undefined;
    if (serviceTypeQuery) {
      if (!VALID_SERVICE_TYPES.includes(serviceTypeQuery) && serviceTypeQuery !== "null") {
        return sendClientError(res, "Invalid service type filter.");
      }
      service_type = serviceTypeQuery === "null" ? null : serviceTypeQuery;
    }

    const messages = await contactService.getContactMessages({
      page,
      limit,
      status,
      service_type,
    });
    res
      .status(200)
      .json(
        responseHandler(
          200,
          "Contact messages retrieved successfully.",
          messages,
        ),
      );
  });

  getContactMessage = catchError(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1)
      return sendClientError(res, "Invalid message ID.");

    const message = await contactService.getContactMessage(id);
    if (!message) {
      return res
        .status(404)
        .json({
          status: "error",
          code: 404,
          message: "Contact message not found.",
        });
    }
    res
      .status(200)
      .json(
        responseHandler(
          200,
          "Contact message retrieved successfully.",
          message,
        ),
      );
  });

  downloadAttachment = catchError(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return sendClientError(res, "Invalid message ID.");
    }

    const message = await contactService.getContactMessage(id);
    if (!message || !message.attachment_file) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "No attachment found for this message.",
      });
    }

    // Path traversal safety: strip directory components
    const safeFileName = path.basename(message.attachment_file);
    const filePath = path.join(PRIVATE_CONTACT_DIR, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Attachment file missing from storage.",
      });
    }

    const isInline =
      req.query.inline === "1" &&
      (message.attachment_mime?.startsWith("image/") ||
        message.attachment_mime === "application/pdf");

    const originalName = message.attachment_name || safeFileName;
    // ASCII fallback + RFC 5987 UTF-8 filename for non-ASCII names
    const asciiName = originalName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_");
    const disposition = `${isInline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;

    res.setHeader(
      "Content-Type",
      message.attachment_mime || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", disposition);

    res.sendFile(filePath);
  });

  updateContactMessageStatus = catchError(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const status = req.body.status;
    if (!Number.isInteger(id) || id < 1 || !VALID_STATUSES.includes(status)) {
      return sendClientError(
        res,
        "Provide a valid message ID and status (NEW, READ, or ARCHIVED).",
      );
    }

    const message = await contactService.getContactMessage(id);
    if (!message) {
      return res
        .status(404)
        .json({
          status: "error",
          code: 404,
          message: "Contact message not found.",
        });
    }

    const updatedMessage = await contactService.updateContactMessageStatus(
      id,
      status,
    );
    res
      .status(200)
      .json(
        responseHandler(
          200,
          "Contact message status updated successfully.",
          updatedMessage,
        ),
      );
  });

  deleteContactMessage = catchError(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1)
      return sendClientError(res, "Invalid message ID.");

    const message = await contactService.getContactMessage(id);
    if (!message) {
      return res
        .status(404)
        .json({
          status: "error",
          code: 404,
          message: "Contact message not found.",
        });
    }

    const deleted = await contactService.deleteContactMessage(id);

    // If an attachment existed, unlink from private storage
    if (deleted?.attachment_file) {
      const safeFileName = path.basename(deleted.attachment_file);
      const filePath = path.join(PRIVATE_CONTACT_DIR, safeFileName);
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        // Ignore if file was already deleted
      }
    }

    res
      .status(200)
      .json(responseHandler(200, "Contact message deleted successfully."));
  });
}

export default new ContactController();
