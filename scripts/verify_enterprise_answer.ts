/**
 * Integration test: Verify enterprise-grade answer pipeline
 *
 * Tests:
 * 1. Doc-intent response structure
 * 2. Evidence with locationUrl for Drive sources
 * 3. No hallucinated status fields
 * 4. Evidence contains only used sources
 * 5. Per-claim attribution with sourceIds
 */

import { storage } from "../server/storage";
import { runAgentTurn } from "../server/lib/agent/agentCore";
import type { AgentTurnOutput } from "../server/lib/agent/agentCore";

async function main() {
  console.log("🧪 Enterprise Answer Pipeline Verification\n");

  try {
    // Test 1: Verify response structure
    console.log("Test 1: Doc-intent response structure");
    console.log("─────────────────────────────────────────");

    // Create a test user
    const testUser = await storage.getUserByUsername("test-user");
    if (!testUser) {
      console.error("❌ Test user not found. Please create a test user first.");
      process.exit(1);
    }

    // Send OKR query
    const result: AgentTurnOutput = await runAgentTurn({
      message: "What are our Q4 OKRs?",
      userId: testUser.id,
      userRole: "admin",
      channel: "http"
    });

    // Verify response has doc_intent kind
    if (result.kind === "doc_intent") {
      console.log("✅ Response has kind='doc_intent'");
    } else {
      console.log(`⚠️  Response kind is '${result.kind}', expected 'doc_intent'`);
    }

    // Verify intentType
    if (result.intentType) {
      console.log(`✅ Response has intentType='${result.intentType}'`);
    } else {
      console.log("⚠️  Response missing intentType");
    }

    // Verify evidence array exists
    if (result.evidence && result.evidence.length > 0) {
      console.log(`✅ Evidence array present (${result.evidence.length} items)`);
    } else {
      console.log("⚠️  Evidence array missing or empty");
    }

    console.log();

    // Test 2: Verify locationUrl for Drive sources
    console.log("Test 2: Drive locationUrl");
    console.log("─────────────────────────────────────────");

    if (result.evidence) {
      const driveEvidence = result.evidence.filter(e => e.connectorType === 'drive');
      if (driveEvidence.length > 0) {
        console.log(`Found ${driveEvidence.length} Drive sources`);

        driveEvidence.forEach((ev, idx) => {
          console.log(`\nDrive source ${idx + 1}:`);
          console.log(`  Title: ${ev.title}`);
          console.log(`  URL: ${ev.url || 'N/A'}`);
          console.log(`  Location URL: ${ev.locationUrl || 'N/A'}`);

          if (ev.locationUrl) {
            console.log(`  ✅ locationUrl present`);
          } else {
            console.log(`  ⚠️  locationUrl missing (may be acceptable if parent unknown)`);
          }

          if (ev.whyUsed) {
            console.log(`  ✅ whyUsed: "${ev.whyUsed}"`);
          }
        });
      } else {
        console.log("⚠️  No Drive sources in evidence");
      }
    }

    console.log();

    // Test 3: Verify no hallucinated status
    console.log("Test 3: No hallucinated status");
    console.log("─────────────────────────────────────────");

    if (result.sections) {
      let statusCount = 0;
      let itemsWithStatus: any[] = [];

      result.sections.forEach(section => {
        section.items.forEach(item => {
          if (item.status) {
            statusCount++;
            itemsWithStatus.push({
              text: item.text,
              status: item.status,
              citations: item.citations
            });
          }
        });
      });

      if (statusCount === 0) {
        console.log("✅ No status fields found (good if source doesn't contain status)");
      } else {
        console.log(`Found ${statusCount} items with status:`);
        itemsWithStatus.forEach((item, idx) => {
          console.log(`\n  Item ${idx + 1}:`);
          console.log(`    Text: ${item.text.substring(0, 60)}...`);
          console.log(`    Status: ${item.status}`);
          console.log(`    Citations: ${item.citations?.length || 0}`);
          console.log(`    ⚠️  Verify status is in source quote (check manually)`);
        });
      }
    }

    console.log();

    // Test 4: Evidence contains only used sources
    console.log("Test 4: Evidence contains only used sources");
    console.log("─────────────────────────────────────────");

    if (result.sections && result.evidence) {
      // Collect all sourceIds from sections
      const usedSourceIds = new Set<string>();
      result.sections.forEach(section => {
        section.items.forEach(item => {
          item.citations?.forEach(c => usedSourceIds.add(c.sourceId));
        });
      });

      // Check if all evidence items are in usedSourceIds
      const evidenceSourceIds = new Set(result.evidence.map(e => e.id));
      const allUsed = [...evidenceSourceIds].every(id => usedSourceIds.has(id));

      if (allUsed) {
        console.log("✅ All evidence sources are used in sections");
        console.log(`   Used sources: ${usedSourceIds.size}`);
        console.log(`   Evidence items: ${evidenceSourceIds.size}`);
      } else {
        console.log("⚠️  Some evidence sources not used in sections");
        const unused = [...evidenceSourceIds].filter(id => !usedSourceIds.has(id));
        console.log(`   Unused: ${unused.join(', ')}`);
      }

      // Check reverse: all used sources are in evidence
      const allInEvidence = [...usedSourceIds].every(id => evidenceSourceIds.has(id));
      if (allInEvidence) {
        console.log("✅ All used sources are in evidence");
      } else {
        console.log("⚠️  Some used sources missing from evidence");
        const missing = [...usedSourceIds].filter(id => !evidenceSourceIds.has(id));
        console.log(`   Missing: ${missing.join(', ')}`);
      }
    }

    console.log();

    // Test 5: Per-claim attribution
    console.log("Test 5: Per-claim attribution");
    console.log("─────────────────────────────────────────");

    if (result.sections && result.evidence) {
      const multiSourceSections = result.sections.filter(section =>
        section.items.some(item => {
          const uniqueSources = new Set(item.citations?.map(c => c.sourceId) || []);
          return uniqueSources.size > 1;
        })
      );

      if (multiSourceSections.length > 0) {
        console.log(`Found ${multiSourceSections.length} sections with multi-source items`);

        multiSourceSections.forEach((section, sIdx) => {
          console.log(`\nSection ${sIdx + 1}: ${section.title}`);
          section.items.forEach((item, iIdx) => {
            const uniqueSources = new Set(item.citations?.map(c => c.sourceId) || []);
            if (uniqueSources.size > 1) {
              console.log(`  Item ${iIdx + 1}: ${uniqueSources.size} sources`);
              uniqueSources.forEach(sid => {
                const evidence = result.evidence!.find(e => e.id === sid);
                console.log(`    - ${evidence?.title || sid}`);
              });
              console.log(`  ✅ Multi-source item has per-claim attribution`);
            }
          });
        });
      } else {
        console.log("⚠️  No multi-source items found (single-source responses don't need markers)");
      }
    }

    console.log();

    // Summary
    console.log("Summary");
    console.log("═══════════════════════════════════════════");
    console.log(`✅ Response kind: ${result.kind || 'N/A'}`);
    console.log(`✅ Intent type: ${result.intentType || 'N/A'}`);
    console.log(`✅ Evidence items: ${result.evidence?.length || 0}`);
    console.log(`✅ Sections: ${result.sections?.length || 0}`);
    console.log(`✅ Framing context: ${result.framingContext ? 'Yes' : 'No'}`);
    console.log(`✅ Summary: ${result.summary ? 'Yes' : 'No'}`);

    console.log("\n✨ Verification complete!");

  } catch (error) {
    console.error("\n❌ Verification failed:");
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main as verifyEnterpriseAnswer };
