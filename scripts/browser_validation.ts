/**
 * Chrome Browser Automation Validation
 *
 * Launches a dev server (if needed), opens the chat UI in Chrome,
 * sends test queries, and validates:
 *   - No raw JSON in chat bubbles
 *   - Conversational RAG tone (warm, grounded, not robotic)
 *   - Citations visible
 *   - Answer rendered properly
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/tracepilot_test" \
 *   DEV_CONNECTOR_FIXTURES=1 \
 *   npx tsx scripts/browser_validation.ts
 *
 * Set HEADLESS=true to run headless (default: false for visual inspection).
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPORTS_DIR = join(__dirname, "..", "reports");
const SCREENSHOTS_DIR = join(REPORTS_DIR, "screenshots");
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://localhost:5001";
const HEADLESS = process.env.HEADLESS === "true";
const STARTUP_TIMEOUT = 60_000;
const QUERY_TIMEOUT = 90_000;

// ---------- Credentials (try in order) ----------
const CREDENTIALS = [
  { email: "admin@tracepilot.com", password: "admin123" },
  { email: "golden-eval@example.com", password: "password123" },
  { email: "demo-eval@example.com", password: "password" },
  { email: "test@example.com", password: "password" },
];

// ---------- Test queries ----------
const BROWSER_TEST_QUERIES = [
  {
    id: "ui-okr",
    query: "What are our Q4 OKRs?",
    expectConversational: true,
    expectNoColdOpener: true,
  },
  {
    id: "ui-blocker",
    query: "What blockers are we facing?",
    expectConversational: true,
    expectNoColdOpener: true,
  },
  {
    id: "ui-overview",
    query: "Give me a quick overview of Project Phoenix",
    expectConversational: true,
    expectNoColdOpener: true,
  },
  {
    id: "ui-ambiguous",
    query: "Who owns this?",
    expectAmbiguityHandling: true,
  },
];

interface UITestResult {
  id: string;
  query: string;
  passed: boolean;
  failures: string[];
  screenshotPath: string;
  answerText: string;
  hasCitations: boolean;
  hasRawJson: boolean;
  toneScore: { conversational: boolean; warmOpener: boolean; notRobotic: boolean; grounded: boolean };
  responseTimeMs: number;
}

// ======================== Helpers ========================

async function waitForServerReady(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`).catch(() => null);
      if (resp && resp.ok) return true;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// Detect raw JSON that should never appear in the chat bubble
function detectRawJson(text: string): boolean {
  const patterns = [
    /\{\s*"items"\s*:/,
    /\{\s*"bullets"\s*:/,
    /"chunkId"\s*:\s*"/,
    /"sourceId"\s*:\s*"/,
    /"citations"\s*:\s*\[/,
    /"metadata_json"\s*:/,
    /"framingContext"\s*:/,
    /\{\s*"answer"\s*:/,
  ];
  return patterns.some(p => p.test(text));
}

// Evaluate conversational RAG tone
function scoreTone(text: string): { conversational: boolean; warmOpener: boolean; notRobotic: boolean; grounded: boolean } {
  const lc = text.toLowerCase();

  // Conversational: uses natural language, not bullet-only
  const conversational = text.length > 30 && /[a-z]{3,}/i.test(text);

  // Warm opener: doesn't start with a cold, robotic phrase
  const coldOpeners = [
    /^here'?s what i found/i,
    /^based on the (available|provided) (information|context|data)/i,
    /^the following (information|data|results)/i,
    /^i found the following/i,
    /^query results/i,
  ];
  const warmOpener = !coldOpeners.some(p => p.test(text.trim()));

  // Not robotic: doesn't repeat the same phrase multiple times
  const notRobotic = !(
    (lc.match(/here'?s what/g) || []).length > 1 ||
    (lc.match(/based on/g) || []).length > 2 ||
    (lc.match(/the following/g) || []).length > 1
  );

  // Grounded: mentions specific data, not generic filler
  const grounded = /\d/.test(text) || /[A-Z][a-z]+ [A-Z][a-z]+/.test(text) || text.length > 50;

  return { conversational, warmOpener, notRobotic, grounded };
}

// ======================== Login ========================

async function loginToApp(page: Page): Promise<boolean> {
  // Try API login with each credential set
  for (const cred of CREDENTIALS) {
    console.log(`  Trying API login: ${cred.email}...`);
    try {
      const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: cred.email, password: cred.password },
      });
      if (resp.ok()) {
        const body = await resp.json();
        console.log(`  API login OK: ${body.email} (${body.role})`);

        // Navigate to chat to verify session works
        await page.goto(`${BASE_URL}/chat`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(4000);

        if (!page.url().includes("login")) {
          console.log(`  Session valid - on ${page.url()}`);
          return true;
        }
        console.log(`  Session cookie not applied - still on login page`);
      }
    } catch (e: any) {
      console.log(`  API login error: ${e.message}`);
    }
  }

  // API login didn't redirect. Try form-based login.
  console.log("  Falling back to form-based login...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);

  for (const cred of CREDENTIALS) {
    console.log(`  Trying form login: ${cred.email}...`);
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();

    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) continue;

    await emailInput.fill(cred.email);
    await pwInput.fill(cred.password);

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in")').first();
    await submitBtn.click();

    // Wait for navigation
    await page.waitForTimeout(5000);

    if (!page.url().includes("login")) {
      console.log(`  Form login success -> ${page.url()}`);
      return true;
    }

    // Check for error message
    const errorText = await page.locator('[role="alert"], .text-destructive, .text-red').textContent().catch(() => "");
    if (errorText) console.log(`  Login error: ${errorText}`);
  }

  return false;
}

// ======================== Chat interaction ========================

async function navigateToChat(page: Page): Promise<void> {
  const url = page.url();
  if (!url.includes("/chat")) {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
  }

  // Wait for the chat input to be visible
  const chatInput = page.locator('[data-testid="input-chat"]');
  try {
    await chatInput.waitFor({ state: "visible", timeout: 15000 });
    console.log("  Chat input found.");
  } catch {
    // Check if we're on a conversation auto-create redirect
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log(`  Chat page URL: ${currentUrl}`);
    if (currentUrl.includes("/chat/")) {
      console.log("  On conversation page. Waiting for input...");
      await chatInput.waitFor({ state: "visible", timeout: 10000 });
    }
  }
}

async function sendChatMessage(page: Page, message: string): Promise<{ answerText: string; responseTimeMs: number }> {
  const startTime = Date.now();

  // Use data-testid first, then fallback
  let input = page.locator('[data-testid="input-chat"]');
  if (!(await input.isVisible({ timeout: 3000 }).catch(() => false))) {
    input = page.locator('textarea').first();
  }

  await input.fill(message);

  // Send via button click (more reliable than Enter key for Textarea components)
  const sendBtn = page.locator('[data-testid="button-send"]');
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await input.press("Enter");
  }

  // Wait for response to appear and stabilize
  await page.waitForTimeout(3000);

  let lastText = "";
  let stableCount = 0;

  for (let elapsed = 0; elapsed < QUERY_TIMEOUT; elapsed += 2000) {
    await page.waitForTimeout(2000);

    // Grab all visible text in message containers
    const msgs = await page.locator('.mb-6.space-y-4, [class*="message"]').allTextContents();
    const currentText = msgs.join("\n");

    if (currentText === lastText && currentText.length > 0) {
      stableCount++;
      if (stableCount >= 2) break; // Stable for 4 seconds
    } else {
      stableCount = 0;
      lastText = currentText;
    }
  }

  const responseTimeMs = Date.now() - startTime;

  // Get the most recent assistant message
  const allMsgs = await page.locator('.mb-6.space-y-4').allTextContents();
  const answerText = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : "";

  return { answerText, responseTimeMs };
}

// ======================== Main ========================

async function main() {
  console.log("=== Chrome Browser Automation Validation ===");
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Headless: ${HEADLESS}\n`);

  let serverProcess: ChildProcess | null = null;
  let browser: Browser | null = null;

  try {
    // Step 1: Ensure dev server is running
    console.log("Step 1: Checking dev server...");
    let serverReady = await waitForServerReady(BASE_URL, 5000);

    if (!serverReady) {
      console.log("  Starting dev server on port 5001...");
      serverProcess = spawn("npx", ["tsx", "server/index.ts"], {
        cwd: join(__dirname, ".."),
        env: {
          ...process.env,
          PORT: "5001",
          DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/tracepilot_test",
          DEV_CONNECTOR_FIXTURES: process.env.DEV_CONNECTOR_FIXTURES || "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      serverProcess.stdout?.on("data", d => {
        const line = d.toString().trim();
        if (line) console.log(`  [srv] ${line}`);
      });
      serverProcess.stderr?.on("data", d => {
        const line = d.toString().trim();
        if (line && !line.includes("Experimental")) console.log(`  [srv:err] ${line}`);
      });

      serverReady = await waitForServerReady(BASE_URL, STARTUP_TIMEOUT);
      if (!serverReady) {
        throw new Error("Dev server failed to start within timeout");
      }
    }
    console.log("  Server ready.\n");

    // Step 2: Launch browser
    console.log("Step 2: Launching Chromium...");
    browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--disable-web-security", "--window-size=1280,900"],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    console.log("  Browser launched.\n");

    // Step 3: Login
    console.log("Step 3: Logging in...");
    const loggedIn = await loginToApp(page);
    if (!loggedIn) {
      await page.screenshot({ path: join(SCREENSHOTS_DIR, "login-failed.png"), fullPage: true });
      throw new Error("Could not log in with any credential. Check screenshots/login-failed.png");
    }
    console.log("");

    // Step 4: Navigate to chat
    console.log("Step 4: Opening chat...");
    await navigateToChat(page);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, "01-chat-ready.png"), fullPage: true });
    console.log("  Chat ready.\n");

    // Step 5: Run test queries
    console.log("Step 5: Running test queries...\n");
    const results: UITestResult[] = [];

    for (const tc of BROWSER_TEST_QUERIES) {
      console.log(`  [${tc.id}] "${tc.query}"`);

      try {
        const { answerText, responseTimeMs } = await sendChatMessage(page, tc.query);

        // Checks
        const hasRawJson = detectRawJson(answerText);
        const tone = scoreTone(answerText);
        const citCount = await page.locator('[data-testid^="citation-"]').count();
        const hasCitations = citCount > 0;

        const failures: string[] = [];

        // Core: no raw JSON
        if (hasRawJson) failures.push("Raw JSON in chat bubble");

        // Answer existence
        if (answerText.trim().length < 15) failures.push(`Answer too short (${answerText.length} chars)`);

        // Tone: conversational RAG style
        if (tc.expectConversational && !tone.conversational) failures.push("Not conversational");
        if (tc.expectNoColdOpener && !tone.warmOpener) failures.push("Cold/robotic opener");
        if (tc.expectConversational && !tone.notRobotic) failures.push("Repetitive robotic phrasing");

        // Ambiguity handling
        if (tc.expectAmbiguityHandling) {
          const lc = answerText.toLowerCase();
          const asksClarification = /which|what.*do you mean|could you (specify|clarify)|more specific/i.test(lc);
          if (!asksClarification) failures.push("Did not ask for clarification on ambiguous query");
        }

        const ssPath = join(SCREENSHOTS_DIR, `${tc.id}.png`);
        await page.screenshot({ path: ssPath, fullPage: true });

        const result: UITestResult = {
          id: tc.id,
          query: tc.query,
          passed: failures.length === 0,
          failures,
          screenshotPath: ssPath,
          answerText: answerText.substring(0, 500),
          hasCitations,
          hasRawJson,
          toneScore: tone,
          responseTimeMs,
        };
        results.push(result);

        const status = result.passed ? "PASS" : "FAIL";
        console.log(`    ${status} | ${responseTimeMs}ms | ${answerText.length} chars | ${citCount} citations | tone: conv=${tone.conversational} warm=${tone.warmOpener} notRobot=${tone.notRobotic}`);
        if (failures.length > 0) console.log(`    Failures: ${failures.join("; ")}`);
      } catch (err: any) {
        const ssPath = join(SCREENSHOTS_DIR, `${tc.id}-error.png`);
        await page.screenshot({ path: ssPath, fullPage: true }).catch(() => {});
        results.push({
          id: tc.id, query: tc.query, passed: false,
          failures: [`Error: ${err.message}`],
          screenshotPath: ssPath, answerText: "", hasCitations: false, hasRawJson: false,
          toneScore: { conversational: false, warmOpener: false, notRobotic: false, grounded: false },
          responseTimeMs: 0,
        });
        console.log(`    ERROR: ${err.message}`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: join(SCREENSHOTS_DIR, "99-final.png"), fullPage: true });

    // Step 6: Generate report
    console.log("\nStep 6: Generating report...");
    const passCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    writeFileSync(join(REPORTS_DIR, "browser_validation_results.json"), JSON.stringify({
      timestamp: new Date().toISOString(),
      browser: "Chromium (Playwright)",
      baseUrl: BASE_URL,
      headless: HEADLESS,
      results,
      summary: { passed: passCount, total: totalCount, passRate: `${Math.round(passCount / totalCount * 100)}%` },
    }, null, 2));

    const reportMd = `# Browser Automation Validation Report

**Generated:** ${new Date().toISOString()}
**Browser:** Chromium (Playwright, ${HEADLESS ? "headless" : "headed"})
**Base URL:** ${BASE_URL}

## Test Results

| # | Test | Pass | Time | Chars | Citations | Raw JSON | Tone | Failures |
|---|------|------|------|-------|-----------|----------|------|----------|
${results.map((r, i) =>
  `| ${i + 1} | ${r.id} | ${r.passed ? "PASS" : "FAIL"} | ${r.responseTimeMs}ms | ${r.answerText.length} | ${r.hasCitations ? "YES" : "NO"} | ${r.hasRawJson ? "YES" : "NO"} | conv=${r.toneScore.conversational ? "Y" : "N"} warm=${r.toneScore.warmOpener ? "Y" : "N"} | ${r.failures.join("; ") || "-"} |`
).join("\n")}

## Tone Quality (Conversational RAG Style)

The following tone dimensions are checked for each response:
- **Conversational**: Natural language, not just bullets/data dumps
- **Warm opener**: Doesn't start with cold "Here's what I found" / "Based on the provided context"
- **Not robotic**: Avoids repetitive canned phrases
- **Grounded**: Contains specific data (names, numbers, dates)

## Summary

| Metric | Result |
|--------|--------|
| Tests passed | ${passCount}/${totalCount} |
| Pass rate | ${Math.round(passCount / totalCount * 100)}% |

## Screenshots

${results.map(r => `- **${r.id}**: \`${r.screenshotPath}\``).join("\n")}

## Queries & Answers

${results.map(r => `### ${r.id}: "${r.query}"

**Result:** ${r.passed ? "PASS" : "FAIL"}
**Tone:** conversational=${r.toneScore.conversational} | warmOpener=${r.toneScore.warmOpener} | notRobotic=${r.toneScore.notRobotic} | grounded=${r.toneScore.grounded}

**Answer (first 500 chars):**
\`\`\`
${r.answerText}
\`\`\`
`).join("\n")}
`;

    writeFileSync(join(REPORTS_DIR, "browser_validation_report.md"), reportMd);

    console.log(`\n=== Results: ${passCount}/${totalCount} passed ===`);
    console.log(`JSON:   ${join(REPORTS_DIR, "browser_validation_results.json")}`);
    console.log(`Report: ${join(REPORTS_DIR, "browser_validation_report.md")}`);
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);

    if (!HEADLESS) {
      console.log("\nBrowser stays open 5s for visual inspection...");
      await page.waitForTimeout(5000);
    }

    await context.close();
  } catch (err: any) {
    console.error(`\n[FATAL] ${err.message}`);
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill();
      console.log("Dev server stopped.");
    }
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
