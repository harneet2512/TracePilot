import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { storage } from "../../storage";
import { tracer } from "../observability/tracer";
import { searchSimilar } from "../vectorstore";
import { chatCompletion, type ChatMessage } from "../openai";
import { validateWithRepair } from "../validation/jsonRepair";
import { checkPolicy, formatPolicyDenial } from "../policy/checker";
import { parse as parseYaml } from "yaml";
import type { PolicyYaml } from "@shared/schema";
import { chatResponseSchema, type ChatResponse, type Citation } from "@shared/schema";
import { enqueueJob } from "../jobs/runner";

// Protocol message types
interface ClientMessage {
  type: "start" | "user_partial" | "user_final" | "barge_in" | "end";
  callId?: string;
  callerNumber?: string;
  metadata?: Record<string, unknown>;
  text?: string;
  tsMs?: number;
}

interface ServerMessage {
  type: "started" | "ack" | "assistant_delta" | "assistant_final" | "tts_stop" | "error";
  callId: string;
  text?: string;
  textChunk?: string;
  fullText?: string;
  citations?: Citation[];
  approvals?: Array<{ toolName: string; requiresApproval: boolean }>;
  message?: string;
}

// Fast-path FSM states
type FastPathState = "idle" | "collecting_schedule" | "collecting_ticket" | "completed";

interface FastPathContext {
  state: FastPathState;
  intent?: "schedule" | "support_ticket";
  slots: Record<string, string>;
  slotsFilledCount: number;
}

// Call session state
interface CallSession {
  callId: string;
  userId: string;
  ws: WebSocket;
  fastPath: FastPathContext;
  lastPartialTime: number;
  eouTimer: NodeJS.Timeout | null;
  isStreaming: boolean;
  currentTraceId: string | null;
  partialText: string;
  partialCount: number;
}

const EOU_TIMEOUT_MS = 300; // 250-350ms range, using 300ms
const KEEP_ALIVE_TIMEOUT_MS = 600;
const sessions = new Map<string, CallSession>();

export function setupVoiceWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: "/ws/voice"
  });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log("[VoiceWS] New connection");
    
    let session: CallSession | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        
        // Extract userId from message or request (for MVP, allow null userId)
        const userId = extractUserIdFromRequest(req);
        
        // Handle message and update session reference
        const newSession = await handleMessage(ws, message, userId, session);
        if (newSession) {
          session = newSession;
        }
      } catch (error) {
        console.error("[VoiceWS] Message error:", error);
        sendError(ws, session?.callId || "", error instanceof Error ? error.message : "Invalid message");
      }
    });

    ws.on("close", () => {
      if (session) {
        cleanupSession(session.callId);
      }
      console.log("[VoiceWS] Connection closed");
    });

    ws.on("error", (error) => {
      console.error("[VoiceWS] WebSocket error:", error);
      if (session) {
        cleanupSession(session.callId);
      }
    });
  });

  console.log("[VoiceWS] WebSocket server listening on /ws/voice");
}

function extractUserIdFromRequest(req: any): string | null {
  // For MVP: extract userId from query param or header
  // In production, validate session cookie
  const url = new URL(req.url || "", "http://localhost");
  const userId = url.searchParams.get("userId");
  if (userId) return userId;
  
  // Try header
  const userIdHeader = req.headers["x-user-id"];
  if (userIdHeader) return userIdHeader;
  
  // For MVP, allow null userId (will be handled in handleStart)
  return null;
}

async function handleMessage(
  ws: WebSocket,
  message: ClientMessage,
  userId: string | null,
  sessionRef: CallSession | null
): Promise<CallSession | null> {
  switch (message.type) {
    case "start":
      if (sessionRef) {
        sendError(ws, sessionRef.callId, "Call already started");
        return null;
      }
      const newSession = await handleStart(ws, message, userId);
      if (newSession) {
        sessions.set(newSession.callId, newSession);
        return newSession;
      }
      return null;
      
    case "user_partial":
      if (!sessionRef) {
        // Try to find session by callId if provided
        if (message.callId) {
          const foundSession = sessions.get(message.callId);
          if (foundSession) {
            await handleUserPartial(foundSession, message);
            return foundSession;
          }
        }
        sendError(ws, "", "No active call");
        return null;
      }
      await handleUserPartial(sessionRef, message);
      return sessionRef;
      
    case "user_final":
      if (!sessionRef) {
        if (message.callId) {
          const foundSession = sessions.get(message.callId);
          if (foundSession) {
            await handleUserFinal(foundSession, message);
            return foundSession;
          }
        }
        sendError(ws, "", "No active call");
        return null;
      }
      await handleUserFinal(sessionRef, message);
      return sessionRef;
      
    case "barge_in":
      if (!sessionRef) {
        if (message.callId) {
          const foundSession = sessions.get(message.callId);
          if (foundSession) {
            await handleBargeIn(foundSession, message);
            return foundSession;
          }
        }
        sendError(ws, "", "No active call");
        return null;
      }
      await handleBargeIn(sessionRef, message);
      return sessionRef;
      
    case "end":
      if (!sessionRef) {
        if (message.callId) {
          const foundSession = sessions.get(message.callId);
          if (foundSession) {
            await handleEnd(foundSession);
            return null;
          }
        }
        sendError(ws, "", "No active call");
        return null;
      }
      await handleEnd(sessionRef);
      return null;
      
    default:
      return sessionRef;
  }
}

async function handleStart(
  ws: WebSocket,
  message: ClientMessage,
  userId: string | null
): Promise<CallSession | null> {
  // Create voice call record
  const call = await storage.createVoiceCall({
    userId: userId || null,
    status: "active",
    callerNumber: message.callerNumber || null,
    metadataJson: message.metadata || null,
  });
  
  // Start trace (use call.id as requestId)
  const traceCtx = await tracer.startTrace("voice", userId || undefined, call.id);
  
  // Record session start span
  await tracer.recordSpan(traceCtx.traceId, {
    name: "voice.session.start",
    kind: "other",
    durationMs: 0,
    metadata: { callId: call.id, callerNumber: message.callerNumber },
  });
  
  const session: CallSession = {
    callId: call.id,
    userId: userId || "",
    ws,
    fastPath: {
      state: "idle",
      slots: {},
      slotsFilledCount: 0,
    },
    lastPartialTime: Date.now(),
    eouTimer: null,
    isStreaming: false,
    currentTraceId: traceCtx.traceId,
    partialText: "",
    partialCount: 0,
  };
  
  sendMessage(ws, {
    type: "started",
    callId: call.id,
  });
  
  return session;
}

async function handleUserPartial(session: CallSession, message: ClientMessage): Promise<void> {
  session.lastPartialTime = Date.now();
  session.partialCount++;
  session.partialText = message.text || "";
  
  // Clear existing EOU timer
  if (session.eouTimer) {
    clearTimeout(session.eouTimer);
    session.eouTimer = null;
  }
  
  // Set new EOU timer
  session.eouTimer = setTimeout(() => {
    handleEOU(session);
  }, EOU_TIMEOUT_MS);
}

async function handleUserFinal(session: CallSession, message: ClientMessage): Promise<void> {
  // Clear EOU timer
  if (session.eouTimer) {
    clearTimeout(session.eouTimer);
    session.eouTimer = null;
  }
  
  const finalText = message.text || "";
  
  // Persist turn
  await storage.createVoiceTurn({
    callId: session.callId,
    role: "user",
    text: finalText,
    traceId: session.currentTraceId,
    turnJson: {
      partialCount: session.partialCount,
      eouMs: Date.now() - session.lastPartialTime,
    },
  });
  
  // Immediately handle EOU
  await handleEOU(session, finalText);
}

async function handleEOU(session: CallSession, finalText?: string): Promise<void> {
  const eouStartTime = Date.now();
  const text = finalText || session.partialText;
  
  if (!text.trim()) return;
  
  // Record EOU detection span
  const eouMs = finalText ? 0 : Date.now() - session.lastPartialTime;
  await tracer.recordSpan(session.currentTraceId!, {
    name: "voice.turn.eou_detected",
    kind: "other",
    durationMs: 0,
    metadata: { eouMs, partialCount: session.partialCount },
  });
  
  // Try fast-path first
  const fastPathStart = Date.now();
  const fastPathResult = await tryFastPath(session, text);
  const fastPathMs = Date.now() - fastPathStart;
  
  if (fastPathResult.handled) {
    // Fast-path handled it
    const responseText = fastPathResult.response || "I understand. How can I help you further?";
    const totalLatencyMs = Date.now() - eouStartTime;
    
    // Record fast-path span
    await tracer.recordSpan(session.currentTraceId!, {
      name: "voice.turn.fast_path",
      kind: "other",
      durationMs: fastPathMs,
      metadata: {
        state: session.fastPath.state,
        intent: session.fastPath.intent,
        slotsFilledCount: session.fastPath.slotsFilledCount,
        latencyMs: totalLatencyMs,
      },
    });
    
    // Stream response
    await streamResponse(session, responseText, []);
    
    // Persist assistant turn
    await storage.createVoiceTurn({
      callId: session.callId,
      role: "assistant",
      text: responseText,
      traceId: session.currentTraceId,
      turnJson: {
        fastPath: true,
        intent: session.fastPath.intent,
        slotsFilledCount: session.fastPath.slotsFilledCount,
        latencyMs: totalLatencyMs,
      },
    });
    
    return;
  }
  
  // Deep-path: RAG + LLM + Policy
  await handleDeepPath(session, text, eouStartTime);
}

async function tryFastPath(session: CallSession, text: string): Promise<{ handled: boolean; response?: string }> {
  const lowerText = text.toLowerCase();
  
  // Detect intent
  if (!session.fastPath.intent) {
    if (lowerText.includes("schedule") || lowerText.includes("appointment") || lowerText.includes("meeting")) {
      session.fastPath.intent = "schedule";
      session.fastPath.state = "collecting_schedule";
    } else if (lowerText.includes("support") || lowerText.includes("ticket") || lowerText.includes("issue")) {
      session.fastPath.intent = "support_ticket";
      session.fastPath.state = "collecting_ticket";
    } else {
      return { handled: false };
    }
  }
  
  // Fast-path FSM for schedule
  if (session.fastPath.intent === "schedule") {
    return handleScheduleFastPath(session, text);
  }
  
  // Fast-path FSM for support ticket
  if (session.fastPath.intent === "support_ticket") {
    return handleSupportTicketFastPath(session, text);
  }
  
  return { handled: false };
}

function handleScheduleFastPath(session: CallSession, text: string): { handled: boolean; response?: string } {
  const lowerText = text.toLowerCase();
  
  // Extract slots using simple patterns
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})|(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(am|pm)?)|(morning|afternoon|evening)/i);
  const durationMatch = text.match(/(\d+)\s*(minute|hour|hr)/i);
  
  if (dateMatch && !session.fastPath.slots.date) {
    session.fastPath.slots.date = dateMatch[0];
    session.fastPath.slotsFilledCount++;
  }
  if (timeMatch && !session.fastPath.slots.time) {
    session.fastPath.slots.time = timeMatch[0];
    session.fastPath.slotsFilledCount++;
  }
  if (durationMatch && !session.fastPath.slots.duration) {
    session.fastPath.slots.duration = durationMatch[0];
    session.fastPath.slotsFilledCount++;
  }
  
  // Check if all required slots filled
  const requiredSlots = ["date", "time"];
  const allFilled = requiredSlots.every(slot => session.fastPath.slots[slot]);
  
  if (allFilled) {
    session.fastPath.state = "completed";
    return {
      handled: true,
      response: `I've scheduled your appointment for ${session.fastPath.slots.date} at ${session.fastPath.slots.time}${session.fastPath.slots.duration ? ` for ${session.fastPath.slots.duration}` : ""}. Is there anything else I can help with?`,
    };
  }
  
  // Ask for missing slots
  const missingSlots = requiredSlots.filter(slot => !session.fastPath.slots[slot]);
  if (missingSlots.length > 0) {
    return {
      handled: true,
      response: `I need a few more details. What ${missingSlots[0]} would you like?`,
    };
  }
  
  return { handled: true, response: "I understand you want to schedule something. What date and time work for you?" };
}

function handleSupportTicketFastPath(session: CallSession, text: string): { handled: boolean; response?: string } {
  const lowerText = text.toLowerCase();
  
  // Extract issue summary
  if (!session.fastPath.slots.summary && text.length > 10) {
    session.fastPath.slots.summary = text;
    session.fastPath.slotsFilledCount++;
  }
  
  // Extract severity
  if (!session.fastPath.slots.severity) {
    if (lowerText.includes("urgent") || lowerText.includes("critical") || lowerText.includes("emergency")) {
      session.fastPath.slots.severity = "high";
      session.fastPath.slotsFilledCount++;
    } else if (lowerText.includes("important") || lowerText.includes("soon")) {
      session.fastPath.slots.severity = "medium";
      session.fastPath.slotsFilledCount++;
    } else {
      session.fastPath.slots.severity = "low";
      session.fastPath.slotsFilledCount++;
    }
  }
  
  // Check if all required slots filled
  const requiredSlots = ["summary", "severity"];
  const allFilled = requiredSlots.every(slot => session.fastPath.slots[slot]);
  
  if (allFilled) {
    session.fastPath.state = "completed";
    return {
      handled: true,
      response: `I've created a ${session.fastPath.slots.severity} priority support ticket for: "${session.fastPath.slots.summary}". A team member will contact you shortly. Is there anything else?`,
    };
  }
  
  // Ask for missing slots
  if (!session.fastPath.slots.summary) {
    return {
      handled: true,
      response: "I can help you create a support ticket. What issue are you experiencing?",
    };
  }
  
  return { handled: true, response: "Got it. What's the priority level - urgent, important, or low?" };
}

async function handleDeepPath(
  session: CallSession,
  text: string,
  eouStartTime: number
): Promise<void> {
  // Send keep-alive if no response within 600ms
  const keepAliveTimer = setTimeout(() => {
    if (!session.isStreaming) {
      sendMessage(session.ws, {
        type: "ack",
        callId: session.callId,
        text: "Got it—checking now…",
      });
    }
  }, KEEP_ALIVE_TIMEOUT_MS);
  
  try {
    // Retrieval span
    const retrievalStart = Date.now();
    const allChunks = await storage.getActiveChunks();
    const relevantChunks = await searchSimilar(text, allChunks, 5);
    const retrievalMs = Date.now() - retrievalStart;
    
    await tracer.recordSpan(session.currentTraceId!, {
      name: "voice.turn.retrieve",
      kind: "retrieve",
      durationMs: retrievalMs,
      retrievalCount: relevantChunks.length,
      similarityMin: relevantChunks.length > 0 ? Math.min(...relevantChunks.map(r => r.score)) : undefined,
      similarityMax: relevantChunks.length > 0 ? Math.max(...relevantChunks.map(r => r.score)) : undefined,
      similarityAvg: relevantChunks.length > 0 ? relevantChunks.reduce((a, r) => a + r.score, 0) / relevantChunks.length : undefined,
    });
    
    // Build context
    const contextParts = relevantChunks.map((r, i) => {
      return `[Source ${i + 1}: chunk ${r.chunk.id} from source ${r.chunk.sourceId}${r.chunk.sourceVersionId ? ` version ${r.chunk.sourceVersionId}` : ""}]\n${r.chunk.text}`;
    });
    
    // Get active policy
    const activePolicy = await storage.getActivePolicy();
    let parsedPolicy: PolicyYaml | null = null;
    if (activePolicy) {
      try {
        parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
      } catch (e) {
        console.error("Policy parse error:", e);
      }
    }
    
    // LLM call
    const llmStart = Date.now();
    const systemPrompt = `You are FieldCopilot voice assistant. Answer concisely based on the context.

Context:
${contextParts.join("\n\n---\n\n") || "No relevant context found."}

Respond in JSON: {"assistantText": "...", "citations": [{"sourceId": "...", "sourceVersionId": "...", "chunkId": "...", "charStart": number, "charEnd": number}], "suggestedActions": [{"type": "jira.create_issue" | "slack.post_message" | "confluence.upsert_page", "draft": {...}}], "handoffRequired": false, "handoffReason": ""}`;
    
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];
    
    const responseText = await chatCompletion(messages);
    const llmMs = Date.now() - llmStart;
    
    // Parse response (voice uses simpler format: assistantText, citations, suggestedActions)
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      await streamResponse(session, "I apologize, but I'm having trouble processing that. Could you rephrase?", []);
      return;
    }
    
    // Validate using chatResponseSchema for compatibility
    const validationResult = await validateWithRepair(responseText, chatResponseSchema, 2);
    
    if (!validationResult.success || !validationResult.data) {
      // Try to extract assistantText from parsed response
      const assistantText = parsedResponse.assistantText || parsedResponse.answer || "I understand. How can I help you?";
      const citations = parsedResponse.citations || [];
      await streamResponse(session, assistantText, citations);
      return;
    }
    
    const chatResponse = validationResult.data;
    
    // Enrich citations
    const chunkMap = new Map(relevantChunks.map(r => [r.chunk.id, { chunk: r.chunk, sourceVersionId: r.chunk.sourceVersionId }]));
    const enrichCitations = (citations: Citation[]) => {
      return citations.map(citation => {
        const chunkInfo = chunkMap.get(citation.chunkId);
        if (chunkInfo) {
          return {
            ...citation,
            sourceVersionId: citation.sourceVersionId ?? (chunkInfo.sourceVersionId ?? undefined),
            charStart: citation.charStart ?? chunkInfo.chunk.charStart ?? undefined,
            charEnd: citation.charEnd ?? chunkInfo.chunk.charEnd ?? undefined,
          };
        }
        return citation;
      });
    };
    
    chatResponse.bullets = chatResponse.bullets.map(bullet => ({
      ...bullet,
      citations: enrichCitations(bullet.citations),
    }));
    
    if (chatResponse.action) {
      chatResponse.action = {
        ...chatResponse.action,
        citations: enrichCitations(chatResponse.action.citations),
      };
    }
    
    // Record LLM span
    await tracer.recordSpan(session.currentTraceId!, {
      name: "voice.turn.llm",
      kind: "llm",
      durationMs: llmMs,
      model: "gpt-4o",
      inputTokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
      metadata: { messageCount: messages.length },
    });
    
    // Policy check for suggested actions
    const approvals: Array<{ toolName: string; requiresApproval: boolean }> = [];
    if (chatResponse.action) {
      const policyResult = checkPolicy(parsedPolicy, {
        userRole: "member", // Default role - in production get from session
        toolName: chatResponse.action.type,
        toolParams: chatResponse.action.draft,
      });
      
      await tracer.recordSpan(session.currentTraceId!, {
        name: "voice.turn.policy",
        kind: "validate",
        durationMs: 0,
        metadata: {
          allow: policyResult.allowed,
          deny: !policyResult.allowed,
          ruleName: policyResult.denialDetails?.violatedRule,
        },
      });
      
      if (policyResult.allowed && policyResult.requiresApproval) {
        // Create audit event first
        const auditEvent = await storage.createAuditEvent({
          requestId: session.currentTraceId!,
          userId: session.userId || null,
          role: "member",
          kind: "action_execute",
          toolProposalsJson: [chatResponse.action],
          success: true,
          traceId: session.currentTraceId,
        });
        
        // Create approval (draft only, not executed)
        await storage.createApproval({
          auditEventId: auditEvent.id,
          userId: session.userId,
          toolName: chatResponse.action.type,
          draftJson: chatResponse.action.draft,
          finalJson: chatResponse.action.draft,
          idempotencyKey: null,
          result: null,
        });
        
        approvals.push({
          toolName: chatResponse.action.type,
          requiresApproval: true,
        });
        
        await tracer.recordSpan(session.currentTraceId!, {
          name: "voice.turn.approvals",
          kind: "other",
          durationMs: 0,
          metadata: { approvalsCreatedCount: 1 },
        });
      }
    }
    
    // Stream response (use answer from chatResponse)
    const assistantText = chatResponse.answer || "I understand. How can I help you?";
    const citations = chatResponse.bullets.flatMap(b => b.citations);
    await streamResponse(session, assistantText, citations, approvals);
    
    // Persist assistant turn
    await storage.createVoiceTurn({
      callId: session.callId,
      role: "assistant",
      text: assistantText,
      traceId: session.currentTraceId,
      turnJson: {
        fastPath: false,
        latencyMs: Date.now() - eouStartTime,
        citationsCount: citations.length,
      },
    });
    
    clearTimeout(keepAliveTimer);
  } catch (error) {
    clearTimeout(keepAliveTimer);
    console.error("[VoiceWS] Deep-path error:", error);
    await streamResponse(session, "I apologize, but I encountered an error. Please try again.", []);
  }
}

async function streamResponse(
  session: CallSession,
  text: string,
  citations: Citation[],
  approvals?: Array<{ toolName: string; requiresApproval: boolean }>
): Promise<void> {
  session.isStreaming = true;
  
  // Split by sentences for streaming simulation
  const sentences = text.split(/([.!?]+\s*)/).filter(s => s.trim());
  let fullText = "";
  
  for (const sentence of sentences) {
    if (!session.isStreaming) break; // Barge-in stopped streaming
    
    fullText += sentence;
    sendMessage(session.ws, {
      type: "assistant_delta",
      callId: session.callId,
      textChunk: sentence,
    });
    
    // Simulate TTS delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (session.isStreaming) {
    sendMessage(session.ws, {
      type: "assistant_final",
      callId: session.callId,
      fullText: text,
      citations,
      approvals,
    });
  }
  
  session.isStreaming = false;
}

async function handleBargeIn(session: CallSession, message: ClientMessage): Promise<void> {
  if (session.isStreaming) {
    const stopSentMs = Date.now();
    session.isStreaming = false;
    
    sendMessage(session.ws, {
      type: "tts_stop",
      callId: session.callId,
    });
    
    const bargeInStopMs = (message.tsMs || Date.now()) - stopSentMs;
    
    await tracer.recordSpan(session.currentTraceId!, {
      name: "voice.turn.barge_in",
      kind: "other",
      durationMs: 0,
      metadata: { bargeInStopMs },
    });
  }
}

async function handleEnd(session: CallSession): Promise<void> {
  // Mark call as completed
  await storage.updateVoiceCall(session.callId, {
    status: "completed",
    completedAt: new Date(),
  });
  
  // End trace
  if (session.currentTraceId) {
    await tracer.endTrace(session.currentTraceId, "completed");
  }
  
  // Enqueue transcript ingestion job
  await enqueueJob({
    type: "ingest_call_transcript",
    userId: session.userId,
    payload: { callId: session.callId },
    connectorType: "upload",
    idempotencyKey: `ingest_call_${session.callId}`,
    priority: 1,
  });
  
  cleanupSession(session.callId);
}

function cleanupSession(callId: string): void {
  const session = sessions.get(callId);
  if (session) {
    if (session.eouTimer) {
      clearTimeout(session.eouTimer);
    }
    sessions.delete(callId);
  }
}

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, callId: string, message: string): void {
  sendMessage(ws, {
    type: "error",
    callId,
    message,
  });
}

