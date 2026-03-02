
import "dotenv/config";
import { runAgentTurn } from "../server/lib/agent/agentCore";
import { storage } from "../server/storage";

async function run() {
    const q = "Are there any blockers for the AI search launch?";

    let user = await storage.getUserByEmail("test@example.com");
    if (!user) user = await storage.getUserByEmail("alice@tracepilot.com"); // Fallback

    // Or just mock
    const userId = user?.id || "test-user-id";

    console.log("Running query:", q);
    const result = await runAgentTurn({
        message: q,
        userId: userId,
        userRole: "admin",
        channel: "http",
        topK: 10
    });

    console.log("Answer:", result.answerText);
    console.log("Bullets:", JSON.stringify(result.bullets, null, 2));
    console.log("Citations:", JSON.stringify(result.citations, null, 2));
}

run().catch(console.error);
