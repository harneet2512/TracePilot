import pg from 'pg';
import { readFileSync } from 'fs';

// Parse .env manually
const env = readFileSync('.env', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
console.log('DB:', dbUrl ? 'found' : 'not found');

const pool = new pg.Pool({ connectionString: dbUrl });

const client = await pool.connect();
try {
  const srcRes = await client.query('SELECT id, title, workspace_id FROM sources WHERE workspace_id = $1 ORDER BY created_at', ['default-workspace']);
  console.log('Sources for default-workspace:', srcRes.rowCount);
  srcRes.rows.forEach(r => console.log(' -', r.title));

  const chunkRes = await client.query('SELECT COUNT(*) as cnt FROM chunks WHERE workspace_id = $1', ['default-workspace']);
  console.log('Chunks in default-workspace:', chunkRes.rows[0].cnt);

  const gsrcRes = await client.query('SELECT id, title FROM sources WHERE workspace_id = $1 ORDER BY created_at', ['golden-eval-workspace']);
  console.log('Golden workspace sources:', gsrcRes.rowCount);
  gsrcRes.rows.forEach(r => console.log(' -', r.title));

  const gchunkRes = await client.query('SELECT COUNT(*) as cnt FROM chunks WHERE workspace_id = $1', ['golden-eval-workspace']);
  console.log('Chunks in golden-eval-workspace:', gchunkRes.rows[0].cnt);

  // Check which user is golden-eval
  const evalUser = await client.query('SELECT id, email, workspace_id FROM users WHERE email = $1', ['golden-eval@example.com']);
  console.log('golden-eval user:', JSON.stringify(evalUser.rows[0]));

} finally {
  client.release();
  await pool.end();
}
