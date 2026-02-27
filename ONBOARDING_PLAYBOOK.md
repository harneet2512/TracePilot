# FieldCopilot Onboarding Playbook for Digital Native Teams

This playbook guides you through onboarding FieldCopilot for your field operations team, from initial discovery to production rollout.

## Phase 1: Discovery (Week 0)

### Discovery Checklist

Use this checklist to gather requirements before implementation:

#### Business Goals
- [ ] What is the primary use case? (e.g., incident response, safety procedures lookup, equipment maintenance)
- [ ] What are the success metrics? (e.g., response time, accuracy, user satisfaction)
- [ ] What is the target user base? (field technicians, safety officers, operations managers)
- [ ] What is the expected query volume? (requests per day/hour)

#### UX Requirements
- [ ] What is the preferred interface? (web UI, voice, API, Slack bot)
- [ ] What is the acceptable response latency? (target: <3s for chat, <1s for voice)
- [ ] What devices will users use? (mobile, tablet, desktop)
- [ ] Do users need offline access?

#### Data & Content
- [ ] What knowledge sources need to be indexed? (Jira, Confluence, Slack, documents)
- [ ] What is the volume of content? (number of documents, pages, messages)
- [ ] How frequently does content change? (daily, weekly, monthly)
- [ ] What is the content format? (PDFs, markdown, HTML, plain text)
- [ ] Are there sensitive documents that should be excluded?

#### Permissions & Security
- [ ] What authentication method? (SSO, OAuth, local accounts)
- [ ] What are the user roles? (admin, member, viewer)
- [ ] What tools should each role access? (Jira, Slack, Confluence)
- [ ] What are the policy constraints? (allowed projects, channels, spaces)
- [ ] What approval workflows are needed? (human-in-the-loop for certain actions)

#### Integration Requirements
- [ ] Which tools need integration? (Jira, Slack, Confluence, Google Drive)
- [ ] What OAuth scopes are needed?
- [ ] Are there rate limits to respect?
- [ ] What is the sync frequency? (real-time, hourly, daily)

#### Compliance & Logging
- [ ] What audit logging is required? (all requests, actions only, errors only)
- [ ] What PII handling is needed? (redaction, masking, retention)
- [ ] What compliance standards apply? (SOC 2, HIPAA, GDPR)
- [ ] What is the log retention policy?

## Phase 2: Reference Architectures

### Core Architecture: Shared Agent Core

**Key Principle**: HTTP, Voice (WebSocket), and MCP are **transport adapters** over a shared **Agent Core**.

```
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│  HTTP API   │  │ Voice WS     │  │ MCP Server  │
│  /api/chat  │  │ /ws/voice    │  │ stdio       │
└──────┬──────┘  └──────┬───────┘  └──────┬──────┘
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Agent Core       │
              │  runAgentTurn()    │
              │                     │
              │  - Retrieval (RAG)  │
              │  - LLM Call         │
              │  - Validation       │
              │  - Policy Check     │
              │  - Safety (PII,     │
              │     Injection)      │
              │  - Tracing          │
              └─────────────────────┘
```

**Agent Core** (`server/lib/agent/agentCore.ts`):
- Single entry point: `runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutput>`
- Unified processing: retrieval, LLM, validation, policy, safety
- Channel-aware: tracks `channel: "http" | "voice" | "mcp"` in traces
- Same safety, same policy gates, same observability across all channels

**Evidence:**
- `server/lib/agent/agentCore.ts:1-383` - Complete agent core implementation
- `server/routes.ts:417-456` - HTTP adapter (thin wrapper)
- `server/lib/voice/voiceServer.ts:67-120` - Voice adapter (WebSocket)
- `server/mcp/mcpServer.ts:120-150` - MCP adapter (stdio)

### Architecture 1: HTTP Mode (Normal Text)

**Use Case**: Web UI and API clients.

**Components**:
- Express HTTP API (`/api/chat`)
- Thin adapter over agent core
- Returns `ChatResponse` with bullets and citations

**Setup**:
1. Start server: `npm run dev`
2. Query via web UI (`/chat`) or API (`POST /api/chat`)
3. All processing goes through agent core

**Latency**: <3s for chat responses

### Architecture 2: Voice Mode (WebSocket Transcript)

**Use Case**: Real-time voice transcript processing.

**Components**:
- WebSocket server (`/ws/voice`)
- Transcript-only mode (required)
- Audio streaming mode (optional, TODO)

**Protocol:**
- Inbound: `voice.session.start`, `voice.transcript`, `voice.endTurn`
- Outbound: `voice.turn.result`, `voice.turn.error`

**Setup**:
1. Start server: `npm run dev`
2. Connect to `ws://localhost:5000/ws/voice`
3. Send transcript messages
4. Receive structured responses with citations

**Latency**: <3s for deep-path responses

**Evidence:**
- `server/lib/voice/voiceServer.ts:1-200` - Voice WebSocket server
- `script/voice-smoke.ts:1-150` - Smoke test script

### Architecture 3: MCP Mode (Claude Desktop)

**Use Case**: Integration with Claude Desktop or any MCP host.

**Components**:
- MCP stdio server
- Tools: `fieldcopilot.chat`, `fieldcopilot.playbook`, `fieldcopilot.action_draft`, `fieldcopilot.action_execute`
- Resources: `fieldcopilot://status`, `fieldcopilot://evals`

**Setup**:
1. Install: `npm install @modelcontextprotocol/sdk`
2. Run server: `npm run mcp` or `tsx server/mcp/mcpServer.ts`
3. Configure Claude Desktop MCP settings
4. Use tools in Claude Desktop conversations

**Latency**: <3s for chat tool calls

**Evidence:**
- `server/mcp/mcpServer.ts:1-400` - Complete MCP server implementation
- `script/mcp-smoke.ts:1-150` - Smoke test script

### Architecture 4: RAG + Tool Actions (Full Workflow)

**Use Case**: Incident response with automated ticket creation and team notifications.

**Components**:
- Agent core (RAG + tool actions)
- Policy enforcement and approvals
- Works across HTTP, Voice, and MCP

**Setup**:
1. Connect Jira and Slack via OAuth
2. Configure policy with role-based tool access
3. Set up approval workflows for sensitive actions
4. Users create playbooks from incident descriptions

**Latency**: <5s for playbook generation, <2s for tool execution

## Phase 3: 2-Week Pilot Plan

### Week 1: Setup & Initial Testing

#### Day 1-2: Infrastructure Setup
- [ ] Deploy FieldCopilot (local or cloud)
- [ ] Set up PostgreSQL database
- [ ] Configure environment variables (OpenAI API key, OAuth credentials)
- [ ] Run database migrations (`npm run db:push`)
- [ ] Seed initial data (`npm run seed`)

#### Day 3-4: Content Ingestion
- [ ] Connect Jira (if needed)
  - [ ] OAuth setup
  - [ ] Configure project scope
  - [ ] Run initial sync
- [ ] Connect Confluence (if needed)
  - [ ] OAuth setup
  - [ ] Configure space scope
  - [ ] Run initial sync
- [ ] Connect Slack (if needed)
  - [ ] OAuth setup
  - [ ] Configure channel scope
  - [ ] Run initial sync
- [ ] Upload manual documents (if any)
  - [ ] Use `/api/ingest` endpoint
  - [ ] Verify chunks created in database

#### Day 5: Policy Configuration
- [ ] Create user roles (admin, member)
- [ ] Configure policy YAML:
  - [ ] Define role tool access
  - [ ] Set tool constraints (allowed projects/channels/spaces)
  - [ ] Configure approval requirements
- [ ] Test policy enforcement:
  - [ ] Verify disallowed tools are refused
  - [ ] Verify constraints are enforced
  - [ ] Verify approvals are required when configured

### Week 2: Usage & Measurement

#### Day 6-7: User Testing
- [ ] Onboard 5-10 pilot users
- [ ] Provide training on:
  - [ ] Chat interface
  - [ ] Playbook creation
  - [ ] Tool actions (if enabled)
- [ ] Collect feedback on:
  - [ ] Response accuracy
  - [ ] Response latency
  - [ ] Citation quality
  - [ ] Tool action success rate

#### Day 8-9: Evaluation & Optimization
- [ ] Run evaluation suite (`npm run eval`)
- [ ] Review metrics:
  - [ ] Task Success Rate (TSR)
  - [ ] Citation Integrity
  - [ ] Unsupported Claim Rate
  - [ ] Tool Selection Accuracy
- [ ] Identify gaps:
  - [ ] Missing content (add to knowledge base)
  - [ ] Poor retrieval (adjust chunking/embedding)
  - [ ] Incorrect tool selection (refine prompts)
- [ ] Iterate on prompts and policy

#### Day 10: Go/No-Go Decision
- [ ] Review pilot metrics
- [ ] Assess user feedback
- [ ] Decide on production rollout or extended pilot

## Phase 4: Rollout & Monitoring

### Production Rollout

1. **Scale Infrastructure**
   - [ ] Set up production database (managed PostgreSQL)
   - [ ] Configure worker processes for job queue
   - [ ] Set up monitoring (traces, metrics, alerts)

2. **Content Migration**
   - [ ] Full content sync from all sources
   - [ ] Verify chunk counts and quality
   - [ ] Test retrieval on production data

3. **User Onboarding**
   - [ ] Create user accounts (or integrate SSO)
   - [ ] Assign roles and permissions
   - [ ] Provide training materials

4. **Monitoring Setup**
   - [ ] Set up observability dashboard (`/admin/observability`)
   - [ ] Configure alerts for:
     - [ ] High error rates
     - [ ] Slow response times
     - [ ] Low citation integrity
   - [ ] Set up eval regression monitoring (`npm run ci`)

### Ongoing Monitoring

**Daily**:
- Review error rates and latency in observability dashboard
- Check for failed jobs in job queue

**Weekly**:
- Run evaluation suite and check for regressions
- Review user feedback and support tickets
- Update knowledge base with new content

**Monthly**:
- Review audit logs for security issues
- Analyze citation quality trends
- Update policy based on usage patterns

## Troubleshooting

### Common Issues

**Issue**: Low citation integrity
- **Cause**: Chunks not properly linked to sources
- **Fix**: Verify source versioning is working, check chunk creation

**Issue**: Slow response times
- **Cause**: Large knowledge base, inefficient retrieval
- **Fix**: Reduce top-K retrieval count, optimize vector search, use caching

**Issue**: Tool actions failing
- **Cause**: OAuth tokens expired, policy constraints
- **Fix**: Refresh OAuth tokens, check policy configuration

**Issue**: Poor answer quality
- **Cause**: Missing context, low similarity scores
- **Fix**: Add more relevant content, adjust chunking strategy, refine prompts

## Success Metrics

Track these metrics to measure success:

- **Task Success Rate (TSR)**: % of queries answered correctly (target: >85%)
- **Citation Integrity**: % of citations that are valid (target: 100%)
- **Unsupported Claim Rate**: % of claims without citations (target: <20%)
- **Response Latency**: P95 latency for chat (target: <3s)
- **User Satisfaction**: Survey scores (target: >4/5)

## Next Steps

After successful onboarding:

1. Expand knowledge base with more sources
2. Add more tool integrations (if needed)
3. Implement custom workflows
4. Set up automated evaluation and regression detection
5. Scale to more users and higher query volumes

## Support

For questions or issues:
- Review documentation in `README.md`
- Check `EVAL_RUBRIC.md` for evaluation criteria
- Review `SECURITY_LOGGING.md` for security policies
- Contact support team
