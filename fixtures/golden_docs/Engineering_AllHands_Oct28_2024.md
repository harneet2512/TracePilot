# Engineering All-Hands Meeting Notes

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

**Q: What's our biggest risk for the Nov 15 launch?**
A: The AWS EU region quota blocker is our biggest risk. If not resolved, we'll need to delay EU customer onboarding. Jordan is confident we'll have resolution by Nov 11.

**Q: How are we handling the cost overruns?**
A: We have contingency budget and are implementing optimizations. We expect to be back on target by end of November.

---

*Next All-Hands: November 11, 2024*
