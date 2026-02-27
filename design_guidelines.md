# FieldCopilot Design Guidelines

## Design Approach

**System-Based Approach**: Drawing from Linear, Notion, and enterprise productivity tools for clean, information-dense interfaces optimized for efficiency and learnability.

**Core Principles**:
- Clarity over decoration - every element serves a functional purpose
- Consistent information hierarchy across all admin views
- Dense but scannable layouts for data-heavy interfaces
- Clear visual distinction between read and write operations

---

## Typography System

**Font Stack**: 
- Primary: Inter or System UI stack via Google Fonts
- Monospace: JetBrains Mono for code/JSON/IDs

**Hierarchy**:
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-medium
- Card/panel titles: text-base font-medium
- Body text: text-sm
- Metadata/timestamps: text-xs text-gray-500
- Code blocks/IDs: text-xs font-mono

---

## Layout System

**Spacing Primitives**: Tailwind units of **2, 3, 4, 6, 8, 12** (e.g., p-4, gap-6, mt-8)

**Container Strategy**:
- Max width for content: max-w-7xl mx-auto
- Chat interface: max-w-4xl for optimal reading
- Admin tables: full-width with px-6 padding
- Sidebars: fixed w-64 on desktop, mobile drawer

**Grid Patterns**:
- Two-column layouts: grid-cols-1 lg:grid-cols-2
- Admin cards: grid-cols-1 md:grid-cols-2 xl:grid-cols-3
- Never exceed 3 columns for enterprise data

---

## Component Library

### Navigation Structure
**Top Navigation Bar**:
- Fixed height h-16 with shadow-sm
- Left: Logo/app name
- Center: Role indicator badge (admin/member)
- Right: User menu dropdown

**Sidebar (Admin Section)**:
- Vertical nav items with icons (Heroicons)
- Active state: subtle background fill
- Grouped sections: Connectors, Ingestion, Policies, Audit, Evals

### Chat Interface
**Message Container**:
- User messages: right-aligned, max-w-2xl
- Assistant responses: left-aligned, full-width
- Clear visual separation between messages (mb-6)

**Citation Display**:
- Inline citation badges: small pill-shaped with sourceId reference
- Clickable, underlined on hover
- Bullet points with nested citation lists below each claim

**Action Draft Panel**:
- Bordered card with warning-style accent (not color, but visual weight)
- Editable form fields with labels
- Two-button layout: "Approve & Execute" (primary) + "Cancel" (secondary)
- Show tool type prominently at top

### Source Viewer
**Document Layout**:
- Breadcrumb navigation at top
- Document metadata panel (title, type, date) in sidebar or top card
- Full text in main content area with generous line-height (1.6)
- Chunk highlighting: bold text with subtle border-left accent
- Navigation buttons for adjacent chunks

### Admin Dashboards

**Data Tables** (Audit Logs, Eval Results):
- Sticky header row
- Alternating row backgrounds for scannability
- Fixed column widths for IDs/timestamps
- Expandable rows for detailed views
- Filters at top: date range, user, tool type, success/fail

**Connector Configuration**:
- Card-based layout for each connector type
- Status indicator (connected/disconnected) prominently displayed
- Configuration form in modal or slide-over panel
- Masked credentials display (show last 4 chars only)

**Ingestion Interface**:
- Drag-and-drop upload zone (h-48 border-dashed)
- Progress indicator during processing
- Results summary: processed/skipped/failed counts in stat cards
- Chunking stats table below

**Policy Editor**:
- Side-by-side layout: YAML editor (monospace) + preview of parsed rules
- Syntax highlighting for YAML
- Active/inactive toggle with clear visual state

**Evaluation Dashboard**:
- Top metrics row: total cases, pass rate, avg latency (stat cards)
- Failure table below with case ID, type, reason, replay button
- Suite selector dropdown if multiple suites exist

### Forms & Inputs
**Text Inputs**:
- Height h-10, padding px-3
- Border with focus ring
- Labels above inputs (text-sm font-medium mb-1)

**Buttons**:
- Primary: h-10 px-4 font-medium
- Secondary: h-10 px-4 with border
- Icon buttons: square aspect ratio
- Consistent hover/active states across all variants

**Select/Dropdown**:
- Native select styled or Headless UI for complex cases
- Clear visual hierarchy for grouped options

### Feedback Elements
**Loading States**:
- Spinner for async operations
- Skeleton loaders for table/card placeholders
- Progress bars for long operations (ingestion, eval runs)

**Alerts/Notifications**:
- Toast notifications for actions (top-right corner)
- Inline error messages below invalid form fields
- Success confirmations ephemeral (auto-dismiss 3s)

**Empty States**:
- Centered with icon, heading, description, CTA button
- Use for empty audit logs, no connectors, etc.

---

## Animations

**Minimal Use Only**:
- Smooth page transitions (150ms)
- Dropdown/modal enter/exit (200ms)
- No scroll-triggered effects
- No decorative animations

---

## Images

**No Hero Images**: This is a utility application, not marketing.

**Icon Usage**: 
- Heroicons throughout (outline for nav, solid for states)
- Tool-specific icons for Jira/Slack/Confluence connectors
- Status icons (checkmark, warning, error) in tables

---

## Key Interaction Patterns

**Citation Click Flow**: Citation badge → opens source viewer in new tab/modal → scrolls to chunk → highlights span

**Approval Workflow**: Chat response with draft → editable form panel slides in → user edits → approve button → confirmation toast → audit entry created

**Audit Replay**: Click replay on audit row → opens chat interface with pre-filled prompt → shows "Replay Mode" indicator → executes dry run → displays diff vs original

**Policy Validation**: Real-time validation as user types YAML → show errors inline → success state when valid → save button enables