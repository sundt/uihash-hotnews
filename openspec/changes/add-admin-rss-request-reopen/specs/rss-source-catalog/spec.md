## ADDED Requirements

### Requirement: Admin can reopen rejected RSS source requests
The system SHALL allow an admin to reset an RSS source request from `rejected` to `pending`.

#### Scenario: Admin reopens a rejected request
- **GIVEN** an RSS source request exists with status `rejected`
- **WHEN** an admin triggers "Reopen" for that request
- **THEN** the request status becomes `pending`
- **AND** the request `reason` is cleared
- **AND** the request `reviewed_at` is reset to 0

#### Scenario: Admin cannot reopen non-rejected requests
- **GIVEN** an RSS source request exists with status `pending` or `approved`
- **WHEN** an admin triggers "Reopen" for that request
- **THEN** the system rejects the operation
