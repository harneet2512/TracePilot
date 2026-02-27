// Test Q4 to verify owner/deadline citations appear in evidence excerpts
const BASE_URL = 'http://localhost:5000';

const loginRes = await fetch(BASE_URL + '/api/auth/login', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ email: 'golden-eval@example.com', password: 'password123' })
});
const csrf = (await loginRes.json()).csrfToken;
const cookie = loginRes.headers.getSetCookie?.()?.join('; ') || loginRes.headers.get('set-cookie');
console.log('Login:', loginRes.status === 200 ? 'OK' : 'FAILED');

const res = await fetch(BASE_URL + '/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'x-csrf-token': csrf },
  body: JSON.stringify({ message: 'Who is responsible for fixing the AWS blocker and when is the deadline?', conversationHistory: [] })
});
const text = await res.text();
let answer, details, trustSignal, retrievalSummary;
for (const line of text.split('\n')) {
  if (!line.startsWith('data: ')) continue;
  try {
    const d = JSON.parse(line.slice(6));
    if (d.answer !== undefined) answer = d.answer;
    if (d.details) details = d.details;
    if (d.trustSignal) trustSignal = d.trustSignal;
    if (d.retrievalSummary) retrievalSummary = d.retrievalSummary;
  } catch {}
}

console.log('\nTrust:', JSON.stringify(trustSignal));
console.log('Retrieval:', JSON.stringify(retrievalSummary));
console.log('\nAnswer (first 250 chars):', answer?.slice(0, 250));

console.log('\nEvidence by source (excerpt check):');
(details?.evidenceBySource ?? []).forEach(e => {
  console.log(' Source:', e.title || e.sourceKey);
  (e.excerpts ?? []).forEach(x => {
    const text = x.text ?? '';
    const hasOwner = /jordan martinez/i.test(text);
    const hasDate = /november 11|nov.*11/i.test(text);
    console.log('   excerpt:', text.slice(0, 100), '| owner:', hasOwner, '| date:', hasDate);
  });
});

console.log('\nSummary rows:');
(details?.summaryRows ?? []).forEach(r => {
  console.log(' row:', JSON.stringify(r));
});
