import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('@prod Smoke', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(() => {
    const baseUrl = (process.env.BASE_URL || '').trim();
    if (baseUrl !== 'https://hot.uihash.com') {
      test.skip(true, 'prod smoke tests only run against production BASE_URL');
    }
  });

  test('index.html should be reachable', async ({ page }) => {
    const resp = await page.goto('/index.html');
    expect(resp?.ok()).toBeTruthy();

    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Hotnews|热点新闻/);

    const viewerReady = page.locator('body.categories-ready');
    const legacyIndex = page.locator('.container');

    if (await viewerReady.count()) {
      await expect(page.locator('.category-tabs .category-tab').first()).toBeVisible();
    } else {
      await expect(legacyIndex).toBeVisible();
    }
  });

  test('viewer NBA should expand beyond 20 items', async ({ page }) => {
    const viewerPage = new ViewerPage(page);
    await viewerPage.goto();

    const sportsTab = page.locator('.category-tab[data-category="sports"]');
    if ((await sportsTab.count()) === 0) return;
    await sportsTab.click();

    const card = page.locator('#tab-sports .platform-card[data-platform="nba-schedule"]');
    if ((await card.count()) === 0) return;

    const visible = card.locator('.news-item:not(.paged-hidden)');
    await expect.poll(async () => await visible.count(), { timeout: 45_000 }).toBeGreaterThan(20);
  });
});
