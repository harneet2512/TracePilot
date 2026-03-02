
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));
const SCOPE_ID = "e1d4022a-156a-4d94-96b4-e2fdacffc7aa"; // Known Valid Scope

async function diagnose() {
    console.log("=== RAG CONTEXT DIAGNOSIS ===");
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
        // Look for debug info (assuming we have retrieval trace or similar, otherwise rely on the answer analysis)
        // Since we can't easily see the internal context without server logs, we will inspect the 'trace' if available
        // or just rely on the answer quality first.

        // Wait! The user asked to "Dump/log the exact “context” string passed to the LLM".
        // Use the debug endpoint I created earlier? GET /api/debug/rag/trace/:traceId
        // This endpoint returns span data.

        if (data.actionDraft && data.actionDraft.traceId) {
            const traceId = data.actionDraft.traceId;
            console.log(`fetching trace: ${traceId}`);
            const traceRes = await client.get(`/api/debug/rag/trace/${traceId}`);
            const trace = traceRes.data;

            // Find retrieval span or LLM span input
            const llmSpan = trace.spans.find((s: any) => s.kind === 'llm');
            if (llmSpan) {
                console.log("\n--- LLM PROMPT CONTEXT (First 5000 chars) ---");
                // Assuming metadataJson contains the prompt or at least the input messages
                const meta = llmSpan.metadataJson;
                if (meta && meta.prompt) {
                    console.log(meta.prompt.substring(0, 5000));
                } else if (meta && meta.messages) {
                    console.log(JSON.stringify(meta.messages, null, 2).substring(0, 5000));
                } else {
                    console.log("No prompt/messages found in LLM span metadata");
                    console.log("Keys:", Object.keys(meta || {}));
                }
            } else {
                console.log("LLM span not found in trace");
            }
        } else {
            console.log("No traceId found in response (check if dev mode is on)");
        }

    } catch (e: any) {
        console.error("ERROR:", e.message);
        if (e.response) console.error("Data:", e.response.data);
    }
}

diagnose();
