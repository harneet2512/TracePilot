
import "dotenv/config";
import { retrieveForAnswer } from "../server/lib/retrieval";
import { normalizeForGrounding } from "../server/lib/rag/textNormalizer";
import { storage } from "../server/storage";

async function run() {
    const q = "What are our Q4 OKRs for the AI search project?";
    const userId = (await storage.getUserByEmail("admin@fieldcopilot.com"))?.id;
    if (!userId) {
        console.log("User not found");
        return;
    }
    const user = await storage.getUser(userId);
    const filters = {
        workspaceId: user?.workspaceId || "default-workspace",
        requesterUserId: userId,
    };

    console.log(`Searching for: "${q}"`);
    const { chunks, diagnostics } = await retrieveForAnswer(q, filters);

    console.log(`\nRetrieved ${chunks.length} chunks.`);
    console.log("Diagnostics:", JSON.stringify(diagnostics.decision, null, 2));

    for (const res of chunks) {
        console.log(`\n[Chunk ${res.chunk.id}] Source: ${res.source?.title} (Score: ${res.score})`);
        console.log(`Text: ${res.chunk.text.slice(0, 200)}...`);

        // Test Grounding
        const expected = "Launch semantic search by November 15, 2024";
        const normText = normalizeForGrounding(res.chunk.text);
        const normQuote = normalizeForGrounding(expected);

        if (normText.includes(normQuote)) {
            console.log("✅ Grounding Check PASS for 'Launch semantic search...'");
        } else {
            console.log("❌ Grounding Check FAIL for 'Launch semantic search...'");
            // console.log("NormText:", normText);
            // console.log("NormQuote:", normQuote);
        }
    }
}

run().catch(console.error);
