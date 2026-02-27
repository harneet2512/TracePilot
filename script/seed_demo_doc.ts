/**
 * Seed Demo Document for Smoke Tests
 * 
 * Creates a demo document about safety procedures for equipment maintenance
 * that matches the voice smoke test query. This ensures retrieval returns
 * citations without requiring OAuth setup or manual ingestion.
 */

import { storage } from "../server/storage.js";
import { chunkText, estimateTokens } from "../server/lib/chunker.js";
import { createHash } from "crypto";

const DEMO_DOC_CONTENT = `# Safety Procedures for Equipment Maintenance

## Overview
This document outlines the essential safety procedures that must be followed when performing equipment maintenance tasks.

## Pre-Maintenance Checklist
1. Ensure all equipment is powered off and locked out
2. Verify that all energy sources are disconnected
3. Wear appropriate personal protective equipment (PPE)
4. Review the equipment manual and maintenance history
5. Notify team members of the maintenance activity

## During Maintenance
- Always follow manufacturer guidelines
- Use only approved tools and replacement parts
- Keep work area clean and organized
- Never bypass safety interlocks or guards
- If unsure about any procedure, stop and consult a supervisor

## Post-Maintenance
- Restore all safety guards and covers
- Test equipment functionality before returning to service
- Document all work performed in maintenance log
- Clean up work area completely
- Notify team that equipment is ready for use

## Emergency Procedures
In case of equipment failure or safety incident:
1. Immediately stop all work
2. Ensure personnel safety
3. Notify supervisor and safety officer
4. Follow emergency response protocols
5. Document incident details

## Personal Protective Equipment (PPE)
Required PPE for equipment maintenance includes:
- Safety glasses or face shield
- Protective gloves appropriate for the task
- Steel-toed boots
- Hearing protection if working in noisy environments
- Respiratory protection if working with chemicals or dust

## Conclusion
Following these safety procedures ensures the well-being of maintenance personnel and prevents equipment damage. Always prioritize safety over speed.`;

export async function seedDemoDocument(): Promise<void> {
  console.log("🌱 Seeding demo document for smoke tests...");

  // Check if demo document already exists
  const contentHash = createHash("sha256").update(DEMO_DOC_CONTENT).digest("hex");
  const existingSource = await storage.getSourceByContentHash(contentHash);
  
  if (existingSource) {
    // Check if it has active chunks
    const chunks = await storage.getChunksBySourceId(existingSource.id);
    if (chunks.length > 0) {
      console.log(`✅ Demo document already exists with ${chunks.length} chunks`);
      return;
    }
  }

  // Create source
  const source = await storage.createSource({
    type: "upload",
    title: "Safety Procedures for Equipment Maintenance (Demo)",
    contentHash,
    fullText: DEMO_DOC_CONTENT,
    metadataJson: {
      mimeType: "text/markdown",
      size: DEMO_DOC_CONTENT.length,
      demo: true,
    },
    userId: null, // System document, not user-specific
  });

  console.log(`✅ Created source: ${source.id}`);

  // Create source version (active)
  const sourceVersion = await storage.createSourceVersion({
    sourceId: source.id,
    version: 1,
    contentHash,
    fullText: DEMO_DOC_CONTENT,
    isActive: true,
    charCount: DEMO_DOC_CONTENT.length,
    tokenEstimate: estimateTokens(DEMO_DOC_CONTENT),
  });

  console.log(`✅ Created source version: ${sourceVersion.id}`);

  // Chunk the content
  const textChunks = chunkText(DEMO_DOC_CONTENT);
  console.log(`✅ Created ${textChunks.length} text chunks`);

  // Create chunk records
  const chunkRecords = await storage.createChunks(
    textChunks.map((tc, idx) => ({
      sourceId: source.id,
      sourceVersionId: sourceVersion.id,
      chunkIndex: idx,
      text: tc.text,
      charStart: tc.charStart,
      charEnd: tc.charEnd,
      tokenEstimate: estimateTokens(tc.text),
      userId: null, // System document
    }))
  );

  console.log(`✅ Created ${chunkRecords.length} chunk records`);

  // Note: Chunks are stored in DB. The server process will hydrate its in-memory
  // vector store from DB on first retrieval (see ensureVectorStoreHydrated in vectorstore.ts)

  console.log("✅ Demo document seeded successfully");
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoDocument()
    .then(() => {
      console.log("\n✅ Seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Seed failed:", error);
      process.exit(1);
    });
}
