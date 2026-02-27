
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa";
const OUTPUT_FILE = path.resolve('tmp/verify_rag_quality_report.txt');

// Ensure tmp dir exists
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

async function verify() {
    let failures = 0;
    const reportLines: string[] = [];

    const log = (msg: string) => {
        console.log(msg);
        reportLines.push(msg);
    };

    try {
        log("=== RAG QUALITY VERIFICATION ===");
        log("Logging in...");
        await client.post('/api/auth/login', {
            email: 'admin@fieldcopilot.com',
            password: 'admin123'
        });

        // TEST 1: Positive Case (OKRs)
        log("\n--- TEST 1: Positive Case (OKRs) ---");
        const res1 = await client.post('/api/chat', {
            message: "what are our Q4 OKRs for AI search project?",
            scopeId: SCOPE_ID,
            conversationHistory: []
        });
        const data1 = res1.data;

        if (data1.bullets && data1.bullets.length > 0) {
            log("PASS: Bullets present.");
        } else {
            log("FAIL: Bullets missing for known content.");
            failures++;
        }

        if (data1.citations && data1.citations.length > 0) {
            log("PASS: Citations present.");
        } else {
            log("FAIL: Citations missing for known content.");
            failures++;
        }

        // Check Trace
        const traceId1 = data1.debug?.traceId;
        if (traceId1) {
            // Wait for async trace write
            await new Promise(r => setTimeout(r, 1000));
            const traceRes = await client.get(`/api/debug/rag/trace/${traceId1}?skip_auth=1`);
            const spans = traceRes.data.spans || [];
            if (spans.find((s: any) => s.name === "retrieval")) {
                log("PASS: Retrieval span found.");
            } else {
                log("FAIL: Retrieval span missing.");
                failures++;
            }
        } else {
            log("FAIL: No traceId returned.");
            failures++;
        }

        // TEST 2: Negative Case (Irrelevant Query)
        log("\n--- TEST 2: Negative Case (Irrelevant Query) ---");
        const res2 = await client.post('/api/chat', {
            message: "What is the recipe for chocolate cake defined in our strategy?",
            scopeId: SCOPE_ID,
            conversationHistory: []
        });
        const data2 = res2.data;

        log(`Answer: ${data2.answer}`);
        if (data2.bullets && data2.bullets.length === 0) {
            log("PASS: Bullets empty for irrelevant query.");
        } else {
            log(`FAIL: Bullets NOT empty for irrelevant query. Found: ${data2.bullets.map((b: any) => b.claim)}`);
            failures++;
        }

        const answerLower = data2.answer.toLowerCase();
        if (answerLower.includes("couldn't find") || answerLower.includes("don't have") || answerLower.includes("no information")) {
            log("PASS: Answer indicates 'not found'.");
        } else {
            // It might also be a polite refusal without exact phrase, but typically we want explicit signal
            // If answer is just generic chat without claiming facts, it's arguably okay, but we prefer explicit.
            log(`WARN: Answer might not be explicit about not finding info: "${data2.answer}"`);
        }

        log("\n=== SUMMARY ===");
        if (failures === 0) {
            log("ALL TESTS PASSED.");
        } else {
            log(`${failures} TESTS FAILED.`);
            process.exit(1);
        }

        fs.writeFileSync(OUTPUT_FILE, reportLines.join('\n'));

    } catch (e: any) {
        log(`CRITICAL FAIL: ${e.message}`);
        if (e.response) log(JSON.stringify(e.response.data));
        process.exit(1);
    }
}

verify();
