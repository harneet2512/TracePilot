
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));
const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa";

async function verify() {
    console.log("=== SOURCES & CITATIONS VERIFICATION ===");
    try {
        await client.post('/api/auth/login', {
            email: 'admin@tracepilot.com',
            password: 'admin123'
        });

        const res = await client.post('/api/chat', {
            message: "what are our Q4 OKRs for AI search project?",
            scopeId: SCOPE_ID
        });

        const data = res.data;
        const sources = data.sources || data.citations; // Check both or preferred

        console.log(`Sources found: ${sources?.length}`);

        if (!sources || sources.length === 0) {
            console.error("FAIL: No sources returned");
            process.exit(1);
        }

        let failures = 0;
        sources.forEach((s: any, i: number) => {
            console.log(`\nSource ${i + 1}:`);
            console.log(`RAW SOURCE OBJ:`, JSON.stringify(s));
            console.log(`  Title: ${s.title} (Label: ${s.label})`);
            console.log(`  URL: ${s.url}`);
            console.log(`  ExtID: ${s.externalId}`);
            console.log(`  Mime: ${s.mimeType}`);

            if (!s.title || s.title === "Untitled Source") {
                console.error("  FAIL: invalid title");
                failures++;
            }
            if (!s.url || !s.url.startsWith("http")) {
                console.error("  FAIL: invalid URL");
                failures++;
            }
            if (!s.externalId && s.sourceType === 'google') {
                console.warn("  WARN: Google source missing externalId (checks frontend open logic)");
            }
        });

        // Check if bullets have citations
        const bullets = data.bullets || [];
        const citationsInBullets = bullets.some((b: any) => b.citations && b.citations.length > 0);
        if (!citationsInBullets) {
            console.error("FAIL: No citations inside bullets");
            failures++;
        } else {
            console.log("PASS: Citations present in bullets");
        }

        if (failures === 0) {
            console.log("\nALL CHECKS PASSED");
        } else {
            console.error(`\nFAILED with ${failures} errors`);
            process.exit(1);
        }

    } catch (e: any) {
        console.error("CRITICAL ERROR:", e.message);
        process.exit(1);
    }
}

verify();
