## 1. Proposal Approval
- [ ] 1.1 Review and approve `proposal.md`

## 2. Design
- [ ] 2.1 Define a minimal Provider interface (input/output + error semantics)
- [ ] 2.2 Define a Provider registry and configuration mapping (platform -> provider)
- [ ] 2.3 Define scheduling strategy for periodic ingestion (intervals, timeouts, retries, rate limit)
- [ ] 2.4 Define storage contract for ingested items (where written, how queried by viewer)

## 3. Implementation
- [ ] 3.1 Add provider base types + registry
- [ ] 3.2 Add a site-ingestion provider (RSS-first, HTML fallback) for Caixin (title+link only)
- [ ] 3.3 Migrate NBA ingestion from `hotnews/web/server.py` into provider layer
- [ ] 3.4 Implement periodic ingestion runner (cron/worker) and persist results
- [ ] 3.5 Update viewer `/api/news` and page rendering to read from persisted results (no request-triggered crawling)
- [ ] 3.6 Ensure fetch metrics are recorded consistently (`status`, `duration_ms`, `items_count`, `content_hash`, `changed_count` where applicable)

## 4. Verification
- [ ] 4.1 Verify Caixin platform appears with title+link items
- [ ] 4.2 Verify NBA still appears under `sports` category without request-triggered fetching
- [ ] 4.3 Verify `/api/fetch-metrics` includes provider runs for Caixin and NBA
- [ ] 4.4 Regression check: existing NewsNow platforms unaffected
