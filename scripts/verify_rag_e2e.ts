
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

const QUERIES = [
    { q: "What are our Q4 OKRs for the AI search project?", label: "OKRs", expected: ["Launch semantic search", "2s p95 latency"] },
    { q: "Are there any blockers for the AI search launch?", label: "Blockers", expected: ["blockers", "issues"] }, // broad match
    { q: "What vector database are we using and why?", label: "Architecture", expected: ["vector", "database"] },
    { q: "Who is responsible for fixing the AWS blocker and when is the deadline?", label: "Owner/Deadline", expected: ["AWS", "blocker"] },
    { q: "What's our 2025 product roadmap?", label: "Roadmap", expected: ["2025", "roadmap"] }
];

async function verifyRag() {
    try {
        console.log("Login...");
        await client.post('/api/auth/login', {
            email: 'admin@fieldcopilot.com',
            password: 'admin123'
        });

        // 1. Check conversation persistence
        console.log("\n--- Testing Conversation Persistence ---");
        const res1 = await client.post('/api/chat', { message: "Hello world" }); // No conv ID
        const convId = res1.data.conversationId;
        if (!convId) {
            console.error("FAIL: No conversationId returned for new chat.");
            process.exit(1);
        }
        console.log("PASS: Created conversation:", convId);

        // 2. Run Queries
        console.log("\n--- Running RAG Queries ---");
        for (const { q, label, expected } of QUERIES) {
            console.log(`\nQuery: "${q}" [${label}]`);
            // Use same conversation or new? New to isolate context usually better for raw RAG test
            const res = await client.post('/api/chat', {
                message: q,
                // conversationId: convId // Keep in same conv or not? Let's use new to match "independent" requirement behavior if desired, but user said "independent; no cross-chat memory".
                // Actually user said "Multiple conversations supported... Each chat is independent".
                // Let's just create new ones implicitly or reuse. Reusing expands history.
                // Let's reuse to test persistence too.
                conversationId: convId,
                conversationHistory: [] // We control history explicitly or let backend fetch? 
                // Route uses history from body if provided, but we want to test backend retrieval? 
                // Route `runAgentTurn` uses `conversationHistory` from body.
                // Agent persistence doesn't automatically load history yet in `runAgentTurn` unless `context assembly` does it.
                // Current `runAgentTurn` (via `routes.ts`) takes history from body.
                // So if we don't pass it, it's effectively stateless RAG turn + storage.
            });

            const data = res.data;
            // console.log("Answer:", data.answer);

            // Invariant Check
            if (data.answer.includes("Not found") || data.answer.includes("I cannot answer")) {
                if (data.bullets && data.bullets.length > 0) {
                    console.error("FAIL: Invariant violated (Not found + bullets).");
                    console.error(JSON.stringify(data, null, 2));
                    process.exit(1);
                }
                console.warn(`WARN: Answer was "Not found". Double check data availability for: ${label}`);
            } else {
                // Grounding Check
                if (!data.citations || data.citations.length === 0) {
                    console.error("FAIL: Answer provided without citations.");
                    console.error("Answer:", data.answer);
                    process.exit(1);
                } else {
                    console.log(`PASS: ${data.citations.length} citations found.`);
                    // Check URL
                    const hasUrl = data.citations.every((c: any) => c.url && (c.url.startsWith("http") || c.url.startsWith("https")));
                    if (!hasUrl) {
                        console.error("FAIL: Some citations missing valid URLs.");
                        console.error(JSON.stringify(data.citations, null, 2));
                    } else {
                        console.log("PASS: Citations have valid URLs.");
                    }
                }
            }
        }

        console.log("\n✅ E2E Verification Complete.");

    } catch (error: any) {
        console.error("FAIL:", error.message);
        if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
        process.exit(1);
    }
}

verifyRag();
