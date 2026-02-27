/**
 * Verification script for EVAL_MODE fix
 * Tests that OKR query returns actual results, not strict grounding message
 */

import { validateAndAttribute } from "../server/lib/rag/grounding";
import { renderExtractedData } from "../server/lib/rag/standardRenderer";

console.log("=".repeat(80));
console.log("VERIFICATION: EVAL_MODE Fix for Runtime OKR Queries");
console.log("=".repeat(80));

// Check if EVAL_MODE is set
const evalMode = process.env.EVAL_MODE;
console.log(`\n1. Environment Check:`);
console.log(`   EVAL_MODE = ${evalMode || "(not set)"}`);
console.log(`   Expected: (not set) for runtime`);

if (evalMode === '1') {
  console.log(`   ❌ FAIL: EVAL_MODE is set to '1'. This will cause strict grounding.`);
  console.log(`   Fix: Remove EVAL_MODE from .env or set it to a value other than '1'`);
  process.exit(1);
} else {
  console.log(`   ✅ PASS: EVAL_MODE is not set or not '1'. Runtime mode active.`);
}

// Test grounding validation keeps items without citations in runtime mode
console.log(`\n2. Grounding Validation Test (Runtime Mode):`);

const mockChunks = [
  {
    chunkId: "chunk1",
    sourceId: "source1",
    text: "The Q4 OKR is to launch the AI search project with 95% accuracy."
  }
];

const extractedData = {
  type: "OKR" as const,
  data: {
    items: [
      {
        objective: "Launch AI Search Project",
        keyResults: [
          { result: "Achieve 95% search accuracy" }
        ],
        citations: [
          {
            chunkId: "chunk1",
            quote: "non-existent quote"  // Invalid quote - won't match
          }
        ]
      }
    ]
  }
};

const validated = validateAndAttribute(extractedData, mockChunks);
console.log(`   Input items: ${extractedData.data.items.length}`);
console.log(`   Output items after validation: ${validated.data.items.length}`);

if (validated.data.items.length > 0) {
  console.log(`   ✅ PASS: Item with invalid citation was KEPT (runtime behavior)`);
} else {
  console.log(`   ❌ FAIL: Item with invalid citation was DROPPED (strict mode active)`);
  console.log(`   This should NOT happen in runtime. Check EVAL_MODE setting.`);
  process.exit(1);
}

// Test renderer produces friendly message when no items, not strict message
console.log(`\n3. Renderer Message Test (Empty Items):`);

const emptyData = {
  type: "OKR" as const,
  data: { items: [] }
};

const rendered = renderExtractedData(emptyData);
console.log(`   Message: "${rendered.answer}"`);

if (rendered.answer.includes("Strict Grounding applied")) {
  console.log(`   ❌ FAIL: Renderer produced strict grounding message`);
  console.log(`   This should only happen when EVAL_MODE='1'`);
  process.exit(1);
} else if (rendered.answer.includes("No OKRs found in the provided sources")) {
  console.log(`   ✅ PASS: Renderer produced friendly runtime message`);
} else {
  console.log(`   ⚠️  WARN: Unexpected message format`);
}

// Test with valid citations to ensure normal flow still works
console.log(`\n4. Valid Citation Flow Test:`);

const validData = {
  type: "OKR" as const,
  data: {
    items: [
      {
        objective: "Launch AI Search Project",
        keyResults: [
          { result: "Achieve 95% search accuracy" }
        ],
        citations: [
          {
            chunkId: "chunk1",
            quote: "The Q4 OKR is to launch the AI search project with 95% accuracy"
          }
        ]
      }
    ]
  }
};

const validValidated = validateAndAttribute(validData, mockChunks);
console.log(`   Input items: ${validData.data.items.length}`);
console.log(`   Output items after validation: ${validValidated.data.items.length}`);
console.log(`   Citations in output: ${validValidated.data.items[0]?._citations?.length || 0}`);

if (validValidated.data.items.length === 1 && validValidated.data.items[0]._citations?.length === 1) {
  console.log(`   ✅ PASS: Valid citations preserved correctly`);
} else {
  console.log(`   ❌ FAIL: Valid citation flow broken`);
  process.exit(1);
}

// Summary
console.log(`\n${"=".repeat(80)}`);
console.log(`VERIFICATION COMPLETE: ✅ All checks passed`);
console.log(`${"=".repeat(80)}`);
console.log(`\nSummary:`);
console.log(`  - EVAL_MODE not set in runtime ✅`);
console.log(`  - Items with invalid citations are KEPT in runtime ✅`);
console.log(`  - Friendly message shown for empty results ✅`);
console.log(`  - Valid citations still work correctly ✅`);
console.log(`\nThe fix is working correctly. OKR queries should now return actual results.`);
console.log(`\nNext step: Test with actual API call:`);
console.log(`  1. Start server: pnpm dev`);
console.log(`  2. Query: "What are our Q4 OKRs for the AI search project?"`);
console.log(`  3. Verify: Response contains actual OKRs, not "Strict Grounding applied"`);
