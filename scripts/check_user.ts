
import { storage } from "../server/storage";

async function main() {
    try {
        // We need to access the underlying DB or use a method to list users if available.
        // storage.getUserByEmail is available.
        // But I want to list all. storage.ts interface has getUser(id) and getUserByEmail(email).
        // It does NOT have getAllUsers exposed in IStorage explicitly, but DatabaseStorage implementation might have it or I can add it/use direct DB if needed.
        // Actually, I can just try to fetch a known user or check the count.

        // Let's try to find a user by a common email 'demo@fieldcopilot.com' or 'admin@example.com'
        const email = "demo@fieldcopilot.com";
        const user = await storage.getUserByEmail(email);

        if (user) {
            console.log(`User found: ${user.email} (ID: ${user.id})`);
            console.log(`Role: ${user.role}`);
        } else {
            console.log(`User ${email} not found.`);
        }

        // Also try a raw query if possible or just exit. 
        // Since I cannot easily execute raw SQL without importing db from server/db.ts
        // I will rely on the storage method.

    } catch (err) {
        console.error("Error checking users:", err);
    }
}

main();
