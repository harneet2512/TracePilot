
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa";
const OUTPUT_FILE = path.resolve('tmp/repro_okrs_output.txt');

// Ensure tmp dir exists
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

async function repro() {
    try {
        console.log("Login...");
        await client.post('/api/auth/login', {
            email: 'admin@fieldcopilot.com',
            password: 'admin123'
        });

        console.log("Querying OKRs...");
        const res = await client.post('/api/chat', {
            message: "what are our Q4 OKRs for AI search project?",
            scopeId: SCOPE_ID,
            conversationHistory: []
        });

        const data = res.data;
        const debug = data.debug || {};
        const traceId = debug.traceId;

        console.log(`Response Status: ${res.status}`);
        console.log(`Trace ID: ${traceId}`);
        console.log(`Answer: ${data.answer?.slice(0, 100)}...`);
        console.log(`Bullets Count: ${data.bullets?.length}`);

        if (!traceId) {
            console.error("FAIL: No Trace ID returned.");
            process.exit(1);
        }

        // Fetch Trace
        console.log("Fetching Trace...");
        // Wait a bit to ensure async writes to DB are done (though await in agentCore should handle it)
        await new Promise(r => setTimeout(r, 1000));

        const traceRes = await client.get(`/api/debug/rag/trace/${traceId}?skip_auth=1`);
        const traceData = traceRes.data;

        console.log(`Trace Status: ${traceData.trace?.status}`);
        const spans = traceData.spans || [];
        console.log(`Spans Found: ${spans.length}`);

        if (spans.length > 0) {
            console.log("Span Names:", spans.map((s: any) => s.name).join(", "));
            // Log full details of retrieval span if present, else first span
            const retrievalSpan = spans.find((s: any) => s.name === "retrieval");
            if (retrievalSpan) {
                console.log("Retrieval Span Details:", JSON.stringify(retrievalSpan, null, 2));
            } else {
                console.log("First Span Details:", JSON.stringify(spans[0], null, 2));
            }
        } else {
            console.log("WARN: No spans found in trace object.");
        }

        const report = `
=== REPRO REPORT ===
Trace ID: ${traceId}
Spans Count: ${spans.length}
Span Names: ${spans.map((s: any) => s.name).join(", ")}

1. OUTPUT
   Bullets Count: ${data.bullets?.length}
   Citations Count: ${data.citations?.length}

2. TRACE DATA
   ${JSON.stringify(traceData, null, 2)}
`;

        fs.writeFileSync(OUTPUT_FILE, report);
        console.log(`Report saved to ${OUTPUT_FILE}`);

    } catch (e: any) {
        console.error("FAIL:", e.message);
        if (e.response) console.error(e.response.data);
    }
}

repro();
