## 1. Implementation
- [ ] 1.1 Update `trendradar/web/templates/viewer.html` to include favicon / app icon `<link>` tags
- [ ] 1.2 Use `static_prefix` + `?v={{ asset_rev }}` so the icon works with/without CDN and reduces cache issues
- [ ] 1.3 (Optional) If a vector source is provided, add an SVG favicon for supporting browsers; keep PNG/JPG fallback for WebViews

## 2. Verification
- [ ] 2.1 Load `/viewer?ts=<now>` and confirm the browser tab / in-app webview shows the new icon
- [ ] 2.2 Run Playwright `@prod` smoke (or add a small assertion if needed)

## 3. Rollback
- [ ] 3.1 Revert `viewer.html` favicon links and redeploy using the standard hotfix runbook
