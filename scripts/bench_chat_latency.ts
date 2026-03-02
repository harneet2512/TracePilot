/**
 * bench_chat_latency.ts
 *
 * HTTP benchmark for /api/chat (sync) and /api/chat/stream (SSE).
 * Measures total latency, TTFT, retrievalMs, and generationMs.
 *
 * Usage:
 *   npx tsx scripts/bench_chat_latency.ts
 *
 * Env vars:
 *   BASE_URL       — default http://127.0.0.1:5000
 *   BENCH_EMAIL    — default admin@tracepilot.com
 *   BENCH_PASSWORD — default admin123
 *   BENCH_N        — number of requests per endpoint (default 10)
 *   BENCH_QUERY    — query text (default: "What are the current OKRs?")
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const EMAIL = process.env.BENCH_EMAIL || "admin@tracepilot.com";
const PASSWORD = process.env.BENCH_PASSWORD || "admin123";
const N = parseInt(process.env.BENCH_N || "10", 10);
const QUERY = process.env.BENCH_QUERY || "What are the current OKRs?";

interface BenchResult {
  totalMs: number;
  ttftMs: number | null;
  retrievalMs: number | null;
  generationMs: number | null;
  error?: string;
}

function p95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

async function login(): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!resp.ok) throw new Error(`Login failed: ${resp.status} ${await resp.text()}`);
  // Extract session cookie
  const setCookie = resp.headers.get("set-cookie");
  if (!setCookie) throw new Error("No set-cookie header in login response");
  // Return just the cookie value part (up to first ;)
  return setCookie.split(";")[0];
}

async function benchSync(cookie: string, i: number): Promise<BenchResult> {
  const start = Date.now();
  try {
    const resp = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ message: QUERY }),
    });
    const totalMs = Date.now() - start;
    if (!resp.ok) {
      return { totalMs, ttftMs: null, retrievalMs: null, generationMs: null, error: `HTTP ${resp.status}` };
    }
    const data: any = await resp.json();
    const latency = data?.meta?.latencyMs || {};
    return {
      totalMs,
      ttftMs: totalMs, // sync endpoint: TTFT ≈ total
      retrievalMs: latency.retrievalMs ?? null,
      generationMs: latency.llmMs ?? null,
    };
  } catch (e: any) {
    return { totalMs: Date.now() - start, ttftMs: null, retrievalMs: null, generationMs: null, error: e.message };
  }
}

async function benchStream(cookie: string, i: number): Promise<BenchResult> {
  const start = Date.now();
  let ttftMs: number | null = null;
  let retrievalMs: number | null = null;
  let generationMs: number | null = null;
  let error: string | undefined;

  try {
    const resp = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message: QUERY }),
    });

    if (!resp.ok || !resp.body) {
      return {
        totalMs: Date.now() - start,
        ttftMs: null,
        retrievalMs: null,
        generationMs: null,
        error: `HTTP ${resp.status}`,
      };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;

        try {
          const evt = JSON.parse(raw);

          // TTFT event
          if (evt.type === "ttft" && evt.data?.ttftMs != null) {
            ttftMs = evt.data.ttftMs;
          }
          // Delta events — first delta counts as TTFT if no explicit ttft event yet
          if (evt.type === "delta" && ttftMs === null) {
            ttftMs = Date.now() - start;
          }
          // Final event — extract latency metadata
          if (evt.type === "final") {
            const meta = evt.data?.meta?.latencyMs || {};
            retrievalMs = meta.retrievalMs ?? retrievalMs;
            generationMs = meta.llmMs ?? generationMs;
          }
          // Chat latency from logger (not available in SSE, use final)
        } catch (_e) { /* ignore malformed SSE lines */ }
      }
    }
  } catch (e: any) {
    error = e.message;
  }

  const totalMs = Date.now() - start;
  return { totalMs, ttftMs, retrievalMs, generationMs, error };
}

function printStats(label: string, results: BenchResult[]): void {
  const successful = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Endpoint: ${label}  (N=${N}, errors=${errors.length})`);
  console.log("=".repeat(60));

  if (successful.length === 0) {
    console.log("  No successful requests.");
    errors.forEach((r) => console.log(`  ERROR: ${r.error}`));
    return;
  }

  const totalMsArr = successful.map((r) => r.totalMs);
  const ttftArr = successful.filter((r) => r.ttftMs != null).map((r) => r.ttftMs as number);
  const retArr = successful.filter((r) => r.retrievalMs != null).map((r) => r.retrievalMs as number);
  const genArr = successful.filter((r) => r.generationMs != null).map((r) => r.generationMs as number);

  console.log(`  totalMs      avg=${avg(totalMsArr)}ms  p95=${p95(totalMsArr)}ms`);
  if (ttftArr.length > 0)
    console.log(`  ttftMs       avg=${avg(ttftArr)}ms  p95=${p95(ttftArr)}ms  (n=${ttftArr.length})`);
  if (retArr.length > 0)
    console.log(`  retrievalMs  avg=${avg(retArr)}ms  p95=${p95(retArr)}ms  (n=${retArr.length})`);
  if (genArr.length > 0)
    console.log(`  generationMs avg=${avg(genArr)}ms  p95=${p95(genArr)}ms  (n=${genArr.length})`);
  if (errors.length > 0) {
    console.log(`  Errors:`);
    errors.forEach((r) => console.log(`    ${r.error}`));
  }
}

async function main(): Promise<void> {
  console.log(`TracePilot Chat Latency Benchmark`);
  console.log(`  BASE_URL:  ${BASE_URL}`);
  console.log(`  EMAIL:     ${EMAIL}`);
  console.log(`  N:         ${N}`);
  console.log(`  QUERY:     ${QUERY.slice(0, 60)}`);

  console.log("\nLogging in...");
  let cookie: string;
  try {
    cookie = await login();
    console.log("  Login OK");
  } catch (e: any) {
    console.error(`  Login failed: ${e.message}`);
    process.exit(1);
  }

  // Warm up (1 request to each to avoid cold-start skew)
  console.log("\nWarming up...");
  await benchSync(cookie, 0).catch(() => {});
  await benchStream(cookie, 0).catch(() => {});

  // Benchmark /api/chat (sync)
  console.log(`\nBenchmarking POST /api/chat (N=${N})...`);
  const syncResults: BenchResult[] = [];
  for (let i = 0; i < N; i++) {
    process.stdout.write(`  [${i + 1}/${N}] `);
    const r = await benchSync(cookie, i + 1);
    syncResults.push(r);
    console.log(`totalMs=${r.totalMs}ms ttftMs=${r.ttftMs ?? "-"}ms${r.error ? ` ERROR=${r.error}` : ""}`);
  }

  // Benchmark /api/chat/stream (SSE)
  console.log(`\nBenchmarking POST /api/chat/stream (N=${N})...`);
  const streamResults: BenchResult[] = [];
  for (let i = 0; i < N; i++) {
    process.stdout.write(`  [${i + 1}/${N}] `);
    const r = await benchStream(cookie, i + 1);
    streamResults.push(r);
    console.log(
      `totalMs=${r.totalMs}ms ttftMs=${r.ttftMs ?? "-"}ms retrievalMs=${r.retrievalMs ?? "-"}ms generationMs=${r.generationMs ?? "-"}ms${r.error ? ` ERROR=${r.error}` : ""}`
    );
  }

  // Print summary stats
  printStats("POST /api/chat (sync)", syncResults);
  printStats("POST /api/chat/stream (SSE)", streamResults);

  console.log("\n");
}

main().catch((e) => {
  console.error("Benchmark failed:", e);
  process.exit(1);
});
