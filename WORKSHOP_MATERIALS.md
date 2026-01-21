# FieldCopilot Workshop Materials

60-90 minute hands-on workshop for Digital Native teams to learn FieldCopilot.

## Agenda

1. **Introduction** (10 min)
   - What is FieldCopilot?
   - Use cases and benefits
   - Architecture overview

2. **Live Demo** (20 min)
   - Chat interface (HTTP mode)
   - Voice transcript mode (WebSocket)
   - MCP mode (Claude Desktop integration)
   - Playbook generation
   - Tool actions (Jira/Slack)

3. **Hands-On Exercise 1: Basic Q&A** (15 min)
   - Set up local environment
   - Ingest documents
   - Query knowledge base

4. **Hands-On Exercise 2: Tool Integration** (20 min)
   - Connect Jira
   - Create tickets via chat
   - Configure policy

5. **Hands-On Exercise 3: Playbooks** (15 min)
   - Create incident playbook
   - Review generated steps
   - Execute action drafts

6. **Q&A & Troubleshooting** (10 min)

## 1. Introduction

### What is FieldCopilot?

FieldCopilot is an AI assistant for field operations teams that:
- Answers questions from your knowledge base (RAG)
- Generates incident response playbooks
- Executes tool actions (Jira, Slack, Confluence)
- Provides voice support for real-time assistance

### Key Features

- **RAG-Powered Q&A**: Semantic search over your documents
- **Citation Integrity**: Every answer cites its sources
- **Tool Actions**: Create tickets, post messages, update docs
- **Policy Enforcement**: Role-based access control
- **Observability**: Full tracing and metrics

### Architecture

```
User Query → RAG Retrieval → LLM Generation → Response with Citations
                ↓
         Tool Actions → Policy Check → Approval (if needed) → Execution
```

## 2. Live Demo

### Demo Script

**Scenario**: Field technician needs to handle a chemical spill.

#### A. HTTP Mode (Normal Chat)

1. **Query Knowledge Base**
   ```
   User: "How do I handle a chemical spill?"
   
   FieldCopilot: [Answer with citations to safety procedures]
   ```

2. **Generate Playbook**
   ```
   User: "Create a playbook for chemical spill in lab B"
   
   FieldCopilot: [Generates structured playbook with SOP steps, PPE checklist, action drafts]
   ```

3. **Execute Action**
   ```
   User: "Create a Jira ticket for this incident"
   
   FieldCopilot: [Proposes Jira ticket, checks policy, creates ticket]
   ```

#### B. Voice Mode (WebSocket Transcript)

**Demo Steps:**
1. Open WebSocket connection to `ws://localhost:5000/ws/voice`
2. Send session start:
   ```json
   {"type": "voice.session.start", "sessionId": "demo-1", "userId": "user-1", "mode": "transcript"}
   ```
3. Send transcript:
   ```json
   {"type": "voice.transcript", "sessionId": "demo-1", "text": "What are the safety procedures for chemical spills?", "messageId": "msg-1"}
   ```
4. Receive response with citations and action drafts
5. Show trace spans with `channel="voice"` in observability dashboard

**Code Snippet:**
```typescript
// server/lib/voice/voiceServer.ts:67-120
// Voice server calls runAgentTurn() with channel="voice"
const result = await runAgentTurn({
  message: message.text,
  userId: session.userId,
  userRole: "member",
  channel: "voice",
  requestId: uuidv4(),
});
```

#### C. MCP Mode (Claude Desktop)

**Demo Steps:**
1. Show Claude Desktop MCP configuration
2. Call `fieldcopilot.chat` tool:
   ```json
   {
     "name": "fieldcopilot.chat",
     "arguments": {
       "query": "What are the safety procedures for chemical spills?",
       "topK": 5
     }
   }
   ```
3. Show response with citations and meta (channel="mcp")
4. Access `fieldcopilot://status` resource to show build info

**Code Snippet:**
```typescript
// server/mcp/mcpServer.ts:120-150
// MCP tool calls runAgentTurn() with channel="mcp"
const result = await runAgentTurn({
  message: query,
  userId: "mcp_user",
  userRole: "member",
  channel: "mcp",
  requestId: `mcp-${Date.now()}`,
  topK,
});
```

## 3. Hands-On Exercise 1: Basic Q&A

### Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd Field-Copilot-1

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# 4. Set up database
npm run db:push

# 5. Start server
npm run dev
```

### Exercise Steps

1. **Ingest a Document**

```bash
# Create a sample safety procedure document
cat > safety-procedures.txt << EOF
# Safety Procedures

## Chemical Spill Response
1. Evacuate the area immediately
2. Notify safety officer
3. Use appropriate PPE (gloves, goggles, apron)
4. Contain spill with absorbent material
5. Dispose of contaminated materials properly
EOF

# Upload via API (or use web UI at /admin/ingest)
curl -X POST http://localhost:5000/api/ingest \
  -H "Cookie: session=YOUR_SESSION" \
  -F "files=@safety-procedures.txt"
```

2. **Query the Knowledge Base**

```bash
# Via API
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "message": "What PPE is required for chemical spills?"
  }'
```

Or use the web UI at `http://localhost:5000/chat`

3. **Verify Citations**

Check that the response includes:
- Citations with `chunkId` and `sourceId`
- Answer grounded in the uploaded document

### Expected Output

```json
{
  "answer": "For chemical spills, you need gloves, goggles, and an apron...",
  "bullets": [
    {
      "claim": "PPE required: gloves, goggles, apron",
      "citations": [
        {
          "chunkId": "...",
          "sourceId": "...",
          "charStart": 100,
          "charEnd": 150
        }
      ]
    }
  ]
}
```

## 4. Hands-On Exercise 2: Tool Integration

### Connect Jira

1. **Set up OAuth** (one-time)

```bash
# Configure OAuth credentials in .env
ATLASSIAN_CLIENT_ID=your_client_id
ATLASSIAN_CLIENT_SECRET=your_client_secret
```

2. **Connect Account** (via web UI)

Navigate to `/connect/atlassian` and authorize.

3. **Configure Sync Scope**

```bash
# Create connector scope via API
curl -X POST http://localhost:5000/api/connectors/scopes \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "type": "atlassian",
    "scopeConfigJson": {
      "cloudId": "your-cloud-id",
      "projectKeys": ["OPS", "FIELD"]
    }
  }'
```

4. **Sync Content**

```bash
# Trigger sync job
curl -X POST http://localhost:5000/api/connectors/scopes/:scopeId/sync \
  -H "Cookie: session=YOUR_SESSION"
```

### Create Jira Ticket via Chat

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "message": "Create a Jira ticket for equipment failure in production line 3"
  }'
```

Response will include an `action` proposal:

```json
{
  "action": {
    "type": "jira.create_issue",
    "draft": {
      "project": "OPS",
      "summary": "Equipment failure in production line 3",
      "description": "..."
    }
  }
}
```

5. **Execute Action**

```bash
curl -X POST http://localhost:5000/api/actions/execute \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "action": {
      "type": "jira.create_issue",
      "draft": {
        "project": "OPS",
        "summary": "Equipment failure",
        "description": "Production line 3 equipment failure"
      }
    }
  }'
```

### Configure Policy

Create a policy YAML:

```yaml
roles:
  member:
    tools:
      - jira.create_issue
      - slack.post_message
  admin:
    tools:
      - jira.create_issue
      - jira.update_issue
      - slack.post_message
      - confluence.upsert_page

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
    requireApproval: true
```

Upload via `/admin/policies` UI or API.

## 5. Hands-On Exercise 3: Playbooks

### Create Playbook

```bash
curl -X POST http://localhost:5000/api/playbooks \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "incidentText": "Chemical spill in lab B. Approximately 2 liters of hydrochloric acid spilled on the floor. No injuries reported."
  }'
```

### Review Generated Playbook

The playbook will include:
- SOP steps with citations
- PPE checklist
- Shutdown procedures
- Action drafts (Jira ticket, Slack notification)

### Execute Action Drafts

Navigate to `/playbooks/:id` and click "Approve" on action drafts.

## 6. Troubleshooting

### Common Issues

**Issue**: "No relevant documents found"
- **Cause**: Documents not ingested or chunks not created
- **Fix**: Check ingestion job status, verify chunks in database

**Issue**: "Tool action failed"
- **Cause**: OAuth token expired or policy constraint
- **Fix**: Reconnect OAuth, check policy configuration

**Issue**: "Slow response times"
- **Cause**: Large knowledge base or inefficient retrieval
- **Fix**: Reduce top-K, optimize vector search

**Issue**: "Citations not showing"
- **Cause**: Chunks not properly linked to sources
- **Fix**: Verify source versioning, check chunk creation

### Debug Tips

1. **Check Observability Dashboard**
   - Navigate to `/admin/observability`
   - View traces and spans
   - Check retrieval similarity scores

2. **Check Job Queue**
   - View jobs at `/admin/jobs`
   - Check for failed jobs
   - Review job run stats

3. **Check Evaluation Metrics**
   - Run eval suite: `npm run eval`
   - Review metrics in eval run results
   - Check for regressions: `npm run ci`

## Code Snippets

### Custom Integration Example

```typescript
// Add custom tool action
import { checkPolicy } from "./lib/policy/checker";

app.post("/api/actions/custom", async (req, res) => {
  const { action } = req.body;
  
  // Check policy
  const policyResult = checkPolicy(policy, {
    userRole: req.user.role,
    toolName: "custom.action",
    toolParams: action.draft,
  });
  
  if (!policyResult.allowed) {
    return res.status(403).json({ error: policyResult.denialReason });
  }
  
  // Execute custom action
  const result = await executeCustomAction(action.draft);
  res.json({ result });
});
```

### Custom Sync Engine

```typescript
// Add custom sync engine
import type { SyncEngine } from "./lib/sync/types";

export const customSyncEngine: SyncEngine = {
  name: "custom",
  
  async fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]> {
    // Fetch metadata from custom source
    return items;
  },
  
  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    // Fetch content for item
    return content;
  },
};
```

## Next Steps

After the workshop:

1. Set up production environment
2. Ingest your actual knowledge base
3. Configure policies for your team
4. Train users on best practices
5. Set up monitoring and evaluation

## Resources

- **Documentation**: `README.md`
- **Onboarding**: `ONBOARDING_PLAYBOOK.md`
- **Evaluation**: `EVAL_RUBRIC.md`
- **Security**: `SECURITY_LOGGING.md`
