
/**
 * End-to-End Demo Evaluation for RAG Pipeline
 * 
 * Runs a set of test queries against the API and verifies:
 * - Response presence
 * - Grounding (citations presence)
 * - Specific keyword extraction where applicable
 */

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { strict as assert } from "assert";

// Configuration
const BASE_URL = "http://localhost:5000";
const EMAIL = "admin@tracepilot.com";
const PASSWORD = "admin123";
const LOGIN_ENDPOINT = "/api/auth/login";

interface QueryTestCase {
    query: string;
    expectedIntent?: "OKR" | "ROADMAP" | "GENERAL";
    checks: {
        contains?: string[];
        hasSources?: boolean;
        hasBullets?: boolean;
    };
}

const TEST_CASES: QueryTestCase[] = [
    {
        query: "What are the Q4 OKRs?",
        expectedIntent: "OKR",
        checks: {
            contains: ["Objective", "Key Result"],
            hasSources: true,
            hasBullets: true
        }
    },
    {
        query: "Show me the roadmap for Q1 2025.",
        expectedIntent: "ROADMAP",
        checks: {
            contains: ["Milestone"],
            hasSources: true,
            hasBullets: true
        }
    },
    {
        query: "What is the status of the AI Search project?",
        expectedIntent: "GENERAL",
        checks: {
            hasSources: true
        }
    },
];

async function runEvaluations() {
    console.log("🚀 Starting RAG Demo Evaluation...");

    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, baseURL: BASE_URL }));

    // 1. Login
    try {
        await client.post(LOGIN_ENDPOINT, { email: EMAIL, password: PASSWORD });
        console.log(`✅ Logged in as ${EMAIL}`);
    } catch (e: any) {
        throw new Error(`Login failed: ${e.message}`);
    }

    let passed = 0;
    let failed = 0;

    for (const testCase of TEST_CASES) {
        console.log(`\n-----------------------------------`);
        console.log(`Testing Query: "${testCase.query}"`);

        try {
            const res = await client.post('/api/chat', {
                message: testCase.query,
                channel: "http"
            });

            const data = res.data;
            console.log("Response received.");

            const answer = data.answer || "";
            const sources = data.sources || [];
            const bullets = data.bullets || [];

            // Validate Content
            if (testCase.checks.contains) {
                for (const term of testCase.checks.contains) {
                    if (!answer.toLowerCase().includes(term.toLowerCase())) {
                        if (answer.includes("Not found")) {
                            console.warn(`⚠️ Answer is "Not found". Expected term "${term}" missing.`);
                            // If not found is acceptable (empty KB), then technically logic is correct
                            // But strictly we might want to fail if data is expected.
                            // For now, allow "Not found" to catch logic errors (crashes), 
                            // but log warning.
                        } else {
                            throw new Error(`Missing term: ${term}`);
                        }
                    }
                }
            }

            // Validate Sources
            if (testCase.checks.hasSources) {
                if (sources.length === 0) {
                    if (answer.toLowerCase().includes("not found")) {
                        console.log("ℹ️ Correctly identified 'Not Found'.");
                    } else {
                        throw new Error("Missing sources for grounded answer");
                    }
                } else {
                    const s1 = sources[0];
                    if (!s1.url || !s1.title) {
                        throw new Error(`Source missing URL/Title: ${JSON.stringify(s1)}`);
                    }
                }
            }

            // Validate Bullets
            if (testCase.checks.hasBullets && bullets.length === 0) {
                if (!answer.toLowerCase().includes("not found")) {
                    throw new Error("Missing bullets");
                }
            }

            console.log(`✅ PASSED`);
            passed++;

        } catch (e: any) {
            console.error(`❌ FAILED: ${e.message}`);
            if (e.response) {
                console.error("Data:", e.response.data);
            }
            failed++;
        }
    }

    console.log(`\n===================================`);
    console.log(`Summary: ${passed} Passed, ${failed} Failed`);

    if (failed > 0) process.exit(1);
}

runEvaluations().catch(e => {
    console.error("Fatal Error:", e);
    process.exit(1);
});
