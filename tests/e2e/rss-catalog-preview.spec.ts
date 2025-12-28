import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';
import fs from 'fs';
import path from 'path';

function _pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ensureViewerOutputFixture() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = _pad2(now.getMonth() + 1);
  const dd = _pad2(now.getDate());
  const iso = `${yyyy}-${mm}-${dd}`;
  const zh = `${yyyy}年${mm}月${dd}日`;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const outDir = path.join(repoRoot, 'output');

  const content = `weibo | 微博\n1. Hello World [URL:https://example.com]\n`;

  for (const folder of [iso, zh]) {
    const txtDir = path.join(outDir, folder, 'txt');
    fs.mkdirSync(txtDir, { recursive: true });
    const fp = path.join(txtDir, 'e2e-fixture.txt');
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, content, 'utf-8');
    }
  }
}

test.describe('RSS Catalog Preview', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);

    await page.addInitScript(() => {
      localStorage.removeItem('rss_subscriptions');
      localStorage.removeItem('rss_catalog_preview_seen_v1');
      localStorage.removeItem('trendradar_categories_config');
      localStorage.removeItem('category_settings_badge_dismissed');
      localStorage.removeItem('rss_subscription_badge_dismissed');
    });

    await page.route('**/api/me/rss-subscriptions', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not allowlisted' }),
      });
    });
  });

  test('should open preview modal, load 4 sources sequentially, allow add-to-pending and save', async ({ page }) => {
    ensureViewerOutputFixture();
    const sources = [
      { id: 'rsssrc-a', name: 'Feed A', url: 'https://a.example.com/feed.xml', host: 'a.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 4 },
      { id: 'rsssrc-b', name: 'Feed B', url: 'https://b.example.com/feed.xml', host: 'b.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 3 },
      { id: 'rsssrc-c', name: 'Feed C', url: 'https://c.example.com/feed.xml', host: 'c.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 2 },
      { id: 'rsssrc-d', name: 'Feed D', url: 'https://d.example.com/feed.xml', host: 'd.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 1 },
    ];

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/subscriptions/rss-news*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            'rsscol-rss': {
              name: 'RSS',
              icon: '📰',
              platforms: {
                'rss-rsssrc-a': {
                  name: 'Feed A',
                  news: [
                    {
                      title: 'A1',
                      display_title: 'A1',
                      url: 'https://a.example.com/a1',
                      meta: '',
                      stable_id: 'id-a1',
                    },
                  ],
                },
              },
            },
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      // First call returns 4 sources.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources,
          total: sources.length,
          limit: 50,
          offset: 0,
          next_offset: null,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview?*', async (route) => {
      const url = route.request().url();
      const u = new URL(url);
      const sid = u.searchParams.get('source_id') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://${sid}.example.com/feed.xml`,
          final_url: `https://${sid}.example.com/feed.xml`,
          content_type: 'application/xml',
          data: {
            format: 'rss',
            feed: { title: sid.toUpperCase() },
            entries: Array.from({ length: 25 }).map((_, i) => ({
              title: `${sid}-title-${i + 1}`,
              link: `https://${sid}.example.com/${i + 1}`,
            })),
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 4, results: [] }),
      });
    });

    await viewerPage.goto();

    await page.locator('button.category-settings-btn:has-text("预览RSS")').click();
    await expect(page.locator('#rssCatalogPreviewModal')).toBeVisible();

    await expect(page.locator('#rssCatalogPreviewStatus')).toContainText('已加载', { timeout: 15000 });

    // 4 cards rendered
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(4, { timeout: 15000 });

    // Each card shows up to 20 entries
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card').first().locator('.news-item')).toHaveCount(20);

    // Add first source into pending
    const firstAddBtn = page
      .locator('#rssCatalogPreviewGrid .platform-card')
      .first()
      .locator('button:has-text("加入待保存")');
    await firstAddBtn.click();

    // Save and refresh
    await page.locator('#rssCatalogPreviewModal button:has-text("保存并刷新")').click();

    // The RSS category/platform should appear after refresh
    const rssTab = page.locator('.category-tabs .category-tab[data-category^="rsscol-"]');
    await expect(rssTab.first()).toBeVisible({ timeout: 20000 });
    await rssTab.first().click();
    await expect(page.locator(`.platform-card[data-platform="rss-rsssrc-a"]`)).toBeVisible({ timeout: 15000 });
  });

  test('should not repeat already seen sources within 24h unless reset', async ({ page }) => {
    ensureViewerOutputFixture();
    const page1 = [
      { id: 'rsssrc-a', name: 'Feed A', url: 'https://a.example.com/feed.xml', host: 'a.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 6 },
      { id: 'rsssrc-b', name: 'Feed B', url: 'https://b.example.com/feed.xml', host: 'b.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 5 },
      { id: 'rsssrc-c', name: 'Feed C', url: 'https://c.example.com/feed.xml', host: 'c.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 4 },
      { id: 'rsssrc-d', name: 'Feed D', url: 'https://d.example.com/feed.xml', host: 'd.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 3 },
    ];
    const page2 = [
      { id: 'rsssrc-e', name: 'Feed E', url: 'https://e.example.com/feed.xml', host: 'e.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 2 },
      { id: 'rsssrc-f', name: 'Feed F', url: 'https://f.example.com/feed.xml', host: 'f.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 1 },
      { id: 'rsssrc-g', name: 'Feed G', url: 'https://g.example.com/feed.xml', host: 'g.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 0 },
      { id: 'rsssrc-h', name: 'Feed H', url: 'https://h.example.com/feed.xml', host: 'h.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 0 },
    ];

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/subscriptions/rss-news*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      const reqUrl = new URL(route.request().url());
      const offsetStr = reqUrl.searchParams.get('offset') || '0';
      const offset = parseInt(offsetStr, 10) || 0;
      const sources = offset <= 0 ? page1 : page2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources,
          total: 8,
          limit: 50,
          offset,
          next_offset: null,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview?*', async (route) => {
      const url = route.request().url();
      const u = new URL(url);
      const sid = u.searchParams.get('source_id') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://${sid}.example.com/feed.xml`,
          final_url: `https://${sid}.example.com/feed.xml`,
          content_type: 'application/xml',
          data: {
            format: 'rss',
            feed: { title: sid },
            entries: Array.from({ length: 5 }).map((_, i) => ({
              title: `${sid}-title-${i + 1}`,
              link: `https://${sid}.example.com/${i + 1}`,
            })),
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 4, results: [] }),
      });
    });

    await viewerPage.goto();

    await page.locator('button.category-settings-btn:has-text("预览RSS")').click();
    await expect(page.locator('#rssCatalogPreviewModal')).toBeVisible();

    await expect(page.locator('#rssCatalogPreviewStatus')).toContainText('已加载', { timeout: 15000 });

    // First batch shows A-D
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(4);
    const firstBatchText = await page.locator('#rssCatalogPreviewGrid').innerText();
    expect(firstBatchText).toContain('rsssrc-a');
    expect(firstBatchText).toContain('rsssrc-d');

    // Next batch should show E-H (no repeats)
    await page.locator('#rssCatalogPreviewModal button:has-text("换一批")').click();
    await expect(page.locator('#rssCatalogPreviewStatus')).toContainText('已加载', { timeout: 15000 });
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(4);
    const secondBatchText = await page.locator('#rssCatalogPreviewGrid').innerText();
    expect(secondBatchText).toContain('rsssrc-e');
    expect(secondBatchText).toContain('rsssrc-h');
    expect(secondBatchText).not.toContain('rsssrc-a');

    // Reset seen and it should start from A-D again
    await page.locator('#rssCatalogPreviewModal button:has-text("重置已浏览")').click();
    await expect(page.locator('#rssCatalogPreviewStatus')).toContainText('已加载', { timeout: 15000 });
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(4);
    const afterResetText = await page.locator('#rssCatalogPreviewGrid').innerText();
    expect(afterResetText).toContain('rsssrc-a');
  });
});
