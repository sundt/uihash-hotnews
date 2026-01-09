## 1. Proposal
- [ ] 1.1 Confirm health definitions (OK_EMPTY abnormal; STALE=30d)

## 2. Backend (server-side rendering)
- [ ] 2.1 Compute health state per rss_source using existing fields: enabled, fail_count, backoff_until, last_attempt_at, entries_count, latest_entry_time
- [ ] 2.2 Add server-side KPI aggregation counts for each health state
- [ ] 2.3 Ensure queries remain aggregated (no N+1)

## 3. Admin UI
- [ ] 3.1 Render KPI pills above Catalog(All)
- [ ] 3.2 Add quick filter controls (All / Abnormal / OK / FAIL / BACKOFF / NEVER_TRIED / STALE / OK_EMPTY / DISABLED)
- [ ] 3.3 Add search box for name/url/host/category/source
- [ ] 3.4 Add per-row health badge and expose key fields (last_attempt_at, last_error_reason, backoff_until)

## 4. Tests & Validation
- [ ] 4.1 Add/Update Playwright E2E coverage for admin filters (if test suite already covers admin page)
- [ ] 4.2 Run `npm test`

## 5. Manual Verification
- [ ] 5.1 Rebuild/restart viewer so template/backend changes apply
- [ ] 5.2 Open `/admin/rss-sources` and verify counts match table filtering
- [ ] 5.3 Verify “Abnormal” includes OK_EMPTY and STALE (30d)
