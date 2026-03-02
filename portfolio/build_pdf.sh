<# 
  build_pdf.sh (PowerShell build script)

  This repo environment is Windows PowerShell-first (no bash detected).
  Run rebuild with ONE command:
    powershell -ExecutionPolicy Bypass -File portfolio/build_pdf.sh
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PortfolioDir = Join-Path $RepoRoot "portfolio"
$DiagramsDir = Join-Path $PortfolioDir "diagrams"
$HtmlPath = Join-Path $PortfolioDir "AI_ARTIFACT.html"
$PdfPath = Join-Path $PortfolioDir "AI_ARTIFACT.pdf"

New-Item -ItemType Directory -Force -Path $DiagramsDir | Out-Null

function Ensure-Diagrams {
  $required = @(
    (Join-Path $DiagramsDir "architecture.svg"),
    (Join-Path $DiagramsDir "request_sequence.svg"),
    (Join-Path $DiagramsDir "data_pipeline.svg")
  )

  $missing = $required | Where-Object { -not (Test-Path $_) }
  if ($missing.Count -eq 0) { return }

  $tmpArch = Join-Path $env:TEMP "tracepilot_architecture.mmd"
  $tmpSeq  = Join-Path $env:TEMP "tracepilot_request_sequence.mmd"
  $tmpPipe = Join-Path $env:TEMP "tracepilot_data_pipeline.mmd"

  @"
flowchart LR
  U[User] --> FE[Web UI<br/>React + TypeScript]
  FE --> API[API Server<br/>Express + TypeScript]

  API --> RAG[Retrieval - RAG]
  API --> JOBS[Job Runner / Worker]
  API --> OBS[Observability]
  API --> LLM[OpenAI APIs<br/>GPT-4o + embeddings]

  RAG --> DB[(DB<br/>Postgres/SQLite via Drizzle)]
  RAG --> VS[(Vector Store<br/>in-memory + persisted vectors)]

  JOBS --> DB
  JOBS --> VS
  JOBS --> EXT[Connectors<br/>Google / Atlassian / Slack]

  OBS --> DB
"@ | Set-Content -Encoding UTF8 $tmpArch

  @"
sequenceDiagram
  participant User
  participant UI as Web UI (/chat)
  participant API as API Server
  participant RAG as Retrieval
  participant DB as DB
  participant VS as Vector Store
  participant LLM as OpenAI

  User->>UI: Ask question
  UI->>API: POST /api/chat
  API->>RAG: retrieveForAnswer(query, workspace/user)
  RAG->>DB: Load active sources/chunks (workspace + visibility)
  RAG->>VS: Vector similarity search
  RAG-->>API: Context chunks + diagnostics
  API->>LLM: chatCompletion (JSON schema)
  LLM-->>API: Structured answer + citations
  API-->>UI: Response (answer + sources)
  UI-->>User: Render answer + citations
"@ | Set-Content -Encoding UTF8 $tmpSeq

  @"
flowchart TD
  subgraph Inputs
    UPLOAD[/Upload via /api/ingest/]
    SYNC[Background Sync Jobs]
    CHAT[Chat question]
  end

  subgraph Normalize
    SRC[Source identity]
    VER[Source version snapshot]
    CHUNK[Chunks with text spans]
  end

  subgraph Index
    EMB[Embeddings]
    STORE[(Vector Store)]
  end

  subgraph Answer
    RET[Retrieve: vector + fallback]
    PROMPT[Assemble context + schema]
    GEN[Generate answer]
    OUT[Answer + citations]
  end

  UPLOAD --> SRC --> VER --> CHUNK --> EMB --> STORE
  SYNC --> SRC

  CHAT --> RET
  CHUNK --> RET
  STORE --> RET
  RET --> PROMPT --> GEN --> OUT
"@ | Set-Content -Encoding UTF8 $tmpPipe

  try {
    npx -y @mermaid-js/mermaid-cli -i $tmpArch -o (Join-Path $DiagramsDir "architecture.svg")
    npx -y @mermaid-js/mermaid-cli -i $tmpSeq  -o (Join-Path $DiagramsDir "request_sequence.svg")
    npx -y @mermaid-js/mermaid-cli -i $tmpPipe -o (Join-Path $DiagramsDir "data_pipeline.svg")
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tmpArch, $tmpSeq, $tmpPipe
  }
}

function Render-Pdf-With-Playwright {
  if (-not (Test-Path $HtmlPath)) { throw "Missing HTML source: $HtmlPath" }

  $htmlAbs = (Resolve-Path $HtmlPath).Path
  $pdfAbs = (Resolve-Path $PortfolioDir).Path + "\AI_ARTIFACT.pdf"

  $nodeScript = @"
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const html = ${([System.Text.Json.JsonSerializer]::Serialize($htmlAbs))};
const pdf  = ${([System.Text.Json.JsonSerializer]::Serialize($pdfAbs))};
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
await page.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' } });
await browser.close();
console.log('Wrote PDF:', pdf);
"@

  # Use npx-provided Playwright without adding dependencies to the repo
  npx -y --package=playwright@latest node --input-type=module -e $nodeScript
}

function Build-Pdf {
  try {
    Render-Pdf-With-Playwright
  } catch {
    # Best-effort: install Chromium only if needed, then retry once
    npx -y playwright@latest install chromium
    Render-Pdf-With-Playwright
  }
}

Ensure-Diagrams
Build-Pdf

if (-not (Test-Path $PdfPath)) { throw "Build finished but PDF not found: $PdfPath" }
Write-Host "OK: $PdfPath"

