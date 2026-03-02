// Test Q7 and Q9 directly to understand why they fail
const BASE_URL = 'http://localhost:5000';

async function sendQuery(cookie, csrf, msg) {
  const start = Date.now();
  const res = await fetch(BASE_URL + '/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'x-csrf-token': csrf
    },
    body: JSON.stringify({ message: msg, conversationHistory: [] })
  });
  const text = await res.text();
  const latency = Date.now() - start;

  let answer, trustSignal, retrievalSummary;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const d = JSON.parse(line.slice(6));
      if (d.answer !== undefined) answer = d.answer;
      if (d.trustSignal) trustSignal = d.trustSignal;
      if (d.retrievalSummary) retrievalSummary = d.retrievalSummary;
    } catch {}
  }
  return { answer: answer?.slice(0, 200), trustSignal, retrievalSummary, latency, status: res.status };
}

// Login as admin@tracepilot.com
const loginRes = await fetch(BASE_URL + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@tracepilot.com', password: 'admin123' })
});
const loginBody = await loginRes.json();
const csrf = loginBody.csrfToken;
const cookie = loginRes.headers.getSetCookie?.()?.join('; ') || loginRes.headers.get('set-cookie');
console.log('Logged in as admin:', loginRes.status, 'CSRF:', csrf ? 'ok' : 'missing');

console.log('\n--- Q7: Cost query ---');
const q7 = await sendQuery(cookie, csrf, 'How much is the AI search project costing us?');
console.log('Status:', q7.status, '| Latency:', q7.latency, 'ms');
console.log('Trust:', JSON.stringify(q7.trustSignal));
console.log('Retrieval:', JSON.stringify(q7.retrievalSummary));
console.log('Answer:', q7.answer);

console.log('\n--- Q9: Claude vs GPT-4 ---');
const q9 = await sendQuery(cookie, csrf, 'Why did we choose Claude over GPT-4?');
console.log('Status:', q9.status, '| Latency:', q9.latency, 'ms');
console.log('Trust:', JSON.stringify(q9.trustSignal));
console.log('Retrieval:', JSON.stringify(q9.retrievalSummary));
console.log('Answer:', q9.answer);

console.log('\n--- Q10: Project Phoenix overview ---');
const q10 = await sendQuery(cookie, csrf, "I'm new to the team - what should I know about Project Phoenix?");
console.log('Status:', q10.status, '| Latency:', q10.latency, 'ms');
console.log('Trust:', JSON.stringify(q10.trustSignal));
console.log('Retrieval:', JSON.stringify(q10.retrievalSummary));
console.log('Answer:', q10.answer);
