import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfigRaw from "../vite.config";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  console.log("[Vite] Starting Vite setup...");
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  console.log("[Vite] Resolving Vite config...");
  // Resolve vite config if it's a function
  let viteConfig: any;
  try {
    viteConfig = typeof viteConfigRaw === 'function'
      ? await (viteConfigRaw as any)({ command: "serve", mode: "development" })
      : viteConfigRaw;
    console.log("[Vite] Vite config resolved successfully");
  } catch (err) {
    console.error("[Vite] Error resolving vite config:", err);
    throw err;
  }

  console.log("[Vite] Creating Vite server instance...");
  let vite;
  try {
    vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
    });
    console.log("[Vite] Vite server instance created");
  } catch (err) {
    console.error("[Vite] Error creating Vite server:", err);
    throw err;
  }

  console.log("[Vite] Vite server created, setting up middleware...");
  app.use(vite.middlewares);

  console.log("[Vite] Setting up catch-all route handler...");
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
  console.log("[Vite] Vite setup complete");
}
