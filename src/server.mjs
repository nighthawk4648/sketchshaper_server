import express from "express";

// Internal Imports
import cors from "cors";
import morgan from "morgan";
import { config } from "./config/config.mjs";
import { corsPolicy } from "./middlewares/corsPolicy.mjs";
import globalErrorHandler from "./middlewares/errors/globalErrorHandler.mjs";
import indexRouter from "./routes/api/index.mjs";
import { checkRevalidateConfig } from "./utils/revalidate.mjs";

// Fix for BigInt serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cors(corsPolicy));
app.use(morgan("dev"));

// Disable caching for API responses to prevent 304 Not Modified issues
app.use("/api", (req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
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
app.use("/api/uploads", express.static("uploads"));

// Error Handler
app.use(globalErrorHandler);

app.listen(config.port, () => {
  console.log(
    `Server is running in ${config.mode} mode at http://${config.host}:${config.port}`,
  );
  checkRevalidateConfig();
});
