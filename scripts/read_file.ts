
import * as fs from 'fs';
import * as path from 'path';

const file = process.argv[2];
if (!file) {
    console.error("Usage: tsx read_file.ts <file>");
    process.exit(1);
}

try {
    // Try utf8, if fails, maybe try reading as buffer and printing string
    const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    console.log(content);
} catch (e) {
    console.error("Error reading file:", e);
}
