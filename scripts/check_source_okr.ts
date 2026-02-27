
import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;

async function checkSources() {
    if (!process.env.DATABASE_URL) process.exit(1);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log("Checking for 'OKR' sources...");

        const res = await pool.query(`SELECT id, title, type, created_at FROM sources WHERE title ILIKE '%OKR%' OR full_text ILIKE '%OKR%'`);
        console.log(`Found ${res.rows.length} sources matching 'OKR':`);
        res.rows.forEach(r => console.log(` - [${r.type}] ${r.title} (${r.id})`));

        if (res.rows.length > 0) {
            const sourceId = res.rows[0].id;
            const chunksRes = await pool.query(`SELECT count(*) FROM chunks WHERE source_id = $1`, [sourceId]);
            console.log(`Chunks for this source: ${chunksRes.rows[0].count}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkSources();
