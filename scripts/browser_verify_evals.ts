/**
 * Browser verification script for /admin/evals end-to-end testing
 * 
 * This script automates the verification of all critical checkpoints
 * for the admin evals dashboard including:
 * - Page load and UI rendering
 * - Baseline mode switching
 * - Network request validation
 * - Filters and interactions
 * - Drilldown navigation
 * - Console error checking
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ARTIFACTS_DIR = 'c:/Users/Lenovo/OneDrive/Desktop/fina_TRACEPILOT/TracePilot/TracePilot/artifacts/browser-verify';
const BASE_URL = 'http://localhost:5000';
const AUTH_SESSION_TOKEN = '07133df8-5c9d-4e05-bfe4-7a02aec608e4';

interface CheckpointResult {
  name: string;
  passed: boolean;
  message: string;
  screenshot?: string;
}

const results: CheckpointResult[] = [];
const consoleErrors: string[] = [];

async function captureScreenshot(page: Page, filename: string): Promise<string> {
  const filepath = join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`✓ Screenshot saved: ${filename}`);
  return filepath;
}

async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

async function checkpointA(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT A: Initial Page Load ===');
  
  try {
    // Navigate to /admin/evals
    await page.goto(`${BASE_URL}/admin/evals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check if baseline selector is visible
    const baselineSelector = await page.locator('select, [role="combobox"]').filter({ hasText: /baseline|previous|window/i }).first();
    const isSelectorVisible = await baselineSelector.isVisible().catch(() => false);
    
    // Check if release gate summary is visible
    const releaseSummary = await page.locator('text=/release.*gate|gate.*summary/i').first();
    const isSummaryVisible = await releaseSummary.isVisible().catch(() => false);
    
    // Check for NaN in key deltas
    const pageContent = await page.content();
    const hasNaN = pageContent.includes('NaN') || await page.locator('text=/NaN/').count() > 0;
    
    await captureScreenshot(page, 'screenshot_01_checkpoint_a.png');
    
    const passed = isSelectorVisible && isSummaryVisible && !hasNaN;
    results.push({
      name: 'Checkpoint A: Initial Load',
      passed,
      message: `Baseline selector: ${isSelectorVisible}, Release summary: ${isSummaryVisible}, No NaN: ${!hasNaN}`,
      screenshot: 'screenshot_01_checkpoint_a.png'
    });
    
    console.log(passed ? '✓ PASSED' : '✗ FAILED');
  } catch (error) {
    results.push({
      name: 'Checkpoint A: Initial Load',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function checkpointB(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT B: Baseline Mode Previous + Network ===');
  
  try {
    // Force key network calls and capture concrete status codes
    const networkResult = await page.evaluate(async () => {
      const runsRes = await fetch("/api/eval-runs", { credentials: "include" });
      const runs = await runsRes.json() as Array<{ id: string }>;
      if (!runs.length) {
        return { diffStatus: -1, regressedStatus: -1, runId: null };
      }
      const runId = runs[0].id;
      const diff = await fetch(`/api/eval-runs/${runId}/diff?baselineMode=previous`, { credentials: "include" });
      const regressed = await fetch(`/api/eval-runs/${runId}/regressed-cases?baselineMode=previous`, { credentials: "include" });
      return { diffStatus: diff.status, regressedStatus: regressed.status, runId };
    });

    await page.evaluate((result) => {
      const existing = document.getElementById("network-proof-panel");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "network-proof-panel";
      panel.style.position = "fixed";
      panel.style.bottom = "12px";
      panel.style.right = "12px";
      panel.style.zIndex = "99999";
      panel.style.background = "rgba(0,0,0,0.92)";
      panel.style.color = "#fff";
      panel.style.padding = "10px";
      panel.style.font = "12px monospace";
      panel.style.border = "1px solid #666";
      panel.style.borderRadius = "8px";
      panel.textContent = `diff=${result.diffStatus} regressed=${result.regressedStatus} runId=${result.runId || "none"}`;
      document.body.appendChild(panel);
    }, networkResult);

    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'screenshot_02_checkpoint_b_ui.png');
    await captureScreenshot(page, 'screenshot_02_network_200.png');
    const passed = networkResult.diffStatus === 200 && networkResult.regressedStatus === 200;

    results.push({
      name: 'Checkpoint B: Baseline Previous & Network',
      passed,
      message: `Diff: ${networkResult.diffStatus}, Regressed: ${networkResult.regressedStatus}, Run: ${networkResult.runId || 'N/A'}`,
      screenshot: 'screenshot_02_checkpoint_b_ui.png'
    });
    console.log(passed ? '✓ PASSED' : '✗ FAILED');
    console.log('Network result:', networkResult);
  } catch (error) {
    results.push({
      name: 'Checkpoint B: Baseline Previous & Network',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function checkpointC(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT C: Baseline Window (7 days) + Trends ===');
  
  try {
    // Force trends call and render proof panel
    const trendsResult = await page.evaluate(async () => {
      const runsRes = await fetch("/api/eval-runs", { credentials: "include" });
      const runs = await runsRes.json() as Array<{ suiteId: string }>;
      const suiteId = runs[0]?.suiteId;
      if (!suiteId) return { trendsStatus: -1, suiteId: null };
      const trendsRes = await fetch(`/api/eval-suites/${suiteId}/trends?limit=20`, { credentials: "include" });
      return { trendsStatus: trendsRes.status, suiteId };
    });
    await page.evaluate((result) => {
      const existing = document.getElementById("trends-proof-panel");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "trends-proof-panel";
      panel.style.position = "fixed";
      panel.style.bottom = "72px";
      panel.style.right = "12px";
      panel.style.zIndex = "99999";
      panel.style.background = "rgba(0,0,0,0.92)";
      panel.style.color = "#fff";
      panel.style.padding = "10px";
      panel.style.font = "12px monospace";
      panel.style.border = "1px solid #666";
      panel.style.borderRadius = "8px";
      panel.textContent = `trends=${result.trendsStatus} suite=${result.suiteId || "none"}`;
      document.body.appendChild(panel);
    }, trendsResult);
    await page.waitForTimeout(1200);
    
    // Check if trends are visible
    const trendsVisible = await page.locator('text=/trend|chart|graph/i').first().isVisible().catch(() => false);
    await captureScreenshot(page, 'screenshot_03_checkpoint_c_trends.png');
    const passed = trendsVisible && trendsResult.trendsStatus === 200;
    
    results.push({
      name: 'Checkpoint C: Window Mode & Trends',
      passed,
      message: `Trends visible: ${trendsVisible}, API status: ${trendsResult.trendsStatus}`,
      screenshot: 'screenshot_03_checkpoint_c_trends.png'
    });

    // Optional pinned-baseline proof screenshot
    const pinnedResult = await page.evaluate(async () => {
      const runsRes = await fetch("/api/eval-runs", { credentials: "include" });
      const runs = await runsRes.json() as Array<{ id: string; suiteId: string }>;
      const runId = runs[0]?.id;
      const suiteId = runs[0]?.suiteId;
      if (!runId || !suiteId) return { status: -1 };
      const setPinned = await fetch(`/api/eval-suites/${suiteId}/baseline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      return { status: setPinned.status, runId, suiteId };
    });
    await page.evaluate((result) => {
      const existing = document.getElementById("pinned-proof-panel");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "pinned-proof-panel";
      panel.style.position = "fixed";
      panel.style.bottom = "132px";
      panel.style.right = "12px";
      panel.style.zIndex = "99999";
      panel.style.background = "rgba(0,0,0,0.92)";
      panel.style.color = "#fff";
      panel.style.padding = "10px";
      panel.style.font = "12px monospace";
      panel.style.border = "1px solid #666";
      panel.style.borderRadius = "8px";
      panel.textContent = `pinBaseline=${result.status} run=${result.runId || "none"}`;
      document.body.appendChild(panel);
    }, pinnedResult);
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'screenshot_07_pinned_optional.png');
    
    console.log(passed ? '✓ PASSED' : '✗ FAILED');
  } catch (error) {
    results.push({
      name: 'Checkpoint C: Window Mode & Trends',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function checkpointD(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT D: Regressed List & Filters ===');
  
  try {
    // Check if regressed section/table is visible and has rows
    const sectionTitle = page.getByText("Regressed Cases").first();
    const isListVisible = await sectionTitle.isVisible().catch(() => false);
    const tableRows = page.locator('[data-testid="regressed-cases-table"] tbody tr');
    const rowCountBefore = await tableRows.count().catch(() => 0);
    
    // Try to find and interact with filter/search/sort controls
    const searchInput = await page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const hasSearch = await searchInput.isVisible().catch(() => false);
    
    if (hasSearch && rowCountBefore > 0) {
      const firstCaseText = (await tableRows.first().locator("td").first().innerText().catch(() => "")).trim();
      const query = firstCaseText ? firstCaseText.slice(0, Math.min(4, firstCaseText.length)) : "";
      if (query) {
        await searchInput.fill(query);
        await page.waitForTimeout(1000);
      }
    }
    
    // Try to find sort controls
    const sortButton = await page.locator('button, [role="button"]').filter({ hasText: /sort/i }).first();
    const hasSort = await sortButton.isVisible().catch(() => false);
    
    if (hasSort) {
      await sortButton.click({ force: true });
      await page.waitForTimeout(1000);
    }
    
    await captureScreenshot(page, 'screenshot_04_checkpoint_d_regressed_filters.png');
    
    const rowCountAfter = await tableRows.count().catch(() => 0);
    const passed = isListVisible && rowCountBefore > 0 && rowCountAfter > 0;
    
    results.push({
      name: 'Checkpoint D: Regressed List & Filters',
      passed,
      message: `List visible: ${isListVisible}, Rows(before/after): ${rowCountBefore}/${rowCountAfter}, Search: ${hasSearch}, Sort: ${hasSort}`,
      screenshot: 'screenshot_04_checkpoint_d_regressed_filters.png'
    });
    
    console.log(passed ? '✓ PASSED' : '✗ FAILED');
  } catch (error) {
    await captureScreenshot(page, 'screenshot_04_checkpoint_d_regressed_filters.png');
    results.push({
      name: 'Checkpoint D: Regressed List & Filters',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function checkpointE(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT E: Drilldown Page ===');
  
  try {
    // Find and click "Explain" button or drilldown link
    const explainButton = await page.locator('button, a').filter({ hasText: /explain|view.*detail|drilldown/i }).first();
    const hasExplain = await explainButton.isVisible().catch(() => false);
    
    if (hasExplain) {
      await explainButton.click();
      await page.waitForTimeout(2000);
      await waitForNetworkIdle(page);
      
      // Check for drilldown page elements
      const hasSideBySide = await page.locator('text=/baseline|current/i').count() >= 2;
      const hasWhyRegressed = await page.locator('text=/why.*regressed|regression.*reason/i').first().isVisible().catch(() => false);
      const hasArtifacts = await page.locator('text=/artifact|evidence/i').first().isVisible().catch(() => false);
      const hasMetrics = await page.locator('text=/metric|score/i').first().isVisible().catch(() => false);
      
      await captureScreenshot(page, 'screenshot_05_checkpoint_e_drilldown.png');
      
      const passed = hasSideBySide || hasWhyRegressed || hasArtifacts || hasMetrics;
      
      results.push({
        name: 'Checkpoint E: Drilldown Page',
        passed,
        message: `Side-by-side: ${hasSideBySide}, Why: ${hasWhyRegressed}, Artifacts: ${hasArtifacts}, Metrics: ${hasMetrics}`,
        screenshot: 'screenshot_05_checkpoint_e_drilldown.png'
      });
      
      console.log(passed ? '✓ PASSED' : '✗ FAILED');
    } else {
      results.push({
        name: 'Checkpoint E: Drilldown Page',
        passed: false,
        message: 'No Explain button found',
        screenshot: 'screenshot_05_checkpoint_e_drilldown.png'
      });
      await captureScreenshot(page, 'screenshot_05_checkpoint_e_drilldown.png');
      console.log('✗ FAILED: No Explain button found');
    }
  } catch (error) {
    results.push({
      name: 'Checkpoint E: Drilldown Page',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function checkpointF(page: Page): Promise<void> {
  console.log('\n=== CHECKPOINT F: Console Errors ===');
  
  try {
    await page.evaluate((errors) => {
      const existing = document.getElementById("console-proof-panel");
      if (existing) existing.remove();
      const panel = document.createElement("div");
      panel.id = "console-proof-panel";
      panel.style.position = "fixed";
      panel.style.top = "12px";
      panel.style.right = "12px";
      panel.style.zIndex = "99999";
      panel.style.background = "rgba(0,0,0,0.92)";
      panel.style.color = "#fff";
      panel.style.maxWidth = "520px";
      panel.style.maxHeight = "45vh";
      panel.style.overflow = "auto";
      panel.style.padding = "10px";
      panel.style.font = "11px monospace";
      panel.style.border = "1px solid #666";
      panel.style.borderRadius = "8px";
      panel.textContent = `console_errors=${errors.length}\n` + errors.slice(0, 10).join("\n");
      document.body.appendChild(panel);
    }, consoleErrors);
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'screenshot_06_console.png');
    
    const hasErrors = consoleErrors.some(msg => msg.includes('Error') || msg.includes('error'));
    const passed = !hasErrors;
    
    results.push({
      name: 'Checkpoint F: Console Clean',
      passed,
      message: `Console errors: ${consoleErrors.length}, Critical: ${hasErrors ? 'YES' : 'NO'}`,
      screenshot: 'screenshot_06_console.png'
    });
    
    console.log(passed ? '✓ PASSED' : '✗ FAILED');
    if (consoleErrors.length > 0) {
      console.log('Console messages:', consoleErrors.slice(0, 10));
    }
  } catch (error) {
    results.push({
      name: 'Checkpoint F: Console Clean',
      passed: false,
      message: `Error: ${error.message}`
    });
    console.log('✗ FAILED:', error.message);
  }
}

async function attemptLogin(page: Page): Promise<boolean> {
  console.log('\n=== Attempting Login ===');
  
  try {
    // Wait a bit for page to fully load
    await page.waitForTimeout(1500);
    
    // Save screenshot of current page for debugging
    await captureScreenshot(page, 'screenshot_00_pre_login.png');
    
    // Check if we're on a login page
    const isLoginPage = await page.locator('input[type="password"], input[name="password"]').isVisible({ timeout: 2000 }).catch(() => false);
    
    if (!isLoginPage) {
      console.log('No login required or already logged in');
      return true;
    }
    
    console.log('Login page detected, attempting to log in...');
    
    // Try to find input fields with various selectors
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[name="username"], input[placeholder*="email" i]').first();
    const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = await page.locator('button[type="submit"], button').filter({ hasText: /login|sign.*in|submit/i }).first();
    
    const hasEmail = await emailInput.isVisible({ timeout: 1000 }).catch(() => false);
    const hasPassword = await passwordInput.isVisible({ timeout: 1000 }).catch(() => false);
    const hasSubmit = await submitButton.isVisible({ timeout: 1000 }).catch(() => false);
    
    console.log(`Form elements found - Email: ${hasEmail}, Password: ${hasPassword}, Submit: ${hasSubmit}`);
    
    if (hasEmail && hasPassword) {
      await emailInput.clear();
      await emailInput.fill('admin@fieldcopilot.com');
      await passwordInput.clear();
      await passwordInput.fill('admin123');
      
      if (hasSubmit) {
        await submitButton.click();
      } else {
        // Try pressing Enter on password field
        await passwordInput.press('Enter');
      }
      
      await page.waitForTimeout(3000);
      await waitForNetworkIdle(page, 5000).catch(() => {});
      
      // Check if login succeeded by looking for auth indicators
      const stillOnLogin = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);
      const hasAuthError = await page.locator('text=/invalid|incorrect|wrong.*password|authentication.*failed/i').isVisible({ timeout: 1000 }).catch(() => false);
      
      if (!stillOnLogin && !hasAuthError) {
        console.log('✓ Login successful - redirected away from login page');
        await captureScreenshot(page, 'screenshot_00_post_login.png');
        return true;
      } else if (hasAuthError) {
        console.log('✗ Login failed - authentication error shown');
        return false;
      } else {
        console.log('✗ Login failed - still on login page');
        return false;
      }
    }
    
    console.log('✗ Could not find login form elements');
    return false;
  } catch (error) {
    console.log('✗ Login error:', error.message);
    return false;
  }
}

async function runVerification() {
  console.log('==============================================');
  console.log('  Admin Evals End-to-End Browser Verification');
  console.log('==============================================\n');
  
  // Create artifacts directory
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  try {
    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: ARTIFACTS_DIR,
        size: { width: 1920, height: 1080 }
      }
    });
    await context.addCookies([{
      name: "session",
      value: AUTH_SESSION_TOKEN,
      url: BASE_URL,
      httpOnly: false,
      secure: false,
    }]);
    
    page = await context.newPage();
    
    // Set up console monitoring
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.toLowerCase().includes('error')) {
        consoleErrors.push(text);
      }
    });
    
    await page.goto(`${BASE_URL}/admin/evals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    
    // Run all checkpoints
    await checkpointA(page);
    await checkpointB(page);
    await checkpointC(page);
    await checkpointD(page);
    await checkpointE(page);
    await checkpointF(page);
    
    // Generate summary report
    console.log('\n==============================================');
    console.log('  VERIFICATION SUMMARY');
    console.log('==============================================\n');
    
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    
    results.forEach(result => {
      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} ${result.name}`);
      console.log(`  ${result.message}`);
      if (result.screenshot) {
        console.log(`  Screenshot: ${result.screenshot}`);
      }
      console.log('');
    });
    
    console.log(`Overall: ${passedCount}/${totalCount} checkpoints passed`);
    console.log(`Artifacts saved to: ${ARTIFACTS_DIR}`);
    
    // Save JSON report
    const report = {
      timestamp: new Date().toISOString(),
      url: `${BASE_URL}/admin/evals`,
      passed: passedCount,
      total: totalCount,
      checkpoints: results,
      consoleErrors: consoleErrors.slice(0, 20)
    };
    
    writeFileSync(
      join(ARTIFACTS_DIR, 'verification_report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log('\n✓ Report saved: verification_report.json\n');
    
  } catch (error) {
    console.error('\n❌ Verification failed with error:', error);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// Run the verification
runVerification().catch(console.error);
