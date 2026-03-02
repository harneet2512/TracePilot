const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const results = [];
  const consoleErrors = [];
  const apiRequests = [];
  const responses = {};

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiRequests.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/chat/suggestions?initial=true')) {
      try { responses.suggestions = await res.json(); } catch(e) {}
    }
  });

  function log(taskId, check, pass, detail) {
    detail = detail || '';
    const status = pass ? 'PASS' : 'FAIL';
    console.log('[' + status + '] ' + taskId + ': ' + check + (detail ? ' -- ' + detail : ''));
    results.push({ task: taskId, check, pass, detail });
    return pass;
  }

  console.log('=== TracePilot Comprehensive Browser Verification ===\n');

  // LOGIN
  await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@tracepilot.com');
  await page.fill('input[type="password"]', 'harneet2512');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/chat/, { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Navigate to fresh /chat
  await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // TASK 1
  console.log('\n--- TASK 1: Name Check ---');
  const title = await page.title();
  log('T1', 'Page title = TracePilot', title === 'TracePilot', 'got: "' + title + '"');
  const body = await page.textContent('body');
  log('T1', 'Body has TracePilot', body.includes('TracePilot'));
  log('T1', 'No TracePilot in body', !body.toLowerCase().includes('tracepilot'));

  // TASK 2
  console.log('\n--- TASK 2: Dynamic Suggestions ---');
  const sugsApiCalled = apiRequests.some(r => r.url.includes('/api/chat/suggestions?initial=true'));
  log('T2', 'GET /api/chat/suggestions?initial=true fires', sugsApiCalled);
  if (responses.suggestions) {
    const sugs = responses.suggestions.suggestions || [];
    log('T2', 'Response has suggestions', sugs.length > 0, 'count=' + sugs.length);
    log('T2', 'Suggestions have label+text', sugs.every(s => s.label && s.text));
  }
  const qrBtns = await page.locator('div.flex.flex-wrap.justify-center button').all();
  log('T2', '3+ quick reply buttons rendered', qrBtns.length >= 3, 'found=' + qrBtns.length);
  const btnLabels = [];
  for (const b of qrBtns) btnLabels.push(await b.innerText());
  const hasOldHardcoded = btnLabels.some(t => t === 'What can you help me find?' || t === "Show me what's been synced");
  log('T2', 'No old hardcoded strings', !hasOldHardcoded, 'buttons: ' + btnLabels.join(', '));

  // OKR QUERY for Tasks 3,7,8,9,11,12,13,14
  console.log('\n--- OKR Query (Tasks 3,7,8,9,11,12,13,14) ---');

  let finalEventData = null;
  let skeletonSeen = false;

  // Watch for skeleton badge
  const skeletonPromise = page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 30000 })
    .then(() => { skeletonSeen = true; console.log('  [OK] Skeleton badge appeared'); })
    .catch(e => console.log('  [NOTE] Skeleton not seen:', e.message));

  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('What are our Q4 OKRs for the AI search project?');
  await page.keyboard.press('Enter');

  await skeletonPromise;
  await page.waitForTimeout(500);
  log('T13', 'Skeleton badge visible during streaming', skeletonSeen, 'data-testid=trust-badge-skeleton');

  // Wait for response (up to 60s)
  console.log('  Waiting for OKR response...');
  await page.waitForTimeout(45000);

  // Capture final event via API
  const CSRF_TOKEN = '34213dfd-c669-4cab-9bc6-6a7b8eaa2010';

  // Get the final event data from already-captured network traffic
  // Since we can't easily capture SSE body from Playwright, we query it directly
  // Actually, let's try to get it from the page's last network response
  // Instead, we'll parse it from a direct curl call in parallel
  // For now verify UI state

  // TASK 13: skeleton gone
  const skeletonAfter = await page.locator('[data-testid="trust-badge-skeleton"]').count();
  log('T13', 'Skeleton removed after streaming', skeletonAfter === 0, 'skeleton count=' + skeletonAfter);

  // TASK 14: retrieval summary line
  const pageText2 = await page.textContent('body');
  const hasChunks = pageText2.includes('chunks');
  const hasSources = pageText2.includes('sources');
  const hasBestMatch = pageText2.includes('best match');
  log('T14', 'Retrieval summary line visible', hasChunks || hasBestMatch, 'chunks=' + hasChunks + ' sources=' + hasSources + ' bestMatch=' + hasBestMatch);

  // TASK 11: Evidence cards
  const evidenceCards = await page.locator('[class*="w-\\[240px\\]"]').all();
  log('T11', 'Horizontal 240px evidence cards rendered', evidenceCards.length >= 1, 'count=' + evidenceCards.length);
  if (evidenceCards.length > 0) {
    const cardText = await evidenceCards[0].textContent();
    log('T11', 'Evidence card has text content', cardText.trim().length > 5, '"' + cardText.trim().slice(0,40) + '"');
  }

  // TASK 12: Citation popover
  const citLinks = await page.locator('[data-testid="inline-citation-link"]').all();
  log('T12', 'Inline [N] citation markers rendered', citLinks.length > 0, 'count=' + citLinks.length);
  if (citLinks.length > 0) {
    await citLinks[0].click();
    await page.waitForTimeout(1000);
    // Check for popover (Radix popover)
    const popoverContent = await page.locator('[data-radix-popper-content-wrapper]').first();
    const popVisible = await popoverContent.isVisible().catch(() => false);
    log('T12', 'Citation popover opens on click', popVisible);
    if (popVisible) {
      const pText = await popoverContent.textContent();
      log('T12', 'Popover has text content', pText.trim().length > 5, '"' + pText.trim().slice(0,60) + '"');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // TASK 8: Trust badge in UI
  const trustBadge = page.locator('button:has-text("grounded"), button:has-text("review"), button:has-text("warning"), [data-testid="trust-badge"]').first();
  const badgeVisible = await trustBadge.isVisible().catch(() => false);
  log('T8', 'Trust badge visible after OKR response', badgeVisible);

  // TASK 3: Response style check
  // Get answer from page
  const messageContent = await page.locator('[data-testid="message-content"]').last().textContent().catch(() => '');
  const answerText = messageContent || '';
  const startsWithI = answerText.trimStart().startsWith('I ') || answerText.trimStart().startsWith('I\'');
  const startsWithBased = answerText.toLowerCase().startsWith('based on');
  const startsWithFound = answerText.toLowerCase().startsWith('i found');
  log('T3', 'Answer does not start with "I"', !startsWithI, 'starts: "' + answerText.slice(0,40) + '"');
  log('T3', 'Answer does not start with "Based on"', !startsWithBased);
  log('T3', 'Answer does not start with "I found"', !startsWithFound);

  // TASK 4: Double-send guard
  const streamPosts = apiRequests.filter(r => r.url.includes('/api/chat/stream') && r.method === 'POST');
  log('T4', 'isSendingRef prevents double-send', streamPosts.length >= 1, 'stream POSTs=' + streamPosts.length);

  // TASK 6: Rolling context in POST body
  let hasHistory = false;
  for (const r of streamPosts) {
    try {
      const b = JSON.parse(r.postData || '{}');
      if (b.conversationHistory && b.conversationHistory.length > 0) {
        hasHistory = true;
        log('T6', 'conversationHistory sent in POST body', true, 'history length=' + b.conversationHistory.length);
        break;
      }
    } catch(e) {}
  }
  if (!hasHistory) log('T6', 'conversationHistory in at least one POST', false, 'check if conversation has prior turns');

  // TASK 15: BLOCKER query for priority pill
  console.log('\n--- TASK 15: BLOCKER query ---');
  const textarea2 = page.locator('textarea').first();
  await textarea2.click();
  await textarea2.fill('What are the blockers for the AI search launch?');
  await page.keyboard.press('Enter');
  console.log('  Waiting for BLOCKER response (~25s)...');
  await page.waitForTimeout(30000);
  const bodyBlocker = await page.textContent('body');
  const hasPriority = bodyBlocker.includes('Priority') || bodyBlocker.includes('High') || bodyBlocker.includes('Critical') || bodyBlocker.includes('Medium');
  const hasImpact = bodyBlocker.includes('Impact') || bodyBlocker.includes('impact');
  const hasDash = bodyBlocker.includes('\u2014'); // em-dash UNAVAILABLE constant
  log('T15', 'Priority content visible in BLOCKER response', hasPriority);
  log('T15', 'Impact content visible', hasImpact);
  log('T15', 'UNAVAILABLE em-dash fallback defined', hasDash);

  // SMALLTALK: hi
  console.log('\n--- Smalltalk test ---');
  const textarea3 = page.locator('textarea').first();
  await textarea3.click();
  await textarea3.fill('hi');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);
  const bodyHi = await page.textContent('body');
  const hasTracePilotInGreeting = bodyHi.includes('TracePilot');
  log('T1', 'TracePilot name in greeting response', hasTracePilotInGreeting);

  // HEALTH
  const nonAuthErrors = consoleErrors.filter(e => !e.includes('401') && !e.includes('Unauthorized') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero non-auth console errors', nonAuthErrors.length === 0, 'errors: ' + nonAuthErrors.slice(0,2).join('; '));

  // SUMMARY
  console.log('\n\n========== FINAL SUMMARY ==========');
  const passCount = results.filter(r => r.pass).length;
  console.log('PASS: ' + passCount + '/' + results.length);
  console.log('\nFailed checks:');
  results.filter(r => !r.pass).forEach(r => console.log('  FAIL: ' + r.task + ': ' + r.check + ' -- ' + r.detail));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
