# Change: Add Fetch Metrics Change Detection (content_hash / changed_count)

## Why
The current `/api/fetch-metrics` endpoint can report whether a fetch is `success` or `cache`, but it cannot answer the key question: **did the content actually change**. This makes it difficult to measure true update frequency and distinguish real updates from cached or unchanged results.

## What Changes
- Add `content_hash` to each metric record to represent the fetched content snapshot for that platform.
- Add `changed_count` to each metric record to estimate how many items are new vs the previous snapshot for the same platform.
- Extend `/api/fetch-metrics` summary aggregation to include:
  - `avg_changed_count`
  - `last_changed_count`
  - `last_content_hash`

## Impact
- Affected specs:
  - `news-viewer`
- Affected code:
  - `hotnews/crawler/fetcher.py` (derive content key list/hash from upstream response)
  - `hotnews/web/server.py` (persist last snapshot per platform and compute `changed_count`; include fields in response)
- Backwards compatibility:
  - Existing fields remain unchanged.
  - New fields are additive and optional for clients.
