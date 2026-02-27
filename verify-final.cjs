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
  await page.waitForTimeout(2000);

  // Navigate to new empty chat via "New Chat" button
  const newChatBtn = page.locator('text=New Chat').first();
  if (await newChatBtn.isVisible()) {
    await newChatBtn.click();
    await page.waitForTimeout(2000);
  } else {
    await page.goto('http://localhost:5000/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }
  console.log('Current URL:', page.url());

  // T2: Check empty state quick reply buttons
  console.log('\n--- T2 ---');
  const qrBtns = await page.locator('div.flex.flex-wrap.justify-center button').all();
  const btnLabels = [];
  for (const b of qrBtns) btnLabels.push(await b.innerText());
  console.log('QR buttons:', btnLabels.join(', '));
  log('T2', '3+ quick reply buttons', qrBtns.length >= 3, 'count=' + qrBtns.length + ' labels: ' + btnLabels.join(', '));
  log('T2', 'No old hardcoded strings', !btnLabels.some(t => t === 'What can you help me find?'));

  // Send BLOCKER query (proven to work in curl tests)
  console.log('\n--- Sending BLOCKER query ---');
  const ta = page.locator('textarea').first();
  await ta.click();
  await ta.fill('What are the blockers for the AI search launch?');

  // Watch for skeleton badge BEFORE pressing Enter
  let skeletonSeen = false;
  page.waitForSelector('[data-testid="trust-badge-skeleton"]', { timeout: 40000 })
    .then(() => { skeletonSeen = true; console.log('  >> Skeleton appeared!'); })
    .catch(() => { console.log('  >> Skeleton not seen in 40s'); });

  await page.keyboard.press('Enter');
  console.log('Waiting for BLOCKER response (max 60s)...');

  // Wait until no more skeleton or get a response
  try {
    await page.waitForSelector('[data-status="complete"], [data-testid="assistant-message"][data-status!="thinking"][data-status!="streaming"]', { timeout: 65000 });
  } catch(e) {
    console.log('  >> waitForSelector timeout, proceeding anyway');
  }
  await page.waitForTimeout(3000);

  // T13: skeleton check result
  log('T13', 'Skeleton visible during streaming', skeletonSeen, 'data-testid=trust-badge-skeleton seen=' + skeletonSeen);
  const skeletonAfter = await page.locator('[data-testid="trust-badge-skeleton"]').count();
  log('T13', 'Skeleton gone after completion', skeletonAfter === 0);

  // Take screenshot
  await page.screenshot({ path: 'verify-final-screenshot.png', fullPage: true });
  console.log('Screenshot saved: verify-final-screenshot.png');

  // T8: Trust badge
  console.log('\n--- T8: Trust badge ---');
  const warningTexts = await page.locator('text=warning').count();
  const reviewTexts = await page.locator('text=review sources').count();
  const groundedTexts = await page.locator('text=grounded').count();
  console.log('warning texts:', warningTexts, 'review:', reviewTexts, 'grounded:', groundedTexts);
  log('T8', 'Trust badge text visible', warningTexts > 0 || reviewTexts > 0 || groundedTexts > 0, 'warning=' + warningTexts + ' review=' + reviewTexts + ' grounded=' + groundedTexts);

  // T12: Inline citation [1] [2] links
  console.log('\n--- T12: Citation links ---');
  const citLinks = await page.locator('[data-testid="inline-citation-link"]').all();
  console.log('Inline citation links:', citLinks.length);
  log('T12', 'Inline [N] citation markers found', citLinks.length > 0, 'count=' + citLinks.length);

  if (citLinks.length > 0) {
    await citLinks[0].click();
    await page.waitForTimeout(1500);
    const popover = await page.locator('[data-radix-popper-content-wrapper]').first();
    const popVisible = await popover.isVisible().catch(() => false);
    log('T12', 'Citation popover opens', popVisible);
    if (popVisible) {
      const pText = await popover.textContent();
      log('T12', 'Popover has content', pText.trim().length > 5, '"' + pText.trim().slice(0, 60) + '"');
      await page.keyboard.press('Escape');
    }
  }

  // T11: Evidence cards (inside collapsed Evidence section)
  console.log('\n--- T11: Evidence cards ---');
  // First expand the Evidence section if it exists
  const evidenceHeader = page.locator('text=Evidence').first();
  const evidenceVisible = await evidenceHeader.isVisible().catch(() => false);
  console.log('Evidence section header visible:', evidenceVisible);
  if (evidenceVisible) {
    await evidenceHeader.click();
    await page.waitForTimeout(1000);
    console.log('Clicked Evidence to expand');
  }

  const cards240 = await page.locator('[class*="w-\\[240px\\]"]').all();
  console.log('240px cards found:', cards240.length);
  log('T11', '240px evidence cards rendered', cards240.length >= 1, 'count=' + cards240.length);

  if (cards240.length > 0) {
    const cardText = await cards240[0].textContent();
    log('T11', 'Card has text', cardText.trim().length > 3, '"' + cardText.trim().slice(0, 50) + '"');
    const cardBtn = await cards240[0].locator('button').count();
    log('T11', 'Card has button', cardBtn > 0, 'buttons=' + cardBtn);
  }

  // T14: Retrieval summary line
  console.log('\n--- T14: Retrieval summary ---');
  const allText = await page.textContent('body');
  const hasChunks = allText.includes('chunks');
  const hasBM = allText.includes('best match');
  console.log('"chunks":', hasChunks, '"best match":', hasBM);
  log('T14', 'Retrieval summary line visible', hasChunks || hasBM, 'chunks=' + hasChunks + ' bestMatch=' + hasBM);

  // T15: Priority pill values
  console.log('\n--- T15: Priority ---');
  const hasHigh = allText.includes('HIGH') || allText.includes('High') || allText.includes('Critical');
  const hasMed = allText.includes('MEDIUM') || allText.includes('Medium');
  const hasLow = allText.includes('LOW') || allText.includes('Low');
  const hasEM = allText.includes('\u2014');
  log('T15', 'Priority filled (HIGH/MEDIUM/LOW)', hasHigh || hasMed || hasLow, 'HIGH=' + hasHigh + ' MED=' + hasMed + ' LOW=' + hasLow);
  log('T15', 'UNAVAILABLE em-dash present', hasEM);

  // T3: Response style
  console.log('\n--- T3: Response style ---');
  const msgs = await page.locator('[data-testid="assistant-message"]').all();
  console.log('Assistant messages:', msgs.length);
  if (msgs.length > 0) {
    const lastMsg = msgs[msgs.length - 1];
    const lastMsgStatus = await lastMsg.getAttribute('data-status');
    console.log('Last message status:', lastMsgStatus);
    if (lastMsgStatus === 'complete' || !lastMsgStatus) {
      const msgText = await lastMsg.textContent();
      log('T3', 'Answer not starting with "I"', !msgText.trimStart().startsWith('I '), 'starts: "' + msgText.trimStart().slice(0, 40) + '"');
      log('T3', 'Answer not "Based on"', !msgText.toLowerCase().startsWith('based on'));
      log('T3', 'Answer substantive (>100 chars)', msgText.length > 100, 'len=' + msgText.length);
    }
  }

  // T1: Name check
  console.log('\n--- T1: Name ---');
  log('T1', 'TracePilot in page', allText.includes('TracePilot'));
  log('T1', 'No FieldCopilot', !allText.toLowerCase().includes('fieldcopilot'));

  // Health
  const nonAuth = errors.filter(e => !e.includes('401') && !e.includes('favicon') && !e.includes('Failed to load resource'));
  log('HEALTH', 'Zero console errors', nonAuth.length === 0, 'count=' + nonAuth.length);

  // Summary
  console.log('\n\n======= SUMMARY =======');
  const passed = results.filter(r => r.pass).length;
  console.log('PASS: ' + passed + '/' + results.length);
  results.filter(r => !r.pass).forEach(r => console.log('  FAIL: ' + r.id + ': ' + r.check + ' -- ' + r.detail));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
