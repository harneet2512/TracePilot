/**
 * Agent Core - Shared agent logic for HTTP, Voice, and MCP pathways
 * 
 * This module extracts the core agent functionality (retrieval, LLM, validation, policy)
 * so it can be reused across different transport layers (HTTP, WebSocket, MCP).
 */

import { storage } from "../../storage";
import { searchSimilar } from "../vectorstore";
import { chatCompletion, type ChatMessage } from "../openai";
import { validateWithRepair } from "../validation/jsonRepair";
import { checkPolicy } from "../policy/checker";
import { sanitizeContent, getUntrustedContextInstruction } from "../safety/sanitize";
import { detectInjection } from "../safety/detector";
import { redactPIIFromObject } from "../safety/redactPII";
import { tracer } from "../observability/tracer";
import { parse as parseYaml } from "yaml";
import type { PolicyYaml, ChatResponse, Citation, Chunk } from "@shared/schema";
import { chatResponseSchema } from "@shared/schema";
import type { Chunk as ChunkType } from "@shared/schema";

export type AgentChannel = "http" | "voice" | "mcp";

export interface AgentTurnInput {
  message: string;
  userId: string;
  userRole: "admin" | "member";
  channel: AgentChannel;
  requestId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  topK?: number;
  workspaceId?: string;
}

export interface AgentTurnOutput {
  answerText: string;
  bullets: Array<{
    claim: string;
    citations: Array<{
      sourceId: string;
      sourceVersionId?: string;
      chunkId: string;
      charStart?: number;
      charEnd?: number;
    }>;
  }>;
  actionDraft?: {
    type: string;
    draft: Record<string, unknown>;
    rationale: string;
    requiresApproval: boolean;
    denialReason?: string;
  };
  playbook?: unknown; // For future playbook generation
  meta: {
    channel: AgentChannel;
    latencyMs: Record<string, number>;
    tokensEstimate: number;
    retrievalTopK: number;
    injectionScore: number;
    safetyActionsApplied: string[];
    traceId: string;
  };
}

/**
 * Main agent turn function - processes a user message and returns structured output
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutput> {
  const startTime = Date.now();
  const latencyMs: Record<string, number> = {};
  const safetyActionsApplied: string[] = [];

  // Start trace
  const traceCtx = await tracer.startTrace("chat", input.userId, input.requestId);

  try {
    // 1. Sanitize and detect injection in user message
    const userMessageDetection = detectInjection(input.message);
    const sanitizedUserMessage = sanitizeContent(input.message, {
      maxLength: 2000,
      sourceType: "upload",
      stripMarkers: true,
    }).sanitized;

    if (userMessageDetection.isSuspicious) {
      safetyActionsApplied.push("injection_detection");
      // Injection detection is synchronous, use minimal duration
      await tracer.recordSpan(traceCtx.traceId, {
        name: "injection_detection",
        kind: "validate",
        durationMs: 0,
        metadata: {
          detected: true,
          score: userMessageDetection.score,
          reasons: userMessageDetection.reasons,
          channel: input.channel,
        },
      });
    }

    // 2. Retrieve relevant chunks with workspace and visibility enforcement + FALLBACK
    const retrievalStart = Date.now();

    // Get user's workspace
    const user = await storage.getUser(input.userId);
    if (!user) {
      throw new Error(`User ${input.userId} not found`);
    }

    // CRITICAL: Use same default as orchestrator.ts:256 ('default-workspace') to ensure alignment
    const retrievalWorkspaceId = user.workspaceId || "default-workspace";

    // Use new retrieval pipeline with fallback
    const { retrieveForAnswer } = await import("../retrieval");
    const retrievalResult = await retrieveForAnswer(sanitizedUserMessage, {
      workspaceId: retrievalWorkspaceId,
      requesterUserId: input.userId,
    }, input.topK || 8);

    const relevantChunks = retrievalResult.chunks;
    latencyMs.retrievalMs = Date.now() - retrievalStart;

    // Diagnostic: Log retrieval results with fallback info
    console.log(`[AgentCore:${input.channel}] Retrieval - workspaceId=${retrievalWorkspaceId} allChunks=${retrievalResult.diagnostics.existenceChecks.chunksTotalInScope} retrieved=${relevantChunks.length} usedFallback=${retrievalResult.diagnostics.decision.usedFallback}`);

    // Record retrieval span with workspace context
    await tracer.recordSpan(traceCtx.traceId, {
      name: "retrieval",
      kind: "retrieve",
      durationMs: latencyMs.retrievalMs,
      retrievalCount: relevantChunks.length,
      similarityMin: relevantChunks.length > 0 ? Math.min(...relevantChunks.map(r => r.score)) : undefined,
      similarityMax: relevantChunks.length > 0 ? Math.max(...relevantChunks.map(r => r.score)) : undefined,
      similarityAvg: relevantChunks.length > 0 ? relevantChunks.reduce((a, r) => a + r.score, 0) / relevantChunks.length : undefined,
      metadata: {
        channel: input.channel,
        topK: input.topK || 8,
        usedFallback: retrievalResult.diagnostics.decision.usedFallback,
      },
    });

    // 3. Build context from chunks (with untrusted context wrapping)
    const chunkMap = new Map<string, { chunk: ChunkType; score: number; sourceVersionId?: string }>();
    const contextParts = relevantChunks.map((r, i) => {
      chunkMap.set(r.chunk.id, { chunk: r.chunk, score: r.score, sourceVersionId: r.chunk.sourceVersionId || undefined });
      const sourceVersionInfo = r.chunk.sourceVersionId ? ` sourceVersion ${r.chunk.sourceVersionId}` : "";
      const source = `[Source ${i + 1}: chunk ${r.chunk.id} from source ${r.chunk.sourceId}${sourceVersionInfo}]`;

      // If chunk text doesn't already have UNTRUSTED_CONTEXT tags, wrap it
      let chunkText = r.chunk.text;
      if (!chunkText.includes("<UNTRUSTED_CONTEXT")) {
        chunkText = `<UNTRUSTED_CONTEXT source="upload">
${chunkText}
</UNTRUSTED_CONTEXT>`;
      }
      return `${source}\n${chunkText}`;
    });

    const context = contextParts.join("\n\n---\n\n");

    // 4. Get active policy for context
    const activePolicy = await storage.getActivePolicy();
    let policyContext = "";
    let parsedPolicy: PolicyYaml | null = null;

    if (activePolicy) {
      try {
        parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
        const allowedTools = parsedPolicy.roles[input.userRole]?.tools || [];
        policyContext = `\n\nUser role: ${input.userRole}\nAllowed tools: ${allowedTools.join(", ") || "none"}`;
      } catch (e) {
        console.error("Policy parse error:", e);
      }
    }

    // 5. Build system prompt
    const systemPrompt = `You are FieldCopilot, an AI assistant for field operations teams. You help users find information from their knowledge base and can propose actions using integrated tools.

${getUntrustedContextInstruction()}

When answering:
1. Base your answers on the provided context
2. Cite your sources using the chunk IDs provided. Include sourceVersionId if available.
3. If you're not sure, say so
4. If the user asks you to do something (create a Jira ticket, post to Slack, etc.), propose an action

Available actions (if user requests): jira.create_issue, jira.update_issue, slack.post_message, confluence.upsert_page
${policyContext}

Context from knowledge base:
${context || "No relevant documents found."}

Respond in JSON format matching this schema:
{
  "answer": "your main answer text",
  "bullets": [{"claim": "a specific claim", "citations": [{"sourceId": "...", "sourceVersionId": "... (optional)", "chunkId": "...", "charStart": number (optional), "charEnd": number (optional)}]}],
  "action": null or {"type": "tool.name", "draft": {...fields}, "rationale": "why this action", "citations": [...]},
  "needsClarification": false,
  "clarifyingQuestions": []
}`;

    // 6. Build messages (sanitize conversation history too)
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(input.conversationHistory || []).slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? sanitizeContent(m.content, { maxLength: 2000, sourceType: "upload" }).sanitized : m.content,
      })),
      { role: "user", content: sanitizedUserMessage },
    ];

    // 7. Call LLM
    const llmStart = Date.now();
    const responseText = await chatCompletion(messages);
    latencyMs.llmMs = Date.now() - llmStart;

    // Estimate token usage
    const tokensEstimate = Math.ceil(
      messages.reduce((a, m) => a + m.content.length, 0) / 4 +
      responseText.length / 4
    );

    // Record LLM span
    await tracer.recordSpan(traceCtx.traceId, {
      name: "llm_completion",
      kind: "llm",
      durationMs: latencyMs.llmMs,
      model: "gpt-4o",
      inputTokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
      outputTokens: Math.ceil(responseText.length / 4),
      metadata: {
        channel: input.channel,
        messageCount: messages.length,
      },
    });

    // 8. Parse and validate response with repair pass
    let chatResponse: ChatResponse;
    const validationResult = await validateWithRepair(responseText, chatResponseSchema, 2);

    if (validationResult.success && validationResult.data) {
      chatResponse = validationResult.data;

      // Log repair span if repair was needed
      if (validationResult.repaired && validationResult.repairAttempts && validationResult.repairAttempts > 0) {
        safetyActionsApplied.push("json_repair");
        await tracer.recordSpan(traceCtx.traceId, {
          name: "json_repair",
          kind: "validate",
          durationMs: 0,
          metadata: {
            repairAttempts: validationResult.repairAttempts,
            originalError: validationResult.originalError,
            channel: input.channel,
          },
        });
      }
    } else {
      // Fallback response if JSON validation fails
      chatResponse = {
        answer: responseText,
        bullets: [],
        action: null,
        needsClarification: false,
        clarifyingQuestions: [],
      };

      if (validationResult.repairAttempts && validationResult.repairAttempts > 0) {
        await tracer.recordSpan(
          traceCtx.traceId,
          {
            name: "json_validation_failed",
            kind: "validate",
            durationMs: 0,
            metadata: {
              repairAttempts: validationResult.repairAttempts,
              channel: input.channel,
            },
          },
          "failed",
          undefined,
          validationResult.originalError
        );
      }
    }

    // 9. Enrich citations with sourceVersionId, charStart/charEnd, URL, and label
    const enrichCitations = async (citations: Citation[]): Promise<Citation[]> => {
      const enrichedCitations: Citation[] = [];

      for (const citation of citations) {
        const chunkInfo = chunkMap.get(citation.chunkId);
        if (!chunkInfo) {
          enrichedCitations.push(citation);
          continue;
        }

        // Fetch source to get URL and metadata
        const source = await storage.getSource(chunkInfo.chunk.sourceId);
        if (!source) {
          enrichedCitations.push({
            ...citation,
            sourceVersionId: citation.sourceVersionId || chunkInfo.sourceVersionId,
            charStart: citation.charStart ?? chunkInfo.chunk.charStart ?? undefined,
            charEnd: citation.charEnd ?? chunkInfo.chunk.charEnd ?? undefined,
          });
          continue;
        }

        // Construct URL and label based on source type
        let url: string | undefined;
        let label: string | undefined;

        const metadata = source.metadataJson as Record<string, unknown> | null;

        switch (source.type) {
          case "slack": {
            // Slack permalink: https://workspace.slack.com/archives/CHANNEL_ID/pMESSAGE_TS
            const channelId = metadata?.channelId as string | undefined;
            const teamDomain = metadata?.teamDomain as string | undefined;
            const chunkMeta = chunkInfo.chunk.metadataJson as Record<string, unknown> | null;
            const messageTs = chunkMeta?.messageTs as string | undefined;

            if (channelId && messageTs) {
              // Convert timestamp to permalink format (remove decimal point)
              const permalinkTs = messageTs.replace(".", "");
              url = teamDomain
                ? `https://${teamDomain}.slack.com/archives/${channelId}/p${permalinkTs}`
                : `https://slack.com/archives/${channelId}/p${permalinkTs}`;
            } else if (source.url) {
              url = source.url;
            }

            const channelName = metadata?.channelName as string | undefined;
            label = channelName ? `#${channelName}` : source.title;
            break;
          }

          case "drive": {
            // Google Drive webViewLink
            url = source.url || (metadata?.webViewLink as string | undefined) || undefined;
            label = source.title;
            break;
          }

          case "jira": {
            // Jira issue browse URL
            url = source.url || undefined; // Already constructed as https://domain.atlassian.net/browse/KEY
            const issueKey = metadata?.key as string | undefined;
            label = issueKey || source.title;
            break;
          }

          case "confluence": {
            // Confluence page URL
            url = source.url || undefined; // Already constructed as https://domain.atlassian.net/wiki/spaces/...
            label = source.title;
            break;
          }

          default:
            url = source.url || undefined;
            label = source.title;
        }

        enrichedCitations.push({
          ...citation,
          sourceVersionId: citation.sourceVersionId || chunkInfo.sourceVersionId,
          charStart: citation.charStart ?? chunkInfo.chunk.charStart ?? undefined,
          charEnd: citation.charEnd ?? chunkInfo.chunk.charEnd ?? undefined,
          url,
          label,
        });
      }

      return enrichedCitations;
    };

    chatResponse.bullets = await Promise.all(
      chatResponse.bullets.map(async (bullet) => ({
        ...bullet,
        citations: await enrichCitations(bullet.citations),
      }))
    );

    if (chatResponse.action) {
      chatResponse.action = {
        ...chatResponse.action,
        citations: await enrichCitations(chatResponse.action.citations),
      };
    }

    // 10. Policy check for action draft
    let actionDraft: AgentTurnOutput["actionDraft"] | undefined;
    if (chatResponse.action) {
      const policyResult = checkPolicy(parsedPolicy, {
        userRole: input.userRole,
        toolName: chatResponse.action.type,
        toolParams: chatResponse.action.draft,
      });

      await tracer.recordSpan(traceCtx.traceId, {
        name: "policy_check",
        kind: "validate",
        durationMs: 0,
        metadata: {
          allowed: policyResult.allowed,
          requiresApproval: policyResult.requiresApproval,
          denialReason: policyResult.denialReason,
          channel: input.channel,
        },
      });

      actionDraft = {
        type: chatResponse.action.type,
        draft: chatResponse.action.draft,
        rationale: chatResponse.action.rationale,
        requiresApproval: policyResult.requiresApproval,
        denialReason: policyResult.allowed ? undefined : policyResult.denialReason,
      };

      if (!policyResult.allowed) {
        safetyActionsApplied.push("policy_denial");
      } else if (policyResult.requiresApproval) {
        safetyActionsApplied.push("approval_required");
      }
    }

    // 11. Log audit event (with PII redaction)
    await storage.createAuditEvent({
      requestId: input.requestId || traceCtx.requestId,
      userId: input.userId,
      role: input.userRole,
      kind: "chat",
      prompt: redactPIIFromObject(input.message) as string,
      retrievedJson: relevantChunks.map(r => ({
        chunkId: r.chunk.id,
        sourceId: r.chunk.sourceId,
        sourceVersionId: r.chunk.sourceVersionId,
        score: r.score,
      })),
      responseJson: redactPIIFromObject(chatResponse),
      policyJson: parsedPolicy,
      success: true,
      latencyMs,
      traceId: traceCtx.traceId,
    });

    // 12. End trace successfully
    await tracer.endTrace(traceCtx.traceId, "completed");

    const totalLatencyMs = Date.now() - startTime;
    latencyMs.totalMs = totalLatencyMs;

    // 13. Return structured output
    return {
      answerText: chatResponse.answer,
      bullets: chatResponse.bullets, // Preserve bullets structure
      actionDraft,
      meta: {
        channel: input.channel,
        latencyMs,
        tokensEstimate,
        retrievalTopK: relevantChunks.length,
        injectionScore: userMessageDetection.score,
        safetyActionsApplied,
        traceId: traceCtx.traceId,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failed audit event
    await storage.createAuditEvent({
      requestId: input.requestId || traceCtx.requestId,
      userId: input.userId,
      role: input.userRole,
      kind: "chat",
      prompt: redactPIIFromObject(input.message) as string,
      success: false,
      error: errorMessage,
      latencyMs,
    });

    // End trace with failure
    await tracer.endTrace(traceCtx.traceId, "failed", errorMessage);

    throw error;
  }
}
