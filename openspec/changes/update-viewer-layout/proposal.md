# Change: Refresh viewer layout and visual theme

## Why
The current viewer UI needs a cohesive visual refresh and better information density across header, tabs, cards, modals, and mobile breakpoints.

## What Changes
- Update header layout (logo, subtitle, button arrangement) for clearer hierarchy and spacing.
- Update category tabs styling and behavior (density, scroll/wrap) to improve navigation.
- Refine platform cards/list styling (spacing, typography, hover states) to improve readability.
- Improve settings/RSS modals layout (width, columns, scroll behavior) for usability.
- Improve mobile responsiveness (breakpoints, layout stacking) for small screens.
- Unify theme tokens (colors, radius, shadows) for consistent visual language.

## Impact
- Affected specs:
  - viewer-ui
- Affected code:
  - `trendradar/web/templates/viewer.html`
  - `trendradar/web/templates/_viewer_modals.html`
  - `trendradar/web/static/css/viewer.css`
  - (potentially) `trendradar/web/static/js/viewer.bundle.js` and `trendradar/web/static/js/src/*` if layout behavior requires JS changes
