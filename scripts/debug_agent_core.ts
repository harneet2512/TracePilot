
import "dotenv/config";
import { runAgentTurn } from "../server/lib/agent/agentCore";
import { storage } from "../server/storage";

async function run() {
    console.log("Running Agent Core Debug...");
    try {
        const user = await storage.getUserByEmail("admin@fieldcopilot.com");
        if (!user) throw new Error("User not found");

        const result = await runAgentTurn({
            message: "Hello world agent core",
            userId: user.id,
            userRole: user.role as "admin" | "member",
            channel: "http",
            requestId: "debug-req-id"
        });

        console.log("Result:", result.answerText);
    } catch (e) {
        console.error("Agent Core Error:", e);
    }
}

run().catch(console.error);
