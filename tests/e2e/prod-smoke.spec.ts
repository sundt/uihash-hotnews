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

  test('viewer NBA should not expand beyond 20 items', async ({ page }) => {
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

    // Trigger another lazy-load cycle; count should still be capped to 20
    await sentinel.scrollIntoViewIfNeeded();
    await expect.poll(async () => await visible.count(), { timeout: 45_000 }).toBeLessThanOrEqual(20);
  });

  test('RSS source picker layout should be compact', async ({ page }) => {
    await page.goto(`/viewer?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });
    await expect(page.locator('.category-tabs .category-tab').first()).toBeVisible({ timeout: 15000 });

    // Open RSS subscription modal
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssSubscriptionModal?.();
    });
    const rssModal = page.locator('#rssSubscriptionModal');
    await rssModal.waitFor({ state: 'visible' });

    // Open RSS source picker modal
    await rssModal.locator('button:has-text("选择RSS源")').click();
    const picker = page.locator('#rssSourcePickerModal');
    await picker.waitFor({ state: 'visible' });

    // Assert left category column uses compact width
    const leftCol = picker.locator('.settings-modal-body > div').first();
    const leftStyle = await leftCol.getAttribute('style');
    expect(leftStyle || '').toContain('width:150px');

    // Footer should be removed so the content can use all available space.
    await expect(picker.locator('.settings-modal-footer')).toHaveCount(0);

    // Results should use flex to fill remaining vertical space (not a fixed height).
    const resultsStyle = await picker.locator('#rssSourceResults').getAttribute('style');
    expect(resultsStyle || '').toContain('flex:1');
    expect(resultsStyle || '').toContain('min-height:0');
    expect(resultsStyle || '').not.toContain('height:360px');

    // Wait for at least one source item and verify name+url are on the same line.
    const firstItem = picker.locator('#rssSourceResults .rss-source-item').first();
    await expect.poll(async () => await firstItem.count(), { timeout: 30_000 }).toBeGreaterThan(0);

    const spans = firstItem.locator('span');
    await expect(spans).toHaveCount(3);

    const nameBox = await spans.nth(0).boundingBox();
    const urlBox = await spans.nth(2).boundingBox();
    expect(nameBox).toBeTruthy();
    expect(urlBox).toBeTruthy();
    expect(Math.abs((nameBox?.y || 0) - (urlBox?.y || 0))).toBeLessThan(6);
  });

  test('viewer sets favicon', async ({ page }) => {
    // bypass nginx cache
    await page.goto(`/viewer?ts=${Date.now()}`);

    const icon = page.locator('head link[rel="icon"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('href', /\/images\/hxlogo\.jpg\?v=/);
  });
});
