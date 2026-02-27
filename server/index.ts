import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes_v2";
import { serveStatic } from "./static";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import { startJobRunner } from "./lib/jobs/runner";
import "./lib/jobs/handlers";

// EVAL_MODE Startup Guard: Prevent strict grounding in production runtime
// EVAL_MODE should ONLY be set for evaluation/test scenarios
if (process.env.EVAL_MODE === '1') {
  if (process.env.NODE_ENV === 'production') {
    console.error("CRITICAL: EVAL_MODE=1 is set in production environment.");
    console.error("This causes strict grounding that drops all unverified items.");
    console.error("EVAL_MODE should ONLY be used for evaluation scenarios.");
    process.exit(1);
  } else {
    console.warn("⚠️  EVAL_MODE=1 detected. Running in strict grounding mode for evaluation.");
    console.warn("⚠️  Items without valid citations will be dropped.");
  }
}

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(helmet({
  // CSP disabled in dev (Vite HMR conflicts); enabled with defaults in prod
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  // Allow Vite to load cross-origin scripts in dev
  crossOriginEmbedderPolicy: process.env.NODE_ENV === "production",
}));

app.use(cookieParser());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Prevent unhandled rejections/exceptions from crashing the server during tests
process.on("unhandledRejection", (reason, p) => {
  console.error("[unhandledRejection]", reason, p);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure DB is initialized before using storage in routes
  console.log("[STARTUP] Initializing database connection...");
  const { getDb } = await import("./db");
  await getDb();
  console.log("[STARTUP] Database connection ready");

  // Log DB target for debugging (no password)
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    console.log(`[db] host=${u.hostname} port=${u.port || 5432} db=${u.pathname.slice(1)} user=${u.username}`);
  } catch { console.log(`[db] target=<parse-error or not set>`); }

  console.log("[STARTUP] Registering routes...");
  await registerRoutes(httpServer, app);
  console.log("[STARTUP] Routes registered");

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    console.log("[STARTUP] Setting up Vite dev server...");
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    console.log("[STARTUP] Vite dev server ready");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const PORT = process.env.PORT ?? "5000";
  // On Windows, default to 127.0.0.1 to avoid ENOTSUP error with 0.0.0.0
  // On other platforms, 0.0.0.0 is fine
  const HOST = process.env.HOST ?? (process.platform === "win32" ? "127.0.0.1" : "0.0.0.0");
  httpServer.listen(parseInt(PORT, 10), HOST, () => {
    log(`[routes] apiMounted=true`);
    log(`serving on port ${PORT}`);

    // Log Google OAuth configuration for debugging
    const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
    const maskedClientId = googleClientId.length > 12
      ? `${googleClientId.substring(0, 6)}...${googleClientId.substring(googleClientId.length - 6)}`
      : "NOT_SET";

    const googleBaseUrl = process.env.GOOGLE_PUBLIC_BASE_URL
      || process.env.PUBLIC_BASE_URL
      || `http://localhost:${PORT}`;
    const googleRedirectUri = `${googleBaseUrl}/api/oauth/google/callback`;

    log(`[oauth:google] client_id=${maskedClientId}`);
    log(`[oauth:google] redirect_uri=${googleRedirectUri}`);
    log(`[oauth:google] scopes=drive.readonly,userinfo.email,userinfo.profile`);
    log(`[oauth:google] access_type=offline prompt=consent`);

    // Log DATABASE_URL for debugging (redact credentials)
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        const parsedUrl = new URL(dbUrl);
        log(`[db] DATABASE_URL=${parsedUrl.hostname}:${parsedUrl.port || 5432}${parsedUrl.pathname}`);
      } catch {
        log(`[db] DATABASE_URL=<invalid URL format>`);
      }
    } else {
      log(`[db] DATABASE_URL=not set (using SQLite fallback)`);
    }

    if (process.env.PROOF_MODE === "1") {
      log("Job runner skipped in PROOF_MODE");
    } else {
      startJobRunner();
      log("Job runner started");
    }

    // Add a clear visual indicator that the server is ready
    console.log("");
    console.log("🚀 Server running at http://localhost:" + PORT);
    console.log("");
  });
})();