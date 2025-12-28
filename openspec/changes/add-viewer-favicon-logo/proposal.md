# Change: Add viewer favicon/logo from hxlogo.jpg

## Why
The site currently does not explicitly set a favicon/apple-touch-icon, so in browsers (including in-app webviews) the top bar icon may be missing or inconsistent. The user wants to use `hxlogo.jpg` as the site logo shown in the browser UI.

## What Changes
- Add favicon-related `<link>` tags to the viewer HTML template so the browser/webview uses `hxlogo.jpg` as the site icon.
- Reference the asset via `static_prefix` for CDN compatibility.
- Provide cache-busting via `?v={{ asset_rev }}` to reduce “not effective” incidents.

## Impact
- Affected specs:
  - deployment
- Affected code:
  - `trendradar/web/templates/viewer.html`
- Affected assets:
  - `trendradar/web/static/images/hxlogo.jpg` (already present)
