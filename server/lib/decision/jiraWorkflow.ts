// Decision Card generator and Jira workflow handler
import { storage } from "../../storage";
import { tracer } from "../observability/tracer";
import type { ChatResponse, Citation } from "@shared/schema";

export interface DecisionCard {
    summary: string;
    owners: string[];
    dueDate: string | null;
    citations: Citation[];
    slackThread: {
        channelId: string;
        channelName: string;
        messageTs: string;
        permalink: string;
    } | null;
}

export interface JiraIssueProposal {
    projectKey: string;
    issueType: string;
    summary: string;
    description: string;
    assignee?: string;
    dueDate?: string;
    labels?: string[];
}

/**
 * Extract a Decision Card from a chat response with Slack citations
 */
export async function generateDecisionCard(
    chatResponse: ChatResponse,
    userId: string
): Promise<DecisionCard> {
    const traceCtx = await tracer.startTrace("action", userId);

    try {
        // Extract decision summary from bullets
        const decisionBullets = chatResponse.bullets.filter(b =>
            b.claim.toLowerCase().includes("decid") ||
            b.claim.toLowerCase().includes("agreed") ||
            b.claim.toLowerCase().includes("will")
        );

        const summary = decisionBullets.length > 0
            ? decisionBullets.map(b => b.claim).join(". ")
            : chatResponse.bullets[0]?.claim || "Decision from Slack thread";

        // Extract owners (look for @mentions or names)
        const owners: string[] = [];
        const ownerRegex = /@(\w+)/g;
        for (const bullet of chatResponse.bullets) {
            let match;
            while ((match = ownerRegex.exec(bullet.claim)) !== null) {
                owners.push(match[1]);
            }
        }

        // Extract due date (look for date mentions)
        let dueDate: string | null = null;
        const dateRegex = /(\d{4}-\d{2}-\d{2}|next \w+|by \w+ \d+)/i;
        for (const bullet of chatResponse.bullets) {
            const match = bullet.claim.match(dateRegex);
            if (match) {
                dueDate = match[1];
                break;
            }
        }

        // Get Slack thread info from first citation
        let slackThread = null;
        const slackCitations = chatResponse.bullets.flatMap(b => b.citations).filter(c => c.url?.includes("slack.com"));
        if (slackCitations.length > 0) {
            const firstCitation = slackCitations[0];
            const source = await storage.getSource(firstCitation.sourceId);
            if (source && source.type === "slack") {
                const metadata = source.metadataJson as any;
                slackThread = {
                    channelId: metadata?.channelId || "",
                    channelName: metadata?.channelName || "",
                    messageTs: metadata?.messageTs || "",
                    permalink: firstCitation.url || "",
                };
            }
        }

        const decisionCard: DecisionCard = {
            summary,
            owners,
            dueDate,
            citations: chatResponse.bullets.flatMap(b => b.citations),
            slackThread,
        };

        await tracer.endTrace(traceCtx.traceId, "completed");

        return decisionCard;
    } catch (error) {
        await tracer.endTrace(traceCtx.traceId, "failed", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

/**
 * Generate a decision card from explicit context (e.g. manual propose)
 */
export async function generateDecisionCardFromContext(
    userId: string,
    context: string,
    citations: any[],
    slackThreadUrl?: string
): Promise<DecisionCard> {
    const traceCtx = await tracer.startTrace("action", userId);
    try {
        // In a real implementation, we would use an LLM to extract these details from context
        // For now, we will construct a simple card from the provided info

        return {
            summary: context.length > 100 ? context.substring(0, 97) + "..." : context,
            owners: [], // Auto-detection not implemented
            dueDate: null,
            citations: citations || [],
            slackThread: slackThreadUrl ? {
                channelId: "unknown",
                channelName: "slack-thread",
                messageTs: "0",
                permalink: slackThreadUrl
            } : null
        };
    } finally {
        await tracer.endTrace(traceCtx.traceId, "completed");
    }
}

/**
 * Create Jira issue proposal from Decision Card
 */
export function createJiraProposal(
    decisionCard: DecisionCard,
    projectKey: string = "PROJ",
    issueType: string = "Task"
): JiraIssueProposal {
    // Build description with Decision Card + citations
    let description = `*Decision Summary*\n${decisionCard.summary}\n\n`;

    if (decisionCard.owners.length > 0) {
        description += `*Owners*\n${decisionCard.owners.map(o => `- ${o}`).join("\n")}\n\n`;
    }

    if (decisionCard.slackThread) {
        description += `*Slack Thread*\n[View conversation|${decisionCard.slackThread.permalink}] in #${decisionCard.slackThread.channelName}\n\n`;
    }

    if (decisionCard.citations.length > 0) {
        description += `*Supporting Citations*\n`;
        for (const citation of decisionCard.citations) {
            if (citation.url && citation.label) {
                description += `- [${citation.label}|${citation.url}]\n`;
            }
        }
    }

    const proposal: JiraIssueProposal = {
        projectKey,
        issueType,
        summary: decisionCard.summary.substring(0, 255), // Jira summary max length
        description,
        dueDate: decisionCard.dueDate || undefined,
        labels: ["from-slack", "decision"],
    };

    if (decisionCard.owners.length > 0) {
        proposal.assignee = decisionCard.owners[0];
    }

    return proposal;
}

/**
 * Execute Jira issue creation with user's Atlassian token
 */
export async function executeJiraCreation(
    proposal: JiraIssueProposal,
    userId: string,
    atlassianAccountId: string
): Promise<{ issueKey: string; issueUrl: string }> {
    const traceCtx = await tracer.startTrace("action", userId);

    try {
        // Get user's Atlassian connector account
        const account = await storage.getUserConnectorAccount(atlassianAccountId);
        if (!account || account.type !== "atlassian") {
            throw new Error("Atlassian account not found");
        }

        // Get Atlassian cloud ID from account
        const metadata = account.metadataJson as any;
        const cloudId = metadata?.cloudId;
        if (!cloudId) {
            throw new Error("Atlassian cloud ID not found");
        }

        // Decrypt token
        const { decryptToken } = await import("../oauth");
        const accessToken = decryptToken(account.accessToken);

        if (process.env.PROOF_MOCK_JIRA === "1") {
            // Mock Jira creation
            const issueKey = `${proposal.projectKey}-123`;
            const issueUrl = `https://${metadata.siteName}.atlassian.net/browse/${issueKey}`;

            // Create audit event
            await storage.createAuditEvent({
                requestId: traceCtx.traceId,
                kind: "decision_to_jira",
                userId,
                success: true,
                responseJson: {
                    issueKey,
                    issueUrl,
                    projectKey: proposal.projectKey,
                    summary: proposal.summary,
                    mock: true
                },
            });
            await tracer.endTrace(traceCtx.traceId, "completed");
            return { issueKey, issueUrl };
        }

        // Create Jira issue
        const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                fields: {
                    project: { key: proposal.projectKey },
                    issuetype: { name: proposal.issueType },
                    summary: proposal.summary,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [
                            {
                                type: "paragraph",
                                content: [{ type: "text", text: proposal.description }],
                            },
                        ],
                    },
                    ...(proposal.assignee && { assignee: { name: proposal.assignee } }),
                    ...(proposal.dueDate && { duedate: proposal.dueDate }),
                    ...(proposal.labels && { labels: proposal.labels }),
                },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Jira API error: ${error}`);
        }

        const result = await response.json();
        const issueKey = result.key;
        const issueUrl = `https://${metadata.siteName}.atlassian.net/browse/${issueKey}`;

        // Create audit event
        await storage.createAuditEvent({
            requestId: traceCtx.traceId,
            kind: "decision_to_jira",
            userId,
            success: true,
            responseJson: {
                issueKey,
                issueUrl,
                projectKey: proposal.projectKey,
                summary: proposal.summary,
            },
        });

        await tracer.endTrace(traceCtx.traceId, "completed");

        return { issueKey, issueUrl };
    } catch (error) {
        await tracer.endTrace(traceCtx.traceId, "failed", error instanceof Error ? error.message : String(error));

        // Create audit event for failure
        await storage.createAuditEvent({
            requestId: traceCtx.traceId,
            kind: "decision_to_jira",
            userId,
            success: false,
            responseJson: {
                error: error instanceof Error ? error.message : String(error),
                proposal,
            },
        });

        throw error;
    }
}
