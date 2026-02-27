"""Seed golden docs directly into PostgreSQL via psycopg2."""
import os, hashlib, json, math, sys
import psycopg2

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/fieldcopilot_test")
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "golden_docs")
WS = "golden-eval-workspace"
UID = "golden-eval-user"

DOCS = {
    "Q4_2024_OKRs.md": ("Q4 2024 OKRs - Project Phoenix", "https://docs.google.com/document/d/1abc123-q4-okrs", "https://drive.google.com/drive/folders/project-phoenix-docs"),
    "AI_Search_Architecture.md": ("AI Search Architecture - Project Phoenix", "https://docs.google.com/document/d/2def456-architecture", "https://drive.google.com/drive/folders/project-phoenix-docs"),
    "Engineering_AllHands_Oct28_2024.md": ("Engineering All-Hands Meeting Notes - Oct 28, 2024", "https://docs.google.com/document/d/3ghi789-allhands", "https://drive.google.com/drive/folders/meeting-notes"),
    "Product_Roadmap_2025.md": ("Product Roadmap 2025 - Project Phoenix", "https://docs.google.com/document/d/4jkl012-roadmap", "https://drive.google.com/drive/folders/product-docs"),
    "JIRA_INFRA-1247_AWS_EU_Blocker.md": ("JIRA INFRA-1247 - AWS EU Region Quota Blocker", "https://company.atlassian.net/browse/INFRA-1247", "https://company.atlassian.net/projects/INFRA"),
    "Team_Quick_Reference_Guide.md": ("Team Quick Reference Guide - Project Phoenix", "https://docs.google.com/document/d/5mno345-team-guide", "https://drive.google.com/drive/folders/team-docs"),
}

def gen_id(prefix, *args):
    h = hashlib.sha256("|".join(args).encode()).hexdigest()[:22]
    return f"golden-{prefix}-{h}"

def chunk_it(text):
    CS, OL = 400, 50
    result = []
    start = 0
    while start < len(text):
        end = min(start + CS, len(text))
        seg = text[start:end]
        if end < len(text):
            pb = seg.rfind("\n\n")
            if pb > CS * 0.5:
                end = start + pb + 2
            else:
                sb = max(seg.rfind(". "), seg.rfind(".\n"))
                if sb > CS * 0.5:
                    end = start + sb + 2
        result.append({"t": text[start:end].strip(), "s": start, "e": end})
        if end >= len(text):
            break
        start = end - OL
        if start >= len(text):
            break
    return result

print(f"Connecting to {DB_URL}...")
conn = psycopg2.connect(DB_URL)
conn.autocommit = False
cur = conn.cursor()

try:
    # Cleanup
    cur.execute("DELETE FROM chunks WHERE id LIKE 'golden-%'")
    cur.execute("DELETE FROM source_versions WHERE id LIKE 'golden-%'")
    cur.execute("DELETE FROM sources WHERE id LIKE 'golden-%'")
    print("Cleanup done")

    # Ensure workspace + user
    cur.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING", (WS, "Golden Eval Workspace"))
    cur.execute("INSERT INTO users (id, workspace_id, email, role) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING", (UID, WS, "golden-eval@example.com", "admin"))
    print("Setup done")

    total_chunks = 0
    for fname, (title, url, loc) in DOCS.items():
        fpath = os.path.join(DIR, fname)
        if not os.path.exists(fpath):
            print(f"  SKIP {fname}")
            continue
        with open(fpath, "r", encoding="utf-8") as doc:
            content = doc.read()

        sid = gen_id("src", fname)
        svid = gen_id("ver", fname, "v1")
        h = hashlib.sha256(content.encode()).hexdigest()
        mj = json.dumps({"sourceTypeLabel": "Drive", "locationUrl": loc, "fileName": fname, "isGoldenFixture": True})

        cur.execute(
            "INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (sid, WS, UID, UID, "drive", "workspace", "golden-" + fname, title, url, h, content, mj)
        )
        cur.execute(
            "INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (svid, WS, sid, 1, h, content, True, len(content), math.ceil(len(content) / 4))
        )

        chunks = chunk_it(content)
        for i, ck in enumerate(chunks):
            cmj = json.dumps({"sourceTitle": title, "sourceType": "drive", "sourceTypeLabel": "Drive", "url": url, "locationUrl": loc, "isGoldenFixture": True})
            cid = gen_id("chunk", fname, str(i))
            cur.execute(
                "INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (cid, WS, UID, sid, svid, i, ck["t"], ck["s"], ck["e"], math.ceil(len(ck["t"]) / 4), cmj)
            )
        total_chunks += len(chunks)
        print(f"  {fname}: {len(chunks)} chunks")

    conn.commit()

    # Verify
    cur.execute("SELECT COUNT(*) FROM sources WHERE id LIKE 'golden-%'")
    src_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM chunks WHERE id LIKE 'golden-%'")
    chunk_count = cur.fetchone()[0]
    print(f"\nSources: {src_count}, Chunks: {chunk_count}")

    if src_count == 6:
        print("[SUCCESS]")
    else:
        print("[FAIL]")
        sys.exit(1)

except Exception as e:
    conn.rollback()
    print(f"ERROR: {e}")
    sys.exit(1)
finally:
    cur.close()
    conn.close()
