
import pg from 'pg';
import { randomUUID } from 'crypto';
import "dotenv/config";
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const { Pool } = pg;
const API_BASE = "http://localhost:5000";
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: API_BASE }));

async function reproduceFlake() {
    if (!process.env.DATABASE_URL) process.exit(1);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log("1. Setup: Login...");
        await client.post('/api/auth/login', { email: 'admin@tracepilot.com', password: 'admin123' });

        const uniqueSecret = `Secret-${randomUUID()}`;
        console.log(`2. Inserting NEW chunk with unique text: "${uniqueSecret}"...`);

        // We need a valid source/version. Use first available or create mock.
        let sourceId, versionId;
        const sourceRes = await pool.query('SELECT id FROM sources LIMIT 1');
        if (sourceRes.rows.length === 0) {
            // Create min source
            sourceId = randomUUID();
            await pool.query(`INSERT INTO sources (id, workspace_id, created_by_user_id, type, title, content_hash, created_at, updated_at) VALUES ($1, 'default-workspace', 'admin-user-id', 'upload', 'Test Source', 'hash', NOW(), NOW())`, [sourceId]);
        } else {
            sourceId = sourceRes.rows[0].id;
        }

        // Create chunk
        const chunkId = randomUUID();
        await pool.query(`INSERT INTO chunks (id, workspace_id, source_id, chunk_index, text, created_at) VALUES ($1, 'default-workspace', $2, 0, $3, NOW())`,
            [chunkId, sourceId, `This is the secret content: ${uniqueSecret}`]);

        console.log("   Chunk inserted.");

        console.log("3. Querying immediately...");
        const res = await client.get(`/api/debug/retrieval/diagnose?q=${uniqueSecret}&skip_auth=1`);

        const chunks = res.data.primaryRetrieval?.chunks || [];
        const found = chunks.some((c: any) => c.preview.includes(uniqueSecret));

        if (!found) {
            console.log("✅ REPRODUCTION SUCCESS: New chunk was NOT retrieved!");
            console.log("   Reason: Vector store likely stale/cached.");
        } else {
            console.log("❌ REPRODUCTION FAILED: Chunk WAS retrieved.");
            console.log("   Maybe vector store auto-refreshes?");
        }

    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.response) console.log(e.response.data);
    } finally {
        await pool.end();
    }
}

reproduceFlake();
