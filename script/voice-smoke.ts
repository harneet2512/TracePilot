/**
 * Voice Smoke Test - Quick test of voice WebSocket server
 * 
 * This script tests the voice WebSocket server by sending transcript messages
 * and verifying responses include citations and action drafts.
 */

import WebSocket from "ws";
import { seedDemoDocument } from "./seed_demo_doc";

const WS_URL = process.env.WS_URL || "ws://localhost:5000/ws/voice";

async function runVoiceSmokeTest() {
  // Seed demo document before running tests to ensure citations are available
  console.log("Preparing test environment...\n");
  try {
    await seedDemoDocument();
    console.log("");
  } catch (error) {
    console.error("⚠️  Warning: Failed to seed demo document:", error);
    console.error("   Continuing anyway - test may fail if no chunks exist\n");
  }

  console.log(`Connecting to ${WS_URL}...\n`);

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      console.log("✅ Connected to voice WebSocket\n");

      // Test 1: Start session
      console.log("Test 1: Start session");
      ws.send(JSON.stringify({
        type: "voice.session.start",
        sessionId: "smoke-test-1",
        userId: "test-user",
        mode: "transcript",
      }));
    });

    let testStep = 0;
    const tests = [
      {
        name: "QNA with citations",
        message: {
          type: "voice.transcript",
          sessionId: "smoke-test-1",
          text: "What are the safety procedures for equipment maintenance?",
          messageId: "msg-1",
        },
        assertions: (result: any) => {
          if (!result.answerText) {
            throw new Error("Missing answerText");
          }
          if (!result.citations || result.citations.length === 0) {
            throw new Error("Missing citations (mustCite requirement)");
          }
          if (result.meta?.channel !== "voice") {
            throw new Error(`Expected channel=voice, got ${result.meta?.channel}`);
          }
          console.log(`  ✅ Answer: ${result.answerText.substring(0, 50)}...`);
          console.log(`  ✅ Citations: ${result.citations.length}`);
          console.log(`  ✅ Channel: ${result.meta?.channel}`);
        },
      },
      {
        name: "Action draft",
        message: {
          type: "voice.transcript",
          sessionId: "smoke-test-1",
          text: "Create a Jira ticket for equipment failure in production line 3",
          messageId: "msg-2",
        },
        assertions: (result: any) => {
          if (!result.answerText) {
            throw new Error("Missing answerText");
          }
          if (!result.actionDraft) {
            throw new Error("Missing actionDraft (expected tool action)");
          }
          if (result.actionDraft.type !== "jira.create_issue") {
            throw new Error(`Expected jira.create_issue, got ${result.actionDraft.type}`);
          }
          console.log(`  ✅ Answer: ${result.answerText.substring(0, 50)}...`);
          console.log(`  ✅ Action: ${result.actionDraft.type}`);
          console.log(`  ✅ Requires approval: ${result.actionDraft.requiresApproval}`);
        },
      },
      {
        name: "Refusal (policy violation)",
        message: {
          type: "voice.transcript",
          sessionId: "smoke-test-1",
          text: "Delete all Jira tickets in project PROD",
          messageId: "msg-3",
        },
        assertions: (result: any) => {
          if (!result.answerText) {
            throw new Error("Missing answerText");
          }
          // Should either refuse or not propose action
          if (result.actionDraft && !result.actionDraft.denialReason) {
            throw new Error("Expected refusal but action was proposed without denial");
          }
          console.log(`  ✅ Answer: ${result.answerText.substring(0, 50)}...`);
          if (result.actionDraft?.denialReason) {
            console.log(`  ✅ Refusal reason: ${result.actionDraft.denialReason}`);
          }
        },
      },
    ];

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "voice.turn.error") {
          console.error(`❌ Error: ${message.message}`);
          ws.close();
          reject(new Error(message.message));
          return;
        }

        if (message.type === "voice.turn.result") {
          if (testStep < tests.length) {
            const test = tests[testStep];
            console.log(`Test ${testStep + 2}: ${test.name}`);
            
            try {
              test.assertions(message);
              console.log(`  ✅ Test ${testStep + 2} passed\n`);
              testStep++;

              if (testStep < tests.length) {
                // Send next test message
                ws.send(JSON.stringify(test.message));
              } else {
                // All tests passed
                console.log("✅ All voice smoke tests passed!");
                ws.send(JSON.stringify({
                  type: "voice.endTurn",
                  sessionId: "smoke-test-1",
                }));
                setTimeout(() => {
                  ws.close();
                  resolve();
                }, 1000);
              }
            } catch (error) {
              console.error(`❌ Test ${testStep + 2} failed:`, error);
              
              // Diagnostic: Log full WS response when Test 2 fails
              if (testStep === 0) { // Test 2 is at index 0 (testStep + 2 = 2)
                console.error("\n[DIAGNOSTIC] Full WS response JSON:");
                console.error(JSON.stringify(message, null, 2));
                console.error("\n[DIAGNOSTIC] Citation locations:");
                console.error(`  - message.citations: ${JSON.stringify(message.citations)}`);
                console.error(`  - message.answer?.citations: ${JSON.stringify((message as any).answer?.citations)}`);
                console.error(`  - message.turn?.citations: ${JSON.stringify((message as any).turn?.citations)}`);
                console.error(`  - message.bullets: ${JSON.stringify((message as any).bullets)}`);
                console.error(`  - message.meta: ${JSON.stringify(message.meta)}`);
              }
              
              ws.close();
              reject(error);
            }
          }
        }
      } catch (error) {
        console.error("❌ Failed to parse message:", error);
        ws.close();
        reject(error);
      }
    });

    ws.on("error", (error) => {
      console.error("❌ WebSocket error:", error);
      reject(error);
    });

    ws.on("close", () => {
      if (testStep < tests.length) {
        reject(new Error("Connection closed before all tests completed"));
      }
    });
  });
}

runVoiceSmokeTest()
  .then(() => {
    console.log("\n✅ Voice smoke test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Voice smoke test failed:", error);
    process.exit(1);
  });
