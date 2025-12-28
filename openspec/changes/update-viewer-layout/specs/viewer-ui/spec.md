## ADDED Requirements

### Requirement: Unified viewer theme
The system SHALL apply a cohesive visual theme across the viewer page, including consistent colors, border radius, and shadows.

#### Scenario: Consistent theme tokens
- **WHEN** the viewer page renders the header, tabs, cards, and modals
- **THEN** the UI SHALL use a consistent set of theme tokens for colors, radius, and shadows

### Requirement: Header layout
The system SHALL present a header layout that clearly separates branding (logo/title/subtitle) from actions (buttons/search) and remains usable on small screens.

#### Scenario: Desktop header layout
- **WHEN** the viewer is opened on a desktop viewport
- **THEN** logo/title/subtitle and action controls SHALL not overlap

#### Scenario: Mobile header stacking
- **WHEN** the viewer is opened on a small viewport
- **THEN** header elements SHALL stack or wrap so that primary actions remain accessible without horizontal overflow

### Requirement: Category tabs navigation
The system SHALL provide category tabs that remain navigable on both wide and narrow viewports.

#### Scenario: Dense tabs on desktop
- **WHEN** the viewer is opened on a desktop viewport
- **THEN** tabs SHALL use compact spacing while remaining readable

#### Scenario: Tabs on mobile
- **WHEN** the viewer is opened on a small viewport
- **THEN** tabs SHALL support horizontal scrolling or wrapping without breaking layout

### Requirement: Platform cards readability
The system SHALL style platform cards and their news list to improve readability and scanability.

#### Scenario: Card information density
- **WHEN** the viewer renders platform cards
- **THEN** typography and spacing SHALL support scanning titles without excessive whitespace

#### Scenario: Hover affordance
- **WHEN** the user hovers a news item or card element (desktop)
- **THEN** the UI SHALL provide a subtle hover state that does not shift layout

### Requirement: Settings and RSS modals usability
The system SHALL provide modals (settings/RSS) with appropriate max width and scrolling behavior.

#### Scenario: Modal width
- **WHEN** a modal is opened on desktop
- **THEN** the modal SHALL use a max width appropriate for its content without forcing horizontal scrolling

#### Scenario: Modal scrolling
- **WHEN** a modal contains content exceeding the viewport height
- **THEN** the modal body SHALL scroll while keeping the header accessible
