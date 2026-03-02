
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa";

async function verifyRagOkrs() {
    try {
        console.log("Login...");
        await client.post('/api/auth/login', {
            email: 'admin@tracepilot.com',
            password: 'admin123'
        });

        console.log("Querying OKRs...");
        const res = await client.post('/api/chat', {
            message: "what are our Q4 OKRs for AI search project?",
            scopeId: SCOPE_ID, // Explicitly sending scopeId
            conversationHistory: []
        });

        const data = res.data;
        const debug = data.debug || {};
        const traceId = debug.traceId;

        console.log(`Trace ID: ${traceId}`);
        console.log(`Answer Length: ${data.answer?.length}`);
        console.log(`Bullets: ${data.bullets?.length}`);
        console.log(`Citations: ${data.citations?.length}`);

        if (data.bullets) {
            data.bullets.forEach(b => console.log(`- ${b.claim} (cites: ${b.citations?.length})`));
        }

        // Fetch Trace Details
        if (traceId) {
            console.log("\nFetching Trace Details...");
            try {
                const traceRes = await client.get(`/api/debug/rag/trace/${traceId}`);
                const spans = traceRes.data.spans || [];
                const retrievalSpan = spans.find(s => s.name === "retrieval");
                if (retrievalSpan) {
                    console.log("Retrieval Stats:", JSON.stringify(retrievalSpan.metadata, null, 2));
                    console.log(`Retrieved Count: ${retrievalSpan.metadata.retrievalCount ?? "N/A"}`);
                } else {
                    console.log("WARN: No retrieval span found.");
                }

                const llmSpan = spans.find(s => s.name === "llm_completion");
                if (llmSpan) {
                    console.log("LLM Context Chars:", llmSpan.metadata.contextChars);
                    console.log("LLM Included Chunks:", llmSpan.metadata.includedChunks);
                }
            } catch (e) {
                console.error("Failed to fetch trace:", e.message);
            }
        }

        // Assertions
        const hasBullets = data.bullets && data.bullets.length >= 3;
        const hasCitations = data.citations && data.citations.length >= 1;
        const noEmptyBullets = data.bullets && !data.bullets.some(b => !b.claim || b.claim.trim() === "-");

        if (hasBullets && hasCitations && noEmptyBullets) {
            console.log("\nPASS: RAG Pipeline is Healthy.");
        } else {
            console.log("\nFAIL: RAG Pipeline failing requirements.");
            if (!hasBullets) console.log("- Not enough bullets (<3).");
            if (!hasCitations) console.log("- Missing citations.");
            if (!noEmptyBullets) console.log("- Empty bullets detected.");
        }

    } catch (error: any) {
        console.error("FAIL:", error.message);
        if (error.response) console.error(error.response.data);
    }
}

verifyRagOkrs();
