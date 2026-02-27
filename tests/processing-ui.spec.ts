import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";

test("processing UI: compact header always visible, steps collapsed by default", async ({
  page,
  request,
}, testInfo) => {
  const baseURL = (testInfo.project.use as any).baseURL as string;

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

  // Override window.fetch in the page to add a 2-second delay on the chat stream request.
  // This keeps the "thinking" state visible long enough to interact with the toggle UI —
  // without page.route (which can trigger "already handled" errors with SSE + retries).
  await page.evaluate(() => {
    const origFetch = window.fetch.bind(window);
    (window as any).__savedFetch = origFetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes("/api/chat/stream")) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      return origFetch(input, init);
    };
  });

  // Pre-register observer for thinking-label BEFORE clicking send.
  // waitForSelector uses MutationObserver internally — catches even transient appearances.
  const thinkingObserved = page.waitForSelector('[data-testid="thinking-label"]', {
    state: "visible",
    timeout: 15_000,
  });

  // Use a simple (non-"complex") query — verifies even simple queries show the step header
  await page.getByTestId("input-chat").fill("Who owns the search project?");
  await page.getByTestId("button-send").click();

  // Wait for thinking state (pre-registered before click)
  await thinkingObserved;

  // 2-second fetch delay means thinking state lasts at least 2s — enough to verify UI
  const thinkingLabel = page.getByTestId("thinking-label");
  const stepsList = page.getByTestId("processing-steps-list");
  const toggle = page.getByTestId("processing-steps-toggle");

  // Step 1: thinking-label visible
  await expect(thinkingLabel).toBeVisible({ timeout: 2_000 });
  await expect(thinkingLabel).toContainText("Searching knowledge base");

  // Step 2: step list NOT visible (collapsed by default)
  await expect(stepsList).not.toBeVisible();

  // Step 3: toggle button present
  await expect(toggle).toBeVisible({ timeout: 2_000 });

  await expect
    .poll(async () => ((await thinkingLabel.textContent()) || "").trim(), { timeout: 15_000 })
    .toMatch(/Searching knowledge base|Retrieving evidence|Drafting response|Validating citations|Completed/);

  // Step 4: click toggle to expand
  await toggle.click();
  await expect(stepsList).toBeVisible({ timeout: 2_000 });

  // Step 5: step list contains the first step
  await expect(stepsList).toContainText("Searching knowledge base");

  await captureScreenshot(page, "processing-ui.png");

  // Step 6: collapse again
  await toggle.click();
  await expect(stepsList).not.toBeVisible();

  // Restore the original fetch so the response can complete
  await page.evaluate(() => {
    if ((window as any).__savedFetch) {
      window.fetch = (window as any).__savedFetch;
    }
  });

  // Wait for response to finish rendering
  await page.waitForTimeout(12_000);
});

test("processing UI: trivial greetings do not show step toggle", async ({
  page,
  request,
}, testInfo) => {
  const baseURL = (testInfo.project.use as any).baseURL as string;

  const seedResp = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResp.status());

  await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });

  await page.goto("/chat");
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "New Chat" }).first().click();
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("input-chat").fill("Hello!");
  await page.getByTestId("button-send").click();

  // Wait briefly for thinking bubble to potentially appear
  await page.waitForTimeout(2_000);

  // For trivial prompts, tasks=[] so the toggle button should not be visible
  const toggle = page.getByTestId("processing-steps-toggle");
  await expect(toggle).not.toBeVisible();
});
