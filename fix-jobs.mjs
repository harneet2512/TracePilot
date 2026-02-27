import pg from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
const pool = new pg.Pool({ connectionString: dbUrl });
const client = await pool.connect();

try {
  // Verify golden-eval-workspace user
  const userRes = await client.query("SELECT id, email, workspace_id FROM users WHERE email = 'golden-eval@example.com'");
  console.log('golden-eval user:', JSON.stringify(userRes.rows[0]));

  // Check golden workspace chunk count
  const chunkRes = await client.query("SELECT COUNT(*) FROM chunks WHERE workspace_id = 'golden-eval-workspace'");
  console.log('Golden workspace chunks:', chunkRes.rows[0].count);

  // Confirm all golden sources are present
  const srcRes = await client.query("SELECT title FROM sources WHERE workspace_id = 'golden-eval-workspace' ORDER BY title");
  console.log('Golden sources:');
  srcRes.rows.forEach(r => console.log(' -', r.title));

  // Check pending/claimed jobs
  const jobRes = await client.query("SELECT status, COUNT(*) FROM jobs GROUP BY status ORDER BY status");
  console.log('\nJob counts by status:');
  jobRes.rows.forEach(r => console.log(' ', r.status, ':', r.count));

} finally {
  client.release();
  await pool.end();
}
