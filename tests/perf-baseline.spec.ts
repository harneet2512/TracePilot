import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "perf-before");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("collect baseline performance and reliability timings", async ({ page, request }, testInfo) => {
  test.setTimeout(600_000);
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  const metrics: Record<string, number> = {};
  const consoleLogs: string[] = [];

  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  const mark = async (name: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    await fn();
    metrics[name] = Date.now() - t0;
  };

  await mark("1_login", async () => {
    await page.goto("/login");
    await page.getByTestId("input-email").fill("admin@fieldcopilot.com");
    await page.getByTestId("input-password").fill("admin123");
    await page.getByTestId("button-login").click();
    await page.waitForURL(/\/chat/, { timeout: 20_000 });
    await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-chat-home.png"), fullPage: true });
  });

  let conversationId = "";
  await mark("2_open_chat_list_and_conversation", async () => {
    await page.getByRole("button", { name: "New Chat" }).first().click();
    await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/chat\/[^/]+/, { timeout: 20_000 });
    conversationId = page.url().match(/\/chat\/([^/?#]+)/)?.[1] || "";
    expect(conversationId).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/chat/${conversationId}`));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-chat-open.png"), fullPage: true });
  });

  await mark("3_switch_tabs_10x", async () => {
    await page.goto("/admin/observability");
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible({ timeout: 20_000 });
    const tabs = ["Chat", "Retrieval", "Citations", "Sync"];
    for (let i = 0; i < 10; i++) {
      const name = tabs[i % tabs.length];
      await page.getByRole("tab", { name }).click();
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "03-tabs-switch.png"), fullPage: true });
  });

  await mark("4_send_hi", async () => {
    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("input-chat").fill("Hi");
    await page.getByTestId("button-send").click();
    await expect(page.getByTestId("assistant-message").last()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="assistant-message"][data-status="done"]').last()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "04-hi-response.png"), fullPage: true });
  });

  await mark("5_send_rag_blockers", async () => {
    await page.getByTestId("input-chat").fill("What are the current blockers?");
    await page.getByTestId("button-send").click();
    await expect(page.locator('[data-testid="assistant-message"][data-status="done"]').last()).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "05-rag-response.png"), fullPage: true });
  });

  await mark("6_navigate_admin_and_back", async () => {
    await page.goto("/admin/chats");
    await expect(page.getByText("Chat Quality")).toBeVisible({ timeout: 20_000 });
    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "06-nav-back.png"), fullPage: true });
  });

  await mark("7_delete_chat", async () => {
    const row = page.locator('[class*="group flex items-center"]').first();
    await row.hover();
    await row.getByRole("button").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "07-delete-chat.png"), fullPage: true });
  });

  fs.writeFileSync(path.join(ARTIFACT_DIR, "baseline-metrics.json"), JSON.stringify(metrics, null, 2), "utf8");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "baseline-console.log"), consoleLogs.join("\n"), "utf8");
});
