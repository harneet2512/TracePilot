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
  await page.waitForTimeout(2000);
  console.log('Logged in. URL:', page.url());

  // Navigate to /chat (new conversation, no messages)
  await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  // Count existing messages BEFORE sending
  const preCount = await page.locator('[data-testid="assistant-message-content"]').count();
  console.log('Messages before query:', preCount);

  // T13: Set up skeleton watcher with extended timeout (TTFT can be 60s+)
  let skeletonSeen = false;
  page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 100000 })
    .then(() => { skeletonSeen = true; console.log('  >> SKELETON APPEARED at', new Date().toISOString()); })
    .catch(() => console.log('  >> skeleton watcher timed out'));

  // Capture ALL stream POSTs to detect T13 and T6
  const streamRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/chat/stream') && req.method() === 'POST') {
      const body = (() => {
        try { return JSON.parse(req.postData() || '{}'); } catch { return {}; }
      })();
      streamRequests.push({ time: Date.now(), body });
      console.log('  >> Stream POST captured, history length:', body.conversationHistory?.length ?? 'n/a');
    }
  });

  // Send first query
  const ta = page.locator('textarea').first();
  await ta.click();
  await ta.fill('What vector database does the AI search project use?');
  const sendT = Date.now();
  console.log('Sending first query at', new Date().toISOString());
  await page.keyboard.press('Enter');

  // Wait for NEW assistant message (count increases above preCount) — up to 120s
  console.log('Waiting for NEW assistant response...');
  try {
    await page.waitForFunction(
      (pre) => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message-content"]');
        return msgs.length > pre;
      },
      preCount,
      { timeout: 120000 }
    );
    console.log('  >> New assistant message appeared, elapsed:', Date.now() - sendT, 'ms');
  } catch(e) {
    console.log('  >> Timeout waiting for new message:', e.message);
  }

  // Wait for isSendingRef to be free (the mutation's onSettled fires)
  // We detect this by waiting for the skeleton to disappear OR a reasonable time
  await page.waitForTimeout(4000);

  // T13 verdict
  log('T13', 'Skeleton badge visible during streaming', skeletonSeen,
    skeletonSeen ? `seen after ${Date.now() - sendT}ms` : 'not seen within 100s (TTFT may exceed timeout)');
  const skeletonAfter = await page.locator('[data-testid="trust-badge-skeleton"]').count();
  log('T13', 'Skeleton gone after response', skeletonAfter === 0, `count=${skeletonAfter}`);

  // Now set up T6: capture the follow-up request
  console.log('\n--- T6: Rolling context follow-up ---');
  let followUpBody = null;
  const followUpPromise = page.waitForRequest(
    req => req.url().includes('/api/chat/stream') && req.method() === 'POST',
    { timeout: 30000 }
  ).then(req => {
    try {
      const b = JSON.parse(req.postData() || '{}');
      followUpBody = b;
      console.log('  >> Follow-up POST captured, history length:', b.conversationHistory?.length ?? 'n/a');
    } catch(e) {}
  }).catch(e => console.log('  >> Follow-up request not captured:', e.message));

  const ta2 = page.locator('textarea').first();
  await ta2.click();
  const followUpText = 'What else should I know about it?';
  await ta2.fill(followUpText);
  console.log('Filled follow-up text:', followUpText);
  await page.keyboard.press('Enter');
  console.log('Enter pressed for follow-up');

  // Wait for the follow-up request to be captured
  await followUpPromise;
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'verify-t6-t13-screenshot.png', fullPage: true });
  console.log('Screenshot saved: verify-t6-t13-screenshot.png');

  const histLen = followUpBody ? (followUpBody.conversationHistory || []).length : -1;
  log('T6', 'conversationHistory sent in follow-up POST',
    followUpBody !== null && histLen > 0,
    followUpBody ? `history length=${histLen}` : 'request not captured');

  // Health
  const nonAuth = errors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuth.length === 0, nonAuth.slice(0,2).join('; '));

  console.log('\n======= SUMMARY =======');
  const passed = results.filter(r => r.pass).length;
  console.log(`PASS: ${passed}/${results.length}`);
  results.filter(r => !r.pass).forEach(r =>
    console.log(`  FAIL: ${r.id}: ${r.check} -- ${r.detail}`)
  );

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
