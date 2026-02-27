const fs = require("fs");
const path = require("path");
const os = require("os");

const runsDir = path.join(os.tmpdir(), "rag_quality", "rag_quality_runs");
const files = fs.readdirSync(runsDir).sort().reverse();

const KEYS = ["hi", "owner_deadline", "blockers", "biggest_risk", "roadmap"];
const latest = {};
for (const key of KEYS) {
  const match = files.find((f) => f.includes(`_${key}_`));
  if (match) latest[key] = match;
}

const SEP = "=".repeat(80);
const SUBSEP = "-".repeat(60);

for (const key of KEYS) {
  const file = latest[key];
  if (!file) {
    console.log(`\n${SEP}\n  QUERY: ${key}\n${SEP}\n  [no artifact found]\n`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(path.join(runsDir, file), "utf-8"));
  const m = data.metrics || {};
  const p = data.payload || {};
  const d = p.debug || data.debug || {};

  console.log(`\n${SEP}`);
  console.log(`  QUERY: ${key}`);
  console.log(`  PASS/FAIL: ${m.pass ? "PASS" : "FAIL"}${data.failureReason ? "  reason=" + data.failureReason : ""}`);
  console.log(SEP);

  console.log(`\n  ${SUBSEP}`);
  console.log(`  METRICS`);
  console.log(`  ${SUBSEP}`);
  console.log(`  bullets_count:        ${m.bullets_count}`);
  console.log(`  citations_per_bullet: [${(m.citations_per_bullet || []).join(", ")}]`);
  console.log(`  all_bullets_cited:    ${m.all_bullets_cited}`);
  console.log(`  unique_sources_cited: ${m.unique_sources_cited}`);
  console.log(`  multi_source_satisfied: ${m.multi_source_satisfied}`);
  console.log(`  owner_present:        ${m.owner_present}`);
  console.log(`  date_present:         ${m.date_present}`);
  console.log(`  needs_clarification:  ${m.needs_clarification}`);
  console.log(`  latency_ms:           ${m.latency_ms || m.latency_total_ms || 0}`);
  console.log(`  retrieval_topK:       ${m.retrieval_topK || m.retrieval_top_k || 0}`);
  console.log(`  has_hard_refusal:     ${m.has_hard_refusal}`);

  console.log(`\n  ${SUBSEP}`);
  console.log(`  FRAMING / SUMMARY`);
  console.log(`  ${SUBSEP}`);
  console.log(`  Framing: ${p.framingContext || "(none)"}`);
  console.log(`  Summary: ${p.summary || "(none)"}`);

  console.log(`\n  ${SUBSEP}`);
  console.log(`  FULL ANSWER TEXT`);
  console.log(`  ${SUBSEP}`);
  const answer = p.answer_text || "(empty)";
  console.log(answer.split("\n").map((l) => `  | ${l}`).join("\n"));

  console.log(`\n  ${SUBSEP}`);
  console.log(`  STRUCTURED SECTIONS`);
  console.log(`  ${SUBSEP}`);
  const sections = p.sections || [];
  if (sections.length === 0) {
    console.log("  (none)");
  }
  for (const sec of sections) {
    console.log(`  ## ${sec.title}`);
    for (const item of sec.items || []) {
      const cites = (item.citations || []).map((c) => c.sourceId?.slice(0, 8)).join(", ");
      console.log(`    - ${item.text}  [owner: ${item.owner || "-"}, status: ${item.status || "-"}]  cites:[${cites}]`);
    }
  }

  console.log(`\n  ${SUBSEP}`);
  console.log(`  SOURCES CITED (unique)`);
  console.log(`  ${SUBSEP}`);
  const citations = p.citations || [];
  const seen = new Set();
  for (const c of citations) {
    const sid = c.sourceId || c.source_id;
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    console.log(`  [${seen.size}] ${c.label || c.title || sid}`);
    console.log(`      sourceId: ${sid}`);
    console.log(`      chunkId:  ${c.chunkId || "-"}`);
    if (c.url) console.log(`      url:      ${c.url}`);
    if (c.charStart != null) console.log(`      chars:    ${c.charStart}-${c.charEnd}`);
  }
  if (seen.size === 0) console.log("  (no citations)");

  console.log(`\n  ${SUBSEP}`);
  console.log(`  ALL SOURCES USED (from response)`);
  console.log(`  ${SUBSEP}`);
  const sourcesUsed = p.sources_used || [];
  if (sourcesUsed.length === 0) console.log("  (none)");
  for (const s of sourcesUsed) {
    console.log(`  - ${s.title || s.id}  [type=${s.sourceType || s.type || "-"}]`);
  }

  console.log(`\n  ${SUBSEP}`);
  console.log(`  EVIDENCE BY SOURCE`);
  console.log(`  ${SUBSEP}`);
  const evidence = (p.details || {}).evidenceBySource || [];
  if (evidence.length === 0) console.log("  (none)");
  for (const ev of evidence) {
    console.log(`  SOURCE: ${ev.title || ev.sourceKey}`);
    for (const exc of ev.excerpts || []) {
      const snippet = (exc.text || "").slice(0, 200).replace(/\n/g, " ");
      console.log(`    excerpt: "${snippet}..."`);
    }
  }

  console.log(`\n  ${SUBSEP}`);
  console.log(`  KEY FACTS`);
  console.log(`  ${SUBSEP}`);
  const keyFacts = p.keyFacts || [];
  if (keyFacts.length === 0) console.log("  (none)");
  for (const kf of keyFacts) {
    console.log(`  - ${kf.text}`);
  }

  console.log(`\n  ${SUBSEP}`);
  console.log(`  RETRIEVED CHUNKS (top 5)`);
  console.log(`  ${SUBSEP}`);
  const chunks = (d.retrieved_chunks_raw || p.retrieved_chunks || []).slice(0, 5);
  if (chunks.length === 0) console.log("  (none)");
  for (const ch of chunks) {
    const snippet = (ch.snippet || ch.text || "").slice(0, 150).replace(/\n/g, " ").replace(/\t/g, " ");
    console.log(`  score=${(ch.score || 0).toFixed(3)} src=${(ch.sourceId || "?").slice(0, 8)} chunk=${(ch.chunkId || "?").slice(0, 8)}`);
    console.log(`    "${snippet}..."`);
  }

  console.log("");
}
