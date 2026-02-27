
import "dotenv/config";
import { storage } from "../server/storage";

async function run() {
    try {
        const sources = await storage.getSources();
        console.log(`Found ${sources.length} sources.`);
        sources.forEach(s => {
            console.log(`- [${s.id}] ${s.title} (${s.type})`);
        });
    } catch (e) {
        console.error(e);
    }
}

run().catch(console.error);
