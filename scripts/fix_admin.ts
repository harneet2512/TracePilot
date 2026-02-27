import "dotenv/config";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

async function fixAdmin() {
    console.log("Fixing admin user...");

    // generated hash for 'admin123'
    const newHash = await bcrypt.hash("admin123", 10);
    console.log("New Hash Generated:", newHash);

    const existing = await storage.getUserByEmail("admin@fieldcopilot.com");
    if (!existing) {
        console.log("Admin not found, creating...");
        await storage.createUser({
            workspaceId: "default-workspace",
            email: "admin@fieldcopilot.com",
            passwordHash: "admin123", // validatePassword will hash this? No, createUser hashes it.
            role: "admin"
        });
    } else {
        console.log("Admin found. Updating password hash directly via DB...");
        // We update directly to avoid any middleware confusion, specifically setting the hash we just made
        await (db as any).update(users)
            .set({ passwordHash: newHash })
            .where(eq(users.email, "admin@fieldcopilot.com"));
    }

    console.log("Verifying...");
    const valid = await storage.validatePassword("admin@fieldcopilot.com", "admin123");
    if (valid) {
        console.log("✅ SUCCESS: Password updated and verified.");
    } else {
        console.log("❌ FAILURE: Password still invalid.");
    }

    process.exit(0);
}

fixAdmin().catch(e => {
    console.error(e);
    process.exit(1);
});
