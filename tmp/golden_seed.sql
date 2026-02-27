BEGIN;
DELETE FROM chunks WHERE id LIKE 'golden-%';
DELETE FROM source_versions WHERE id LIKE 'golden-%';
DELETE FROM sources WHERE id LIKE 'golden-%';
INSERT INTO workspaces (id, name) VALUES ('golden-eval-workspace', 'Golden Eval Workspace') ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, workspace_id, email, role) VALUES ('golden-eval-user', 'golden-eval-workspace', 'golden-eval@example.com', 'admin') ON CONFLICT (id) DO NOTHING;
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-32131f9da27255e9a33d163a','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-Q4_2024_OKRs.md','Q4 2024 OKRs - Project Phoenix','https://docs.google.com/document/d/1abc123-q4-okrs','8af25fb8c4ced15e5b377ccb77aab5a140c787389727b3a436555e2f9f950861','# Q4 2024 OKRs - Project Phoenix (AI Search)

**Document ID:** DOC-OKR-Q4-2024
**Last Updated:** October 15, 2024
**Owner:** Alex Kim, VP of Engineering

---

## Executive Summary

Project Phoenix represents our strategic initiative to replace the legacy keyword-based search system with an AI-powered semantic search platform. This document outlines our Q4 2024 objectives and key results.

## Objective 1: Launch Production-Ready Semantic Search

**Target Date:** November 15, 2024

### Key Results

1. **KR1:** Launch semantic search to 100% of internal users by November 15, 2024
2. **KR2:** Achieve 2s p95 latency for search queries (current baseline: 4.2s)
3. **KR3:** Index 500K+ documents across all connected data sources
4. **KR4:** Reach 92% user satisfaction score in post-launch survey

## Objective 2: Cost-Efficient Infrastructure

**Budget Allocation:** $180,000 for Q4 2024

### Key Results

1. **KR1:** Maintain infrastructure costs under $180,000 for Q4
2. **KR2:** Achieve cost per query under $0.002
3. **KR3:** Optimize embedding generation to process 10K docs/hour

## Budget Breakdown - Total Project

| Category | Allocated | Notes |
|----------|-----------|-------|
| Infrastructure (AWS/Pinecone) | $2,300,000 | 18-month runway |
| LLM API Costs | $180,000 | Claude Sonnet usage |
| Tooling & Monitoring | $85,000 | Datadog, logging |
| **Total** | **$2,565,000** | |

### Spend Tracking (as of October 1, 2024)

- **Total Spent:** $214,000
- **Monthly Burn Rate:** ~$214,000/month
- **Remaining Budget:** $2,351,000

## Team Structure

- **Project Lead:** Alex Kim
- **Engineering Team:** ~15 engineers
- **Infrastructure Lead:** Jordan Martinez
- **ML Lead:** Sarah Chen

## Current Status

- Internal beta complete with positive feedback
- On track for November 15 launch
- Key blockers being actively managed (see Engineering All-Hands notes)

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| P95 Latency | 2s | 2.1s (beta) |
| Documents Indexed | 500K+ | 423K |
| User Satisfaction | 92% | 94% (beta) |
| Uptime | 99.9% | 99.95% (beta) |

---

*This document is confidential and intended for internal use only.*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "fileName": "Q4_2024_OKRs.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-05f06062c248598a2188edfe','golden-eval-workspace','golden-src-32131f9da27255e9a33d163a',1,'8af25fb8c4ced15e5b377ccb77aab5a140c787389727b3a436555e2f9f950861','# Q4 2024 OKRs - Project Phoenix (AI Search)

**Document ID:** DOC-OKR-Q4-2024
**Last Updated:** October 15, 2024
**Owner:** Alex Kim, VP of Engineering

---

## Executive Summary

Project Phoenix represents our strategic initiative to replace the legacy keyword-based search system with an AI-powered semantic search platform. This document outlines our Q4 2024 objectives and key results.

## Objective 1: Launch Production-Ready Semantic Search

**Target Date:** November 15, 2024

### Key Results

1. **KR1:** Launch semantic search to 100% of internal users by November 15, 2024
2. **KR2:** Achieve 2s p95 latency for search queries (current baseline: 4.2s)
3. **KR3:** Index 500K+ documents across all connected data sources
4. **KR4:** Reach 92% user satisfaction score in post-launch survey

## Objective 2: Cost-Efficient Infrastructure

**Budget Allocation:** $180,000 for Q4 2024

### Key Results

1. **KR1:** Maintain infrastructure costs under $180,000 for Q4
2. **KR2:** Achieve cost per query under $0.002
3. **KR3:** Optimize embedding generation to process 10K docs/hour

## Budget Breakdown - Total Project

| Category | Allocated | Notes |
|----------|-----------|-------|
| Infrastructure (AWS/Pinecone) | $2,300,000 | 18-month runway |
| LLM API Costs | $180,000 | Claude Sonnet usage |
| Tooling & Monitoring | $85,000 | Datadog, logging |
| **Total** | **$2,565,000** | |

### Spend Tracking (as of October 1, 2024)

- **Total Spent:** $214,000
- **Monthly Burn Rate:** ~$214,000/month
- **Remaining Budget:** $2,351,000

## Team Structure

- **Project Lead:** Alex Kim
- **Engineering Team:** ~15 engineers
- **Infrastructure Lead:** Jordan Martinez
- **ML Lead:** Sarah Chen

## Current Status

- Internal beta complete with positive feedback
- On track for November 15 launch
- Key blockers being actively managed (see Engineering All-Hands notes)

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| P95 Latency | 2s | 2.1s (beta) |
| Documents Indexed | 500K+ | 423K |
| User Satisfaction | 92% | 94% (beta) |
| Uptime | 99.9% | 99.95% (beta) |

---

*This document is confidential and intended for internal use only.*
',true,2177,545);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c23876fcfc6990792dbfb980','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',0,'# Q4 2024 OKRs - Project Phoenix (AI Search)

**Document ID:** DOC-OKR-Q4-2024
**Last Updated:** October 15, 2024
**Owner:** Alex Kim, VP of Engineering

---

## Executive Summary

Project Phoenix represents our strategic initiative to replace the legacy keyword-based search system with an AI-powered semantic search platform. This document outlines our Q4 2024 objectives and key results.',0,392,98,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-1c8339573c4dc4639c1b1ee0','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',1,'outlines our Q4 2024 objectives and key results.

## Objective 1: Launch Production-Ready Semantic Search

**Target Date:** November 15, 2024

### Key Results

1. **KR1:** Launch semantic search to 100% of internal users by November 15, 2024
2. **KR2:** Achieve 2s p95 latency for search queries (current baseline: 4.2s)
3. **KR3:** Index 500K+ documents across all connected data sources
4.',342,734,98,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-90f5a3f39bbfe0775125edde','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',2,'K+ documents across all connected data sources
4. **KR4:** Reach 92% user satisfaction score in post-launch survey

## Objective 2: Cost-Efficient Infrastructure

**Budget Allocation:** $180,000 for Q4 2024

### Key Results',684,909,56,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-40e39b9c5e75505ad0f5d8ae','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',3,'ocation:** $180,000 for Q4 2024

### Key Results

1. **KR1:** Maintain infrastructure costs under $180,000 for Q4
2. **KR2:** Achieve cost per query under $0.002
3. **KR3:** Optimize embedding generation to process 10K docs/hour

## Budget Breakdown - Total Project',859,1126,67,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-0438d61e27e95850cbb5abe7','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',4,'K docs/hour

## Budget Breakdown - Total Project

| Category | Allocated | Notes |
|----------|-----------|-------|
| Infrastructure (AWS/Pinecone) | $2,300,000 | 18-month runway |
| LLM API Costs | $180,000 | Claude Sonnet usage |
| Tooling & Monitoring | $85,000 | Datadog, logging |
| **Total** | **$2,565,000** | |

### Spend Tracking (as of October 1, 2024)',1076,1440,91,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-afeb137c82216c7ece099e08','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',5,'| |

### Spend Tracking (as of October 1, 2024)

- **Total Spent:** $214,000
- **Monthly Burn Rate:** ~$214,000/month
- **Remaining Budget:** $2,351,000

## Team Structure

- **Project Lead:** Alex Kim
- **Engineering Team:** ~15 engineers
- **Infrastructure Lead:** Jordan Martinez
- **ML Lead:** Sarah Chen

## Current Status',1390,1720,82,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-a716c66f7a6be863a9958fe2','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',6,'nez
- **ML Lead:** Sarah Chen

## Current Status

- Internal beta complete with positive feedback
- On track for November 15 launch
- Key blockers being actively managed (see Engineering All-Hands notes)

## Success Metrics',1670,1895,56,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b8f9971c63a27f6d882c3351','golden-eval-workspace','golden-eval-user','golden-src-32131f9da27255e9a33d163a','golden-ver-05f06062c248598a2188edfe',7,'Engineering All-Hands notes)

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| P95 Latency | 2s | 2.1s (beta) |
| Documents Indexed | 500K+ | 423K |
| User Satisfaction | 92% | 94% (beta) |
| Uptime | 99.9% | 99.95% (beta) |

---

*This document is confidential and intended for internal use only.*',1845,2177,83,'{"sourceTitle": "Q4 2024 OKRs - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/1abc123-q4-okrs", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-2b7d43a298b698bf58306d91','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-AI_Search_Architecture.md','AI Search Architecture - Project Phoenix','https://docs.google.com/document/d/2def456-architecture','33359f92b206bb1f92643df365a0e89ee26b56f0b51520b03371fa8c46d03f34','# AI Search Architecture - Project Phoenix

**Document ID:** DOC-ARCH-001
**Last Updated:** September 25, 2024
**Author:** Sarah Chen, ML Lead

---

## Overview

This document describes the technical architecture for Project Phoenix, our AI-powered semantic search platform that will replace the legacy keyword search system.

## Vector Database Selection

### Decision: Pinecone

After evaluating multiple options including Weaviate, Milvus, and Qdrant, we selected **Pinecone** as our vector database.

#### Selection Criteria

| Factor | Pinecone | Self-Hosted (Milvus) |
|--------|----------|---------------------|
| Time to Market | 2 weeks | 8+ weeks |
| Operational Overhead | Managed | High |
| Scaling | Automatic | Manual |
| Cost (Year 1) | ~$300/month | $500+/month + eng time |

**Decision Rationale:** Pinecone was chosen for faster time-to-market vs self-hosted alternatives. The managed service allows our team to focus on search quality rather than infrastructure operations.

### Pinecone Configuration

- **Pod Type:** p1.x4
- **Dimensions:** 3072 (OpenAI text-embedding-3-large)
- **Similarity Metric:** Cosine similarity
- **Replicas:** 2 (for high availability)
- **Monthly Cost:** ~$300/month

## Embedding Model

We use **OpenAI text-embedding-3-large** for document embeddings:

- Dimensions: 3072
- Max tokens: 8191
- Cost: $0.00013 per 1K tokens

## LLM Selection

### Decision: Claude Sonnet 3.5

We evaluated GPT-4o and Claude Sonnet 3.5 for answer generation:

| Factor | Claude Sonnet 3.5 | GPT-4o |
|--------|------------------|--------|
| Cost per 1M tokens | $3.00 input / $15.00 output | $5.00 / $15.00 |
| Citation Accuracy | 95% | 78% |
| Latency (p50) | 1.2s | 1.4s |

**Decision:** Claude Sonnet 3.5 selected on September 20, 2024
- **30% cheaper** than GPT-4o for our use case
- **Better citation accuracy** (95% vs 78% in our benchmarks)
- Anthropic''s responsible AI practices align with company values

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────>│  API Layer  │────>│   Pinecone  │
│  (Web/API)  │     │  (Express)  │     │  (Vectors)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           v
                    ┌─────────────┐
                    │   Claude    │
                    │  (Answers)  │
                    └─────────────┘
```

## Data Pipeline

1. **Ingestion:** Documents synced from Google Drive, Slack, Confluence
2. **Chunking:** 400-token chunks with 50-token overlap
3. **Embedding:** OpenAI text-embedding-3-large
4. **Storage:** Vectors in Pinecone, metadata in PostgreSQL
5. **Retrieval:** Cosine similarity search, top-10 chunks
6. **Generation:** Claude Sonnet 3.5 with retrieved context

## Performance Targets

| Metric | Target | Architecture Support |
|--------|--------|---------------------|
| Query Latency (p95) | 2s | Pinecone p1.x4 pods, caching |
| Throughput | 100 QPS | Horizontal scaling |
| Index Size | 500K+ docs | Pinecone auto-scaling |

## Security

- All data encrypted at rest and in transit
- Pinecone SOC2 Type II certified
- Row-level security for multi-tenant access

---

*Architecture approved by Engineering Leadership on September 22, 2024*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "fileName": "AI_Search_Architecture.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-97c662c636005264648b2133','golden-eval-workspace','golden-src-2b7d43a298b698bf58306d91',1,'33359f92b206bb1f92643df365a0e89ee26b56f0b51520b03371fa8c46d03f34','# AI Search Architecture - Project Phoenix

**Document ID:** DOC-ARCH-001
**Last Updated:** September 25, 2024
**Author:** Sarah Chen, ML Lead

---

## Overview

This document describes the technical architecture for Project Phoenix, our AI-powered semantic search platform that will replace the legacy keyword search system.

## Vector Database Selection

### Decision: Pinecone

After evaluating multiple options including Weaviate, Milvus, and Qdrant, we selected **Pinecone** as our vector database.

#### Selection Criteria

| Factor | Pinecone | Self-Hosted (Milvus) |
|--------|----------|---------------------|
| Time to Market | 2 weeks | 8+ weeks |
| Operational Overhead | Managed | High |
| Scaling | Automatic | Manual |
| Cost (Year 1) | ~$300/month | $500+/month + eng time |

**Decision Rationale:** Pinecone was chosen for faster time-to-market vs self-hosted alternatives. The managed service allows our team to focus on search quality rather than infrastructure operations.

### Pinecone Configuration

- **Pod Type:** p1.x4
- **Dimensions:** 3072 (OpenAI text-embedding-3-large)
- **Similarity Metric:** Cosine similarity
- **Replicas:** 2 (for high availability)
- **Monthly Cost:** ~$300/month

## Embedding Model

We use **OpenAI text-embedding-3-large** for document embeddings:

- Dimensions: 3072
- Max tokens: 8191
- Cost: $0.00013 per 1K tokens

## LLM Selection

### Decision: Claude Sonnet 3.5

We evaluated GPT-4o and Claude Sonnet 3.5 for answer generation:

| Factor | Claude Sonnet 3.5 | GPT-4o |
|--------|------------------|--------|
| Cost per 1M tokens | $3.00 input / $15.00 output | $5.00 / $15.00 |
| Citation Accuracy | 95% | 78% |
| Latency (p50) | 1.2s | 1.4s |

**Decision:** Claude Sonnet 3.5 selected on September 20, 2024
- **30% cheaper** than GPT-4o for our use case
- **Better citation accuracy** (95% vs 78% in our benchmarks)
- Anthropic''s responsible AI practices align with company values

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────>│  API Layer  │────>│   Pinecone  │
│  (Web/API)  │     │  (Express)  │     │  (Vectors)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           v
                    ┌─────────────┐
                    │   Claude    │
                    │  (Answers)  │
                    └─────────────┘
```

## Data Pipeline

1. **Ingestion:** Documents synced from Google Drive, Slack, Confluence
2. **Chunking:** 400-token chunks with 50-token overlap
3. **Embedding:** OpenAI text-embedding-3-large
4. **Storage:** Vectors in Pinecone, metadata in PostgreSQL
5. **Retrieval:** Cosine similarity search, top-10 chunks
6. **Generation:** Claude Sonnet 3.5 with retrieved context

## Performance Targets

| Metric | Target | Architecture Support |
|--------|--------|---------------------|
| Query Latency (p95) | 2s | Pinecone p1.x4 pods, caching |
| Throughput | 100 QPS | Horizontal scaling |
| Index Size | 500K+ docs | Pinecone auto-scaling |

## Security

- All data encrypted at rest and in transit
- Pinecone SOC2 Type II certified
- Row-level security for multi-tenant access

---

*Architecture approved by Engineering Leadership on September 22, 2024*
',true,3259,815);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-9a181a56df8413539ff24237','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',0,'# AI Search Architecture - Project Phoenix

**Document ID:** DOC-ARCH-001
**Last Updated:** September 25, 2024
**Author:** Sarah Chen, ML Lead

---

## Overview

This document describes the technical architecture for Project Phoenix, our AI-powered semantic search platform that will replace the legacy keyword search system.

## Vector Database Selection

### Decision: Pinecone',0,381,95,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-88eced2c70705aed51da0f47','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',1,'ector Database Selection

### Decision: Pinecone

After evaluating multiple options including Weaviate, Milvus, and Qdrant, we selected **Pinecone** as our vector database.

#### Selection Criteria

| Factor | Pinecone | Self-Hosted (Milvus) |
|--------|----------|---------------------|
| Time to Market | 2 weeks | 8+ weeks |
| Operational Overhead | Managed | High |
| Scaling | Automatic | Manual',331,731,100,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-7f1eb8bc00efcf9c1fafe970','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',2,'| Managed | High |
| Scaling | Automatic | Manual |
| Cost (Year 1) | ~$300/month | $500+/month + eng time |

**Decision Rationale:** Pinecone was chosen for faster time-to-market vs self-hosted alternatives. The managed service allows our team to focus on search quality rather than infrastructure operations.

### Pinecone Configuration',681,1022,85,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-20a594158dc579eee4c56ca3','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',3,'tructure operations.

### Pinecone Configuration

- **Pod Type:** p1.x4
- **Dimensions:** 3072 (OpenAI text-embedding-3-large)
- **Similarity Metric:** Cosine similarity
- **Replicas:** 2 (for high availability)
- **Monthly Cost:** ~$300/month

## Embedding Model

We use **OpenAI text-embedding-3-large** for document embeddings:',972,1304,83,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c4583ac38c196c1424e38fb9','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',4,'ext-embedding-3-large** for document embeddings:

- Dimensions: 3072
- Max tokens: 8191
- Cost: $0.00013 per 1K tokens

## LLM Selection

### Decision: Claude Sonnet 3.5

We evaluated GPT-4o and Claude Sonnet 3.5 for answer generation:',1254,1491,59,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-2c040153e278b196bc7b7621','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',5,'-4o and Claude Sonnet 3.5 for answer generation:

| Factor | Claude Sonnet 3.5 | GPT-4o |
|--------|------------------|--------|
| Cost per 1M tokens | $3.00 input / $15.00 output | $5.00 / $15.00 |
| Citation Accuracy | 95% | 78% |
| Latency (p50) | 1.2s | 1.4s |',1441,1707,66,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c70c77128b3b7fe92ffdd850','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',6,'cy | 95% | 78% |
| Latency (p50) | 1.2s | 1.4s |

**Decision:** Claude Sonnet 3.5 selected on September 20, 2024
- **30% cheaper** than GPT-4o for our use case
- **Better citation accuracy** (95% vs 78% in our benchmarks)
- Anthropic''s responsible AI practices align with company values

## System Architecture',1657,1969,78,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-f5584f2234ece3bf7ab0eefa','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',7,'lign with company values

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────>│  API Layer  │────>│   Pinecone  │
│  (Web/API)  │     │  (Express)  │     │  (Vectors)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           v
                    ┌─────────────┐
                    │   Clau',1919,2319,100,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-540781e23b5288650f3ff67f','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',8,'┌─────────────┐
                    │   Claude    │
                    │  (Answers)  │
                    └─────────────┘
```

## Data Pipeline

1. **Ingestion:** Documents synced from Google Drive, Slack, Confluence
2. **Chunking:** 400-token chunks with 50-token overlap
3. **Embedding:** OpenAI text-embedding-3-large
4. **Storage:** Vectors in Pinecone, metadata in PostgreSQL
5.',2269,2661,97,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-eba4bb7c9d77fb45dd7fa5a6','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',9,'** Vectors in Pinecone, metadata in PostgreSQL
5. **Retrieval:** Cosine similarity search, top-10 chunks
6. **Generation:** Claude Sonnet 3.5 with retrieved context

## Performance Targets

| Metric | Target | Architecture Support |
|--------|--------|---------------------|
| Query Latency (p95) | 2s | Pinecone p1.x4 pods, caching |
| Throughput | 100 QPS | Horizontal scaling |
| Index Size | 500K',2611,3011,100,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-2a0f601c34a1835a0402ed3e','golden-eval-workspace','golden-eval-user','golden-src-2b7d43a298b698bf58306d91','golden-ver-97c662c636005264648b2133',10,'100 QPS | Horizontal scaling |
| Index Size | 500K+ docs | Pinecone auto-scaling |

## Security

- All data encrypted at rest and in transit
- Pinecone SOC2 Type II certified
- Row-level security for multi-tenant access

---

*Architecture approved by Engineering Leadership on September 22, 2024*',2961,3259,75,'{"sourceTitle": "AI Search Architecture - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/2def456-architecture", "locationUrl": "https://drive.google.com/drive/folders/project-phoenix-docs", "isGoldenFixture": true}');
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-de5b4d67beb93d1f5f596bea','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-Engineering_AllHands_Oct28_2024.md','Engineering All-Hands Meeting Notes - Oct 28, 2024','https://docs.google.com/document/d/3ghi789-allhands','65f611edc8335a39eecbf68866d2af6b36b91c7b69a84d5324b8f195ace6e6a5','# Engineering All-Hands Meeting Notes

**Date:** October 28, 2024
**Attendees:** Engineering Team (~45 people)
**Facilitator:** Alex Kim, VP of Engineering

---

## Project Phoenix Update

### Launch Status: ON TRACK for November 15, 2024

Despite several challenges, we remain on track for our November 15 launch date. Internal beta has been very successful with 94% user satisfaction.

## Current Blockers

### 1. AWS EU Region Quota Delays (CRITICAL)

**Status:** Active blocker
**Owner:** Jordan Martinez
**JIRA:** INFRA-1247

The AWS EU region quota increase request is still pending. This is blocking our ability to serve EU customers.

**Impact:**
- Cannot deploy to EU region without quota increase
- 3 enterprise customers waiting (estimated $500K ARR at risk)
- Affects GDPR compliance requirements

**Mitigation Actions:**
- Escalated to AWS Technical Account Manager on October 25
- Executive escalation to AWS VP on November 1, 2024
- Jordan expects resolution by November 11, 2024
- Fallback plan: Deploy with 50 instances (reduced capacity) if quota not approved

### 2. Pinecone Costs Over Budget

**Status:** Monitoring
**Owner:** Sarah Chen

Pinecone costs are tracking **15% over budget** due to higher-than-expected query volume during beta.

**Actions:**
- Implementing query caching (expected 30% cost reduction)
- Negotiating volume discount with Pinecone sales
- Optimizing embedding batch sizes

### 3. Google Drive API Rate Limits

**Status:** Being addressed
**Owner:** Mike Johnson

Hitting Google Drive API rate limits during bulk document sync operations.

**Actions:**
- Implemented exponential backoff
- Requested quota increase from Google
- Optimizing sync to use batch APIs

## Team Updates

### Infrastructure Team (Jordan Martinez)
- AWS migration 85% complete
- New monitoring dashboards deployed
- On-call rotation updated for launch

### ML Team (Sarah Chen)
- Embedding model fine-tuning complete
- Citation accuracy improved from 78% to 95%
- A/B test results positive

### Platform Team (Mike Johnson)
- Real-time sync feature in testing
- Mobile app prototype ready for review

## Action Items

| Item | Owner | Due Date |
|------|-------|----------|
| Resolve AWS quota blocker | Jordan Martinez | Nov 11, 2024 |
| Implement Pinecone caching | Sarah Chen | Nov 5, 2024 |
| Complete Google Drive optimization | Mike Johnson | Nov 8, 2024 |

## Q&A Highlights

**Q: What''s our biggest risk for the Nov 15 launch?**
A: The AWS EU region quota blocker is our biggest risk. If not resolved, we''ll need to delay EU customer onboarding. Jordan is confident we''ll have resolution by Nov 11.

**Q: How are we handling the cost overruns?**
A: We have contingency budget and are implementing optimizations. We expect to be back on target by end of November.

---

*Next All-Hands: November 11, 2024*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "fileName": "Engineering_AllHands_Oct28_2024.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-d7899c35dacf058fc986e552','golden-eval-workspace','golden-src-de5b4d67beb93d1f5f596bea',1,'65f611edc8335a39eecbf68866d2af6b36b91c7b69a84d5324b8f195ace6e6a5','# Engineering All-Hands Meeting Notes

**Date:** October 28, 2024
**Attendees:** Engineering Team (~45 people)
**Facilitator:** Alex Kim, VP of Engineering

---

## Project Phoenix Update

### Launch Status: ON TRACK for November 15, 2024

Despite several challenges, we remain on track for our November 15 launch date. Internal beta has been very successful with 94% user satisfaction.

## Current Blockers

### 1. AWS EU Region Quota Delays (CRITICAL)

**Status:** Active blocker
**Owner:** Jordan Martinez
**JIRA:** INFRA-1247

The AWS EU region quota increase request is still pending. This is blocking our ability to serve EU customers.

**Impact:**
- Cannot deploy to EU region without quota increase
- 3 enterprise customers waiting (estimated $500K ARR at risk)
- Affects GDPR compliance requirements

**Mitigation Actions:**
- Escalated to AWS Technical Account Manager on October 25
- Executive escalation to AWS VP on November 1, 2024
- Jordan expects resolution by November 11, 2024
- Fallback plan: Deploy with 50 instances (reduced capacity) if quota not approved

### 2. Pinecone Costs Over Budget

**Status:** Monitoring
**Owner:** Sarah Chen

Pinecone costs are tracking **15% over budget** due to higher-than-expected query volume during beta.

**Actions:**
- Implementing query caching (expected 30% cost reduction)
- Negotiating volume discount with Pinecone sales
- Optimizing embedding batch sizes

### 3. Google Drive API Rate Limits

**Status:** Being addressed
**Owner:** Mike Johnson

Hitting Google Drive API rate limits during bulk document sync operations.

**Actions:**
- Implemented exponential backoff
- Requested quota increase from Google
- Optimizing sync to use batch APIs

## Team Updates

### Infrastructure Team (Jordan Martinez)
- AWS migration 85% complete
- New monitoring dashboards deployed
- On-call rotation updated for launch

### ML Team (Sarah Chen)
- Embedding model fine-tuning complete
- Citation accuracy improved from 78% to 95%
- A/B test results positive

### Platform Team (Mike Johnson)
- Real-time sync feature in testing
- Mobile app prototype ready for review

## Action Items

| Item | Owner | Due Date |
|------|-------|----------|
| Resolve AWS quota blocker | Jordan Martinez | Nov 11, 2024 |
| Implement Pinecone caching | Sarah Chen | Nov 5, 2024 |
| Complete Google Drive optimization | Mike Johnson | Nov 8, 2024 |

## Q&A Highlights

**Q: What''s our biggest risk for the Nov 15 launch?**
A: The AWS EU region quota blocker is our biggest risk. If not resolved, we''ll need to delay EU customer onboarding. Jordan is confident we''ll have resolution by Nov 11.

**Q: How are we handling the cost overruns?**
A: We have contingency budget and are implementing optimizations. We expect to be back on target by end of November.

---

*Next All-Hands: November 11, 2024*
',true,2834,709);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-4792fd6a4057ef613edf9a2b','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',0,'# Engineering All-Hands Meeting Notes

**Date:** October 28, 2024
**Attendees:** Engineering Team (~45 people)
**Facilitator:** Alex Kim, VP of Engineering

---

## Project Phoenix Update

### Launch Status: ON TRACK for November 15, 2024

Despite several challenges, we remain on track for our November 15 launch date. Internal beta has been very successful with 94% user satisfaction.',0,388,97,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-7dd09abe3cdae74af16edfc7','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',1,'been very successful with 94% user satisfaction.

## Current Blockers

### 1. AWS EU Region Quota Delays (CRITICAL)

**Status:** Active blocker
**Owner:** Jordan Martinez
**JIRA:** INFRA-1247

The AWS EU region quota increase request is still pending. This is blocking our ability to serve EU customers.',338,643,76,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-16b3ab5328882b1251990e85','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',2,'s is blocking our ability to serve EU customers.

**Impact:**
- Cannot deploy to EU region without quota increase
- 3 enterprise customers waiting (estimated $500K ARR at risk)
- Affects GDPR compliance requirements',593,810,54,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-86cba1683bc2bf1a3a9d9c0f','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',3,'at risk)
- Affects GDPR compliance requirements

**Mitigation Actions:**
- Escalated to AWS Technical Account Manager on October 25
- Executive escalation to AWS VP on November 1, 2024
- Jordan expects resolution by November 11, 2024
- Fallback plan: Deploy with 50 instances (reduced capacity) if quota not approved

### 2. Pinecone Costs Over Budget

**Status:** Monitoring
**Owner:** Sarah Chen',760,1160,100,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b9726d7844b808fbf49dd111','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',4,'et

**Status:** Monitoring
**Owner:** Sarah Chen

Pinecone costs are tracking **15% over budget** due to higher-than-expected query volume during beta.

**Actions:**
- Implementing query caching (expected 30% cost reduction)
- Negotiating volume discount with Pinecone sales
- Optimizing embedding batch sizes

### 3. Google Drive API Rate Limits',1110,1458,87,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-6278e5e825e0710ca22ac861','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',5,'batch sizes

### 3. Google Drive API Rate Limits

**Status:** Being addressed
**Owner:** Mike Johnson

Hitting Google Drive API rate limits during bulk document sync operations.

**Actions:**
- Implemented exponential backoff
- Requested quota increase from Google
- Optimizing sync to use batch APIs

## Team Updates',1408,1727,80,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-dfef9a88251d0246af42bf3c','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',6,'timizing sync to use batch APIs

## Team Updates

### Infrastructure Team (Jordan Martinez)
- AWS migration 85% complete
- New monitoring dashboards deployed
- On-call rotation updated for launch

### ML Team (Sarah Chen)
- Embedding model fine-tuning complete
- Citation accuracy improved from 78% to 95%
- A/B test results positive',1677,2012,84,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-55a21f9d81f31e6c969b95c7','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',7,'oved from 78% to 95%
- A/B test results positive

### Platform Team (Mike Johnson)
- Real-time sync feature in testing
- Mobile app prototype ready for review

## Action Items

| Item | Owner | Due Date |
|------|-------|----------|
| Resolve AWS quota blocker | Jordan Martinez | Nov 11, 2024 |
| Implement Pinecone caching | Sarah Chen | Nov 5, 2024 |
| Complete Google Drive optimization | Mike Jo',1962,2362,100,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-cd216004a84aaab219204f54','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',8,'4 |
| Complete Google Drive optimization | Mike Johnson | Nov 8, 2024 |

## Q&A Highlights

**Q: What''s our biggest risk for the Nov 15 launch?**
A: The AWS EU region quota blocker is our biggest risk. If not resolved, we''ll need to delay EU customer onboarding. Jordan is confident we''ll have resolution by Nov 11.',2312,2629,79,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c7d0c996c6e50b94a1b4c384','golden-eval-workspace','golden-eval-user','golden-src-de5b4d67beb93d1f5f596bea','golden-ver-d7899c35dacf058fc986e552',9,'an is confident we''ll have resolution by Nov 11.

**Q: How are we handling the cost overruns?**
A: We have contingency budget and are implementing optimizations. We expect to be back on target by end of November.

---

*Next All-Hands: November 11, 2024*',2579,2834,64,'{"sourceTitle": "Engineering All-Hands Meeting Notes - Oct 28, 2024", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/3ghi789-allhands", "locationUrl": "https://drive.google.com/drive/folders/meeting-notes", "isGoldenFixture": true}');
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-2df0c331291b8b26697b807c','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-Product_Roadmap_2025.md','Product Roadmap 2025 - Project Phoenix','https://docs.google.com/document/d/4jkl012-roadmap','2484fc6e40eb28ba53ed98586db5cb291c1128d8443dc60ec51fe5135608bd3f','# Product Roadmap 2025 - Project Phoenix

**Document ID:** DOC-ROADMAP-2025
**Last Updated:** October 20, 2024
**Owner:** Product Team

---

## Vision

Transform how teams discover and interact with organizational knowledge through AI-powered semantic search.

## 2025 Quarterly Roadmap

### Q1 2025: Foundation & Scale

**Theme:** Enterprise Readiness

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-tenancy | Support for isolated customer environments | P0 |
| Real-time sync | Live updates from connected sources | P0 |
| Advanced filters | Date ranges, file types, authors | P1 |
| Audit logging | Compliance and security tracking | P1 |

**Key Milestones:**
- January: Multi-tenancy architecture deployed
- February: Real-time sync for Google Drive
- March: Advanced filters GA release

### Q2 2025: Intelligence Layer

**Theme:** Conversational AI

| Feature | Description | Priority |
|---------|-------------|----------|
| Conversational search | Follow-up questions with context | P0 |
| Automated summaries | Document and folder summaries | P0 |
| Smart suggestions | Proactive content recommendations | P1 |
| Knowledge graphs | Entity relationships visualization | P2 |

**Key Milestones:**
- April: Conversational search beta
- May: Automated summaries for meetings
- June: Smart suggestions launch

### Q3 2025: Platform Expansion

**Theme:** Ecosystem Growth

| Feature | Description | Priority |
|---------|-------------|----------|
| Microsoft 365 | SharePoint, OneDrive, Outlook | P0 |
| Slack bot | Native Slack integration | P0 |
| Mobile apps | iOS and Android native apps | P1 |
| API v2 | Public API for developers | P1 |

**Key Milestones:**
- July: Microsoft 365 connector beta
- August: Slack bot GA
- September: Mobile apps launch

### Q4 2025: Advanced Capabilities

**Theme:** Differentiation

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-language | Support for 20+ languages | P0 |
| Custom fine-tuning | Domain-specific model training | P1 |
| Analytics dashboard | Usage insights and ROI metrics | P1 |
| Workflow automation | Triggered actions from search | P2 |

**Key Milestones:**
- October: Multi-language support (10 languages)
- November: Custom fine-tuning beta
- December: Analytics dashboard GA

## Success Metrics (2025 Targets)

| Metric | Q1 | Q2 | Q3 | Q4 |
|--------|----|----|----|----|
| Enterprise Customers | 25 | 50 | 100 | 200 |
| Documents Indexed | 2M | 5M | 10M | 20M |
| Monthly Active Users | 10K | 25K | 50K | 100K |
| NPS Score | 45 | 50 | 55 | 60 |

## Dependencies

- AWS capacity for multi-tenant infrastructure
- Anthropic partnership for custom fine-tuning
- Microsoft ISV partnership for 365 integration

## Risks

1. **Competition:** Google and Microsoft investing heavily in AI search
2. **Talent:** ML engineering hiring remains challenging
3. **Costs:** LLM API costs may increase

---

*Roadmap subject to change based on customer feedback and market conditions.*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "fileName": "Product_Roadmap_2025.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-cc2401d7ec3e0aabd88db3a3','golden-eval-workspace','golden-src-2df0c331291b8b26697b807c',1,'2484fc6e40eb28ba53ed98586db5cb291c1128d8443dc60ec51fe5135608bd3f','# Product Roadmap 2025 - Project Phoenix

**Document ID:** DOC-ROADMAP-2025
**Last Updated:** October 20, 2024
**Owner:** Product Team

---

## Vision

Transform how teams discover and interact with organizational knowledge through AI-powered semantic search.

## 2025 Quarterly Roadmap

### Q1 2025: Foundation & Scale

**Theme:** Enterprise Readiness

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-tenancy | Support for isolated customer environments | P0 |
| Real-time sync | Live updates from connected sources | P0 |
| Advanced filters | Date ranges, file types, authors | P1 |
| Audit logging | Compliance and security tracking | P1 |

**Key Milestones:**
- January: Multi-tenancy architecture deployed
- February: Real-time sync for Google Drive
- March: Advanced filters GA release

### Q2 2025: Intelligence Layer

**Theme:** Conversational AI

| Feature | Description | Priority |
|---------|-------------|----------|
| Conversational search | Follow-up questions with context | P0 |
| Automated summaries | Document and folder summaries | P0 |
| Smart suggestions | Proactive content recommendations | P1 |
| Knowledge graphs | Entity relationships visualization | P2 |

**Key Milestones:**
- April: Conversational search beta
- May: Automated summaries for meetings
- June: Smart suggestions launch

### Q3 2025: Platform Expansion

**Theme:** Ecosystem Growth

| Feature | Description | Priority |
|---------|-------------|----------|
| Microsoft 365 | SharePoint, OneDrive, Outlook | P0 |
| Slack bot | Native Slack integration | P0 |
| Mobile apps | iOS and Android native apps | P1 |
| API v2 | Public API for developers | P1 |

**Key Milestones:**
- July: Microsoft 365 connector beta
- August: Slack bot GA
- September: Mobile apps launch

### Q4 2025: Advanced Capabilities

**Theme:** Differentiation

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-language | Support for 20+ languages | P0 |
| Custom fine-tuning | Domain-specific model training | P1 |
| Analytics dashboard | Usage insights and ROI metrics | P1 |
| Workflow automation | Triggered actions from search | P2 |

**Key Milestones:**
- October: Multi-language support (10 languages)
- November: Custom fine-tuning beta
- December: Analytics dashboard GA

## Success Metrics (2025 Targets)

| Metric | Q1 | Q2 | Q3 | Q4 |
|--------|----|----|----|----|
| Enterprise Customers | 25 | 50 | 100 | 200 |
| Documents Indexed | 2M | 5M | 10M | 20M |
| Monthly Active Users | 10K | 25K | 50K | 100K |
| NPS Score | 45 | 50 | 55 | 60 |

## Dependencies

- AWS capacity for multi-tenant infrastructure
- Anthropic partnership for custom fine-tuning
- Microsoft ISV partnership for 365 integration

## Risks

1. **Competition:** Google and Microsoft investing heavily in AI search
2. **Talent:** ML engineering hiring remains challenging
3. **Costs:** LLM API costs may increase

---

*Roadmap subject to change based on customer feedback and market conditions.*
',true,3007,752);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-86c89fe13503d59dd02a8923','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',0,'# Product Roadmap 2025 - Project Phoenix

**Document ID:** DOC-ROADMAP-2025
**Last Updated:** October 20, 2024
**Owner:** Product Team

---

## Vision

Transform how teams discover and interact with organizational knowledge through AI-powered semantic search.

## 2025 Quarterly Roadmap

### Q1 2025: Foundation & Scale

**Theme:** Enterprise Readiness',0,354,88,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b98f06d89f25f52ae8f1594c','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',1,'ndation & Scale

**Theme:** Enterprise Readiness

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-tenancy | Support for isolated customer environments | P0 |
| Real-time sync | Live updates from connected sources | P0 |
| Advanced filters | Date ranges, file types, authors | P1 |
| Audit logging | Compliance and security tracking | P1 |',304,678,93,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-884f91296ba76763de3735f0','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',2,'ogging | Compliance and security tracking | P1 |

**Key Milestones:**
- January: Multi-tenancy architecture deployed
- February: Real-time sync for Google Drive
- March: Advanced filters GA release

### Q2 2025: Intelligence Layer

**Theme:** Conversational AI',628,890,65,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-e12c8e081e42a7723ddd5cbb','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',3,'Intelligence Layer

**Theme:** Conversational AI

| Feature | Description | Priority |
|---------|-------------|----------|
| Conversational search | Follow-up questions with context | P0 |
| Automated summaries | Document and folder summaries | P0 |
| Smart suggestions | Proactive content recommendations | P1 |
| Knowledge graphs | Entity relationships visualization | P2 |',840,1218,94,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-dab4e5085b796e067910501c','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',4,'aphs | Entity relationships visualization | P2 |

**Key Milestones:**
- April: Conversational search beta
- May: Automated summaries for meetings
- June: Smart suggestions launch

### Q3 2025: Platform Expansion

**Theme:** Ecosystem Growth',1168,1410,60,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-d7696c9ff4eaedd9002af11e','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',5,'Platform Expansion

**Theme:** Ecosystem Growth

| Feature | Description | Priority |
|---------|-------------|----------|
| Microsoft 365 | SharePoint, OneDrive, Outlook | P0 |
| Slack bot | Native Slack integration | P0 |
| Mobile apps | iOS and Android native apps | P1 |
| API v2 | Public API for developers | P1 |',1360,1681,80,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-df7b3c4b53b9ea6bf363ba77','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',6,'P1 |
| API v2 | Public API for developers | P1 |

**Key Milestones:**
- July: Microsoft 365 connector beta
- August: Slack bot GA
- September: Mobile apps launch

### Q4 2025: Advanced Capabilities

**Theme:** Differentiation',1631,1858,57,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b6334695ae9f7bbcf35b4fb6','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',7,'dvanced Capabilities

**Theme:** Differentiation

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-language | Support for 20+ languages | P0 |
| Custom fine-tuning | Domain-specific model training | P1 |
| Analytics dashboard | Usage insights and ROI metrics | P1 |
| Workflow automation | Triggered actions from search | P2 |',1808,2169,90,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c7a4d80aff387c57560dd198','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',8,'utomation | Triggered actions from search | P2 |

**Key Milestones:**
- October: Multi-language support (10 languages)
- November: Custom fine-tuning beta
- December: Analytics dashboard GA

## Success Metrics (2025 Targets)',2119,2345,56,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-5cb7acb01f35461829b9c1fa','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',9,'dashboard GA

## Success Metrics (2025 Targets)

| Metric | Q1 | Q2 | Q3 | Q4 |
|--------|----|----|----|----|
| Enterprise Customers | 25 | 50 | 100 | 200 |
| Documents Indexed | 2M | 5M | 10M | 20M |
| Monthly Active Users | 10K | 25K | 50K | 100K |
| NPS Score | 45 | 50 | 55 | 60 |

## Dependencies',2295,2600,76,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-3250bb02b939ca921a12a8d0','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',10,'NPS Score | 45 | 50 | 55 | 60 |

## Dependencies

- AWS capacity for multi-tenant infrastructure
- Anthropic partnership for custom fine-tuning
- Microsoft ISV partnership for 365 integration

## Risks

1. **Competition:** Google and Microsoft investing heavily in AI search
2. **Talent:** ML engineering hiring remains challenging
3. **Costs:** LLM API costs may increase

---',2550,2929,95,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b0fd11e483eb90dff2302d3a','golden-eval-workspace','golden-eval-user','golden-src-2df0c331291b8b26697b807c','golden-ver-cc2401d7ec3e0aabd88db3a3',11,'ng
3. **Costs:** LLM API costs may increase

---

*Roadmap subject to change based on customer feedback and market conditions.*',2879,3007,32,'{"sourceTitle": "Product Roadmap 2025 - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/4jkl012-roadmap", "locationUrl": "https://drive.google.com/drive/folders/product-docs", "isGoldenFixture": true}');
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-1ed43535f857b1f1f69351fd','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-JIRA_INFRA-1247_AWS_EU_Blocker.md','JIRA INFRA-1247 - AWS EU Region Quota Blocker','https://company.atlassian.net/browse/INFRA-1247','3e542b0db36fd98298f93a144850b793e88a4d7b1bb661d1eec6e7f5606e3c17','# JIRA Ticket: INFRA-1247

## AWS EU Region Quota Blocker

**Ticket ID:** INFRA-1247
**Type:** Bug / Blocker
**Priority:** Critical (P0)
**Status:** In Progress
**Created:** October 20, 2024
**Updated:** November 1, 2024

---

## Summary

AWS EU-West-1 region quota increase request pending, blocking Project Phoenix EU deployment.

## Assignee

**Owner:** Jordan Martinez (Infrastructure Lead)
**Watchers:** Alex Kim, Sarah Chen, Mike Johnson

## Description

We submitted a quota increase request for the EU-West-1 region on October 15, 2024. The request has been pending for over 2 weeks with no resolution.

### Current Quota
- EC2 instances: 50 (need 200)
- EBS storage: 10TB (need 50TB)
- RDS instances: 5 (need 20)

### Requested Quota
- EC2 instances: 200
- EBS storage: 50TB
- RDS instances: 20

## Impact Assessment

### Business Impact
- **Revenue at Risk:** $500,000 ARR
- **Customers Affected:** 3 enterprise customers (Acme Corp, TechGlobal, EuroFinance)
- **Timeline Impact:** Cannot serve EU customers until resolved

### Technical Impact
- Cannot deploy production workloads to EU region
- GDPR compliance requirements not met
- Increased latency for EU users (serving from US-East)

## Timeline

| Date | Event |
|------|-------|
| Oct 15, 2024 | Initial quota request submitted |
| Oct 20, 2024 | JIRA ticket created |
| Oct 25, 2024 | Escalated to AWS Technical Account Manager |
| Nov 1, 2024 | Executive escalation to AWS VP |
| Nov 11, 2024 | **Expected resolution date** |

## Escalation History

### October 25, 2024 - TAM Escalation
Contacted AWS Technical Account Manager (Jennifer Walsh). TAM confirmed request is in review queue but no ETA provided.

### November 1, 2024 - Executive Escalation
Alex Kim escalated to AWS VP of Customer Success. Received acknowledgment and commitment to expedite review.

## Mitigation Plan

If quota not approved by November 11, 2024:

1. **Fallback Deployment:** Deploy with 50 instances (25% of planned capacity)
2. **Traffic Routing:** Implement geo-routing to send EU traffic to US-East temporarily
3. **Customer Communication:** Notify affected customers of potential performance impact

### Fallback Capacity Analysis
- 50 instances can handle ~25% of expected EU load
- Acceptable for soft launch with limited customers
- Full capacity needed by December 1 for GA

## Comments

**Jordan Martinez** - October 28, 2024:
> Working with AWS daily on this. The bottleneck appears to be their internal approval process for large quota increases. I''m confident we''ll have resolution by November 11 based on my conversation with the TAM.

**Alex Kim** - November 1, 2024:
> Escalated to AWS VP. This is our biggest risk for the November 15 launch. Jordan, please keep this ticket updated daily.

**Jordan Martinez** - November 1, 2024:
> Understood. Will provide daily updates. Fallback plan is ready if needed.

## Related Links

- [Q4 2024 OKRs](./Q4_2024_OKRs.md)
- [Engineering All-Hands Notes](./Engineering_AllHands_Oct28_2024.md)
- AWS Support Case: #12847593

## Labels

`blocker` `aws` `infrastructure` `project-phoenix` `eu-region` `critical`

---

*Last updated: November 1, 2024 by Jordan Martinez*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://company.atlassian.net/projects/INFRA", "fileName": "JIRA_INFRA-1247_AWS_EU_Blocker.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-de1d60033fa232c124325d67','golden-eval-workspace','golden-src-1ed43535f857b1f1f69351fd',1,'3e542b0db36fd98298f93a144850b793e88a4d7b1bb661d1eec6e7f5606e3c17','# JIRA Ticket: INFRA-1247

## AWS EU Region Quota Blocker

**Ticket ID:** INFRA-1247
**Type:** Bug / Blocker
**Priority:** Critical (P0)
**Status:** In Progress
**Created:** October 20, 2024
**Updated:** November 1, 2024

---

## Summary

AWS EU-West-1 region quota increase request pending, blocking Project Phoenix EU deployment.

## Assignee

**Owner:** Jordan Martinez (Infrastructure Lead)
**Watchers:** Alex Kim, Sarah Chen, Mike Johnson

## Description

We submitted a quota increase request for the EU-West-1 region on October 15, 2024. The request has been pending for over 2 weeks with no resolution.

### Current Quota
- EC2 instances: 50 (need 200)
- EBS storage: 10TB (need 50TB)
- RDS instances: 5 (need 20)

### Requested Quota
- EC2 instances: 200
- EBS storage: 50TB
- RDS instances: 20

## Impact Assessment

### Business Impact
- **Revenue at Risk:** $500,000 ARR
- **Customers Affected:** 3 enterprise customers (Acme Corp, TechGlobal, EuroFinance)
- **Timeline Impact:** Cannot serve EU customers until resolved

### Technical Impact
- Cannot deploy production workloads to EU region
- GDPR compliance requirements not met
- Increased latency for EU users (serving from US-East)

## Timeline

| Date | Event |
|------|-------|
| Oct 15, 2024 | Initial quota request submitted |
| Oct 20, 2024 | JIRA ticket created |
| Oct 25, 2024 | Escalated to AWS Technical Account Manager |
| Nov 1, 2024 | Executive escalation to AWS VP |
| Nov 11, 2024 | **Expected resolution date** |

## Escalation History

### October 25, 2024 - TAM Escalation
Contacted AWS Technical Account Manager (Jennifer Walsh). TAM confirmed request is in review queue but no ETA provided.

### November 1, 2024 - Executive Escalation
Alex Kim escalated to AWS VP of Customer Success. Received acknowledgment and commitment to expedite review.

## Mitigation Plan

If quota not approved by November 11, 2024:

1. **Fallback Deployment:** Deploy with 50 instances (25% of planned capacity)
2. **Traffic Routing:** Implement geo-routing to send EU traffic to US-East temporarily
3. **Customer Communication:** Notify affected customers of potential performance impact

### Fallback Capacity Analysis
- 50 instances can handle ~25% of expected EU load
- Acceptable for soft launch with limited customers
- Full capacity needed by December 1 for GA

## Comments

**Jordan Martinez** - October 28, 2024:
> Working with AWS daily on this. The bottleneck appears to be their internal approval process for large quota increases. I''m confident we''ll have resolution by November 11 based on my conversation with the TAM.

**Alex Kim** - November 1, 2024:
> Escalated to AWS VP. This is our biggest risk for the November 15 launch. Jordan, please keep this ticket updated daily.

**Jordan Martinez** - November 1, 2024:
> Understood. Will provide daily updates. Fallback plan is ready if needed.

## Related Links

- [Q4 2024 OKRs](./Q4_2024_OKRs.md)
- [Engineering All-Hands Notes](./Engineering_AllHands_Oct28_2024.md)
- AWS Support Case: #12847593

## Labels

`blocker` `aws` `infrastructure` `project-phoenix` `eu-region` `critical`

---

*Last updated: November 1, 2024 by Jordan Martinez*
',true,3173,794);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-1681ed1c9007f72809da6bd3','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',0,'# JIRA Ticket: INFRA-1247

## AWS EU Region Quota Blocker

**Ticket ID:** INFRA-1247
**Type:** Bug / Blocker
**Priority:** Critical (P0)
**Status:** In Progress
**Created:** October 20, 2024
**Updated:** November 1, 2024

---

## Summary

AWS EU-West-1 region quota increase request pending, blocking Project Phoenix EU deployment.

## Assignee',0,346,86,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-3aa0ced38d9e00d0d6f9b5ae','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',1,'king Project Phoenix EU deployment.

## Assignee

**Owner:** Jordan Martinez (Infrastructure Lead)
**Watchers:** Alex Kim, Sarah Chen, Mike Johnson

## Description

We submitted a quota increase request for the EU-West-1 region on October 15, 2024. The request has been pending for over 2 weeks with no resolution.',296,612,79,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-855648bb9d9ec98e0b00582a','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',2,'een pending for over 2 weeks with no resolution.

### Current Quota
- EC2 instances: 50 (need 200)
- EBS storage: 10TB (need 50TB)
- RDS instances: 5 (need 20)

### Requested Quota
- EC2 instances: 200
- EBS storage: 50TB
- RDS instances: 20

## Impact Assessment',562,827,66,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-9c3ad27de601a455bc3e7910','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',3,': 50TB
- RDS instances: 20

## Impact Assessment

### Business Impact
- **Revenue at Risk:** $500,000 ARR
- **Customers Affected:** 3 enterprise customers (Acme Corp, TechGlobal, EuroFinance)
- **Timeline Impact:** Cannot serve EU customers until resolved',777,1034,64,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-f366fa864048fde1b393937c','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',4,'pact:** Cannot serve EU customers until resolved

### Technical Impact
- Cannot deploy production workloads to EU region
- GDPR compliance requirements not met
- Increased latency for EU users (serving from US-East)

## Timeline',984,1214,57,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-6c152a90c4847d14c560a00a','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',5,'for EU users (serving from US-East)

## Timeline

| Date | Event |
|------|-------|
| Oct 15, 2024 | Initial quota request submitted |
| Oct 20, 2024 | JIRA ticket created |
| Oct 25, 2024 | Escalated to AWS Technical Account Manager |
| Nov 1, 2024 | Executive escalation to AWS VP |
| Nov 11, 2024 | **Expected resolution date** |

## Escalation History',1164,1521,89,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-f7d92adbc3738de9845f7746','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',6,'ected resolution date** |

## Escalation History

### October 25, 2024 - TAM Escalation
Contacted AWS Technical Account Manager (Jennifer Walsh). TAM confirmed request is in review queue but no ETA provided.

### November 1, 2024 - Executive Escalation
Alex Kim escalated to AWS VP of Customer Success. Received acknowledgment and commitment to expedite review.

## Mitigation Plan',1471,1854,96,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-df0d79a951ac2b4236e02faa','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',7,'mmitment to expedite review.

## Mitigation Plan

If quota not approved by November 11, 2024:

1. **Fallback Deployment:** Deploy with 50 instances (25% of planned capacity)
2. **Traffic Routing:** Implement geo-routing to send EU traffic to US-East temporarily
3. **Customer Communication:** Notify affected customers of potential performance impact',1804,2156,88,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-421ce65a73abc94a03323c6f','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',8,'fected customers of potential performance impact

### Fallback Capacity Analysis
- 50 instances can handle ~25% of expected EU load
- Acceptable for soft launch with limited customers
- Full capacity needed by December 1 for GA

## Comments',2106,2348,60,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-fded72ff1dcde0f7054f57d5','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',9,'apacity needed by December 1 for GA

## Comments

**Jordan Martinez** - October 28, 2024:
> Working with AWS daily on this. The bottleneck appears to be their internal approval process for large quota increases. I''m confident we''ll have resolution by November 11 based on my conversation with the TAM.',2298,2601,76,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-73aa0791a8a6a5a21b9bf7ed','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',10,'vember 11 based on my conversation with the TAM.

**Alex Kim** - November 1, 2024:
> Escalated to AWS VP. This is our biggest risk for the November 15 launch. Jordan, please keep this ticket updated daily.

**Jordan Martinez** - November 1, 2024:
> Understood. Will provide daily updates. Fallback plan is ready if needed.

## Related Links',2551,2893,85,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-69f8baa2e1b06bc10df2dcbc','golden-eval-workspace','golden-eval-user','golden-src-1ed43535f857b1f1f69351fd','golden-ver-de1d60033fa232c124325d67',11,'lback plan is ready if needed.

## Related Links

- [Q4 2024 OKRs](./Q4_2024_OKRs.md)
- [Engineering All-Hands Notes](./Engineering_AllHands_Oct28_2024.md)
- AWS Support Case: #12847593

## Labels

`blocker` `aws` `infrastructure` `project-phoenix` `eu-region` `critical`

---

*Last updated: November 1, 2024 by Jordan Martinez*',2843,3173,83,'{"sourceTitle": "JIRA INFRA-1247 - AWS EU Region Quota Blocker", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://company.atlassian.net/browse/INFRA-1247", "locationUrl": "https://company.atlassian.net/projects/INFRA", "isGoldenFixture": true}');
INSERT INTO sources (id,workspace_id,user_id,created_by_user_id,type,visibility,external_id,title,url,content_hash,full_text,metadata_json) VALUES ('golden-src-a059a0acdadb65a02b52c34f','golden-eval-workspace','golden-eval-user','golden-eval-user','drive','workspace','golden-Team_Quick_Reference_Guide.md','Team Quick Reference Guide - Project Phoenix','https://docs.google.com/document/d/5mno345-team-guide','bb9a18eba15361020ba1cdc18499d5b5c56ee120b6ab323f856e3237223b553c','# Team Quick Reference Guide - Project Phoenix

**Document ID:** DOC-TEAM-001
**Last Updated:** October 30, 2024
**Purpose:** Quick reference for team contacts and responsibilities

---

## Leadership Team

### Alex Kim - VP of Engineering
- **Email:** alex.k@company.com
- **Slack:** @alexkim
- **Role:** Project Phoenix Executive Sponsor
- **Responsibilities:** Overall project ownership, stakeholder management, budget approval

### Sarah Chen - ML Lead
- **Email:** sarah.c@company.com
- **Slack:** @sarahchen
- **Role:** Machine Learning Lead
- **Responsibilities:** Embedding models, LLM integration, search quality

### Jordan Martinez - Infrastructure Lead
- **Email:** jordan.m@company.com
- **Slack:** @jordan
- **Role:** Infrastructure Lead
- **Responsibilities:** AWS infrastructure, Pinecone operations, scaling, monitoring
- **On-Call:** Primary for infrastructure incidents

### Mike Johnson - Platform Lead
- **Email:** mike.j@company.com
- **Slack:** @mikej
- **Role:** Platform Engineering Lead
- **Responsibilities:** Connectors (Google Drive, Slack, Confluence), sync infrastructure

---

## Who to Contact

### Infrastructure Issues
**Contact:** Jordan Martinez (Infrastructure Lead)
- Email: jordan.m@company.com
- Slack: @jordan
- Owns: AWS, Pinecone, scaling, performance

**Examples:**
- Server downtime or errors
- Performance degradation
- Scaling requests
- AWS/cloud issues
- Pinecone connectivity

### Search Quality Issues
**Contact:** Sarah Chen (ML Lead)
- Email: sarah.c@company.com
- Slack: @sarahchen
- Owns: Embeddings, LLM, relevance tuning

**Examples:**
- Poor search results
- Incorrect answers
- Citation problems
- Model performance

### Connector/Sync Issues
**Contact:** Mike Johnson (Platform Lead)
- Email: mike.j@company.com
- Slack: @mikej
- Owns: Google Drive, Slack, Confluence connectors

**Examples:**
- Documents not syncing
- Permission errors
- Missing content
- Connector failures

### Project Management / Priorities
**Contact:** Alex Kim (VP Engineering)
- Email: alex.k@company.com
- Slack: @alexkim
- Owns: Roadmap, priorities, cross-team coordination

---

## Engineering Team Members

| Name | Role | Slack | Focus Area |
|------|------|-------|------------|
| David Park | Senior SWE | @davidp | Backend API |
| Lisa Wang | Senior SWE | @lisaw | Frontend |
| Tom Brown | SWE II | @tomb | Connectors |
| Emma Davis | SWE II | @emmad | Search indexing |
| Chris Lee | SWE I | @chrisl | Testing/QA |
| Amy Zhang | DevOps | @amyz | CI/CD |
| Kevin Wu | ML Engineer | @kevinw | Embeddings |
| Rachel Green | ML Engineer | @rachelg | Evaluation |

---

## Slack Channels

| Channel | Purpose |
|---------|---------|
| #project-phoenix | General project discussion |
| #phoenix-engineering | Technical discussions |
| #phoenix-incidents | Production issues |
| #phoenix-releases | Release coordination |
| #phoenix-ml | ML team discussions |

---

## On-Call Rotation

**Primary:** Jordan Martinez (infrastructure)
**Secondary:** Mike Johnson (platform)
**ML Issues:** Sarah Chen

**Escalation Path:**
1. Primary on-call
2. Secondary on-call
3. Team lead
4. Alex Kim (VP)

---

## Useful Links

- [Q4 OKRs](./Q4_2024_OKRs.md)
- [Architecture Doc](./AI_Search_Architecture.md)
- [2025 Roadmap](./Product_Roadmap_2025.md)
- Runbook: [Internal Wiki Link]
- Dashboard: [Datadog Link]

---

*Keep this document bookmarked for quick access to team contacts.*
','{"sourceTypeLabel": "Drive", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "fileName": "Team_Quick_Reference_Guide.md", "isGoldenFixture": true}');
INSERT INTO source_versions (id,workspace_id,source_id,version,content_hash,full_text,is_active,char_count,token_estimate) VALUES ('golden-ver-85362dc139990f306f8c7c32','golden-eval-workspace','golden-src-a059a0acdadb65a02b52c34f',1,'bb9a18eba15361020ba1cdc18499d5b5c56ee120b6ab323f856e3237223b553c','# Team Quick Reference Guide - Project Phoenix

**Document ID:** DOC-TEAM-001
**Last Updated:** October 30, 2024
**Purpose:** Quick reference for team contacts and responsibilities

---

## Leadership Team

### Alex Kim - VP of Engineering
- **Email:** alex.k@company.com
- **Slack:** @alexkim
- **Role:** Project Phoenix Executive Sponsor
- **Responsibilities:** Overall project ownership, stakeholder management, budget approval

### Sarah Chen - ML Lead
- **Email:** sarah.c@company.com
- **Slack:** @sarahchen
- **Role:** Machine Learning Lead
- **Responsibilities:** Embedding models, LLM integration, search quality

### Jordan Martinez - Infrastructure Lead
- **Email:** jordan.m@company.com
- **Slack:** @jordan
- **Role:** Infrastructure Lead
- **Responsibilities:** AWS infrastructure, Pinecone operations, scaling, monitoring
- **On-Call:** Primary for infrastructure incidents

### Mike Johnson - Platform Lead
- **Email:** mike.j@company.com
- **Slack:** @mikej
- **Role:** Platform Engineering Lead
- **Responsibilities:** Connectors (Google Drive, Slack, Confluence), sync infrastructure

---

## Who to Contact

### Infrastructure Issues
**Contact:** Jordan Martinez (Infrastructure Lead)
- Email: jordan.m@company.com
- Slack: @jordan
- Owns: AWS, Pinecone, scaling, performance

**Examples:**
- Server downtime or errors
- Performance degradation
- Scaling requests
- AWS/cloud issues
- Pinecone connectivity

### Search Quality Issues
**Contact:** Sarah Chen (ML Lead)
- Email: sarah.c@company.com
- Slack: @sarahchen
- Owns: Embeddings, LLM, relevance tuning

**Examples:**
- Poor search results
- Incorrect answers
- Citation problems
- Model performance

### Connector/Sync Issues
**Contact:** Mike Johnson (Platform Lead)
- Email: mike.j@company.com
- Slack: @mikej
- Owns: Google Drive, Slack, Confluence connectors

**Examples:**
- Documents not syncing
- Permission errors
- Missing content
- Connector failures

### Project Management / Priorities
**Contact:** Alex Kim (VP Engineering)
- Email: alex.k@company.com
- Slack: @alexkim
- Owns: Roadmap, priorities, cross-team coordination

---

## Engineering Team Members

| Name | Role | Slack | Focus Area |
|------|------|-------|------------|
| David Park | Senior SWE | @davidp | Backend API |
| Lisa Wang | Senior SWE | @lisaw | Frontend |
| Tom Brown | SWE II | @tomb | Connectors |
| Emma Davis | SWE II | @emmad | Search indexing |
| Chris Lee | SWE I | @chrisl | Testing/QA |
| Amy Zhang | DevOps | @amyz | CI/CD |
| Kevin Wu | ML Engineer | @kevinw | Embeddings |
| Rachel Green | ML Engineer | @rachelg | Evaluation |

---

## Slack Channels

| Channel | Purpose |
|---------|---------|
| #project-phoenix | General project discussion |
| #phoenix-engineering | Technical discussions |
| #phoenix-incidents | Production issues |
| #phoenix-releases | Release coordination |
| #phoenix-ml | ML team discussions |

---

## On-Call Rotation

**Primary:** Jordan Martinez (infrastructure)
**Secondary:** Mike Johnson (platform)
**ML Issues:** Sarah Chen

**Escalation Path:**
1. Primary on-call
2. Secondary on-call
3. Team lead
4. Alex Kim (VP)

---

## Useful Links

- [Q4 OKRs](./Q4_2024_OKRs.md)
- [Architecture Doc](./AI_Search_Architecture.md)
- [2025 Roadmap](./Product_Roadmap_2025.md)
- Runbook: [Internal Wiki Link]
- Dashboard: [Datadog Link]

---

*Keep this document bookmarked for quick access to team contacts.*
',true,3410,853);
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-1b65eed73dccd0d688f6ba56','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',0,'# Team Quick Reference Guide - Project Phoenix

**Document ID:** DOC-TEAM-001
**Last Updated:** October 30, 2024
**Purpose:** Quick reference for team contacts and responsibilities

---

## Leadership Team',0,207,52,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-b986c1fbec5b36f0e77a4a6b','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',1,'ts and responsibilities

---

## Leadership Team

### Alex Kim - VP of Engineering
- **Email:** alex.k@company.com
- **Slack:** @alexkim
- **Role:** Project Phoenix Executive Sponsor
- **Responsibilities:** Overall project ownership, stakeholder management, budget approval',157,432,69,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-2be2ace663d6fc0f5032f6da','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',2,'nership, stakeholder management, budget approval

### Sarah Chen - ML Lead
- **Email:** sarah.c@company.com
- **Slack:** @sarahchen
- **Role:** Machine Learning Lead
- **Responsibilities:** Embedding models, LLM integration, search quality',382,623,60,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-5f37eb775c8b7304e7343dc3','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',3,'mbedding models, LLM integration, search quality

### Jordan Martinez - Infrastructure Lead
- **Email:** jordan.m@company.com
- **Slack:** @jordan
- **Role:** Infrastructure Lead
- **Responsibilities:** AWS infrastructure, Pinecone operations, scaling, monitoring
- **On-Call:** Primary for infrastructure incidents',573,890,79,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-9a5f47c1a6416f4b2ec72f83','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',4,'*On-Call:** Primary for infrastructure incidents

### Mike Johnson - Platform Lead
- **Email:** mike.j@company.com
- **Slack:** @mikej
- **Role:** Platform Engineering Lead
- **Responsibilities:** Connectors (Google Drive, Slack, Confluence), sync infrastructure

---

## Who to Contact',840,1128,72,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-9de88952a83ffb70bd3b1166','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',5,'ce), sync infrastructure

---

## Who to Contact

### Infrastructure Issues
**Contact:** Jordan Martinez (Infrastructure Lead)
- Email: jordan.m@company.com
- Slack: @jordan
- Owns: AWS, Pinecone, scaling, performance

**Examples:**
- Server downtime or errors
- Performance degradation
- Scaling requests
- AWS/cloud issues
- Pinecone connectivity',1078,1428,87,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-e88ff9febecab01c0b95e3c7','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',6,'uests
- AWS/cloud issues
- Pinecone connectivity

### Search Quality Issues
**Contact:** Sarah Chen (ML Lead)
- Email: sarah.c@company.com
- Slack: @sarahchen
- Owns: Embeddings, LLM, relevance tuning

**Examples:**
- Poor search results
- Incorrect answers
- Citation problems
- Model performance',1378,1677,75,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c1b1bbec298f89d008aa3bd6','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',7,'answers
- Citation problems
- Model performance

### Connector/Sync Issues
**Contact:** Mike Johnson (Platform Lead)
- Email: mike.j@company.com
- Slack: @mikej
- Owns: Google Drive, Slack, Confluence connectors

**Examples:**
- Documents not syncing
- Permission errors
- Missing content
- Connector failures',1627,1939,78,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-c4cbafdf9fc27745f6243a14','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',8,'on errors
- Missing content
- Connector failures

### Project Management / Priorities
**Contact:** Alex Kim (VP Engineering)
- Email: alex.k@company.com
- Slack: @alexkim
- Owns: Roadmap, priorities, cross-team coordination

---

## Engineering Team Members',1889,2148,65,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-194bc21cacde8bfed086ad06','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',9,'m coordination

---

## Engineering Team Members

| Name | Role | Slack | Focus Area |
|------|------|-------|------------|
| David Park | Senior SWE | @davidp | Backend API |
| Lisa Wang | Senior SWE | @lisaw | Frontend |
| Tom Brown | SWE II | @tomb | Connectors |
| Emma Davis | SWE II | @emmad | Search indexing |
| Chris Lee | SWE I | @chrisl | Testing/QA |
| Amy Zhang | DevOps | @amyz | CI/CD',2098,2498,100,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-438456815d9dee0071d433e6','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',10,'Testing/QA |
| Amy Zhang | DevOps | @amyz | CI/CD |
| Kevin Wu | ML Engineer | @kevinw | Embeddings |
| Rachel Green | ML Engineer | @rachelg | Evaluation |

---

## Slack Channels

| Channel | Purpose |
|---------|---------|
| #project-phoenix | General project discussion |
| #phoenix-engineering | Technical discussions |
| #phoenix-incidents | Production issues |
| #phoenix-releases | Release co',2448,2848,100,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-515cd1aa2a99b6c876f2bb2b','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',11,'oduction issues |
| #phoenix-releases | Release coordination |
| #phoenix-ml | ML team discussions |

---

## On-Call Rotation

**Primary:** Jordan Martinez (infrastructure)
**Secondary:** Mike Johnson (platform)
**ML Issues:** Sarah Chen

**Escalation Path:**
1. Primary on-call
2. Secondary on-call
3. Team lead
4. Alex Kim (VP)

---

## Useful Links',2798,3152,88,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
INSERT INTO chunks (id,workspace_id,user_id,source_id,source_version_id,chunk_index,text,char_start,char_end,token_estimate,metadata_json) VALUES ('golden-chunk-8b7bcdb2759e077058b7fd74','golden-eval-workspace','golden-eval-user','golden-src-a059a0acdadb65a02b52c34f','golden-ver-85362dc139990f306f8c7c32',12,'Team lead
4. Alex Kim (VP)

---

## Useful Links

- [Q4 OKRs](./Q4_2024_OKRs.md)
- [Architecture Doc](./AI_Search_Architecture.md)
- [2025 Roadmap](./Product_Roadmap_2025.md)
- Runbook: [Internal Wiki Link]
- Dashboard: [Datadog Link]

---

*Keep this document bookmarked for quick access to team contacts.*',3102,3410,77,'{"sourceTitle": "Team Quick Reference Guide - Project Phoenix", "sourceType": "drive", "sourceTypeLabel": "Drive", "url": "https://docs.google.com/document/d/5mno345-team-guide", "locationUrl": "https://drive.google.com/drive/folders/team-docs", "isGoldenFixture": true}');
COMMIT;
SELECT 'Sources: ' || COUNT(*) FROM sources WHERE id LIKE 'golden-%';
SELECT 'Chunks: ' || COUNT(*) FROM chunks WHERE id LIKE 'golden-%';
