## MODIFIED Requirements

### Requirement: RSS proxy fetch resilience
The system SHALL improve RSS proxy fetch stability without using evasive techniques.

#### Scenario: Add non-evasive default headers
- **WHEN** the RSS proxy fetches an upstream feed
- **THEN** the request includes a reasonable `Accept-Language` header by default
- **AND** the request uses a stable `User-Agent` (optionally configurable)
- **AND** the system does not forge `Referer` by default

#### Scenario: Use connect/read timeouts
- **WHEN** the RSS proxy fetches an upstream feed
- **THEN** the system uses separate connect and read timeouts

#### Scenario: Log likely blocking / rate limiting
- **WHEN** the upstream response status is 403, 429, or 503
- **THEN** the system logs a message indicating the request may be blocked or rate limited

#### Scenario: Retry is bounded and conservative
- **WHEN** the RSS proxy encounters retryable failures (timeout/connection error/429/5xx)
- **THEN** the system retries with backoff and a bounded maximum attempt count
- **AND** the system does not perform retry flooding
