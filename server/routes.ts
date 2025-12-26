import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import multer from "multer";
import { parse as parseYaml } from "yaml";
import rateLimit from "express-rate-limit";
import { chunkText, estimateTokens } from "./lib/chunker";
import { indexChunks, searchSimilar, initializeVectorStore } from "./lib/vectorstore";
import { chatCompletion, type ChatMessage } from "./lib/openai";
import {
  insertConnectorSchema, insertPolicySchema, insertEvalSuiteSchema,
  insertUserConnectorScopeSchema,
  chatResponseSchema, policyYamlSchema, evalSuiteJsonSchema,
  type User, type ChatResponse, type PolicyYaml
} from "@shared/schema";
import { z } from "zod";
import { enqueueJob } from "./lib/jobs/runner";

// Schema for updating user connector scopes (only allow scopeConfigJson, syncMode, contentStrategy, exclusionsJson)
const updateUserConnectorScopeSchema = z.object({
  scopeConfigJson: z.unknown().optional(),
  syncMode: z.enum(["metadata_first", "full", "smart", "on_demand"]).optional(),
  contentStrategy: z.enum(["smart", "full", "on_demand"]).optional(),
  exclusionsJson: z.unknown().optional(),
});
import {
  buildAuthUrl, exchangeCodeForTokens, refreshAccessToken,
  getGoogleUserInfo, getAtlassianResources, getSlackUserInfo,
  encryptToken, decryptToken
} from "./lib/oauth";

const upload = multer({ storage: multer.memoryStorage() });

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      requestId: string;
    }
  }
}

// Middleware to add request ID
function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  next();
}

// Auth middleware
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const session = await storage.getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: "Session expired" });
  }
  
  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  
  req.user = user;
  next();
}

// Admin middleware
function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize vector store with existing chunks on startup
  const existingChunks = await storage.getAllChunks();
  if (existingChunks.length > 0) {
    initializeVectorStore(existingChunks).catch(console.error);
  }
  
  // Add request ID to all requests
  app.use(requestIdMiddleware);
  
  // Apply rate limiting to API routes
  app.use("/api", apiLimiter);
  
  // Auth routes
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const user = await storage.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const session = await storage.createSession(user.id);
      
      res.cookie("session", session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      res.json({
        id: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  
  app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies?.session;
    if (token) {
      await storage.deleteSession(token);
    }
    res.clearCookie("session");
    res.json({ success: true });
  });
  
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      role: req.user!.role,
    });
  });
  
  // Connectors routes (admin only)
  app.get("/api/connectors", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const connectors = await storage.getConnectors();
      res.json(connectors);
    } catch (error) {
      console.error("Get connectors error:", error);
      res.status(500).json({ error: "Failed to get connectors" });
    }
  });
  
  app.post("/api/connectors", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const parsed = insertConnectorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      const connector = await storage.createConnector(parsed.data);
      res.json(connector);
    } catch (error) {
      console.error("Create connector error:", error);
      res.status(500).json({ error: "Failed to create connector" });
    }
  });
  
  app.delete("/api/connectors/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await storage.deleteConnector(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete connector error:", error);
      res.status(500).json({ error: "Failed to delete connector" });
    }
  });
  
  app.post("/api/connectors/:id/test", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const connector = await storage.getConnector(req.params.id);
      if (!connector) {
        return res.status(404).json({ error: "Connector not found" });
      }
      
      // Simulate connection test - in real implementation, would test actual connection
      await storage.updateConnector(req.params.id, { status: "connected" });
      res.json({ success: true, status: "connected" });
    } catch (error) {
      console.error("Test connector error:", error);
      res.status(500).json({ error: "Connection test failed" });
    }
  });
  
  // Sources routes
  app.get("/api/sources", authMiddleware, async (_req, res) => {
    try {
      const sources = await storage.getSources();
      res.json(sources);
    } catch (error) {
      console.error("Get sources error:", error);
      res.status(500).json({ error: "Failed to get sources" });
    }
  });
  
  app.get("/api/sources/:id", authMiddleware, async (req, res) => {
    try {
      const result = await storage.getSourceWithChunks(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Get source error:", error);
      res.status(500).json({ error: "Failed to get source" });
    }
  });
  
  app.delete("/api/sources/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await storage.deleteSource(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete source error:", error);
      res.status(500).json({ error: "Failed to delete source" });
    }
  });
  
  // Ingest route (admin only)
  app.post("/api/ingest", authMiddleware, adminMiddleware, upload.array("files"), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }
      
      const results = [];
      
      for (const file of files) {
        const content = file.buffer.toString("utf-8");
        const contentHash = createHash("sha256").update(content).digest("hex");
        
        // Check for duplicate
        const existing = await storage.getSourceByContentHash(contentHash);
        if (existing) {
          results.push({ file: file.originalname, status: "duplicate", sourceId: existing.id });
          continue;
        }
        
        // Create source
        const source = await storage.createSource({
          type: "upload",
          title: file.originalname,
          contentHash,
          fullText: content,
          metadataJson: { mimeType: file.mimetype, size: file.size },
        });
        
        // Chunk the content
        const textChunks = chunkText(content);
        
        // Create chunk records
        const chunkRecords = await storage.createChunks(
          textChunks.map(tc => ({
            sourceId: source.id,
            chunkIndex: tc.chunkIndex,
            text: tc.text,
            charStart: tc.charStart,
            charEnd: tc.charEnd,
            tokenEstimate: estimateTokens(tc.text),
          }))
        );
        
        // Index chunks for vector search
        await indexChunks(chunkRecords);
        
        results.push({
          file: file.originalname,
          status: "success",
          sourceId: source.id,
          chunks: chunkRecords.length,
        });
      }
      
      res.json({ results });
    } catch (error) {
      console.error("Ingest error:", error);
      res.status(500).json({ error: "Failed to ingest files" });
    }
  });
  
  // Policies routes (admin only)
  app.get("/api/policies", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const policies = await storage.getPolicies();
      res.json(policies);
    } catch (error) {
      console.error("Get policies error:", error);
      res.status(500).json({ error: "Failed to get policies" });
    }
  });
  
  app.post("/api/policies", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const parsed = insertPolicySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      // Validate YAML
      try {
        const yamlContent = parseYaml(parsed.data.yamlText);
        policyYamlSchema.parse(yamlContent);
      } catch (e) {
        return res.status(400).json({ error: "Invalid policy YAML format" });
      }
      
      const policy = await storage.createPolicy(parsed.data);
      res.json(policy);
    } catch (error) {
      console.error("Create policy error:", error);
      res.status(500).json({ error: "Failed to create policy" });
    }
  });
  
  app.patch("/api/policies/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      // Validate YAML if provided
      if (req.body.yamlText) {
        try {
          const yamlContent = parseYaml(req.body.yamlText);
          policyYamlSchema.parse(yamlContent);
        } catch (e) {
          return res.status(400).json({ error: "Invalid policy YAML format" });
        }
      }
      
      const policy = await storage.updatePolicy(req.params.id, req.body);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error) {
      console.error("Update policy error:", error);
      res.status(500).json({ error: "Failed to update policy" });
    }
  });
  
  app.delete("/api/policies/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await storage.deletePolicy(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete policy error:", error);
      res.status(500).json({ error: "Failed to delete policy" });
    }
  });
  
  // Chat route
  app.post("/api/chat", authMiddleware, chatLimiter, async (req, res) => {
    const startTime = Date.now();
    const latencyMs: Record<string, number> = {};
    
    try {
      const { message, conversationHistory = [] } = req.body;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Get all chunks for retrieval
      const embedStart = Date.now();
      const allChunks = await storage.getAllChunks();
      
      // Search for relevant chunks
      const retrievalStart = Date.now();
      latencyMs.embedMs = retrievalStart - embedStart;
      
      const relevantChunks = await searchSimilar(message, allChunks, 5);
      latencyMs.retrievalMs = Date.now() - retrievalStart;
      
      // Get active policy for context
      const activePolicy = await storage.getActivePolicy();
      let policyContext = "";
      let parsedPolicy: PolicyYaml | null = null;
      
      if (activePolicy) {
        try {
          parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
          const userRole = req.user!.role;
          const allowedTools = parsedPolicy.roles[userRole]?.tools || [];
          policyContext = `\n\nUser role: ${userRole}\nAllowed tools: ${allowedTools.join(", ") || "none"}`;
        } catch (e) {
          console.error("Policy parse error:", e);
        }
      }
      
      // Build context from chunks
      const contextParts = relevantChunks.map((r, i) => {
        const source = `[Source ${i + 1}: chunk ${r.chunk.id} from source ${r.chunk.sourceId}]`;
        return `${source}\n${r.chunk.text}`;
      });
      
      const context = contextParts.join("\n\n---\n\n");
      
      // Build system prompt
      const systemPrompt = `You are FieldCopilot, an AI assistant for field operations teams. You help users find information from their knowledge base and can propose actions using integrated tools.

When answering:
1. Base your answers on the provided context
2. Cite your sources using the chunk IDs provided
3. If you're not sure, say so
4. If the user asks you to do something (create a Jira ticket, post to Slack, etc.), propose an action

Available actions (if user requests): jira.create_issue, jira.update_issue, slack.post_message, confluence.upsert_page
${policyContext}

Context from knowledge base:
${context || "No relevant documents found."}

Respond in JSON format matching this schema:
{
  "answer": "your main answer text",
  "bullets": [{"claim": "a specific claim", "citations": [{"sourceId": "...", "chunkId": "..."}]}],
  "action": null or {"type": "tool.name", "draft": {...fields}, "rationale": "why this action", "citations": [...]},
  "needsClarification": false,
  "clarifyingQuestions": []
}`;

      // Build messages
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-10).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ];
      
      // Call LLM
      const llmStart = Date.now();
      const responseText = await chatCompletion(messages);
      latencyMs.llmMs = Date.now() - llmStart;
      
      // Parse and validate response
      let chatResponse: ChatResponse;
      try {
        const parsed = JSON.parse(responseText);
        chatResponse = chatResponseSchema.parse(parsed);
      } catch (e) {
        // Fallback response if JSON parsing fails
        chatResponse = {
          answer: responseText,
          bullets: [],
          action: null,
          needsClarification: false,
          clarifyingQuestions: [],
        };
      }
      
      // Log audit event
      await storage.createAuditEvent({
        requestId: req.requestId,
        userId: req.user!.id,
        role: req.user!.role,
        kind: "chat",
        prompt: message,
        retrievedJson: relevantChunks.map(r => ({
          chunkId: r.chunk.id,
          sourceId: r.chunk.sourceId,
          score: r.score,
        })),
        responseJson: chatResponse,
        policyJson: parsedPolicy,
        success: true,
        latencyMs,
      });
      
      res.json(chatResponse);
    } catch (error) {
      console.error("Chat error:", error);
      
      // Log failed audit event
      await storage.createAuditEvent({
        requestId: req.requestId,
        userId: req.user?.id,
        role: req.user?.role,
        kind: "chat",
        prompt: req.body.message,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs,
      });
      
      // Provide more specific error messages
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("API key") || errorMessage.includes("401")) {
        res.status(500).json({ error: "OpenAI API key is invalid or missing. Please check your configuration." });
      } else if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      } else {
        res.status(500).json({ error: "Chat failed. Please try again." });
      }
    }
  });
  
  // Action execution route
  app.post("/api/actions/execute", authMiddleware, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { action, idempotencyKey } = req.body;
      
      if (!action || !action.type || !action.draft) {
        return res.status(400).json({ error: "Invalid action" });
      }
      
      // Check idempotency
      if (idempotencyKey) {
        const existing = await storage.getApprovalByIdempotencyKey(idempotencyKey);
        if (existing && existing.result) {
          return res.json({ result: existing.result, cached: true });
        }
      }
      
      // Get active policy
      const activePolicy = await storage.getActivePolicy();
      let requiresApproval = false;
      
      if (activePolicy) {
        try {
          const policy = parseYaml(activePolicy.yamlText) as PolicyYaml;
          const userRole = req.user!.role;
          const allowedTools = policy.roles[userRole]?.tools || [];
          
          // Check if tool is allowed
          if (!allowedTools.includes(action.type)) {
            return res.status(403).json({ error: `Tool ${action.type} not allowed for role ${userRole}` });
          }
          
          // Check if approval is required
          const toolConstraints = policy.toolConstraints?.[action.type];
          if (toolConstraints?.requireApproval && userRole !== "admin") {
            requiresApproval = true;
          }
        } catch (e) {
          console.error("Policy check error:", e);
        }
      }
      
      // For now, simulate action execution
      // In real implementation, would call actual Jira/Slack/Confluence APIs
      const result = {
        success: true,
        actionType: action.type,
        executedAt: new Date().toISOString(),
        details: action.draft,
      };
      
      // Create audit event
      const auditEvent = await storage.createAuditEvent({
        requestId: req.requestId,
        userId: req.user!.id,
        role: req.user!.role,
        kind: "action_execute",
        toolProposalsJson: [action],
        toolExecutionsJson: [result],
        success: true,
        latencyMs: { toolMs: Date.now() - startTime },
      });
      
      // Create approval record
      await storage.createApproval({
        auditEventId: auditEvent.id,
        userId: req.user!.id,
        toolName: action.type,
        draftJson: action.draft,
        finalJson: action.draft,
        idempotencyKey: idempotencyKey || null,
        result,
        approvedAt: new Date(),
      });
      
      res.json({ result, requiresApproval });
    } catch (error) {
      console.error("Action execution error:", error);
      res.status(500).json({ error: "Action execution failed" });
    }
  });
  
  // Audit routes (admin only)
  app.get("/api/audit", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getAuditEvents(limit);
      res.json(events);
    } catch (error) {
      console.error("Get audit events error:", error);
      res.status(500).json({ error: "Failed to get audit events" });
    }
  });
  
  app.get("/api/audit/:requestId", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const event = await storage.getAuditEventByRequestId(req.params.requestId);
      if (!event) {
        return res.status(404).json({ error: "Audit event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Get audit event error:", error);
      res.status(500).json({ error: "Failed to get audit event" });
    }
  });
  
  app.post("/api/audit/:requestId/replay", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const originalEvent = await storage.getAuditEventByRequestId(req.params.requestId);
      if (!originalEvent) {
        return res.status(404).json({ error: "Original event not found" });
      }
      
      if (originalEvent.kind !== "chat" || !originalEvent.prompt) {
        return res.status(400).json({ error: "Only chat events can be replayed" });
      }
      
      // Re-run the chat with the same prompt
      const allChunks = await storage.getAllChunks();
      const relevantChunks = await searchSimilar(originalEvent.prompt, allChunks, 5);
      
      const contextParts = relevantChunks.map((r, i) => {
        return `[Source ${i + 1}: chunk ${r.chunk.id}]\n${r.chunk.text}`;
      });
      
      const systemPrompt = `You are FieldCopilot. Answer based on the context provided.

Context:
${contextParts.join("\n\n---\n\n")}

Respond in JSON format:
{"answer": "...", "bullets": [], "action": null, "needsClarification": false, "clarifyingQuestions": []}`;

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: originalEvent.prompt },
      ];
      
      const responseText = await chatCompletion(messages);
      let chatResponse: ChatResponse;
      
      try {
        chatResponse = chatResponseSchema.parse(JSON.parse(responseText));
      } catch (e) {
        chatResponse = {
          answer: responseText,
          bullets: [],
          action: null,
          needsClarification: false,
          clarifyingQuestions: [],
        };
      }
      
      // Log replay event
      await storage.createAuditEvent({
        requestId: req.requestId,
        userId: req.user!.id,
        role: req.user!.role,
        kind: "replay",
        prompt: originalEvent.prompt,
        retrievedJson: relevantChunks.map(r => ({
          chunkId: r.chunk.id,
          sourceId: r.chunk.sourceId,
          score: r.score,
        })),
        responseJson: chatResponse,
        replayOf: originalEvent.requestId,
        success: true,
      });
      
      res.json({
        original: originalEvent.responseJson,
        replay: chatResponse,
      });
    } catch (error) {
      console.error("Replay error:", error);
      res.status(500).json({ error: "Replay failed" });
    }
  });
  
  // Eval suite routes (admin only)
  app.get("/api/eval-suites", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const suites = await storage.getEvalSuites();
      res.json(suites);
    } catch (error) {
      console.error("Get eval suites error:", error);
      res.status(500).json({ error: "Failed to get eval suites" });
    }
  });
  
  app.post("/api/eval-suites", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const parsed = insertEvalSuiteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      // Validate JSON content
      try {
        if (!parsed.data.jsonText) {
          return res.status(400).json({ error: "jsonText is required" });
        }
        const jsonContent = JSON.parse(parsed.data.jsonText);
        evalSuiteJsonSchema.parse(jsonContent);
      } catch (e) {
        return res.status(400).json({ error: "Invalid eval suite JSON format" });
      }
      
      const suite = await storage.createEvalSuite(parsed.data);
      res.json(suite);
    } catch (error) {
      console.error("Create eval suite error:", error);
      res.status(500).json({ error: "Failed to create eval suite" });
    }
  });
  
  app.delete("/api/eval-suites/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await storage.deleteEvalSuite(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete eval suite error:", error);
      res.status(500).json({ error: "Failed to delete eval suite" });
    }
  });
  
  app.post("/api/eval-suites/:id/run", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const suite = await storage.getEvalSuite(req.params.id);
      if (!suite) {
        return res.status(404).json({ error: "Eval suite not found" });
      }
      
      if (!suite.jsonText) {
        return res.status(400).json({ error: "Suite has no test cases defined" });
      }
      const suiteJson = evalSuiteJsonSchema.parse(JSON.parse(suite.jsonText));
      
      // Create eval run
      const run = await storage.createEvalRun({
        suiteId: suite.id,
        startedAt: new Date(),
      });
      
      // Run eval cases (async, return immediately)
      runEvalCases(run.id, suiteJson.cases, req.user!.id).catch(console.error);
      
      res.json({ runId: run.id, status: "started" });
    } catch (error) {
      console.error("Start eval run error:", error);
      res.status(500).json({ error: "Failed to start eval run" });
    }
  });
  
  app.get("/api/eval-runs", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const runs = await storage.getEvalRuns();
      res.json(runs);
    } catch (error) {
      console.error("Get eval runs error:", error);
      res.status(500).json({ error: "Failed to get eval runs" });
    }
  });
  
  // OAuth routes - User connector accounts list
  app.get("/api/user-connectors", authMiddleware, async (req, res) => {
    try {
      const accounts = await storage.getUserConnectorAccounts(req.user!.id);
      res.json(accounts.map(a => ({
        id: a.id,
        type: a.type,
        status: a.status,
        externalAccountId: a.externalAccountId,
        lastSyncAt: a.lastSyncAt,
        lastSyncError: a.lastSyncError,
        createdAt: a.createdAt,
      })));
    } catch (error) {
      console.error("Get user connectors error:", error);
      res.status(500).json({ error: "Failed to get connectors" });
    }
  });

  app.delete("/api/user-connectors/:id", authMiddleware, async (req, res) => {
    try {
      const account = await storage.getUserConnectorAccount(req.params.id);
      if (!account || account.userId !== req.user!.id) {
        return res.status(404).json({ error: "Connector not found" });
      }
      await storage.deleteUserConnectorAccount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete user connector error:", error);
      res.status(500).json({ error: "Failed to delete connector" });
    }
  });

  // Google OAuth
  app.get("/api/oauth/google", authMiddleware, (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri = `${baseUrl}/api/oauth/google/callback`;
    const state = Buffer.from(JSON.stringify({ 
      userId: req.user!.id,
      timestamp: Date.now()
    })).toString("base64");

    const authUrl = buildAuthUrl("google", clientId, redirectUri, state);
    res.json({ authUrl });
  });

  app.get("/api/oauth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.redirect("/?error=oauth_failed");
      }

      const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      const userId = stateData.userId;

      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;
      const redirectUri = `${baseUrl}/api/oauth/google/callback`;

      const tokens = await exchangeCodeForTokens(
        "google", code as string, clientId, clientSecret, redirectUri
      );

      const userInfo = await getGoogleUserInfo(tokens.accessToken);

      const existingAccount = await storage.getUserConnectorAccountByType(userId, "google");

      const expiresAt = tokens.expiresIn 
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null;

      if (existingAccount) {
        await storage.updateUserConnectorAccount(existingAccount.id, {
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : existingAccount.refreshToken,
          expiresAt,
          scopesJson: tokens.scope ? tokens.scope.split(" ") : null,
          externalAccountId: userInfo.id,
          metadataJson: { email: userInfo.email, name: userInfo.name, picture: userInfo.picture },
          status: "connected",
          lastSyncError: null,
        });
      } else {
        await storage.createUserConnectorAccount({
          userId,
          type: "google",
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          expiresAt,
          scopesJson: tokens.scope ? tokens.scope.split(" ") : null,
          externalAccountId: userInfo.id,
          metadataJson: { email: userInfo.email, name: userInfo.name, picture: userInfo.picture },
          status: "connected",
        });
      }

      res.redirect("/connect?success=google");
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect("/connect?error=google_oauth_failed");
    }
  });

  // Atlassian OAuth
  app.get("/api/oauth/atlassian", authMiddleware, (req, res) => {
    const clientId = process.env.ATLASSIAN_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Atlassian OAuth not configured" });
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri = `${baseUrl}/api/oauth/atlassian/callback`;
    const state = Buffer.from(JSON.stringify({ 
      userId: req.user!.id,
      timestamp: Date.now()
    })).toString("base64");

    const authUrl = buildAuthUrl("atlassian", clientId, redirectUri, state);
    res.json({ authUrl });
  });

  app.get("/api/oauth/atlassian/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.redirect("/?error=oauth_failed");
      }

      const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      const userId = stateData.userId;

      const clientId = process.env.ATLASSIAN_CLIENT_ID!;
      const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET!;
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;
      const redirectUri = `${baseUrl}/api/oauth/atlassian/callback`;

      const tokens = await exchangeCodeForTokens(
        "atlassian", code as string, clientId, clientSecret, redirectUri
      );

      const resources = await getAtlassianResources(tokens.accessToken);

      const existingAccount = await storage.getUserConnectorAccountByType(userId, "atlassian");

      const expiresAt = tokens.expiresIn 
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null;

      if (existingAccount) {
        await storage.updateUserConnectorAccount(existingAccount.id, {
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : existingAccount.refreshToken,
          expiresAt,
          scopesJson: tokens.scope ? tokens.scope.split(" ") : null,
          metadataJson: { resources },
          status: "connected",
          lastSyncError: null,
        });
      } else {
        await storage.createUserConnectorAccount({
          userId,
          type: "atlassian",
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          expiresAt,
          scopesJson: tokens.scope ? tokens.scope.split(" ") : null,
          externalAccountId: resources[0]?.id || null,
          metadataJson: { resources },
          status: "connected",
        });
      }

      res.redirect("/connect?success=atlassian");
    } catch (error) {
      console.error("Atlassian OAuth callback error:", error);
      res.redirect("/connect?error=atlassian_oauth_failed");
    }
  });

  // Slack OAuth
  app.get("/api/oauth/slack", authMiddleware, (req, res) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Slack OAuth not configured" });
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
    const state = Buffer.from(JSON.stringify({ 
      userId: req.user!.id,
      timestamp: Date.now()
    })).toString("base64");

    const authUrl = buildAuthUrl("slack", clientId, redirectUri, state);
    res.json({ authUrl });
  });

  app.get("/api/oauth/slack/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.redirect("/?error=oauth_failed");
      }

      const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      const userId = stateData.userId;

      const clientId = process.env.SLACK_CLIENT_ID!;
      const clientSecret = process.env.SLACK_CLIENT_SECRET!;
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;
      const redirectUri = `${baseUrl}/api/oauth/slack/callback`;

      const tokens = await exchangeCodeForTokens(
        "slack", code as string, clientId, clientSecret, redirectUri
      );

      let slackUserInfo;
      try {
        slackUserInfo = await getSlackUserInfo(tokens.accessToken);
      } catch {
        slackUserInfo = { id: "unknown", teamId: "unknown", name: "Slack User" };
      }

      const existingAccount = await storage.getUserConnectorAccountByType(userId, "slack");

      if (existingAccount) {
        await storage.updateUserConnectorAccount(existingAccount.id, {
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : existingAccount.refreshToken,
          scopesJson: tokens.scope ? tokens.scope.split(",") : null,
          externalAccountId: slackUserInfo.id,
          metadataJson: { 
            teamId: slackUserInfo.teamId, 
            email: slackUserInfo.email, 
            name: slackUserInfo.name 
          },
          status: "connected",
          lastSyncError: null,
        });
      } else {
        await storage.createUserConnectorAccount({
          userId,
          type: "slack",
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          scopesJson: tokens.scope ? tokens.scope.split(",") : null,
          externalAccountId: slackUserInfo.id,
          metadataJson: { 
            teamId: slackUserInfo.teamId, 
            email: slackUserInfo.email, 
            name: slackUserInfo.name 
          },
          status: "connected",
        });
      }

      res.redirect("/connect?success=slack");
    } catch (error) {
      console.error("Slack OAuth callback error:", error);
      res.redirect("/connect?error=slack_oauth_failed");
    }
  });

  // Token refresh endpoint
  app.post("/api/oauth/refresh/:accountId", authMiddleware, async (req, res) => {
    try {
      const account = await storage.getUserConnectorAccount(req.params.accountId);
      
      if (!account || account.userId !== req.user!.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      if (!account.refreshToken) {
        return res.status(400).json({ error: "No refresh token available" });
      }

      const provider = account.type as "google" | "atlassian" | "slack";
      
      let clientId: string | undefined;
      let clientSecret: string | undefined;

      if (provider === "google") {
        clientId = process.env.GOOGLE_CLIENT_ID;
        clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      } else if (provider === "atlassian") {
        clientId = process.env.ATLASSIAN_CLIENT_ID;
        clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
      } else if (provider === "slack") {
        clientId = process.env.SLACK_CLIENT_ID;
        clientSecret = process.env.SLACK_CLIENT_SECRET;
      }

      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: `${provider} OAuth not configured` });
      }

      const decryptedRefreshToken = decryptToken(account.refreshToken);
      const tokens = await refreshAccessToken(
        provider,
        decryptedRefreshToken,
        clientId,
        clientSecret
      );

      const expiresAt = tokens.expiresIn 
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null;

      await storage.updateUserConnectorAccount(account.id, {
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : account.refreshToken,
        expiresAt,
        status: "connected",
        lastSyncError: null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Token refresh error:", error);
      
      await storage.updateUserConnectorAccount(req.params.accountId, {
        status: "expired",
        lastSyncError: error instanceof Error ? error.message : "Token refresh failed",
      });

      res.status(500).json({ error: "Token refresh failed" });
    }
  });

  // User connector scopes routes
  app.get("/api/user-connector-scopes", authMiddleware, async (req, res) => {
    try {
      const scopes = await storage.getUserConnectorScopes(req.user!.id);
      res.json(scopes);
    } catch (error) {
      console.error("Get user connector scopes error:", error);
      res.status(500).json({ error: "Failed to get scopes" });
    }
  });

  app.get("/api/user-connector-scopes/:accountId", authMiddleware, async (req, res) => {
    try {
      // First verify the account belongs to this user
      const account = await storage.getUserConnectorAccount(req.params.accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const scopes = await storage.getUserConnectorScopesByAccount(req.params.accountId);
      res.json(scopes);
    } catch (error) {
      console.error("Get user connector scope error:", error);
      res.status(500).json({ error: "Failed to get scope" });
    }
  });

  app.post("/api/user-connector-scopes", authMiddleware, async (req, res) => {
    try {
      const { accountId, type, scopeConfigJson, syncMode, contentStrategy, exclusionsJson } = req.body;
      
      if (!accountId || !type || !scopeConfigJson) {
        return res.status(400).json({ error: "accountId, type, and scopeConfigJson are required" });
      }
      
      // Validate type
      if (!["google", "atlassian", "slack"].includes(type)) {
        return res.status(400).json({ error: "Invalid type. Must be google, atlassian, or slack" });
      }
      
      // Verify the account belongs to this user
      const account = await storage.getUserConnectorAccount(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const scope = await storage.createUserConnectorScope({
        userId: req.user!.id,
        accountId,
        type,
        scopeConfigJson,
        syncMode: syncMode || "metadata_first",
        contentStrategy: contentStrategy || "smart",
        exclusionsJson: exclusionsJson || null,
      });
      res.json(scope);
    } catch (error) {
      console.error("Create user connector scope error:", error);
      res.status(500).json({ error: "Failed to create scope" });
    }
  });

  app.patch("/api/user-connector-scopes/:id", authMiddleware, async (req, res) => {
    try {
      const existing = await storage.getUserConnectorScope(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Scope not found" });
      }
      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Validate and extract only allowed fields - prevent changing userId/accountId/type
      const parsed = updateUserConnectorScopeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid update data", details: parsed.error.message });
      }
      
      // Build updates with only defined fields - cast to storage-compatible types
      const updates: Record<string, unknown> = {};
      
      if (parsed.data.scopeConfigJson !== undefined) updates.scopeConfigJson = parsed.data.scopeConfigJson;
      if (parsed.data.syncMode !== undefined) updates.syncMode = parsed.data.syncMode;
      if (parsed.data.contentStrategy !== undefined) updates.contentStrategy = parsed.data.contentStrategy;
      if (parsed.data.exclusionsJson !== undefined) updates.exclusionsJson = parsed.data.exclusionsJson;
      
      const scope = await storage.updateUserConnectorScope(req.params.id, updates as Parameters<typeof storage.updateUserConnectorScope>[1]);
      res.json(scope);
    } catch (error) {
      console.error("Update user connector scope error:", error);
      res.status(500).json({ error: "Failed to update scope" });
    }
  });

  app.delete("/api/user-connector-scopes/:id", authMiddleware, async (req, res) => {
    try {
      const existing = await storage.getUserConnectorScope(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Scope not found" });
      }
      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.deleteUserConnectorScope(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete user connector scope error:", error);
      res.status(500).json({ error: "Failed to delete scope" });
    }
  });

  // Sync routes
  app.post("/api/sync/:scopeId", authMiddleware, async (req, res) => {
    try {
      const scope = await storage.getUserConnectorScope(req.params.scopeId);
      if (!scope) {
        return res.status(404).json({ error: "Scope not found" });
      }
      if (scope.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const account = await storage.getUserConnectorAccount(scope.accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { getSyncEngine, runSync } = await import("./lib/sync");
      const engine = getSyncEngine(scope.type);
      if (!engine) {
        return res.status(400).json({ error: `No sync engine for type: ${scope.type}` });
      }

      const accessToken = decryptToken(account.accessToken);
      const result = await runSync(engine, {
        userId: req.user!.id,
        accountId: account.id,
        scope,
        accessToken,
      });

      await storage.updateUserConnectorScope(scope.id, {});

      res.json(result);
    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.post("/api/sync/:scopeId/on-demand", authMiddleware, async (req, res) => {
    try {
      const { externalId } = req.body;
      if (!externalId) {
        return res.status(400).json({ error: "externalId is required" });
      }

      const scope = await storage.getUserConnectorScope(req.params.scopeId);
      if (!scope) {
        return res.status(404).json({ error: "Scope not found" });
      }
      if (scope.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const account = await storage.getUserConnectorAccount(scope.accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { getSyncEngine, syncOnDemand } = await import("./lib/sync");
      const engine = getSyncEngine(scope.type);
      if (!engine) {
        return res.status(400).json({ error: `No sync engine for type: ${scope.type}` });
      }

      const accessToken = decryptToken(account.accessToken);
      const content = await syncOnDemand(engine, {
        userId: req.user!.id,
        accountId: account.id,
        scope,
        accessToken,
      }, externalId);

      if (!content) {
        return res.status(404).json({ error: "Content not found or failed to sync" });
      }

      res.json({ success: true, title: content.title });
    } catch (error) {
      console.error("On-demand sync error:", error);
      res.status(500).json({ error: "On-demand sync failed" });
    }
  });

  // Job-based sync endpoint (returns job immediately, runs sync in background)
  app.post("/api/sync/:scopeId/async", authMiddleware, async (req, res) => {
    try {
      const scope = await storage.getUserConnectorScope(req.params.scopeId);
      if (!scope) {
        return res.status(404).json({ error: "Scope not found" });
      }
      if (scope.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const account = await storage.getUserConnectorAccount(scope.accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const idempotencyKey = `sync:${scope.id}:${Date.now()}`;
      const job = await enqueueJob({
        type: "sync",
        userId: req.user!.id,
        connectorType: scope.type as "google" | "atlassian" | "slack" | "upload",
        scopeId: scope.id,
        idempotencyKey,
        payload: {
          scopeId: scope.id,
          userId: req.user!.id,
          connectorType: scope.type,
          accountId: account.id,
        },
      });

      res.json({ jobId: job.id, status: job.status });
    } catch (error) {
      console.error("Async sync error:", error);
      res.status(500).json({ error: "Failed to queue sync job" });
    }
  });

  // Job management routes
  app.get("/api/jobs", authMiddleware, async (req, res) => {
    try {
      const jobs = await storage.getJobsByUser(req.user!.id);
      res.json(jobs);
    } catch (error) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  app.get("/api/jobs/:id", authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(job);
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ error: "Failed to get job" });
    }
  });

  app.get("/api/jobs/:id/runs", authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const runs = await storage.getJobRuns(req.params.id);
      res.json(runs);
    } catch (error) {
      console.error("Get job runs error:", error);
      res.status(500).json({ error: "Failed to get job runs" });
    }
  });

  // Admin-only: Get dead letter jobs
  app.get("/api/admin/jobs/dead-letter", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const jobs = await storage.getDeadLetterJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Get dead letter jobs error:", error);
      res.status(500).json({ error: "Failed to get dead letter jobs" });
    }
  });

  // Admin-only: Retry dead letter job
  app.post("/api/admin/jobs/:id/retry", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.status !== "dead_letter" && job.status !== "failed") {
        return res.status(400).json({ error: "Job is not in failed or dead letter state" });
      }
      
      await storage.updateJob(req.params.id, {
        status: "pending",
        attempts: 0,
        nextRunAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      });
      
      res.json({ success: true, message: "Job requeued for retry" });
    } catch (error) {
      console.error("Retry job error:", error);
      res.status(500).json({ error: "Failed to retry job" });
    }
  });

  // Seed admin user endpoint (for initial setup)
  app.post("/api/seed", async (req, res) => {
    try {
      // Check if admin already exists
      const existingAdmin = await storage.getUserByEmail("admin@fieldcopilot.com");
      if (existingAdmin) {
        return res.json({ message: "Admin already exists", email: existingAdmin.email });
      }
      
      // Create admin user
      const admin = await storage.createUser({
        email: "admin@fieldcopilot.com",
        passwordHash: "admin123",
        role: "admin",
      });
      
      // Create default policy
      const defaultPolicy = `roles:
  admin:
    tools:
      - jira.create_issue
      - jira.update_issue
      - slack.post_message
      - confluence.upsert_page
  member:
    tools:
      - jira.create_issue
      - slack.post_message
toolConstraints:
  jira.create_issue:
    allowedProjects:
      - OPS
      - FIELD
    requireApproval: false
  slack.post_message:
    allowedChannels:
      - general
      - field-ops
    requireApproval: false`;
      
      await storage.createPolicy({
        name: "Default Policy",
        yamlText: defaultPolicy,
        isActive: true,
      });
      
      res.json({
        message: "Seeded successfully",
        admin: { email: admin.email, password: "admin123" },
      });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ error: "Seed failed" });
    }
  });
  
  return httpServer;
}

// Helper function to run eval cases asynchronously
async function runEvalCases(
  runId: string,
  cases: Array<{
    id: string;
    type: "QNA" | "ACTION";
    prompt: string;
    mustCite?: boolean;
    expectedSourceIds?: string[];
    expectedTool?: string;
    requiredFields?: string[];
  }>,
  userId: string
) {
  const results: Array<{
    caseId: string;
    passed: boolean;
    details: string;
  }> = [];
  
  for (const evalCase of cases) {
    try {
      // Get chunks for retrieval
      const allChunks = await storage.getAllChunks();
      const relevantChunks = await searchSimilar(evalCase.prompt, allChunks, 5);
      
      const contextParts = relevantChunks.map((r, i) => {
        return `[Source ${i + 1}: chunk ${r.chunk.id} from source ${r.chunk.sourceId}]\n${r.chunk.text}`;
      });
      
      const systemPrompt = `You are FieldCopilot. Answer based on the context.

Context:
${contextParts.join("\n\n---\n\n")}

Respond in JSON: {"answer": "...", "bullets": [{"claim": "...", "citations": [{"sourceId": "...", "chunkId": "..."}]}], "action": null or {...}, "needsClarification": false, "clarifyingQuestions": []}`;

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: evalCase.prompt },
      ];
      
      const responseText = await chatCompletion(messages);
      let response: ChatResponse;
      
      try {
        response = chatResponseSchema.parse(JSON.parse(responseText));
      } catch (e) {
        results.push({
          caseId: evalCase.id,
          passed: false,
          details: "Failed to parse response as valid JSON",
        });
        continue;
      }
      
      // Evaluate based on case type
      let passed = true;
      const details: string[] = [];
      
      if (evalCase.type === "QNA") {
        // Check citations if required
        if (evalCase.mustCite) {
          const hasCitations = response.bullets.some(b => b.citations.length > 0);
          if (!hasCitations) {
            passed = false;
            details.push("Expected citations but none found");
          }
        }
        
        // Check expected source IDs
        if (evalCase.expectedSourceIds && evalCase.expectedSourceIds.length > 0) {
          const citedSources = new Set(
            response.bullets.flatMap(b => b.citations.map(c => c.sourceId))
          );
          const hasExpected = evalCase.expectedSourceIds.some(id => citedSources.has(id));
          if (!hasExpected) {
            passed = false;
            details.push(`Expected sources ${evalCase.expectedSourceIds.join(", ")} not cited`);
          }
        }
      } else if (evalCase.type === "ACTION") {
        // Check if action was proposed
        if (!response.action) {
          passed = false;
          details.push("Expected action but none proposed");
        } else {
          // Check expected tool
          if (evalCase.expectedTool && response.action.type !== evalCase.expectedTool) {
            passed = false;
            details.push(`Expected tool ${evalCase.expectedTool} but got ${response.action.type}`);
          }
          
          // Check required fields
          if (evalCase.requiredFields) {
            for (const field of evalCase.requiredFields) {
              if (!(field in response.action.draft)) {
                passed = false;
                details.push(`Missing required field: ${field}`);
              }
            }
          }
        }
      }
      
      results.push({
        caseId: evalCase.id,
        passed,
        details: details.length > 0 ? details.join("; ") : "All checks passed",
      });
      
      // Log eval audit event
      await storage.createAuditEvent({
        requestId: randomUUID(),
        userId,
        kind: "eval",
        prompt: evalCase.prompt,
        responseJson: response,
        success: passed,
      });
    } catch (error) {
      results.push({
        caseId: evalCase.id,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
  
  // Update run with results
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  await storage.updateEvalRun(runId, {
    finishedAt: new Date(),
    metricsJson: {
      total: cases.length,
      passed,
      failed,
      passRate: cases.length > 0 ? (passed / cases.length) * 100 : 0,
    },
    resultsJson: results,
  });
}
