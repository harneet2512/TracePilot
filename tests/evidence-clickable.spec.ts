import { test, expect } from "@playwright/test";
import { loginAndGetCsrf } from "./helpers/auth";

test.describe("Evidence cards clickability", () => {

  test("each evidence entry has a valid URL", async ({ request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    const csrf = await loginAndGetCsrf(request, baseURL);

    const convResp = await request.post(`${baseURL}/api/conversations`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
    });
    expect(convResp.status()).toBe(200);
    const conv = await convResp.json();

    const chatResp = await request.post(`${baseURL}/api/chat`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
      data: { message: "Are there any blockers for the AI search launch?", conversationId: conv.id },
      timeout: 120_000,
    });
    expect(chatResp.status()).toBe(200);
    const data = await chatResp.json();

    const evidenceBySource = data.details?.evidenceBySource || [];
    expect(evidenceBySource.length, "Should have at least 1 evidence source").toBeGreaterThanOrEqual(1);

    for (const ev of evidenceBySource) {
      expect(ev.url, `Evidence '${ev.title}' must have a non-empty URL`).toBeTruthy();
      const isValidUrl = ev.url.startsWith("http") || ev.url.startsWith("/api/sources/");
      expect(isValidUrl, `Evidence URL must be http or /api/sources/ fallback, got: ${ev.url}`).toBe(true);
    }

    // Verify each evidence entry has a title
    for (const ev of evidenceBySource) {
      expect(ev.title, "Evidence must have a title").toBeTruthy();
      expect(ev.title).not.toBe("Untitled");
    }
  });
});
