const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = [];
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  function log(id, check, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${id}: ${check}${detail ? ' -- ' + detail : ''}`);
    results.push({ id, check, pass, detail: detail || '' });
  }

  // LOGIN
  await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@tracepilot.com');
  await page.fill('input[type="password"]', 'harneet2512');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/chat/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log('Logged in. URL:', page.url());

  // Start a fresh new chat
  await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // T13: Set up skeleton watcher BEFORE sending
  let skeletonSeen = false;
  page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 40000 })
    .then(() => { skeletonSeen = true; console.log('  >> SKELETON APPEARED (T13 PASS)'); })
    .catch(() => console.log('  >> skeleton watch timeout'));

  // Send GENERAL query
  const ta = page.locator('textarea').first();
  await ta.click();
  await ta.fill('What vector database does the AI search project use?');

  console.log('Sending query and waiting up to 90s for response...');
  await page.keyboard.press('Enter');

  // Wait for complete message
  try {
    await page.waitForFunction(
      () => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message"][data-status="done"], [data-testid="assistant-message-content"]');
        return msgs.length > 0;
      },
      { timeout: 90000 }
    );
    console.log('  >> Response appeared (data-status="done" or content found)');
  } catch(e) {
    // Also try checking for completed message without specific status
    const count = await page.locator('[data-testid="assistant-message-content"]').count();
    console.log('  >> Timeout waiting for done status; content count:', count);
  }

  // Wait a bit longer for trust badge to settle (after 500ms DB refetch)
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'verify-t8-screenshot.png', fullPage: true });
  console.log('Screenshot saved: verify-t8-screenshot.png');

  // T13: Skeleton during streaming
  log('T13', 'Skeleton badge visible during streaming', skeletonSeen);
  const skeletonAfter = await page.locator('[data-testid="trust-badge-skeleton"]').count();
  log('T13', 'Skeleton gone after response', skeletonAfter === 0, `count=${skeletonAfter}`);

  // T8: Trust badge - look for span with label text
  console.log('\n--- T8: Trust badge ---');
  const warningBadge = await page.locator('span.rounded-full:has-text("warning")').count();
  const reviewBadge = await page.locator('span.rounded-full:has-text("review sources")').count();
  const groundedBadge = await page.locator('span.rounded-full:has-text("grounded")').count();
  console.log('Trust badge spans - warning:', warningBadge, 'review:', reviewBadge, 'grounded:', groundedBadge);
  log('T8', 'Trust badge (colored pill) visible after GENERAL response',
    warningBadge > 0 || reviewBadge > 0 || groundedBadge > 0,
    `warning=${warningBadge} review=${reviewBadge} grounded=${groundedBadge}`);

  // Also try tooltip approach
  const tooltipTrigger = await page.locator('[data-radix-collection-item], [data-tooltip-content]').count();
  console.log('Tooltip triggers:', tooltipTrigger);

  // T14: Retrieval summary line
  console.log('\n--- T14: Retrieval summary ---');
  const bodyText = await page.textContent('body');
  const hasChunks = bodyText.includes('chunks');
  const hasBestMatch = bodyText.includes('best match');
  const hasSources = bodyText.includes(' sources');
  console.log('"chunks":', hasChunks, '"best match":', hasBestMatch, '"sources":', hasSources);
  // Also check for the specific retrieval summary element
  const rsEl = await page.locator('p.text-xs.text-muted-foreground').count();
  console.log('Retrieval summary <p> elements:', rsEl);
  log('T14', 'Retrieval summary line visible', hasChunks || hasBestMatch,
    `chunks=${hasChunks} bestMatch=${hasBestMatch}`);

  // T12: Citation links
  console.log('\n--- T12: Inline citation links ---');
  const citLinks = await page.locator('[data-testid="inline-citation-link"]').all();
  console.log('Inline [N] citation links:', citLinks.length);
  log('T12', 'Inline [N] citation markers rendered as links', citLinks.length > 0,
    `count=${citLinks.length}`);

  if (citLinks.length > 0) {
    await citLinks[0].click();
    await page.waitForTimeout(1500);
    const popoverContent = page.locator('[data-radix-popper-content-wrapper]').first();
    const popVisible = await popoverContent.isVisible().catch(() => false);
    log('T12', 'Citation popover opens on click', popVisible);
    if (popVisible) {
      const pText = await popoverContent.textContent().catch(() => '');
      log('T12', 'Popover has source content', pText.trim().length > 3,
        `"${pText.trim().slice(0, 60)}"`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const popAfter = await popoverContent.isVisible().catch(() => false);
      log('T12', 'Popover closes on Escape', !popAfter);
    }
  }

  // T6: Rolling context - send follow-up
  console.log('\n--- T6: Rolling context ---');
  let followUpBody = null;
  page.on('request', req => {
    if (req.url().includes('/api/chat/stream') && req.method() === 'POST') {
      try {
        const b = JSON.parse(req.postData() || '{}');
        if (b.conversationHistory && b.conversationHistory.length > 0) followUpBody = b;
      } catch(e) {}
    }
  });
  const ta2 = page.locator('textarea').first();
  await ta2.click();
  await ta2.fill('What else should I know about it?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);
  log('T6', 'conversationHistory sent in follow-up POST',
    followUpBody !== null,
    followUpBody ? `history length=${followUpBody.conversationHistory.length}` : 'not captured');

  // Health
  const nonAuth = errors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuth.length === 0, nonAuth.slice(0, 2).join('; '));

  // Summary
  console.log('\n======= SUMMARY =======');
  const passed = results.filter(r => r.pass).length;
  console.log(`PASS: ${passed}/${results.length}`);
  results.filter(r => !r.pass).forEach(r =>
    console.log(`  FAIL: ${r.id}: ${r.check} -- ${r.detail}`)
  );

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
