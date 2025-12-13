# FieldCopilot

## Overview

FieldCopilot is an AI-powered enterprise assistant that enables users to ask questions and receive answers with chunk-level citations from ingested documents. The system supports action execution across enterprise tools (Jira, Slack, Confluence) with an approval workflow, policy enforcement, comprehensive audit logging, and an evaluation suite for measuring correctness.

**Core Capabilities:**
- Chat interface with RAG (Retrieval-Augmented Generation) and cited answers
- Document ingestion with semantic chunking and vector search
- Action drafts requiring user approval before execution
- Role-based access control (admin/member)
- Policy enforcement for tool/role constraints
- Audit trail for all operations
- Evaluation runner and reporting dashboard

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode)
- **Component Library**: shadcn/ui (Radix UI primitives with custom styling)
- **Design System**: Inter font for UI, JetBrains Mono for code/IDs
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Style**: REST endpoints under /api/*
- **Authentication**: Cookie-based sessions with bcrypt password hashing
- **File Uploads**: Multer with memory storage for document ingestion

### Data Storage
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: shared/schema.ts (shared between client and server)
- **Migrations**: Drizzle Kit with push command (db:push)
- **Vector Storage**: In-memory with OpenAI embeddings (text-embedding-3-small)
  - Design supports future migration to pgvector or Qdrant

### Key Data Models
- **users**: Role-based (admin/member) with password authentication
- **sessions**: Token-based session management
- **connectors**: External service configs (Jira, Slack, Confluence)
- **sources**: Ingested documents with content hashing for deduplication
- **chunks**: Text segments with character offsets for citation linking
- **policies**: YAML-defined role/tool constraints
- **auditEvents**: Comprehensive operation logging
- **approvals**: Pending action drafts requiring user confirmation
- **evalSuites/evalRuns**: Test cases and execution results

### LLM Integration
- **Provider**: OpenAI (GPT-4o for chat, text-embedding-3-small for embeddings)
- **RAG Pipeline**: Query → Vector search → Context injection → Structured response
- **Response Format**: JSON schema enforcement for citations and actions

### Security Considerations
- Secrets stored in environment variables only (never logged or exposed)
- Encrypted connector configurations when ENCRYPTION_KEY is set
- Request IDs for traceability across audit logs
- Policy enforcement before action execution

## External Dependencies

### Required Services
- **PostgreSQL**: Primary data store (DATABASE_URL environment variable)
- **OpenAI API**: LLM and embeddings (OPENAI_API_KEY environment variable)

### Optional Integrations
- **Jira**: Issue creation/updates (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
- **Slack**: Message posting (configured via connectors table)
- **Confluence**: Page management (configured via connectors table)

### NPM Packages (Key Dependencies)
- drizzle-orm / drizzle-kit: Database ORM and migrations
- openai: OpenAI API client
- zod: Runtime schema validation
- bcrypt: Password hashing
- express-session / cookie-parser: Session management
- @tanstack/react-query: Data fetching and caching
- @radix-ui/*: Accessible UI primitives
- tailwindcss: Utility-first CSS