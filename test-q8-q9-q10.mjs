// Test Q8, Q9, Q10 with golden-eval user to verify they work
const BASE_URL = 'http://localhost:5000';

async function login(email, password) {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  const cookie = res.headers.getSetCookie?.()?.join('; ') || res.headers.get('set-cookie');
  return { cookie, csrf: body.csrfToken, status: res.status };
}

async function query(cookie, csrf, message) {
  const start = Date.now();
  const res = await fetch(BASE_URL + '/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ message, conversationHistory: [] })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const pass = Boolean(answer && answer.length > 20);
  return { pass, latency, trustLevel: trustSignal?.level ?? '—', answer: answer?.slice(0, 150), retrievalSummary };
}

const auth = await login('golden-eval@example.com', 'password123');
console.log('Login:', auth.status === 200 ? 'OK' : 'FAILED', '| CSRF:', auth.csrf ? 'ok' : 'missing');

const tests = [
  { id: 'Q8', msg: "What's the biggest risk to our Nov 15 launch and what are we doing about it?" },
  { id: 'Q9', msg: "Why did we choose Claude over GPT-4?" },
  { id: 'Q10', msg: "I'm new to the team - what should I know about Project Phoenix?" },
];

for (const t of tests) {
  try {
    const r = await query(auth.cookie, auth.csrf, t.msg);
    console.log(`\n${t.id}: ${r.pass ? 'PASS' : 'FAIL'} | trust=${r.trustLevel} | ${r.latency}ms`);
    console.log('Answer:', r.answer || '(empty)');
    if (r.retrievalSummary) console.log('Retrieval:', JSON.stringify(r.retrievalSummary));
  } catch (e) {
    console.log(`\n${t.id}: ERROR -`, e.message);
  }
}
