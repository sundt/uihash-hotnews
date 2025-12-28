## ADDED Requirements

### Requirement: Viewer favicon configuration
The system SHALL configure the viewer page to provide a site icon (favicon / touch icon) that is consistently displayed in common browsers and in-app webviews.

#### Scenario: Standard favicon
- **WHEN** the viewer HTML is loaded
- **THEN** the page SHALL include a `rel="icon"` link to a static asset served via `static_prefix`

#### Scenario: Cache-busted asset
- **WHEN** the viewer HTML is rendered
- **THEN** the icon URL SHALL include `?v={{ asset_rev }}` to reduce stale caching

#### Scenario: iOS/WeChat webview compatibility
- **WHEN** the viewer is opened in iOS Safari or common in-app webviews
- **THEN** the page SHALL include an `apple-touch-icon` (PNG/JPG) fallback

### Requirement: Rollback
The system SHALL provide a rollback procedure for favicon changes.

#### Scenario: Revert icon links
- **WHEN** the favicon change causes issues
- **THEN** operators SHALL revert the viewer template changes and redeploy using the standard hotfix runbook
