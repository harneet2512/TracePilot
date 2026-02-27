
import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;

async function testConnection() {
    console.log("Testing raw PG connection...");
    // Force 127.0.0.1 to avoid IPv6 issues
    const url = process.env.DATABASE_URL?.replace("localhost", "127.0.0.1");
    console.log("URL:", url);

    const pool = new Pool({
        connectionString: url,
        connectionTimeoutMillis: 5000,
        ssl: false, // Explicitly disable SSL
    });

    try {
        const client = await pool.connect();
        console.log("Connected successfully!");
        const res = await client.query('SELECT NOW()');
        console.log("Result:", res.rows[0]);
        client.release();
    } catch (err) {
        console.error("Connection failed:", err);
    } finally {
        await pool.end();
    }
}

testConnection();
