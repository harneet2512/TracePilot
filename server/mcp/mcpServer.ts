/**
 * MCP Server - Model Context Protocol server for FieldCopilot
 * 
 * This module implements an MCP server that exposes FieldCopilot as tools and resources,
 * allowing Claude Desktop or any MCP host to interact with the agent.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runAgentTurn } from "../lib/agent/agentCore";
import { storage } from "../storage";
import { checkPolicy } from "../lib/policy/checker";
import { parse as parseYaml } from "yaml";
import type { PolicyYaml } from "@shared/schema";
import { readFileSync } from "fs";
import { join } from "path";

const PACKAGE_JSON = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf-8")
);

export async function startMCPServer() {
  const server = new Server(
    {
      name: "fieldcopilot",
      version: PACKAGE_JSON.version || "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "fieldcopilot.chat",
          description: "Chat with FieldCopilot agent. Returns answer with citations and optional action draft.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "User query/question",
              },
              workspaceId: {
                type: "string",
                description: "Optional workspace ID for scoped queries",
              },
              topK: {
                type: "number",
                description: "Number of top chunks to retrieve (default: 5)",
                default: 5,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "fieldcopilot.playbook",
          description: "Generate an incident response playbook from incident description.",
          inputSchema: {
            type: "object",
            properties: {
              incident: {
                type: "string",
                description: "Description of the incident",
              },
              workspaceId: {
                type: "string",
                description: "Optional workspace ID",
              },
            },
            required: ["incident"],
          },
        },
        {
          name: "fieldcopilot.action_draft",
          description: "Draft a tool action (Jira, Slack, Confluence) based on user intent.",
          inputSchema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                description: "User intent (e.g., 'Create a Jira ticket for X')",
              },
              workspaceId: {
                type: "string",
                description: "Optional workspace ID",
              },
            },
            required: ["intent"],
          },
        },
        {
          name: "fieldcopilot.action_execute",
          description: "Execute a previously approved action using approval ID and idempotency key.",
          inputSchema: {
            type: "object",
            properties: {
              approvalId: {
                type: "string",
                description: "Approval ID from a previous action_draft",
              },
              idempotencyKey: {
                type: "string",
                description: "Idempotency key for this execution",
              },
            },
            required: ["approvalId", "idempotencyKey"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "fieldcopilot.chat": {
          const { query, topK = 5 } = args as { query: string; topK?: number };
          
          // Call agent core
          const result = await runAgentTurn({
            message: query,
            userId: "mcp_user", // TODO: Get from MCP context if available
            userRole: "member", // TODO: Get from MCP context
            channel: "mcp",
            requestId: `mcp-${Date.now()}`,
            topK,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  answerText: result.answerText,
                  citations: result.bullets.flatMap(b => b.citations),
                  actionDraft: result.actionDraft,
                  meta: result.meta,
                }, null, 2),
              },
            ],
          };
        }

        case "fieldcopilot.playbook": {
          const { incident } = args as { incident: string };
          
          // Use agent core to generate playbook (for now, use chat with special prompt)
          const result = await runAgentTurn({
            message: `Generate an incident response playbook for: ${incident}`,
            userId: "mcp_user",
            userRole: "member",
            channel: "mcp",
            requestId: `mcp-playbook-${Date.now()}`,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  playbook: {
                    incident: incident,
                    answer: result.answerText,
                    citations: result.bullets.flatMap(b => b.citations),
                  },
                  meta: result.meta,
                }, null, 2),
              },
            ],
          };
        }

        case "fieldcopilot.action_draft": {
          const { intent } = args as { intent: string };
          
          // Call agent core to draft action
          const result = await runAgentTurn({
            message: intent,
            userId: "mcp_user",
            userRole: "member",
            channel: "mcp",
            requestId: `mcp-action-${Date.now()}`,
          });

          if (!result.actionDraft) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "No action was drafted. The intent may not require a tool action.",
                    meta: result.meta,
                  }, null, 2),
                },
              ],
            };
          }

          // Check policy and create approval if needed
          const activePolicy = await storage.getActivePolicy();
          let parsedPolicy: PolicyYaml | null = null;
          if (activePolicy) {
            try {
              parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
            } catch (e) {
              console.error("Policy parse error:", e);
            }
          }

          const policyResult = checkPolicy(parsedPolicy, {
            userRole: "member",
            toolName: result.actionDraft.type,
            toolParams: result.actionDraft.draft,
          });

          let approvalId: string | null = null;
          if (policyResult.allowed && policyResult.requiresApproval) {
            // Create approval
            const auditEvent = await storage.createAuditEvent({
              requestId: result.meta.traceId,
              userId: "mcp_user",
              role: "member",
              kind: "action_execute",
              toolProposalsJson: [{
                type: result.actionDraft.type,
                draft: result.actionDraft.draft,
                rationale: result.actionDraft.rationale,
                citations: [],
              }],
              success: true,
              traceId: result.meta.traceId,
            });

            const approval = await storage.createApproval({
              auditEventId: auditEvent.id,
              userId: "mcp_user",
              toolName: result.actionDraft.type,
              draftJson: result.actionDraft.draft,
              finalJson: result.actionDraft.draft,
              idempotencyKey: null,
              result: null,
            });

            approvalId = approval.id;
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  actionDraft: result.actionDraft,
                  approvalId,
                  requiresApproval: policyResult.requiresApproval,
                  meta: result.meta,
                }, null, 2),
              },
            ],
          };
        }

        case "fieldcopilot.action_execute": {
          const { approvalId, idempotencyKey } = args as { approvalId: string; idempotencyKey: string };
          
          // Check if approval exists
          const approval = await storage.getApproval(approvalId);
          if (!approval) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "Approval not found",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Validate approval status
          if (approval.status !== "pending" && approval.status !== "approved") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Approval status is ${approval.status}, cannot execute. Status must be "pending" or "approved".`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Check idempotency
          const existingApproval = await storage.getApprovalByIdempotencyKey(idempotencyKey);
          if (existingApproval && existingApproval.result) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "already_executed",
                    result: existingApproval.result,
                  }, null, 2),
                },
              ],
            };
          }

          // Re-check policy before execution (critical for security)
          const activePolicy = await storage.getActivePolicy();
          let parsedPolicy: PolicyYaml | null = null;
          if (activePolicy) {
            try {
              parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
            } catch (e) {
              console.error("Policy parse error:", e);
            }
          }

          const policyResult = checkPolicy(parsedPolicy, {
            userRole: "member", // TODO: Get from approval.userId or MCP context
            toolName: approval.toolName,
            toolParams: (approval.finalJson || approval.draftJson) as Record<string, any>,
          });

          if (!policyResult.allowed) {
            await storage.updateApproval(approvalId, {
              status: "rejected",
              result: { error: policyResult.denialReason },
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Policy denied execution: ${policyResult.denialReason}`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Execute action (simulated for now)
          // TODO: Implement actual tool execution
          const result = {
            success: true,
            actionType: approval.toolName,
            result: {
              id: `simulated-${Date.now()}`,
              status: "created",
            },
          };

          // Update approval with result
          await storage.updateApproval(approvalId, {
            idempotencyKey,
            result: result as any,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "executed",
                  toolExecutionResult: result,
                }, null, 2),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Unknown tool: ${name}`,
                }, null, 2),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "fieldcopilot://status",
          name: "FieldCopilot Status",
          description: "Build info, enabled connectors, and environment sanity checks",
          mimeType: "application/json",
        },
        {
          uri: "fieldcopilot://evals",
          name: "Evaluation Suites",
          description: "List of eval suites and latest run summary",
          mimeType: "application/json",
        },
      ],
    };
  });

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      if (uri === "fieldcopilot://status") {
        const connectors = await storage.getConnectors();
        const activePolicy = await storage.getActivePolicy();
        
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                version: PACKAGE_JSON.version,
                buildTime: new Date().toISOString(),
                enabledConnectors: connectors.map(c => ({
                  type: c.type,
                  name: c.name,
                  status: c.status,
                })),
                hasActivePolicy: !!activePolicy,
                environment: {
                  nodeEnv: process.env.NODE_ENV || "development",
                  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
                  hasDatabase: true, // TODO: Check DB connection
                },
              }, null, 2),
            },
          ],
        };
      }

      if (uri === "fieldcopilot://evals") {
        const suites = await storage.getEvalSuites();
        const runs = await storage.getEvalRuns();
        
        const latestRuns = suites.map(suite => {
          const suiteRuns = runs
            .filter(r => r.suiteId === suite.id && r.status === "completed")
            .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
          return {
            suiteId: suite.id,
            suiteName: suite.name,
            latestRun: suiteRuns[0] ? {
              id: suiteRuns[0].id,
              createdAt: suiteRuns[0].createdAt,
              metrics: suiteRuns[0].metricsJson,
            } : null,
          };
        });

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                suites: latestRuns,
              }, null, 2),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `Unknown resource: ${uri}`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `Error reading resource: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("[MCP] Server started on stdio");
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch(console.error);
}
