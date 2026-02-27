const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const results = [];
  const errors = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  function log(id, check, pass, detail) {
    console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + id + ': ' + check + (detail ? ' -- ' + detail : ''));
    results.push({ id, check, pass, detail: detail || '' });
  }

  // LOGIN
  await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@tracepilot.com');
  await page.fill('input[type="password"]', 'harneet2512');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/chat/, { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('=== GENERAL Path Verification (T8, T12, T13, T14) ===\n');

  // T2: Verify empty state buttons FIRST (before any messages)
  await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const initialUrl = page.url();
  console.log('URL after /chat navigate:', initialUrl);

  // Check for empty state - if we're on a conversation with messages, try New Chat
  const emptyState = await page.locator('text=Start a conversation').isVisible().catch(() => false);
  console.log('Empty state visible:', emptyState);

  if (!emptyState) {
    // Click New Chat button
    const newChatBtn = page.locator('a[href="/chat"], button:has-text("New Chat")').first();
    if (await newChatBtn.isVisible()) {
      await newChatBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  const qrBtns = await page.locator('div.flex.flex-wrap.justify-center button').all();
  const btnLabels = [];
  for (const b of qrBtns) btnLabels.push(await b.innerText());
  console.log('T2: Quick reply buttons:', btnLabels.join(', '));
  log('T2', 'Quick reply buttons in empty state', qrBtns.length >= 1, 'count=' + qrBtns.length + ' labels: ' + btnLabels.join(', '));

  // Send GENERAL path query - "What vector database does the project use?"
  console.log('\n--- Sending GENERAL query ---');
  const ta = page.locator('textarea').first();
  await ta.click();
  await ta.fill('What vector database does the AI search project use?');

  // Set up skeleton watcher BEFORE pressing Enter
  let skeletonSeen = false;
  page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 25000 })
    .then(() => { skeletonSeen = true; console.log('  >> SKELETON APPEARED (T13 PASS)'); })
    .catch(() => console.log('  >> skeleton not seen'));

  await page.keyboard.press('Enter');
  console.log('Waiting for GENERAL response (up to 60s)...');

  // Wait for response to appear (look for a complete assistant message)
  try {
    await page.waitForFunction(
      () => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message"][data-status="complete"], [data-testid="assistant-message-content"]');
        return msgs.length > 0;
      },
      { timeout: 60000 }
    );
    console.log('  >> Response appeared');
  } catch (e) {
    console.log('  >> Response wait timeout, continuing');
  }

  await page.waitForTimeout(3000);

  // T13: Skeleton badge
  log('T13', 'Skeleton badge visible during streaming', skeletonSeen);
  const skeletonAfter = await page.locator('[data-testid="trust-badge-skeleton"]').count();
  log('T13', 'Skeleton gone after response', skeletonAfter === 0);

  // Screenshot
  await page.screenshot({ path: 'verify-general-screenshot.png', fullPage: true });
  console.log('Screenshot saved: verify-general-screenshot.png');

  // T8: Trust badge (GENERAL response should show trust signal)
  console.log('\n--- T8: Trust badge ---');
  const warningSpan = await page.locator('span:has-text("warning")').count();
  const reviewSpan = await page.locator('span:has-text("review sources")').count();
  const groundedSpan = await page.locator('span:has-text("grounded")').count();
  console.log('Trust badge spans - warning:', warningSpan, 'review:', reviewSpan, 'grounded:', groundedSpan);
  log('T8', 'Trust badge visible after GENERAL response', warningSpan > 0 || reviewSpan > 0 || groundedSpan > 0,
    'warning=' + warningSpan + ' review=' + reviewSpan + ' grounded=' + groundedSpan);

  // T14: Retrieval summary line
  console.log('\n--- T14: Retrieval summary ---');
  const allText = await page.textContent('body');
  const hasChunks = allText.includes('chunks');
  const hasBM = allText.includes('best match');
  const hasSrcs = allText.includes('sources');
  console.log('"chunks":', hasChunks, '"best match":', hasBM, '"sources":', hasSrcs);
  log('T14', 'Retrieval summary visible (chunks/best match)', hasChunks || hasBM, 'chunks=' + hasChunks + ' bestMatch=' + hasBM);

  // T12: Inline citation links in GENERAL response
  console.log('\n--- T12: Citation popovers ---');
  const citLinks = await page.locator('[data-testid="inline-citation-link"]').all();
  console.log('Inline [N] citation links:', citLinks.length);
  log('T12', 'Inline [N] citation markers rendered', citLinks.length > 0, 'count=' + citLinks.length);

  if (citLinks.length > 0) {
    await citLinks[0].click();
    await page.waitForTimeout(1500);
    const popContent = await page.locator('[data-radix-popper-content-wrapper]').first();
    const popVisible = await popContent.isVisible().catch(() => false);
    log('T12', 'Citation popover opens on click', popVisible);
    if (popVisible) {
      const pText = await popContent.textContent();
      log('T12', 'Popover has content', pText.trim().length > 5, '"' + pText.trim().slice(0, 60) + '"');
      // Test close behavior
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const popAfterEsc = await popContent.isVisible().catch(() => false);
      log('T12', 'Popover closes on Escape', !popAfterEsc);
    }
  }

  // T4: Double send guard - try rapid clicks
  console.log('\n--- T4: Double-send guard ---');
  const ta2 = page.locator('textarea').first();
  await ta2.click();
  await ta2.fill('hi');

  // Track POST count
  let postCount = 0;
  page.on('request', req => {
    if (req.url().includes('/api/chat/stream') && req.method() === 'POST') postCount++;
  });

  // Click send button multiple times rapidly
  const sendBtn = page.locator('button[type="submit"], button:has([data-lucide="send"])').first();
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
    await sendBtn.click();
    await sendBtn.click();
  } else {
    // Press Enter multiple times
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(3000);
  console.log('Stream POSTs after 3 rapid sends:', postCount);
  log('T4', 'Double-send guard: only 1 POST per send attempt', postCount <= 1, 'POSTs=' + postCount);

  // T6: Rolling context check
  console.log('\n--- T6: Rolling context ---');
  // After sending multiple messages, check a follow-up
  await page.waitForTimeout(5000); // wait for hi response
  const ta3 = page.locator('textarea').first();
  await ta3.click();
  await ta3.fill('What else should I know about that?');

  let followUpBody = null;
  page.on('request', req => {
    if (req.url().includes('/api/chat/stream') && req.method() === 'POST') {
      try {
        const b = JSON.parse(req.postData() || '{}');
        if (b.conversationHistory && b.conversationHistory.length > 0) followUpBody = b;
      } catch(e) {}
    }
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(8000);
  log('T6', 'conversationHistory sent in follow-up POST', followUpBody !== null,
    followUpBody ? 'history length=' + followUpBody.conversationHistory.length : 'not captured');

  // Health
  const nonAuth = errors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuth.length === 0, nonAuth.slice(0,2).join('; '));

  // Summary
  console.log('\n\n======= SUMMARY =======');
  const passed = results.filter(r => r.pass).length;
  console.log('PASS: ' + passed + '/' + results.length);
  results.filter(r => !r.pass).forEach(r => console.log('  FAIL: ' + r.id + ': ' + r.check + ' -- ' + r.detail));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
