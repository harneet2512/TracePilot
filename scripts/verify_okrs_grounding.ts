
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));
const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa"; // Known Valid Scope

async function verify() {
    console.log("=== OKR EXTRACTION & GROUNDING VERIFICATION ===");
    let failures = 0;

    try {
        // Login
        await client.post('/api/auth/login', {
            email: 'admin@tracepilot.com',
            password: 'admin123'
        });

        // Test Case 1: OKR Question
        console.log("\nTest 1: Asking 'What are our Q4 OKRs for AI search project?'...");
        const res = await client.post('/api/chat', {
            message: "what are our Q4 OKRs for AI search project?",
            scopeId: SCOPE_ID
        });

        const data = res.data;
        console.log("FULL RESPONSE:", JSON.stringify(data, null, 2));
        console.log("Answer:", data.answer);

        if (!data || data.answer === undefined) {
            console.error("FAIL: data.answer is undefined");
            failures++;
            process.exit(1);
        }

        // Assertions
        if (!data.answer.toLowerCase().includes("objective") && !data.answer.toLowerCase().includes("not found")) {
            console.error("FAIL: Answer does not contain 'Objective' or 'Not found'");
            failures++;
        }

        if (data.bullets.length === 0 && !data.answer.toLowerCase().includes("not found")) {
            console.error("FAIL: No bullets returned but answer is not 'Not found'");
            failures++;
        }

        // Check for empty bullets
        const hasEmptyBullets = data.bullets.some((b: any) => b.claim.trim() === "-" || b.claim.trim() === "");
        if (hasEmptyBullets) {
            console.error("FAIL: Response contains empty bullets ('-')");
            failures++;
        }

        // Citations check
        if (data.bullets.length > 0) {
            console.log(`Found ${data.bullets.length} bullets.`);
            data.bullets.forEach((b: any, i: number) => {
                if (!b.citations || b.citations.length === 0) {
                    console.error(`FAIL: Bullet ${i + 1} has no citations`);
                    failures++;
                } else {
                    b.citations.forEach((c: any) => {
                        if (!c.url) console.warn(`WARN: Citation ${c.sourceId} missing URL`);
                        if (!c.label && !c.title) console.warn(`WARN: Citation ${c.sourceId} missing label/title`);
                    });
                }
            });
        }

        // Sources check
        if (!data.sources || data.sources.length === 0) {
            // It's possible to have no sources if not found, but if we have bullets we expect sources
            if (data.bullets.length > 0) {
                console.error("FAIL: Missing 'sources' array in response");
                failures++;
            }
        } else {
            console.log(`Found ${data.sources.length} top-level sources.`);
            data.sources.forEach((s: any) => {
                if (!s.title) {
                    console.error("FAIL: Source missing title");
                    failures++;
                }
                if (!s.url) {
                    console.error("FAIL: Source missing URL");
                    failures++;
                }
            });
        }

    } catch (e: any) {
        console.error("CRITICAL ERROR:", e.message);
        if (e.response) console.error("Data:", e.response.data);
        failures++;
    }

    if (failures === 0) {
        console.log("\n✅ VERIFICATION PASSED");
        process.exit(0);
    } else {
        console.error(`\n❌ VERIFICATION FAILED with ${failures} errors`);
        process.exit(1);
    }
}

verify();
