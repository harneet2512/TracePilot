const BASE_URL = 'http://localhost:5000';

const loginRes = await fetch(BASE_URL + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@fieldcopilot.com', password: 'admin123' })
});
const loginBody = await loginRes.json();
const csrf = loginBody.csrfToken;
const cookie = loginRes.headers.getSetCookie?.()?.join('; ') || loginRes.headers.get('set-cookie');

const res = await fetch(BASE_URL + '/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'x-csrf-token': csrf },
  body: JSON.stringify({ message: 'How much is the AI search project costing us?', conversationHistory: [] })
});

const text = await res.text();
console.log('=== RAW RESPONSE (first 2000 chars) ===');
console.log(text.slice(0, 2000));
console.log('=== TOTAL LENGTH:', text.length, '===');

// Parse all events
const events = text.split('\n').filter(l => l.trim());
console.log('\n=== ALL EVENTS ===');
events.forEach(e => console.log(e.slice(0, 200)));
