# 🚀 TracePilot/TracePilot - 4-Minute Demo Script

**Target Audience**: Engineering Hiring Managers & Technical Leaders  
**Duration**: 4 minutes  
**Goal**: Demonstrate full-stack expertise, AI engineering, and production-grade system design

---

## 🎬 Demo Flow Overview

**Hook → Knowledge Ingestion → Intelligent Q&A → Action Automation → Voice Agent → Observability**

---

## 📋 Pre-Demo Setup (Do Before Recording)

### Environment Check
```bash
# Ensure these are running
npm run dev          # Terminal 1: Main server
npm run worker       # Terminal 2: Job worker
```

### Seed Demo Data
```bash
# Seed evaluation data and sample documents
npm run demo:seed
```

### Browser Tabs Ready
1. **Main Chat**: `http://localhost:5000/chat`
2. **Admin Observability**: `http://localhost:5000/admin/observability`
3. **Playbooks**: `http://localhost:5000/playbooks`
4. **Voice Agent**: `http://localhost:5000/voice` (optional)

---

## 🎯 4-Minute Script

### **[0:00-0:30] HOOK: The Problem & Solution (30 seconds)**

> "Hi, I'm [Your Name]. I built **TracePilot** - an enterprise-grade AI assistant that helps field operations teams find critical information instantly and take action safely.
>
> Imagine you're a field technician dealing with equipment failure. Instead of digging through hundreds of PDFs, Slack threads, and Jira tickets, you just ask a question and get an answer with **verified citations** in seconds.
>
> Let me show you how it works - this is a full-stack TypeScript system with RAG, real-time agents, and production-grade observability."

**Visual**: Show the clean chat interface

---

### **[0:30-1:15] DEMO 1: Knowledge Ingestion & Multi-Source Sync (45 seconds)**

> "First, the system needs knowledge. TracePilot connects to your existing tools - Google Drive, Slack, Confluence, and Jira."

**Actions**:
1. Navigate to Settings/Connectors page
2. Show connected Google Drive (already authorized)
3. **Upload a document** via the ingest page:
   ```
   Click "Upload" → Select a PDF (e.g., "Q4_Safety_Procedures.pdf")
   ```
4. Show the job queue processing in real-time

**Script**:
> "I'm uploading a safety procedures document. Watch the job queue - it extracts text, chunks it into semantic segments, generates embeddings with OpenAI, and stores it in PostgreSQL with pgvector.
>
> The cool part? **Source versioning** - if I upload a new version, the system keeps both, deactivates the old one, and all citations automatically reference the correct version. This is production-ready design."

**Visual**: Show the job completing, document appearing in sources list

**Tech Callout**: _"Built with Drizzle ORM, PostgreSQL, and a custom job runner with concurrency control and rate limiting."_

---

### **[1:15-2:15] DEMO 2: Intelligent Q&A with RAG & Citations (60 seconds)**

> "Now the magic happens. Let's ask a complex question that requires reading multiple documents."

**Actions**:
1. Type in chat:
   ```
   What are the emergency shutdown procedures for hydraulic systems?
   ```
2. Press Send

**Script** (while waiting for response):
> "Behind the scenes, this triggers a multi-step RAG pipeline:
> - **Embedding**: Your question is converted to a vector
> - **Retrieval**: Semantic search finds the top 15 relevant chunks across all sources
> - **Grounding**: GPT-4o synthesizes the answer, but here's the key...
> - **Citation Verification**: Every claim is grounded in retrieved documents. No hallucinations."

**Visual**: Response appears with structured bullets

**Actions**:
3. Hover over citation numbers `[1]`, `[2]` to show snippets
4. Click a citation to open the source document with highlighted section

**Script**:
> "See these citation numbers? Every fact is traceable back to the source document. Click one - it opens the exact page and highlights the relevant section.
>
> This is **enterprise-grade grounding**. If the AI can't cite it, it won't say it. I built a custom evaluation framework that measures Citation Integrity and blocks PRs if it drops below 95%."

**Tech Callout**: _"Vector search with pgvector, OpenAI embeddings, and custom Zod schemas for structured extraction."_

---

### **[2:15-2:45] DEMO 3: Action Automation with Policy Enforcement (30 seconds)**

> "But TracePilot doesn't just answer questions - it takes action. Let me show you the policy engine."

**Actions**:
1. Type in chat:
   ```
   Create a Jira ticket for hydraulic pump inspection - assign to maintenance team, high priority
   ```
2. Press Send

**Script** (while waiting):
> "The system drafts a Jira ticket, but here's where it gets interesting..."

**Visual**: Action draft appears with approval button

**Script**:
> "Before executing, it checks the **policy engine**. Who am I? What tools can I use? What projects am I allowed to create tickets in?
>
> This draft is editable. I can modify the summary, change the priority, or reject it entirely. Once I approve, it executes via the Jira API."

**Actions**:
3. Click "Approve & Execute"
4. Show success message with Jira link

**Tech Callout**: _"YAML-based policy engine with role-based access control and approval workflows. All actions are audit-logged."_

---

### **[2:45-3:15] DEMO 4: Playbook Generation for Incident Response (30 seconds)**

> "For critical incidents, TracePilot generates **action playbooks** with all the steps, PPE requirements, and safety checks."

**Actions**:
1. Navigate to `/playbooks/new`
2. Enter incident text:
   ```
   Hydraulic leak detected in production line 3
   ```
3. Click "Generate Playbook"

**Script** (while generating):
> "The system retrieves relevant SOPs, safety procedures, and past incidents, then generates a step-by-step playbook."

**Visual**: Playbook appears with:
- Emergency shutdown steps (cited)
- PPE checklist
- Notification actions (Slack, Jira)

**Script**:
> "Every step is cited. The PPE checklist is pulled from safety docs. And it auto-drafts Jira tickets and Slack notifications - all waiting for approval."

**Tech Callout**: _"This demonstrates multi-step reasoning, structured extraction, and action composition."_

---

### **[3:15-3:45] DEMO 5: Real-Time Voice Agent (Optional but Impressive) (30 seconds)**

> "One more thing - TracePilot has a **real-time voice agent** for hands-free operation in the field."

**Actions**:
1. Navigate to `/voice`
2. Click "Connect"
3. Type a message (simulating voice):
   ```
   What PPE is required for hydraulic maintenance?
   ```
4. Press Enter

**Script**:
> "The voice agent uses WebSockets for low-latency responses. It has:
> - **Fast-path**: Common queries answered in <500ms without LLM
> - **Deep-path**: Complex queries use the full RAG pipeline
> - **Barge-in**: You can interrupt the assistant mid-response
>
> After the call, the transcript is automatically ingested as a searchable source. No information is lost."

**Tech Callout**: _"Built with WebSocket, finite state machine for fast-path routing, and spans for observability."_

---

### **[3:45-4:00] DEMO 6: Observability & Closing (15 seconds)**

> "Finally, production systems need observability."

**Actions**:
1. Navigate to `/admin/observability`
2. Show metrics dashboard with:
   - Request latency (p50, p95)
   - Token usage
   - Retrieval metrics
   - Error rates

**Script**:
> "Every operation emits traces and spans. I can see latency breakdowns, token costs, and retrieval quality metrics.
>
> This entire system is built with:
> - **Frontend**: React + TypeScript + Tailwind + TanStack Query
> - **Backend**: Express + Drizzle ORM + PostgreSQL
> - **AI**: OpenAI GPT-4o + vector embeddings
> - **Testing**: Evaluation framework with CI gates
> - **DevOps**: Docker, GitHub Actions, automated regression detection
>
> It's production-ready, type-safe, and thoroughly tested. The code is on my GitHub - I'd love to discuss how I can bring this level of engineering to your team. Thanks for watching!"

**Visual**: Show GitHub repo link or portfolio page

---

## 🎨 Visual Polish Tips

### Before Recording
1. **Clean browser**: Clear history, close extra tabs
2. **Hide bookmarks bar**: Make interface clean
3. **Zoom to 110%**: Make text readable in recording
4. **Use light theme**: Better for video compression
5. **Disable notifications**: No popup interruptions

### During Recording
1. **Smooth mouse movements**: No frantic clicking
2. **Pause for processing**: Let viewers see the work happening
3. **Highlight key points**: Use cursor to draw attention
4. **Maintain energy**: Stay enthusiastic but professional

### Recording Tools
- **macOS**: QuickTime (Cmd+Shift+5) or OBS
- **Windows**: OBS Studio or Xbox Game Bar (Win+G)
- **Resolution**: 1920x1080 minimum
- **Frame rate**: 60fps for smooth UI interactions

---

## 💡 Alternative 4-Minute Flows

### Flow A: Developer-Focused (More Technical)
1. Architecture overview (system diagram)
2. Database schema walkthrough
3. Code deep-dive (RAG pipeline)
4. Live debugging with observability
5. Test suite and CI gates

### Flow B: Product-Focused (Less Technical)
1. User problem narrative
2. Chat demo with multiple questions
3. Action automation showcase
4. Mobile-friendly voice agent
5. Business impact (time saved, accuracy)

### Flow C: Full-Stack Showcase (Balanced)
1. Frontend: UI components, state management
2. Backend: API design, job queue
3. Database: Schema, migrations, versioning
4. AI: RAG pipeline, grounding
5. DevOps: CI/CD, testing, deployment

---

## 📊 Key Talking Points (Memorize These)

### Technical Depth
- "Built a custom RAG pipeline with semantic chunking and vector search"
- "Source versioning ensures citation integrity across document updates"
- "Job runner with concurrency control, rate limiting, and exponential backoff"
- "Policy engine with RBAC and approval workflows"
- "Evaluation framework with CI gates - PRs fail if quality metrics drop"

### Production Readiness
- "Multi-tenant architecture with workspace isolation"
- "Comprehensive observability with traces, spans, and Prometheus metrics"
- "Type-safe end-to-end with TypeScript and Zod validation"
- "Automated testing with 56 E2E voice agent tests"
- "Docker Compose for local dev, ready for Kubernetes"

### Business Impact
- "Reduces information retrieval time from minutes to seconds"
- "Prevents errors with verified citations - no hallucinations"
- "Enforces safety policies with approval workflows"
- "Audit trail for compliance and incident analysis"

---

## 🚨 Troubleshooting

### If Demo Fails

**Problem**: Server not responding
- **Fix**: Check both `npm run dev` and `npm run worker` are running
- **Backup**: Show architecture diagram and walk through code

**Problem**: No documents to query
- **Fix**: Run `npm run demo:seed` again
- **Backup**: Upload a simple text file on the spot

**Problem**: Slow AI response
- **Fix**: "This is hitting OpenAI's API, sometimes takes 3-5 seconds..."
- **Backup**: Show cached response or pre-recorded clip

**Problem**: Job queue stuck
- **Fix**: Restart worker: `npm run worker`
- **Backup**: Show job queue architecture in code

---

## 🎯 Success Metrics

After the demo, the hiring manager should understand:
1. ✅ You can architect complex full-stack systems
2. ✅ You understand AI/ML engineering (not just API calls)
3. ✅ You think about production concerns (observability, testing, policies)
4. ✅ You write clean, type-safe, maintainable code
5. ✅ You can ship features end-to-end

---

## 📎 Follow-Up Resources

Prepare these for the interviewer:
- **GitHub Repo**: Link to clean, well-documented code
- **Architecture Diagram**: Visual system overview
- **Technical Blog Post**: Deep-dive on a feature (e.g., "Building a Production RAG Pipeline")
- **Live Demo Site**: Deployed version they can try (if safe)
- **Resume Highlight**: "Built enterprise AI assistant with RAG, vector search, and real-time agents"

---

## 🎓 Pro Tips

### Do's ✅
- **Start strong**: Hook them in the first 15 seconds
- **Show, don't tell**: Live demo > slides
- **Highlight uniqueness**: What makes this hard/impressive?
- **Connect to business**: "This saves teams 10+ hours/week"
- **Be confident**: You built something impressive

### Don'ts ❌
- **Don't apologize**: "Sorry, this is a bit rough..." (NO!)
- **Don't ramble**: Stay on script, 4 minutes is tight
- **Don't skip failures**: If something breaks, debug live (shows skills)
- **Don't oversell**: Be honest about limitations
- **Don't forget the ask**: "I'd love to discuss joining your team"

---

## 🔗 Next Steps After Demo

1. **Share the recording**: Loom, YouTube (unlisted), or Google Drive
2. **Email follow-up**:
   > "Hi [Hiring Manager],
   > 
   > Following up on our conversation - here's a 4-minute demo of TracePilot, the full-stack AI assistant I built: [link]
   > 
   > Key highlights:
   > - RAG pipeline with citation verification
   > - Multi-connector sync (Google Drive, Slack, Jira)
   > - Real-time voice agent
   > - Production-grade observability
   > 
   > GitHub repo: [link]
   > 
   > I'm excited about [Company Name] and would love to bring this level of engineering to your team. Happy to dive deeper into any aspect!
   > 
   > Best,
   > [Your Name]"

3. **Prepare for technical questions**:
   - "How did you handle race conditions in the job queue?"
   - "What's your strategy for vector similarity thresholds?"
   - "How do you prevent prompt injection attacks?"
   - "What's your deployment strategy?"

---

**Good luck! You've got this. 🚀**
