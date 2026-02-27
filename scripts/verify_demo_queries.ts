
import "dotenv/config";
import { runAgentTurn } from "../server/lib/agent/agentCore";
import { storage } from "../server/storage";
import { strict as assert } from "assert";

// Mock request context
const mockUserId = "test-user-id";
const mockRequestId = "test-request-id";

async function runTest() {
    console.log("Starting verification of demo queries...");

    // Ensure we have a user
    let user = await storage.getUserByEmail("test@example.com");
    if (!user) {
        user = await storage.createUser({
            email: "test@example.com",
            password: "password",
            role: "admin",
            workspaceId: "default-workspace"
        });
    }

    const userId = user.id;

    const queries = [
        {
            q: "What are our Q4 OKRs for the AI search project?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No top-level citations");
                assert(res.bullets.length > 0, "No bullets returned");
                assert(res.bullets[0].citations.length > 0, "First bullet has no citations");
                const text = res.answerText + JSON.stringify(res.bullets);
                assert(text.toLowerCase().includes("nov 15") || text.includes("500") || text.includes("180"), "Missing OKR details");
            }
        },
        {
            q: "Are there any blockers for the AI search launch?",
            checks: (res: any) => {
                // If docs exist, it should return blockers. If not, refusal.
                // We assume docs exist for this test based on user prompt.
                if (res.citations.length > 0) {
                    assert(res.bullets.length > 0, "Found citations but no bullets for blockers");
                    assert(res.bullets[0].citations.length > 0, "Blocker bullet missing citation");
                }
            }
        },
        {
            q: "What vector database are we using and why?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for vector db");
                const text = res.answerText.toLowerCase();
                assert(text.includes("pinecone"), "Did not mention Pinecone");
            }
        },
        {
            q: "Who is responsible for fixing the AWS blocker and when is the deadline?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for owner/deadline");
            }
        },
        {
            q: "What’s our 2025 product roadmap?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for roadmap");
                assert(res.bullets.length > 0, "No bullets for roadmap");
            }
        },
        {
            q: "Who should I contact about infrastructure issues?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for contact");
                const text = res.answerText + JSON.stringify(res.bullets);
                assert(text.includes("Jordan") || text.includes("Martinez"), "Did not mention Jordan Martinez");
            }
        },
        {
            q: "How much is the AI search project costing us?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for budget");
            }
        },
        {
            q: "What’s the biggest risk to our Nov 15 launch and what are we doing about it?",
            checks: (res: any) => {
                assert(res.citations.length > 0, "No citations for risk");
            }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const { q, checks } of queries) {
        console.log(`\nRunning query: "${q}"`);
        try {
            const result = await runAgentTurn({
                message: q,
                userId: userId,
                userRole: "admin",
                channel: "http",
                requestId: mockRequestId,
                topK: 10
            });

            console.log(`Answer: ${result.answerText.substring(0, 100)}...`);
            console.log(`Citations: ${result.citations.length}`);

            checks(result);
            console.log("✅ PASS");
            passed++;
        } catch (e: any) {
            console.log("❌ FAIL: " + e.message);
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTest().catch(console.error);
