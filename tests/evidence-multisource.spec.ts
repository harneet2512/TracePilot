import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";

test("evidence multi-source: Q2 has >=2 unique sources and no duplicates", async ({
  page,
  request,
}, testInfo) => {
  const baseURL = (testInfo.project.use as any).baseURL as string;

  // Seed and login
  const seedResp = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResp.status());

  const loginResp = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResp.status()).toBe(200);

  await page.goto("/chat");
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "New Chat" }).first().click();
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });

  // Send exact Q2 query.
  const streamDone = page.waitForResponse(
    (r) =>
      r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByTestId("input-chat").fill(
    "Are there any blockers for the AI search launch?"
  );
  await page.getByTestId("button-send").click();
  await streamDone;

  await page.waitForTimeout(25_000);

  await captureScreenshot(page, "q2.png");

  const convListResp = await page.request.get(`${baseURL}/api/conversations`);
  expect(convListResp.status()).toBe(200);
  const conversations = await convListResp.json();
  const latestConversationId = conversations?.[0]?.id;
  expect(latestConversationId, "Expected a conversation id after chat").toBeTruthy();

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${latestConversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const sources: any[] = latestAssistant?.metadataJson?.response?.sources || [];
  const sourceIds = sources.map((s: any) => s.sourceId || s.id).filter(Boolean);
  const uniqueIds = new Set(sourceIds);
  const titles = sources.map((s: any) => String(s.title || s.label || ""));

  expect(uniqueIds.size, "Q2 should cite at least 2 unique sources").toBeGreaterThanOrEqual(2);
  expect(
    uniqueIds.size,
    `sources[] must not contain duplicates. Got: [${sourceIds.join(", ")}]`
  ).toBe(sourceIds.length);
  expect(
    titles.some((t) => t.includes("Engineering_AllHands_Oct28_2024")),
    `Expected source title containing Engineering_AllHands_Oct28_2024; got [${titles.join(" | ")}]`
  ).toBe(true);
  expect(
    titles.some((t) => t.includes("JIRA_INFRA-1247")),
    `Expected source title containing JIRA_INFRA-1247; got [${titles.join(" | ")}]`
  ).toBe(true);

  const assistantCard = page.locator('[class*="bg-card"]').last();
  await expect(assistantCard).toBeVisible({ timeout: 25_000 });
});
