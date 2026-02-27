
import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;

async function checkChunks() {
    if (!process.env.DATABASE_URL) process.exit(1);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log("Checking for relevant chunks...");

        const resBio = await pool.query(`SELECT count(*) FROM chunks WHERE text ILIKE '%biology%'`);
        console.log("Chunks with 'biology':", resBio.rows[0].count);

        const resOCR = await pool.query(`SELECT count(*) FROM chunks WHERE text ILIKE '%OKR%' OR text ILIKE '%Q4%' OR text ILIKE '%AI search%'`);
        console.log("Chunks with 'OKR'/'Q4'/'AI search':", resOCR.rows[0].count);

        const allChunks = await pool.query(`SELECT text, source_id, metadata_json FROM chunks LIMIT 5`);
        console.log("Sample Chunks:", allChunks.rows.map(r => r.text.slice(0, 50)));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkChunks();
