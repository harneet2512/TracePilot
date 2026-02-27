console.log("Importing schema...");
import { sources, chunks } from "../shared/schema";
console.log("Schema imported successfully");
console.log("sources table:", sources._.name);
console.log("chunks table:", chunks._.name);
process.exit(0);
