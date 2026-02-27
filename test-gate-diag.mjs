// Diagnose the 4 failing gates: owner/deadline citation, priority/impact summary
const BASE_URL = 'http://localhost:5000';

const loginRes = await fetch(BASE_URL + '/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'golden-eval@example.com',password:'password123'})});
const csrf = (await loginRes.json()).csrfToken;
const cookie = loginRes.headers.getSetCookie?.()?.join('; ') || loginRes.headers.get('set-cookie');

async function check(msg, label) {
  const res = await fetch(BASE_URL + '/api/chat/stream', {
    method:'POST', headers:{'Content-Type':'application/json','Cookie':cookie,'x-csrf-token':csrf},
    body: JSON.stringify({message: msg, conversationHistory:[]})
  });
  const text = await res.text();
  let answer, details;
  for (const l of text.split('\n')) {
    if (!l.startsWith('data: ')) continue;
    try { const d=JSON.parse(l.slice(6)); if(d.answer)answer=d.answer; if(d.details)details=d.details; } catch {}
  }

  console.log(`\n=== ${label} ===`);

  // Extract dates from answer
  const dateRe = /\b([A-Za-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;
  const dates = [...(answer || '').matchAll(dateRe)].map(m => m[1]);
  console.log('Dates in answer:', dates);

  // Check owner names
  const hasJordan = /jordan martinez/i.test(answer || '');
  console.log('Mentions Jordan Martinez:', hasJordan);

  // Check evidence excerpts for dates and names
  const excerpts = (details?.evidenceBySource ?? []).flatMap(e => (e.excerpts ?? []).map(x => ({source: e.title, text: x.text ?? ''})));
  console.log('Evidence excerpts:', excerpts.length);
  const allText = excerpts.map(e => e.text.toLowerCase()).join(' ');
  dates.forEach(d => {
    const normalized = d.toLowerCase().replace(/,/g, '');
    const found = allText.includes(normalized);
    console.log(`  Date "${d}" in excerpts: ${found}`);
  });
  console.log('  Jordan in excerpts:', /jordan martinez/i.test(allText));

  // Check summary rows
  (details?.summaryRows ?? []).forEach((r, i) => {
    console.log(`  Row ${i}: priority="${r.priority}" impact="${r.impact?.slice(0,50)}"`)
  });
}

await check('Are there any blockers for the AI search launch?', 'Q2 Run1 (BLOCKER)');
await check('Who is responsible for fixing the AWS blocker and when is the deadline?', 'Q4 (OWNER)');
await check("What's the biggest risk to our Nov 15 launch and what are we doing about it?", 'Q8 (RISK)');
