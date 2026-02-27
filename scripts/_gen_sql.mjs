var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var DIR = path.join(__dirname, "..", "fixtures", "golden_docs");
var WS = "golden-eval-workspace";
var UID = "golden-eval-user";

function genId(prefix) { var args = Array.prototype.slice.call(arguments, 1); return "golden-" + prefix + "-" + crypto.createHash("sha256").update(args.join("|")).digest("hex").substring(0, 24); }
function esc(s) { return s.replace(/'/g, "''"); }
function chunkIt(text) {
  var CS = 400, OL = 50, r = [], s = 0;
  while (s < text.length) {
    var e = Math.min(s + CS, text.length);
    var seg = text.slice(s, e);
    if (e < text.length) {
      var pb = seg.lastIndexOf("\n\n");
      if (pb > CS * 0.5) e = s + pb + 2;
      else { var sb = Math.max(seg.lastIndexOf(". "), seg.lastIndexOf(".\n")); if (sb > CS * 0.5) e = s + sb + 2; }
    }
    r.push({ t: text.slice(s, e).trim(), s: s, e: e });
    s = e - OL;
    if (s >= text.length) break;
  }
  return r;
}

var DOCS = {
  "Q4_2024_OKRs.md": { t: "Q4 2024 OKRs - Project Phoenix", u: "https://docs.google.com/document/d/1abc123-q4-okrs", l: "https://drive.google.com/drive/folders/project-phoenix-docs" },
  "AI_Search_Architecture.md": { t: "AI Search Architecture - Project Phoenix", u: "https://docs.google.com/document/d/2def456-architecture", l: "https://drive.google.com/drive/folders/project-phoenix-docs" },
  "Engineering_AllHands_Oct28_2024.md": { t: "Engineering All-Hands Meeting Notes - Oct 28, 2024", u: "https://docs.google.com/document/d/3ghi789-allhands", l: "https://drive.google.com/drive/folders/meeting-notes" },
  "Product_Roadmap_2025.md": { t: "Product Roadmap 2025 - Project Phoenix", u: "https://docs.google.com/document/d/4jkl012-roadmap", l: "https://drive.google.com/drive/folders/product-docs" },
  "JIRA_INFRA-1247_AWS_EU_Blocker.md": { t: "JIRA INFRA-1247 - AWS EU Region Quota Blocker", u: "https://company.atlassian.net/browse/INFRA-1247", l: "https://company.atlassian.net/projects/INFRA" },
  "Team_Quick_Reference_Guide.md": { t: "Team Quick Reference Guide - Project Phoenix", u: "https://docs.google.com/document/d/5mno345-team-guide", l: "https://drive.google.com/drive/folders/team-docs" },
};

var sqlFile = path.join(__dirname, "..", "tmp", "golden_seed.sql");
fs.mkdirSync(path.dirname(sqlFile), { recursive: true });
var out = fs.createWriteStream(sqlFile);

out.write("BEGIN;\n");
out.write("DELETE FROM chunks WHERE id LIKE 'golden-%';\n");
out.write("DELETE FROM source_versions WHERE id LIKE 'golden-%';\n");
out.write("DELETE FROM sources WHERE id LIKE 'golden-%';\n");
out.write("INSERT INTO workspaces (id, name) VALUES ('" + WS + "', 'Golden Eval Workspace') ON CONFLICT (id) DO NOTHING;\n");
out.write("INSERT INTO users (id, workspace_id, email, role) VALUES ('" + UID + "', '" + WS + "', 'golden-eval@example.com', 'admin') ON CONFLICT (id) DO NOTHING;\n");

var files = fs.readdirSync(DIR).filter(function (f) { return f.endsWith(".md"); });
var tc = 0;

for (var fi = 0; fi < files.length; fi++) {
  var f = files[fi];
  var d = DOCS[f];
  if (!d) continue;
  var content = fs.readFileSync(path.join(DIR, f), "utf-8");
  var sid = genId("src", f);
  var svid = genId("ver", f, "v1");
  var h = crypto.createHash("sha256").update(content).digest("hex");
  var mj = JSON.stringify({ sourceTypeLabel: "Drive", locationUrl: d.l, fileName: f, isGoldenFixture: true });

  out.write("INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('" + esc(sid) + "','" + WS + "','" + UID + "','" + UID + "','drive','workspace','" + esc("golden-" + f) + "','" + esc(d.t) + "','" + esc(d.u) + "','" + h + "','" + esc(content) + "','" + esc(mj) + "');\n");
  out.write("INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('" + esc(svid) + "','" + WS + "','" + esc(sid) + "',1,'" + h + "','" + esc(content) + "',true," + content.length + "," + Math.ceil(content.length / 4) + ");\n");

  var cks = chunkIt(content);
  for (var i = 0; i < cks.length; i++) {
    var ck = cks[i];
    var cmj = JSON.stringify({ sourceTitle: d.t, sourceType: "drive", sourceTypeLabel: "Drive", url: d.u, locationUrl: d.l, isGoldenFixture: true });
    out.write("INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('" + esc(genId("chunk", f, String(i))) + "','" + WS + "','" + UID + "','" + esc(sid) + "','" + esc(svid) + "'," + i + ",'" + esc(ck.t) + "'," + ck.s + "," + ck.e + "," + Math.ceil(ck.t.length / 4) + ",'" + esc(cmj) + "');\n");
  }
  tc += cks.length;
  console.log(f + ": " + cks.length + " chunks");
}

out.write("COMMIT;\n");
out.write("SELECT 'Sources: ' || COUNT(*) FROM sources WHERE id LIKE 'golden-%';\n");
out.write("SELECT 'Chunks: ' || COUNT(*) FROM chunks WHERE id LIKE 'golden-%';\n");
out.end(function () {
  console.log("\nTotal: " + tc + " chunks");
  console.log("SQL file: " + sqlFile);
});
