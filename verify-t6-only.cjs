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

  // Capture ALL stream requests
  const allStreamPosts = [];
  page.on('request', req => {
    if ((req.url().includes('/api/chat/stream') || req.url().endsWith('/api/chat')) && req.method() === 'POST') {
      try {
        const b = JSON.parse(req.postData() || '{}');
        allStreamPosts.push(b);
        console.log(`  >> Chat POST #${allStreamPosts.length}: message="${b.message?.slice(0,30)}" historyLen=${b.conversationHistory?.length ?? 'n/a'}`);
      } catch(e) {}
    }
  });

  // --- TURN 1: Send "hi" using type (to ensure React state updated) ---
  console.log('\n--- Turn 1: Sending "hi" ---');
  const ta = page.locator('textarea').first();
  await ta.click();
  await page.keyboard.type('hi');
  await page.waitForTimeout(300); // Let React process the input event

  // Check what's in the textarea
  const val1 = await ta.inputValue();
  console.log('Textarea value before send:', JSON.stringify(val1));

  await page.keyboard.press('Enter');

  // Wait for "hi" response (fast path)
  try {
    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('[data-testid="assistant-message"]');
      for (const m of msgs) {
        if (m.getAttribute('data-status') === 'done') return true;
      }
      return false;
    }, { timeout: 20000 });
    console.log('  >> Turn 1 response appeared');
  } catch(e) {
    console.log('  >> Turn 1 timeout, continuing');
  }

  await page.waitForTimeout(2000);
  console.log('URL after turn 1:', page.url());

  // Count messages now (should include at least 1 assistant)
  const msgCount = await page.locator('[data-testid="assistant-message"][data-status="done"]').count();
  console.log('Complete assistant messages:', msgCount);

  // --- TURN 2: Follow-up ---
  console.log('\n--- Turn 2: Follow-up ---');
  const ta2 = page.locator('textarea').first();
  await ta2.click();
  await page.keyboard.type('What else?');
  await page.waitForTimeout(300);

  const val2 = await ta2.inputValue();
  console.log('Textarea value before follow-up send:', JSON.stringify(val2));

  // Set up request capture BEFORE sending
  const followUpCapture = new Promise((resolve) => {
    const cleanup = page.on('request', req => {
      if ((req.url().includes('/api/chat/stream') || req.url().endsWith('/api/chat')) && req.method() === 'POST') {
        try {
          const b = JSON.parse(req.postData() || '{}');
          if (b.message && b.message !== 'hi') { // Not the first "hi"
            cleanup(); // Remove listener after first capture
            resolve(b);
          }
        } catch(e) {}
      }
    });
    setTimeout(() => resolve(null), 12000); // Timeout fallback
  });

  await page.keyboard.press('Enter');
  console.log('Enter pressed for follow-up');

  const followUpBody = await followUpCapture;
  console.log('Follow-up body captured:', followUpBody ? 'YES' : 'NO');
  if (followUpBody) {
    console.log('  conversationHistory length:', followUpBody.conversationHistory?.length ?? 'n/a');
    console.log('  message:', followUpBody.message);
  }

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'verify-t6-screenshot.png', fullPage: true });
  console.log('Screenshot saved.');

  const histLen = followUpBody ? (followUpBody.conversationHistory || []).length : -1;
  log('T6', 'conversationHistory sent in follow-up POST',
    followUpBody !== null && histLen > 0,
    followUpBody ? `history length=${histLen}, message="${followUpBody.message}"` : 'request not captured');

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
