# AI Search Architecture - Project Phoenix

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
- Anthropic's responsible AI practices align with company values

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
