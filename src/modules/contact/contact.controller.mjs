import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import contactService from "./contact.service.mjs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ["NEW", "READ", "ARCHIVED"];

const sendClientError = (res, message) =>
  res.status(400).json({ status: "error", code: 400, message });

class ContactController {
  createContactMessage = catchError(async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!name || name.length > 100) {
      return sendClientError(
        res,
        "Name is required and must be 100 characters or fewer.",
      );
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return sendClientError(res, "Please provide a valid email address.");
    }
    if (!message || message.length > 5000) {
      return sendClientError(
        res,
        "Message is required and must be 5,000 characters or fewer.",
      );
    }

    const contactMessage = await contactService.createContactMessage({
      name,
      email,
      message,
    });
    res
      .status(201)
      .json(responseHandler(201, "Message sent successfully.", contactMessage));
  });

  getContactMessages = catchError(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const status = req.query.status;

    if (page < 1 || (status && !VALID_STATUSES.includes(status))) {
      return sendClientError(res, "Invalid page or status filter.");
    }

    const messages = await contactService.getContactMessages({
      page,
      limit,
      status,
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

    await contactService.deleteContactMessage(id);
    res
      .status(200)
      .json(responseHandler(200, "Contact message deleted successfully."));
  });
}

export default new ContactController();
