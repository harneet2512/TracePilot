
import "dotenv/config";
import { apiRequest } from "../client/src/lib/queryClient";
// import fetch from "node-fetch"; // Use global fetch

// Mock auth middleware or use a seeded user if possible.
// Actually, since we are in a script, we can hit the API directly if we can auth or bypass.
// For verification proof, we can import the handlers directly? No, request/response objects needed.
// Easiest is to curl localhost:5000 if running.
// If not running, we can import server/app but need to listen.

import express from "express";
import { registerRoutes } from "../server/routes";
// import { setupAuth } from "../server/auth";
import { db } from "../server/db";

import { storage } from "../server/storage";
import { workspaces } from "../shared/schema";

async function main() {
    // Seed data
    const existing = await storage.getUserByEmail("admin@obs.com");
    let user = existing;
    if (!existing) {
        const [ws] = await db.insert(workspaces).values({ name: "ObsWorkspace" }).returning();
        user = await storage.createUser({
            workspaceId: ws.id,
            email: "admin@obs.com",
            role: "admin",
            passwordHash: "mock",
        });
    }

    // We will start the server momentarily to curl it
    const app = express();
    app.use(express.json());

    // Mock user for auth bypass in this script
    app.use((req, res, next) => {
        // @ts-ignore
        req.user = user;
        // @ts-ignore
        req.isAuthenticated = () => true;
        next();
    });

    const { createServer } = await import("http");
    const dummyServer = createServer(app);
    const server = await registerRoutes(dummyServer, app);
    const PORT = 5050; // Use different port

    const httpServer = app.listen(PORT, async () => {
        console.log(`Test server running on ${PORT}`);

        try {
            // Hit Chat Endpoint to generate a trace
            console.log("\n\n=== Hitting /api/chat to generate trace ===");
            try {
                await fetch(`http://localhost:${PORT}/api/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Hello observability", conversationHistory: [] })
                });
            } catch (e) {
                console.log("Chat hit failed (expected if mock keys), but trace should be created.");
            }

            const endpoints = [
                "/api/admin/observability/chat",
                "/api/admin/observability/retrieval",
                "/api/admin/observability/citations",
                "/api/admin/observability/sync"
            ];

            for (const ep of endpoints) {
                console.log(`\n\n=== Fetching ${ep} ===`);
                const res = await fetch(`http://localhost:${PORT}${ep}`);
                const json = await res.json();
                console.log(JSON.stringify(json, null, 2));
            }
        } catch (e) {
            console.error(e);
        } finally {
            httpServer.close();
            process.exit(0);
        }
    });
}

main();
