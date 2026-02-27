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

  // ---- LOGIN ----
  await page.goto('http://localhost:5000/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'admin@tracepilot.com');
  await page.fill('input[type="password"]', 'harneet2512');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL('**/chat/**', { timeout: 20000 });
  } catch(e) {
    await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  console.log('Post-login URL:', page.url());

  // Check CSRF cookie
  const cookies = await ctx.cookies('http://localhost:5000');
  const csrfCookie = cookies.find(c => c.name === '_csrf');
  const sessionCookie = cookies.find(c => c.name === 'session');
  console.log('CSRF cookie:', csrfCookie ? csrfCookie.value.slice(0, 10) + '...' : 'MISSING');
  console.log('Session cookie:', sessionCookie ? 'present' : 'MISSING');

  // Check CSRF via document.cookie
  const docCookies = await page.evaluate(() => document.cookie);
  console.log('document.cookie:', docCookies.slice(0, 80));

  await page.waitForSelector('textarea', { timeout: 15000 });
  console.log('Textarea found!');

  // Collect ALL chat POSTs
  const chatPosts = [];
  page.on('request', req => {
    if (req.url().includes('/api/chat') && req.method() === 'POST') {
      try {
        const b = JSON.parse(req.postData() || '{}');
        chatPosts.push(b);
        const hdr = req.headers();
        console.log(`  >> Chat POST: msg="${b.message?.slice(0,20)}" histLen=${(b.conversationHistory||[]).length} csrf=${hdr['x-csrf-token']?.slice(0,8) || 'none'}`);
      } catch(e) {}
    }
  });

  // Also capture responses to see if requests are rejected
  page.on('response', res => {
    if (res.url().includes('/api/chat') && res.request().method() === 'POST') {
      console.log(`  >> Chat response: ${res.status()} ${res.url().slice(-30)}`);
    }
  });

  // ---- TURN 1: hi ----
  console.log('\n--- Turn 1: "hi" ---');
  const ta1 = page.locator('textarea').first();
  await ta1.click();
  // Use type() which fires real keystroke events (better for React controlled inputs)
  await ta1.type('hi', { delay: 50 });
  await page.waitForTimeout(500);

  const ta1val = await ta1.inputValue();
  console.log('ta1 value:', JSON.stringify(ta1val));

  // Check React state via evaluate
  const reactInputState = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return 'no-textarea';
    // Try to get React's controlled state
    return ta.value;
  });
  console.log('DOM textarea.value:', JSON.stringify(reactInputState));

  await ta1.press('Enter');
  console.log('Enter pressed for T1');

  // Wait for response or toast
  await page.waitForTimeout(8000);
  const doneCount = await page.locator('[data-testid="assistant-message"][data-status="done"]').count();
  console.log('Done messages after T1:', doneCount, '| chatPosts:', chatPosts.length);

  // ---- TURN 2: follow-up ----
  console.log('\n--- Turn 2: "ok thanks" ---');
  const prePosts = chatPosts.length;
  const ta2 = page.locator('textarea').first();
  await ta2.click();
  await ta2.type('ok thanks', { delay: 50 });
  await page.waitForTimeout(500);

  await ta2.press('Enter');
  console.log('Enter pressed for T2');

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && chatPosts.length <= prePosts) {
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: 'verify-t6-screenshot.png', fullPage: true });
  console.log('chatPosts total:', chatPosts.length);

  const followUpBody = chatPosts.length > prePosts ? chatPosts[chatPosts.length - 1] : null;
  if (followUpBody) {
    const histLen = (followUpBody.conversationHistory || []).length;
    console.log('Follow-up histLen:', histLen);
    if (histLen > 0) {
      console.log('History:', followUpBody.conversationHistory.map(h => `${h.role}:${h.content.slice(0,20)}`));
    }
    log('T6', 'conversationHistory sent in follow-up POST', histLen > 0,
      `histLen=${histLen}`);
  } else {
    const blocked = await page.locator('text=Send already in progress').isVisible().catch(() => false);
    console.log('Blocked?', blocked);
    log('T6', 'conversationHistory sent in follow-up POST', false,
      blocked ? 'blocked by isSendingRef' : 'no request captured');
  }

  const nonAuth = errors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuth.length === 0, nonAuth.join('; ').slice(0, 80));

  console.log('\n======= SUMMARY =======');
  const passed = results.filter(r => r.pass).length;
  console.log(`PASS: ${passed}/${results.length}`);
  results.filter(r => !r.pass).forEach(r => console.log(`  FAIL: ${r.id}: ${r.check} -- ${r.detail}`));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
