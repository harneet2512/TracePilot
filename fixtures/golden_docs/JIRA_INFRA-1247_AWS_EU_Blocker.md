# JIRA Ticket: INFRA-1247

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
> Working with AWS daily on this. The bottleneck appears to be their internal approval process for large quota increases. I'm confident we'll have resolution by November 11 based on my conversation with the TAM.

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
