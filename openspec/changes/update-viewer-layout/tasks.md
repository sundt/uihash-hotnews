## 1. Design / Decisions
- [ ] 1.1 Define target layout changes for: header, tabs, cards, modals
- [ ] 1.2 Define theme tokens (colors, radius, shadows) and where they live (CSS variables or existing classes)
- [ ] 1.3 Define mobile breakpoints and stacking rules

## 2. Implementation
- [ ] 2.1 Update `viewer.html` header structure and classes (logo/subtitle/buttons)
- [ ] 2.2 Update category tabs CSS (density + scroll/wrap)
- [ ] 2.3 Update platform card/list CSS (spacing/typography/hover)
- [ ] 2.4 Update modals layout CSS/markup (width/columns/scroll)
- [ ] 2.5 Ensure mobile responsive behavior for header/tabs/cards/modals

## 3. Tests / Verification
- [ ] 3.1 Update/add Playwright assertions for critical layout behavior (tabs responsiveness, modal scroll, key elements visible)
- [ ] 3.2 Run `npm test` locally
- [ ] 3.3 Run `npm run test:prod` after deployment

## 4. Rollback
- [ ] 4.1 Revert CSS/template changes and redeploy using the standard hotfix runbook
