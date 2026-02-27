# Chat Quality Dashboard Manual QA Checklist

## Environment
- [ ] Seed data available with at least 10 chats and 30 replies
- [ ] Admin user can access `/admin/chats`
- [ ] Dark mode and light mode both tested

## Overview Page (`/admin/chats`)
- [ ] Filters work: date range, environment, model, status
- [ ] Pagination works across pages
- [ ] Summary cards render non-overlapping values at zoom 90/100/110/125
- [ ] Baseline compare toggle loads delta badges
- [ ] Table rows open chat detail correctly

## Chat Detail (`/admin/chats/:chatId`)
- [ ] Metadata section renders model/env/appVersion/gitSha when present
- [ ] Aggregate stats show avg/min/max/p50/p95 for latency/tokens/unsupported rate
- [ ] Timeline renders both user and assistant messages
- [ ] "View Reply Details" opens the expected reply detail page
- [ ] Worst-reply shortcut buttons navigate correctly

## Reply Detail (`/admin/chats/:chatId/replies/:replyId`)
- [ ] Inputs/Outputs section includes numbered assistant sentences
- [ ] Retrieval evidence table shows chunk/source/score/snippet
- [ ] Citation mapping displays integrity/coverage/misattribution values
- [ ] Claim table shows label and supporting chunk IDs
- [ ] Tool calls are sanitized (no raw secrets)
- [ ] Observability spans render with timing

## Accessibility & Legibility
- [ ] Keyboard navigation reaches all controls (filters, links, pagination)
- [ ] Focus rings visible on interactive elements
- [ ] Text contrast is readable on dark background for cards/table/badges
- [ ] No layout jump when loading data (stable card/table spacing)

## Regression Checks
- [ ] Existing `/admin/evals` flow still works (suite list, run, details)
- [ ] Existing `/admin/observability` charts still render
- [ ] Existing `/chat` send/receive flow still works
