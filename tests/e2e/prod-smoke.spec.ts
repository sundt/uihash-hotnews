import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('@prod Smoke', () => {
  test.describe.configure({ timeout: 60_000 });

  test('index.html should be reachable', async ({ page }) => {
    const resp = await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    expect(resp?.ok()).toBeTruthy();

    // /index.html is expected to be reachable; environments may either redirect to /
    // or serve the viewer content directly at /index.html.
    await expect(page).toHaveURL(/\/(?:$|\?|index\.html(?:$|\?))/);

    await expect(page).toHaveTitle(/Hotnews|热点新闻/);
    await expect(page.locator('.category-tabs .category-tab').first()).toBeVisible();
  });

  test('viewer NBA should expand beyond 20 items', async ({ page }) => {
    const viewerPage = new ViewerPage(page);
    await viewerPage.goto();

    const sportsTab = page.locator('.category-tab[data-category="sports"]');
    if ((await sportsTab.count()) === 0) return;
    await sportsTab.click();

    const card = page.locator('#tab-sports .platform-card[data-platform="nba-schedule"]');
    if ((await card.count()) === 0) return;

    const sentinel = card.locator('.news-load-sentinel');
    if ((await sentinel.count()) === 0) return;
    await sentinel.scrollIntoViewIfNeeded();

    const visible = card.locator('.news-item:not(.paged-hidden)');
    await expect.poll(async () => await visible.count(), { timeout: 45_000 }).toBeGreaterThan(0);

    // Trigger another lazy-load cycle so paging window can exceed 20
    await sentinel.scrollIntoViewIfNeeded();
    await expect.poll(async () => await visible.count(), { timeout: 45_000 }).toBeGreaterThan(20);
  });
});
