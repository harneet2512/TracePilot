
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../shared/schema.ts");
const backupPath = path.join(__dirname, "../shared/schema.pg.ts");

if (fs.existsSync(backupPath)) {
    console.log("Restoring shared/schema.ts from shared/schema.pg.ts");
    fs.copyFileSync(backupPath, schemaPath);
    console.log("Switched shared/schema.ts back to Postgres version.");
} else {
    console.error("No backup found at shared/schema.pg.ts. Cannot restore.");
    process.exit(1);
}
