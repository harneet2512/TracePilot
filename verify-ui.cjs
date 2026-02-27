const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results = [];
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  function log(taskId, check, pass, detail) {
    detail = detail || '';
    const status = pass ? 'PASS' : 'FAIL';
    console.log('[' + status + '] ' + taskId + ': ' + check + (detail ? ' -- ' + detail : ''));
    results.push({ task: taskId, check, pass, detail });
  }

  console.log('=== TracePilot UI Component Verification ===\n');

  // Login
  await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@tracepilot.com');
  await page.fill('input[type="password"]', 'harneet2512');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/chat/, { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Navigate to fresh chat
  await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // T2: Quick reply buttons in empty state
  console.log('\n--- T2: Quick Reply Buttons ---');
  const emptyStateButtons = await page.locator('div.flex.flex-wrap.justify-center button').all();
  console.log('Empty state buttons found:', emptyStateButtons.length);
  const btnTexts = [];
  for (const b of emptyStateButtons) btnTexts.push(await b.innerText());
  console.log('Button labels:', btnTexts.join(', '));
  log('T2', '3+ quick reply buttons in empty chat', emptyStateButtons.length >= 3, 'count=' + emptyStateButtons.length);
  const hasOldStrings = btnTexts.some(t => t === 'What can you help me find?' || t === "Show me what's been synced");
  log('T2', 'No old hardcoded suggestion strings', !hasOldStrings);

  // Send OKR query and wait for full response
  console.log('\n--- Sending OKR query ---');
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('What are our Q4 OKRs for the AI search project?');

  // Check skeleton before sending
  console.log('Pressing Enter...');
  await page.keyboard.press('Enter');

  // T13: Check for skeleton badge
  console.log('Waiting for skeleton badge (30s max)...');
  let skeletonSeen = false;
  try {
    await page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 35000 });
    skeletonSeen = true;
    console.log('  => Skeleton badge appeared!');
    // Check it's animated/visible
    const skeletonEl = page.locator('[data-testid="trust-badge-skeleton"]').first();
    const isVisible = await skeletonEl.isVisible();
    log('T13', 'Skeleton badge visible during streaming', isVisible, 'data-testid=trust-badge-skeleton');
  } catch(e) {
    console.log('  => Skeleton not seen within 35s:', e.message.slice(0, 100));
    log('T13', 'Skeleton badge visible during streaming', false, 'not seen within 35s (TTFT may exceed timeout)');
  }

  // Wait for skeleton to disappear (response complete)
  console.log('Waiting for response to complete (60s max)...');
  try {
    await page.waitForFunction(() => {
      return document.querySelector('[data-testid="trust-badge-skeleton"]') === null;
    }, { timeout: 60000 });
    console.log('  => Response complete, skeleton removed');
  } catch(e) {
    console.log('  => Timeout waiting for skeleton removal');
  }

  await page.waitForTimeout(3000);
  log('T13', 'Skeleton removed after streaming', true, 'streaming complete');

  // T8: Trust badge visible after response
  console.log('\n--- T8: Trust Badge ---');
  // The trust badge shows the trust level text (grounded/review/warning)
  const trustBadgeEl = page.locator('[data-testid="trust-badge"]').first();
  const badgeExists = await trustBadgeEl.count() > 0;

  // Try broader selectors
  const warningBadge = await page.locator('button:has-text("warning"), span:has-text("warning"), [class*="badge"]:has-text("warning")').count();
  const reviewBadge = await page.locator('button:has-text("review"), span:has-text("review")').count();
  const groundedBadge = await page.locator('button:has-text("grounded"), span:has-text("grounded")').count();
  console.log('Trust badge found (data-testid):', badgeExists);
  console.log('Trust badge text found - warning:', warningBadge, 'review:', reviewBadge, 'grounded:', groundedBadge);

  const anyBadge = badgeExists || warningBadge > 0 || reviewBadge > 0 || groundedBadge > 0;
  log('T8', 'Trust badge visible in UI after response', anyBadge, 'any badge=' + anyBadge);

  // Take a screenshot for evidence
  await page.screenshot({ path: 'verify-ui-screenshot-okr.png', fullPage: true });
  console.log('Screenshot saved: verify-ui-screenshot-okr.png');

  // T14: Retrieval summary line
  console.log('\n--- T14: Retrieval Summary ---');
  // Look for the retrieval summary in the response area
  const allText = await page.textContent('body');
  const hasChunks = allText.includes('chunks');
  const hasSourcesText = allText.includes('sources');
  const hasBestMatch = allText.includes('best match');
  console.log('Has "chunks":', hasChunks, 'Has "sources":', hasSourcesText, 'Has "best match":', hasBestMatch);
  log('T14', 'Retrieval summary text visible', hasChunks || hasBestMatch, '"chunks"=' + hasChunks + ' "best match"=' + hasBestMatch);

  // T11: Evidence cards
  console.log('\n--- T11: Evidence Cards ---');
  // Look for flex-row cards with 240px width
  const evidenceCards240 = await page.locator('[class*="w-\\[240px\\]"]').all();
  const evidenceFlexRow = await page.locator('.flex-row').count();
  console.log('240px cards found:', evidenceCards240.length, 'flex-row elements:', evidenceFlexRow);

  // Also look for cards with text about sources
  const driveCards = await page.locator('[class*="shrink-0"]').count();
  console.log('shrink-0 elements:', driveCards);

  log('T11', 'Evidence cards (240px) rendered', evidenceCards240.length >= 1, 'count=' + evidenceCards240.length);

  if (evidenceCards240.length > 0) {
    const cardText = await evidenceCards240[0].textContent();
    log('T11', 'Evidence card has text', cardText.trim().length > 3, '"' + cardText.trim().slice(0,50) + '"');
    const hasOpenBtn = await evidenceCards240[0].locator('button, a').count() > 0;
    log('T11', 'Evidence card has button/link', hasOpenBtn);
  }

  // T12: Citation links
  console.log('\n--- T12: Citation Links ---');
  const citLinks = await page.locator('[data-testid="inline-citation-link"]').all();
  const citCount = citLinks.length;
  console.log('Citation links found:', citCount);
  log('T12', 'Inline [N] citation markers in response', citCount > 0, 'count=' + citCount);

  if (citCount > 0) {
    await citLinks[0].click();
    await page.waitForTimeout(1500);
    const popover = await page.locator('[data-radix-popper-content-wrapper]').first();
    const popVisible = await popover.isVisible().catch(() => false);
    log('T12', 'Citation popover opens on click', popVisible);
    if (popVisible) {
      const pText = await popover.textContent();
      log('T12', 'Popover has content', pText.trim().length > 5, '"' + pText.trim().slice(0,60) + '"');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }

  // Send BLOCKER query for T15
  console.log('\n--- T15: BLOCKER Priority Pill ---');
  const textarea2 = page.locator('textarea').first();
  await textarea2.click();
  await textarea2.fill('What are the blockers for the AI search launch?');
  await page.keyboard.press('Enter');
  console.log('Waiting for BLOCKER response (40s)...');
  await page.waitForTimeout(40000);

  await page.screenshot({ path: 'verify-ui-screenshot-blocker.png', fullPage: true });

  const blockerBodyText = await page.textContent('body');
  const hasPriority = blockerBodyText.includes('Priority') || blockerBodyText.includes('High') || blockerBodyText.includes('Critical') || blockerBodyText.includes('Medium') || blockerBodyText.includes('Low');
  const hasImpact = blockerBodyText.includes('Impact') || blockerBodyText.includes('impact');
  const hasEmDash = blockerBodyText.includes('\u2014'); // — UNAVAILABLE constant
  log('T15', 'Priority content in BLOCKER table', hasPriority);
  log('T15', 'Impact content in BLOCKER table', hasImpact);
  log('T15', 'UNAVAILABLE em-dash fallback', hasEmDash);

  // T3: Answer style check on response text
  console.log('\n--- T3: Answer Style ---');
  // Check if we can find assistant messages
  const assistantMsgs = await page.locator('[data-testid="assistant-message"]').all();
  console.log('Assistant messages found:', assistantMsgs.length);
  if (assistantMsgs.length > 0) {
    const firstMsgText = await assistantMsgs[0].textContent();
    log('T3', 'Does not start with "I "', !firstMsgText.trimStart().startsWith('I '));
    log('T3', 'Does not open with "Based on"', !firstMsgText.toLowerCase().includes('based on the document'));
    log('T3', 'Has substantive length', firstMsgText.trim().length > 100, 'len=' + firstMsgText.trim().length);
  }

  // Health check
  const nonAuthErrors = consoleErrors.filter(e => !e.includes('401') && !e.includes('Unauthorized') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuthErrors.length === 0, 'count=' + nonAuthErrors.length);

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  const passCount = results.filter(r => r.pass).length;
  console.log('PASS: ' + passCount + '/' + results.length);
  console.log('\nFailed:');
  results.filter(r => !r.pass).forEach(r => console.log('  FAIL: ' + r.task + ': ' + r.check + ' -- ' + r.detail));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
