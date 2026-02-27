
import { db } from "../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

async function setPassword() {
    try {
        const email = "demo-eval@example.com";
        const password = "password";
        const hash = await bcrypt.hash(password, 10);

        console.log(`Setting password for ${email}...`);

        // Update user
        await db.update(users)
            .set({ passwordHash: hash })
            .where(eq(users.email, email));

        console.log("Password set successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error setting password:", err);
        process.exit(1);
    }
}

setPassword();
