#!/usr/bin/env node
/**
 * Voice Agent Simulation Script
 * 
 * Simulates a voice agent client connecting to /ws/voice and sending:
 * - start
 * - user_partial bursts
 * - user_final
 * - barge_in during assistant streaming
 * - end
 * 
 * Usage: tsx script/voice_sim.ts
 */

import WebSocket from "ws";

const WS_URL = process.env.WS_URL || "ws://localhost:5000/ws/voice?userId=test-user";

let callId: string | null = null;
let isStreaming = false;

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("[Sim] Connected to voice WebSocket");
  
  // Send start
  console.log("[Sim] Sending start...");
  ws.send(JSON.stringify({
    type: "start",
    callerNumber: "+1234567890",
    metadata: { source: "simulation" },
  }));
});

ws.on("message", (data: Buffer) => {
  const message = JSON.parse(data.toString());
  console.log(`[Sim] Received: ${message.type}`, message);
  
  switch (message.type) {
    case "started":
      callId = message.callId;
      console.log(`[Sim] Call started: ${callId}`);
      
      // Simulate user partial bursts
      setTimeout(() => {
        simulateUserPartial("I need to");
      }, 500);
      setTimeout(() => {
        simulateUserPartial("I need to schedule");
      }, 800);
      setTimeout(() => {
        simulateUserPartial("I need to schedule an appointment");
      }, 1100);
      setTimeout(() => {
        simulateUserFinal("I need to schedule an appointment for tomorrow at 2pm");
      }, 1400);
      break;
      
    case "assistant_delta":
      isStreaming = true;
      process.stdout.write(message.textChunk || "");
      break;
      
    case "assistant_final":
      isStreaming = false;
      console.log("\n[Sim] Assistant finished speaking");
      
      // Simulate barge-in during next response
      setTimeout(() => {
        simulateUserFinal("Actually, cancel that");
        
        // Send barge-in during streaming
        setTimeout(() => {
          if (isStreaming) {
            console.log("\n[Sim] Sending barge-in...");
            ws.send(JSON.stringify({
              type: "barge_in",
              callId,
              tsMs: Date.now(),
            }));
          }
        }, 500);
      }, 2000);
      break;
      
    case "tts_stop":
      console.log("\n[Sim] TTS stopped (barge-in)");
      break;
      
    case "ack":
      console.log(`[Sim] Keep-alive: ${message.text}`);
      break;
      
    case "error":
      console.error(`[Sim] Error: ${message.message}`);
      break;
  }
});

ws.on("error", (error) => {
  console.error("[Sim] WebSocket error:", error);
});

ws.on("close", () => {
  console.log("[Sim] WebSocket closed");
  process.exit(0);
});

function simulateUserPartial(text: string) {
  if (!callId) return;
  console.log(`[Sim] Sending user_partial: "${text}"`);
  ws.send(JSON.stringify({
    type: "user_partial",
    callId,
    text,
    tsMs: Date.now(),
  }));
}

function simulateUserFinal(text: string) {
  if (!callId) return;
  console.log(`[Sim] Sending user_final: "${text}"`);
  ws.send(JSON.stringify({
    type: "user_final",
    callId,
    text,
    tsMs: Date.now(),
  }));
}

// End call after 30 seconds
setTimeout(() => {
  if (callId) {
    console.log("[Sim] Ending call...");
    ws.send(JSON.stringify({
      type: "end",
      callId,
    }));
  }
}, 30000);

// Keep process alive
process.on("SIGINT", () => {
  if (callId) {
    ws.send(JSON.stringify({
      type: "end",
      callId,
    }));
  }
  setTimeout(() => process.exit(0), 1000);
});


