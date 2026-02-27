// Test if BLOCKER response has Priority/Impact populated in summary rows
const BASE_URL = 'http://localhost:5000';

const loginRes = await fetch(BASE_URL + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'golden-eval@example.com', password: 'password123' })
});
const loginBody = await loginRes.json();
const cookie = loginRes.headers.getSetCookie?.()?.join('; ') || loginRes.headers.get('set-cookie');
const csrf = loginBody.csrfToken;
console.log('Login:', loginRes.status === 200 ? 'OK' : 'FAILED');

// Q2 (blockers) - should produce BLOCKER table with priority/impact
const res = await fetch(BASE_URL + '/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'x-csrf-token': csrf },
  body: JSON.stringify({ message: 'Are there any blockers for the AI search launch?', conversationHistory: [] })
});

const text = await res.text();
let answer, details, sections;
for (const line of text.split('\n')) {
  if (!line.startsWith('data: ')) continue;
  try {
    const d = JSON.parse(line.slice(6));
    if (d.answer !== undefined) answer = d.answer;
    if (d.details) details = d.details;
    if (d.sections) sections = d.sections;
  } catch {}
}

console.log('\nAnswer (first 200 chars):', answer?.slice(0, 200));
console.log('\nDetails.summaryRows:', JSON.stringify(details?.summaryRows, null, 2));
console.log('\nSections (type check):', sections?.map(s => ({ type: s.type, hasPriority: !!s.priority, hasImpact: !!s.impact })));
