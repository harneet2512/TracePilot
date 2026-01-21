import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes_v2";
import { serveStatic } from "./static";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import { startJobRunner } from "./lib/jobs/runner";
import "./lib/jobs/handlers";

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(cookieParser());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

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
  await registerRoutes(httpServer, app);

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
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
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

    startJobRunner();
    log("Job runner started");
  });
})();
