const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const OUT_DIR = process.env.PERF_OUT_DIR
  ? path.join(process.cwd(), process.env.PERF_OUT_DIR)
  : path.join(process.cwd(), "playwright-artifacts", "perf-before");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const metrics = {};
  const consoleLogs = [];

  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  async function step(name, fn) {
    const t0 = Date.now();
    await fn();
    metrics[name] = Date.now() - t0;
  }

  try {
    await step("1_login", async () => {
      const loginResp = await context.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: "admin@fieldcopilot.com", password: "admin123" },
      });
      if (loginResp.status() !== 200) {
        throw new Error(`Login failed: ${loginResp.status()}`);
      }
      const rawSetCookie = loginResp.headers()["set-cookie"] || "";
      const session = /session=([^;]+)/.exec(rawSetCookie)?.[1];
      const csrf = /_csrf=([^;]+)/.exec(rawSetCookie)?.[1];
      if (!session || !csrf) {
        throw new Error("Missing session or csrf cookie from login response");
      }
      await context.addCookies([
        { name: "session", value: session, url: BASE_URL, httpOnly: true, sameSite: "Lax" },
        { name: "_csrf", value: csrf, url: BASE_URL, httpOnly: false, sameSite: "Lax" },
      ]);

      await page.goto("/chat", { timeout: 30000 });
      await page.getByTestId("input-chat").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(OUT_DIR, "01-chat-home.png"), fullPage: true });
    });

    let conversationId = "";
    await step("2_open_chat_and_list", async () => {
      const listResp = await context.request.get(`${BASE_URL}/api/conversations`);
      if (listResp.status() !== 200) throw new Error(`List conversations failed ${listResp.status()}`);
      const conversations = await listResp.json();
      if (!Array.isArray(conversations) || conversations.length === 0) {
        throw new Error("No conversations available for baseline run");
      }
      conversationId = String(conversations[0].id || "");
      if (!conversationId) throw new Error("No conversationId in URL");
      await page.goto(`/chat/${conversationId}`, { timeout: 30000 });
      await page.getByTestId("input-chat").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(OUT_DIR, "02-chat-open.png"), fullPage: true });
    });

    await step("3_switch_tabs_10x", async () => {
      await page.goto("/admin/observability", { timeout: 30000 });
      await page.getByRole("tab", { name: "Chat" }).waitFor({ timeout: 30000 });
      const tabs = ["Chat", "Retrieval", "Citations", "Sync"];
      for (let i = 0; i < 10; i++) {
        await page.getByRole("tab", { name: tabs[i % tabs.length] }).click();
      }
      await page.screenshot({ path: path.join(OUT_DIR, "03-tabs-switch.png"), fullPage: true });
    });

    await step("4_send_hi", async () => {
      await page.goto(`/chat/${conversationId}`, { timeout: 30000 });
      await page.getByTestId("input-chat").fill("Hi");
      await page.getByTestId("button-send").click();
      await page.locator('[data-testid="assistant-message"][data-status="done"]').last().waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(OUT_DIR, "04-hi-response.png"), fullPage: true });
    });

    await step("5_send_rag_blockers", async () => {
      await page.getByTestId("input-chat").fill("What are the current blockers?");
      await page.getByTestId("button-send").click();
      await page.locator('[data-testid="assistant-message"][data-status="done"]').last().waitFor({ timeout: 60000 });
      await page.screenshot({ path: path.join(OUT_DIR, "05-rag-response.png"), fullPage: true });
    });

    await step("6_navigate_admin_and_back", async () => {
      await page.goto("/admin/chats", { timeout: 30000 });
      await page.getByRole("heading", { name: "Chat Quality" }).first().waitFor({ timeout: 30000 });
      await page.goto(`/chat/${conversationId}`, { timeout: 30000 });
      await page.getByTestId("input-chat").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(OUT_DIR, "06-nav-back.png"), fullPage: true });
    });

    await step("7_delete_chat", async () => {
      const firstRow = page.locator('[class*="group flex items-center"]').first();
      await firstRow.hover();
      await firstRow.getByRole("button").click();
      await page.getByRole("button", { name: "Delete" }).click();
      await page.getByTestId("input-chat").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(OUT_DIR, "07-delete-chat.png"), fullPage: true });
    });

    fs.writeFileSync(path.join(OUT_DIR, "baseline-metrics.json"), JSON.stringify(metrics, null, 2), "utf8");
    fs.writeFileSync(path.join(OUT_DIR, "baseline-console.log"), consoleLogs.join("\n"), "utf8");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
