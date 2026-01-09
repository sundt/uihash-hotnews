## ADDED Requirements

### Requirement: Admin RSS catalog health classification
The system SHALL classify each RSS source in the Admin Catalog(All) into a health state derived from runtime fetch fields and content freshness.

#### Scenario: Classify disabled sources
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=0`
- **THEN** the system MUST classify the source as `DISABLED`

#### Scenario: Classify sources in backoff
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=1`
- **AND** `backoff_until` is greater than the current time
- **THEN** the system MUST classify the source as `BACKOFF`

#### Scenario: Classify failing sources
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=1`
- **AND** `fail_count>0`
- **AND** `backoff_until` is not greater than the current time
- **THEN** the system MUST classify the source as `FAIL`

#### Scenario: Classify never-tried sources
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=1`
- **AND** `last_attempt_at=0`
- **THEN** the system MUST classify the source as `NEVER_TRIED`

#### Scenario: Classify empty-but-successful sources as abnormal
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=1`
- **AND** `fail_count=0`
- **AND** `last_attempt_at>0`
- **AND** the source has no stored entries (`entries_count=0`)
- **THEN** the system MUST classify the source as `OK_EMPTY`
- **AND** the system MUST treat `OK_EMPTY` as abnormal

#### Scenario: Classify stale sources as abnormal
- **WHEN** an admin views the RSS Catalog(All)
- **AND** a source has `enabled=1`
- **AND** the source has a latest entry time
- **AND** the latest entry time is older than 30 days
- **THEN** the system MUST classify the source as `STALE`
- **AND** the system MUST treat `STALE` as abnormal

### Requirement: Admin RSS catalog health KPI and filtering
The system SHALL provide KPI summary counts and quick filters on `/admin/rss-sources` to quickly focus on abnormal sources.

#### Scenario: Admin views health KPI counts
- **WHEN** an admin opens `/admin/rss-sources`
- **THEN** the page MUST display KPI counts for at least: `OK`, `FAIL`, `BACKOFF`, `NEVER_TRIED`, `OK_EMPTY`, `STALE`, `DISABLED`

#### Scenario: Admin filters abnormal sources
- **WHEN** an admin selects an `Abnormal` filter
- **THEN** the catalog view MUST show only sources whose health state is one of: `FAIL`, `BACKOFF`, `NEVER_TRIED`, `OK_EMPTY`, `STALE`

#### Scenario: Admin searches catalog
- **WHEN** an admin enters a search query
- **THEN** the catalog view MUST filter sources by matching the query against at least: name, url, host, category, source
