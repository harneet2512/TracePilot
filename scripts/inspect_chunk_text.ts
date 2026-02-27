
import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;

async function checkChunkText() {
    if (!process.env.DATABASE_URL) process.exit(1);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const sourceId = '0feb67d7-b827-4917-a69d-872d9e96da3d';
        console.log(`Checking chunks for source ${sourceId}...`);

        const res = await pool.query(`SELECT id, text, metadata_json FROM chunks WHERE source_id = $1`, [sourceId]);

        if (res.rows.length === 0) {
            console.log("No chunks found.");
        } else {
            console.log(`Found ${res.rows.length} chunk(s):`);
            res.rows.forEach((r, i) => {
                console.log(`--- Chunk ${i} ---`);
                console.log(JSON.stringify(r.text));
                console.log(`Length: ${r.text.length}`);
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkChunkText();
