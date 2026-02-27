/**
 * Security smoke tests — verifies deployment hardening is effective.
 *
 * These tests run against the live server (started by playwright.config.ts webServer)
 * and check that:
 *   1. Admin API routes require authentication
 *   2. Debug endpoints are gated (404 in production, 401/403 in dev)
 *   3. File upload size limit is enforced
 */
import { test, expect } from "@playwright/test";

const DEBUG_ROUTES = [
  "/api/debug/oauth/reset/google",
  "/api/debug/oauth/reset/google/account/test-id",
  "/api/debug/scope/test-id/summary",
  "/api/debug/retrieval/alignment",
  "/api/debug/retrieval/diagnose?q=test",
  "/api/debug/oauth/google/accounts",
  "/api/debug/oauth/google/account/test-id",
  "/api/debug/google/drive/ping/test-id",
  "/api/debug/google/drive/list/test-id",
];

const ADMIN_ROUTES = [
  { method: "GET",    path: "/api/connectors" },
  { method: "GET",    path: "/api/admin/users" },
  { method: "GET",    path: "/api/admin/chats" },
  { method: "GET",    path: "/api/admin/eval-suites" },
  { method: "GET",    path: "/api/sources" },
];

// ─── Test 1: Unauthenticated admin route access ──────────────────────────────

test("security: unauthenticated requests to admin routes are blocked", async ({ request }) => {
  for (const route of ADMIN_ROUTES) {
    const res = route.method === "POST"
      ? await request.post(route.path, { data: {} })
      : await request.get(route.path);

    expect(
      [401, 403],
      `Expected 401 or 403 for ${route.method} ${route.path}, got ${res.status()}`
    ).toContain(res.status());
  }
});

// ─── Test 2: Debug endpoint gate ─────────────────────────────────────────────

test("security: debug endpoints return 401, 403, or 404 without a valid session", async ({ request }) => {
  const isProduction = process.env.NODE_ENV === "production";

  for (const route of DEBUG_ROUTES) {
    const method = route.startsWith("/api/debug/oauth/reset") ? "POST" : "GET";
    const res = method === "POST"
      ? await request.post(route, { data: {} })
      : await request.get(route);

    const status = res.status();

    if (isProduction) {
      // Production: prod guard fires first → 404
      expect(
        status,
        `Expected 404 for ${method} ${route} in production, got ${status}`
      ).toBe(404);
    } else {
      // Dev: either 401/403 from auth middleware, or 404 from prod guard if somehow active
      expect(
        [401, 403, 404],
        `Expected 401/403/404 for ${method} ${route} in dev, got ${status}`
      ).toContain(status);
    }
  }
});

// ─── Test 3: Upload size limit (55 MB file → 413) ────────────────────────────

test("security: upload endpoint rejects files over 50 MB", async ({ request }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;

  // Seed admin and log in
  const seedRes = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedRes.status());

  const loginRes = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginRes.status(), "Admin login should succeed").toBe(200);

  // Build a 55 MB buffer
  const FIFTY_FIVE_MB = 55 * 1024 * 1024;
  const bigContent = Buffer.alloc(FIFTY_FIVE_MB, "A");

  const uploadRes = await request.post(`${baseURL}/api/ingest`, {
    multipart: {
      files: {
        name: "huge.txt",
        mimeType: "text/plain",
        buffer: bigContent,
      },
    },
  });

  expect(
    uploadRes.status(),
    `Expected 413 for oversized upload, got ${uploadRes.status()}`
  ).toBe(413);
});
