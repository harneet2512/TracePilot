
import "dotenv/config";
import { storage } from "../server/storage";

async function run() {
    console.log("Creating conversation...");
    try {
        const user = await storage.getUserByEmail("admin@fieldcopilot.com");
        if (!user) throw new Error("User not found");

        const conv = await storage.createConversation(user.id, "Debug Chat");
        console.log("Conversation created:", conv.id);

        console.log("Creating User message...");
        const msg = await storage.createMessage({
            conversationId: conv.id,
            role: "user",
            content: "Hello db debug",
            metadataJson: {}
        });
        console.log("User message created:", msg.id);

        console.log("Creating Assistant message...");
        const msg2 = await storage.createMessage({
            conversationId: conv.id,
            role: "assistant",
            content: "Hello response",
            metadataJson: { foo: "bar" }
        });
        console.log("Assistant message created:", msg2.id);

    } catch (e) {
        console.error("DB Error:", e);
    }
}

run().catch(console.error);
