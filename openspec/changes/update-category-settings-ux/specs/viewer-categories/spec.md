# Viewer Categories Specification

## MODIFIED Requirements

### Requirement: Category Settings Entry
The system SHALL provide a category settings entry that is easy to operate for both default categories and custom categories, without changing existing configuration semantics.

#### Scenario: Efficient custom category editing
- **WHEN** user opens the category settings modal
- **THEN** the UI presents custom-category related actions prominently
- **AND** the default category section does not occupy excessive space by default (e.g. collapsed or compact)

---

### Requirement: Platform Selection Interface
The system SHALL provide a platform selection interface that supports efficient bulk selection while keeping existing semantics (selected platform IDs and ordering) unchanged.

#### Scenario: One-screen-first selection (Option A)
- **WHEN** user is creating or editing a category
- **THEN** the platform list is presented in a multi-column grid to maximize on-screen visibility
- **AND** scrolling is minimized, allowing only small scrolling in extreme cases (very large platform counts)

#### Scenario: Quick filtering and bulk actions
- **WHEN** user types in the platform search input
- **THEN** the platform list filters to matching platforms
- **AND** user can perform bulk actions (select all, select none, clear selection)

#### Scenario: Ordering remains supported
- **WHEN** user reorders platforms (drag-and-drop)
- **THEN** the configured platform order is preserved and persisted as before
