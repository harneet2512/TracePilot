import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use async config to avoid top-level await
export default defineConfig(async () => {
  console.log("[Vite Config] Starting Vite config resolution...");
  // Replit dev plugins (only in dev + Replit environment)
  // Skip entirely if not in Replit to avoid hanging on import
  const replitPlugins = [];
  const isReplit = process.env.REPL_ID !== undefined && process.env.REPL_SLUG !== undefined;

  if (process.env.NODE_ENV !== "production" && isReplit) {
    try {
      console.log("[Vite Config] Loading Replit plugins...");
      const cartographer = await import("@replit/vite-plugin-cartographer");
      const devBanner = await import("@replit/vite-plugin-dev-banner");
      replitPlugins.push(cartographer.cartographer(), devBanner.devBanner());
      console.log("[Vite Config] Replit plugins loaded");
    } catch (err) {
      console.log("[Vite Config] Replit plugins not available, skipping");
    }
  }

  const config = {
    plugins: [
      react(),
      runtimeErrorOverlay(),
      ...replitPlugins,
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
        "@config": path.resolve(__dirname, "config"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
        allow: [
          path.resolve(__dirname, "client"),
          path.resolve(__dirname, "shared"),
          path.resolve(__dirname, "config"),
        ],
      },
    },
  };
  console.log("[Vite Config] Vite config resolved");
  return config;
});
