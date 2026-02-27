
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testPdf() {
    try {
        const main = require("pdf-parse");
        console.log("Type of require('pdf-parse'):", typeof main);

        if (typeof main === 'function') {
            console.log("PASS: It is a function! v1.1.1 installed.");
        } else {
            console.log("FAIL: It is NOT a function.");
        }
    } catch (e) {
        console.error("FAIL:", e);
    }
}

testPdf();
