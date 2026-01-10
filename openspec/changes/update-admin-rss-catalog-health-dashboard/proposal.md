# Change: update-admin-rss-catalog-health-dashboard

## Why
The `/admin/rss-sources` page currently renders a large RSS catalog table without clear health status signals. Operators cannot quickly identify which sources are healthy vs unhealthy, nor focus remediation on the small subset of problematic sources.

## What Changes
- Add **health state classification** for each RSS source in the admin catalog view.
- Add **KPI summary** counts (OK / FAIL / BACKOFF / NEVER_TRIED / OK_EMPTY / STALE / DISABLED) at the top of the catalog.
- Add **quick filters** to show only problematic sources (default: show all, with one-click “only abnormal”).
- Add **search** to filter the catalog by name / url / host / category / source.

## Health Definitions (Admin)
A source is considered **abnormal** if it matches any of:
- `OK_EMPTY` (entries=0 after at least one attempt)
- `FAIL` (fail_count>0)
- `BACKOFF` (backoff_until > now)
- `NEVER_TRIED` (last_attempt_at=0)
- `STALE` (latest_entry_time older than 30 days)

`STALE` threshold: 30 days.

## Impact
- Affected specs: admin-rss-sources
- Affected code:
  - `hotnews/web/rss_admin.py`
  - `hotnews/web/templates/admin_rss_sources.html`
  - (optional) E2E tests for the admin page

## Verification
- After implementing this change, the viewer MUST be rebuilt/restarted to apply template/backend changes.
- The implementer MUST manually verify the `/admin/rss-sources` page behaviors (KPI counts, quick filters, search) after restart.

## Non-Goals
- Do not change RSS fetching/parsing logic.
- Do not add new authentication methods; reuse existing admin token gate.
- Do not redesign the admin UI styling; keep changes minimal and functional.

## Risks
- Admin page render time could increase if health stats add heavy queries; keep queries aggregated and avoid per-row N+1 patterns.

## Rollback
- Revert the change to restore the previous admin page behavior.
