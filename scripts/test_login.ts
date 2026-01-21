import "dotenv/config";
import { storage } from "../server/storage";

async function testLogin() {
    console.log("Checking for admin user...");
    const user = await storage.getUserByEmail("admin@fieldcopilot.com");

    if (!user) {
        console.log("❌ User admin@fieldcopilot.com NOT FOUND in DB.");
        process.exit(1);
    }

    console.log("✅ User found:", { id: user.id, email: user.email, role: user.role, hasHash: !!user.passwordHash });

    console.log("Testing password 'admin123'...");
    const validUser = await storage.validatePassword("admin@fieldcopilot.com", "admin123");

    if (validUser) {
        console.log("✅ Password VALIDATED successfully.");
    } else {
        console.log("❌ Password validation FAILED.");
        console.log("Stored Hash:", user.passwordHash);
    }

    process.exit(0);
}

testLogin().catch(console.error);
