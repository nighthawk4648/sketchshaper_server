import express from "express";

// Internal Imports
import cors from "cors";
import morgan from "morgan";
import { config } from "./config/config.mjs";
import globalErrorHandler from "./middlewares/errors/globalErrorHandler.mjs";
import indexRouter from "./routes/api/index.mjs";

// Fix for BigInt serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// CORS configuration - allow multiple origins
const allowedOrigins =
  config.mode === "dev"
    ? "*"
    : [
        config.frontend_url,
        "https://admin.sketchshaper.com",
        "https://sketchshaper.com",
        "https://www.sketchshaper.com",
        "http://localhost:5173", // For local development
        "http://localhost:3000", // For local development
      ].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins === "*") {
        callback(null, true);
      } else if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Log the rejected origin for debugging
        console.warn(`CORS rejected origin: ${origin}`);
        console.warn(`Allowed origins: ${JSON.stringify(allowedOrigins)}`);
        // In production, still allow the request but log it
        callback(null, true);
      }
    },
    credentials: true,
  }),
);
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
});
