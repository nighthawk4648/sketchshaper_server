import express from "express";

// Internal Imports
import cors from "cors";
import morgan from "morgan";
import { config } from "./config/config.mjs";
import { corsPolicy } from "./middlewares/corsPolicy.mjs";
import globalErrorHandler from "./middlewares/errors/globalErrorHandler.mjs";
import indexRouter from "./routes/api/index.mjs";
import { publicUploads, cacheControlFor, NO_STORE } from "./middlewares/uploads/publicUploads.mjs";
import { checkRevalidateConfig } from "./utils/revalidate.mjs";
import { keepWebhookBody } from "./modules/polar/polar.webhook.mjs";
import { softNotFound } from "./middlewares/softNotFound.mjs";

// Fix for BigInt serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// Middleware
app.use(express.json({ limit: "50mb", verify: keepWebhookBody }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cors(corsPolicy));
app.use(morgan("dev"));
app.use(softNotFound);

// Disable caching for API responses to prevent 304 Not Modified issues
app.use("/api", (req, res, next) => {
  const cacheControl = cacheControlFor(req.baseUrl + req.path);
  res.set("Cache-Control", cacheControl);
  if (cacheControl === NO_STORE) {
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

// Root route
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "SketchShaper Backend API is running successfully 🚀",
    version: "1.0.0",
  });
});

// Routes
app.use("/api", indexRouter);
app.use("/api/uploads", publicUploads);

// Error Handler
app.use(globalErrorHandler);

app.listen(config.port, () => {
  console.log(
    `Server is running in ${config.mode} mode at http://${config.host}:${config.port}`,
  );
  checkRevalidateConfig();
});
