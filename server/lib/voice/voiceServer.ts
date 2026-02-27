/**
 * Voice Server - WebSocket server for voice transcript mode
 * 
 * This module provides a simplified transcript-only voice interface that uses
 * the shared agent core for all processing.
 */

import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { storage } from "../../storage";
import { runAgentTurn } from "../agent/agentCore";
import { tracer } from "../observability/tracer";

// Protocol message types
export interface VoiceClientMessage {
  type: "voice.session.start" | "voice.transcript" | "voice.endTurn";
  sessionId?: string;
  userId?: string;
  mode?: "transcript" | "audio";
  text?: string;
  messageId?: string;
}

export interface VoiceServerMessage {
  type: "voice.turn.result" | "voice.turn.error";
  messageId: string;
  answerText?: string;
  citations?: Array<{
    sourceId: string;
    sourceVersionId?: string;
    chunkId: string;
    charStart?: number;
    charEnd?: number;
  }>;
  actionDraft?: {
    type: string;
    draft: Record<string, unknown>;
    requiresApproval: boolean;
    denialReason?: string;
  };
  playbook?: unknown;
  meta?: {
    channel: "voice";
    latencyMs: Record<string, number>;
    tokensEstimate: number;
    retrievalTopK: number;
    injectionScore: number;
    safetyActionsApplied: string[];
    traceId: string;
  };
  errorCode?: string;
  message?: string;
}

// Voice session state
interface VoiceSession {
  sessionId: string;
  userId: string;
  ws: WebSocket;
  mode: "transcript" | "audio";
  currentTraceId: string | null;
}

const sessions = new Map<string, VoiceSession>();

export function setupVoiceWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: "/ws/voice"
  });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log("[VoiceWS] New connection");
    
    let session: VoiceSession | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message: VoiceClientMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case "voice.session.start":
            if (session) {
              sendError(ws, "", "Session already started");
              return;
            }
            
            const sessionId = message.sessionId || uuidv4();
            const userId = message.userId || extractUserIdFromRequest(req) || "anonymous";
            const mode = message.mode || "transcript";
            
            session = {
              sessionId,
              userId,
              ws,
              mode,
              currentTraceId: null,
            };
            
            sessions.set(sessionId, session);
            
            ws.send(JSON.stringify({
              type: "voice.turn.result",
              messageId: "session_started",
              answerText: "Session started. Ready for transcript.",
            }));
            break;
            
          case "voice.transcript":
            if (!session) {
              sendError(ws, "", "No active session. Send voice.session.start first.");
              return;
            }
            
            if (!message.text || !message.messageId) {
              sendError(ws, session.sessionId, "Missing text or messageId");
              return;
            }
            
            // Call agent core
            const result = await runAgentTurn({
              message: message.text,
              userId: session.userId,
              userRole: "member", // TODO: Get from session/auth
              channel: "voice",
              requestId: uuidv4(),
              topK: 5,
            });
            
            // Update session trace ID
            session.currentTraceId = result.meta.traceId;
            
            // Extract citations from bullets
            const citations = result.bullets.flatMap(b => b.citations);
            
            // Diagnostic: Log retrieval and citation counts
            console.log(`[VoiceWS] QNA response - retrievedChunks: ${result.meta.retrievalTopK}, citations in response: ${citations.length}, bullets count: ${result.bullets.length}`);
            if (result.bullets.length > 0) {
              console.log(`[VoiceWS] Bullet citations: ${result.bullets.map(b => b.citations.length).join(', ')}`);
            }
            
            // Send result
            ws.send(JSON.stringify({
              type: "voice.turn.result",
              messageId: message.messageId,
              answerText: result.answerText,
              citations: citations,
              actionDraft: result.actionDraft,
              meta: result.meta,
            }));
            break;
            
          case "voice.endTurn":
            if (!session) {
              sendError(ws, "", "No active session");
              return;
            }
            
            // End trace if active
            if (session.currentTraceId) {
              await tracer.endTrace(session.currentTraceId, "completed");
              session.currentTraceId = null;
            }
            
            sessions.delete(session.sessionId);
            session = null;
            
            ws.send(JSON.stringify({
              type: "voice.turn.result",
              messageId: "turn_ended",
              answerText: "Turn ended.",
            }));
            break;
            
          default:
            sendError(ws, session?.sessionId || "", `Unknown message type: ${(message as any).type}`);
        }
      } catch (error) {
        console.error("[VoiceWS] Message error:", error);
        sendError(ws, session?.sessionId || "", error instanceof Error ? error.message : "Invalid message");
      }
    });

    ws.on("close", () => {
      if (session) {
        cleanupSession(session.sessionId);
      }
      console.log("[VoiceWS] Connection closed");
    });

    ws.on("error", (error) => {
      console.error("[VoiceWS] WebSocket error:", error);
      if (session) {
        cleanupSession(session.sessionId);
      }
    });
  });

  console.log("[VoiceWS] WebSocket server listening on /ws/voice");
}

function sendError(ws: WebSocket, sessionId: string, message: string) {
  ws.send(JSON.stringify({
    type: "voice.turn.error",
    messageId: "error",
    errorCode: "ERROR",
    message,
  }));
}

function extractUserIdFromRequest(req: any): string | null {
  // Extract userId from query param or header
  const url = new URL(req.url || "", "http://localhost");
  const userId = url.searchParams.get("userId") || req.headers["x-user-id"];
  return userId || null;
}

function cleanupSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session && session.currentTraceId) {
    tracer.endTrace(session.currentTraceId, "failed", "Session closed").catch(console.error);
  }
  sessions.delete(sessionId);
}
