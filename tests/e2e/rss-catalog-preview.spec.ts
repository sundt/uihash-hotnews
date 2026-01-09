import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('RSS Catalog Preview', () => {
  let viewerPage: ViewerPage;
  let savedSubs: any[];

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    viewerPage = new ViewerPage(page);

    savedSubs = [];

    await page.addInitScript(() => {
      localStorage.removeItem('rss_subscriptions');
      localStorage.removeItem('trendradar_categories_config');
      localStorage.removeItem('category_settings_badge_dismissed');
      localStorage.removeItem('rss_subscription_badge_dismissed');
      localStorage.removeItem('trendradar_explore_seen_sources_v1');
      localStorage.removeItem('trendradar_explore_last_source_v1');
    });

    await page.route('**/api/me/rss-subscriptions', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscriptions: savedSubs }),
        });
        return;
      }
      if (method === 'PUT') {
        const bodyRaw = route.request().postData() || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(bodyRaw);
        } catch (e) {
          parsed = null;
        }
        savedSubs = Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscriptions: savedSubs }),
        });
        return;
      }
      await route.fulfill({ status: 405, body: 'Method Not Allowed' });
    });
  });

  test('should open preview modal, show single card, allow next/prev, add-to-pending and save', async ({ page }) => {
    const sources = [
      { id: 'rsssrc-a', name: 'Feed A', url: 'https://a.example.com/feed.xml', host: 'a.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 4 },
      { id: 'rsssrc-b', name: 'Feed B', url: 'https://b.example.com/feed.xml', host: 'b.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 3 },
      { id: 'rsssrc-c', name: 'Feed C', url: 'https://c.example.com/feed.xml', host: 'c.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 2 },
      { id: 'rsssrc-d', name: 'Feed D', url: 'https://d.example.com/feed.xml', host: 'd.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 1 },
    ];

    let newsCalls = 0;
    let includeRssOnNextNews = false;
    await page.route('**/api/news', async (route) => {
      newsCalls += 1;
      const includeRss = savedSubs.length > 0 && (includeRssOnNextNews || newsCalls >= 2);
      if (includeRssOnNextNews && includeRss) {
        includeRssOnNextNews = false;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            general: {
              id: 'general',
              name: '综合新闻',
              icon: '📰',
              platforms: includeRss
                ? {
                    'rss-rsssrc-a': {
                      id: 'rss-rsssrc-a',
                      name: 'Feed A',
                      is_new: false,
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
                  }
                : {},
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
      const entryDate = '2025-12-29T10:11:00+08:00';
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
              published: entryDate,
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

    await page.waitForFunction(() => typeof (window as any).openRssCatalogPreviewModal === 'function');
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssCatalogPreviewModal();
    });
    await expect(page.locator('#rssCatalogPreviewModal')).toBeVisible();

    // Single card rendered
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(1, { timeout: 15000 });

    // Each card shows 15 rows (padded with placeholders when needed)
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card').first().locator('.news-item')).toHaveCount(15);

    // Next goes to another card
    const title = page.locator('#rssCatalogPreviewGrid .rss-preview-title-text');
    await expect(title).toBeVisible({ timeout: 15000 });
    const firstTitle = await title.innerText();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(1);
    await expect(title).not.toHaveText(firstTitle, { timeout: 15000 });

    // Prev goes back
    await page.keyboard.press('ArrowLeft');
    await expect(title).toHaveText(firstTitle, { timeout: 15000 });

    // Add to category via dropdown (immediate persistence)
    const dropdown = page.locator('#rssCatalogPreviewGrid select[data-action="add-category"]').first();
    await expect(dropdown).toBeVisible();
    const pickedCatId = await dropdown.evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const opts = Array.from(sel.options || []);
      const generalOpt = opts.find((o) => {
        const v = String(o.value || '');
        const t = String(o.textContent || '');
        return v === 'general' || v.endsWith(':general') || t.includes('综合');
      });
      if (generalOpt && typeof generalOpt.value === 'string' && generalOpt.value) return generalOpt.value;
      const firstValueOpt = opts.find((o) => typeof o.value === 'string' && o.value);
      return firstValueOpt ? firstValueOpt.value : '';
    });
    expect(pickedCatId).not.toBe('');
    const saveResp = page.waitForResponse('**/api/me/rss-subscriptions', { timeout: 20000 });
    await dropdown.selectOption(pickedCatId);
    await saveResp;
    includeRssOnNextNews = true;

    const tabId = pickedCatId.replace(/^(default:|custom:)/, '');

    // Subscription should be persisted after save
    const subs = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('rss_subscriptions') || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    });
    expect(subs.some((s: any) => String(s?.source_id || s?.rss_source_id || '').trim() === 'rsssrc-a')).toBeTruthy();

    // Close preview modal before interacting with main page tabs
    await page.locator('#rssCatalogPreviewModal .settings-modal-close').click();
    await expect(page.locator('#rssCatalogPreviewModal')).toBeHidden({ timeout: 15000 });

    // Add-to-category only saves subscriptions now; trigger a manual refresh so /api/news is re-fetched.
    const refreshResp = page.waitForResponse(async (resp) => {
      try {
        if (!resp.url().includes('/api/news')) return false;
        const data = await resp.json().catch(() => null);
        const platforms = (data as any)?.categories?.general?.platforms || {};
        return !!platforms?.['rss-rsssrc-a'];
      } catch (e) {
        return false;
      }
    }, { timeout: 20000 });
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).refreshViewerData?.({ preserveScroll: true });
    });
    await refreshResp;

    // RSS tab should NOT exist
    await expect(page.locator('.category-tabs .category-tab[data-category="rsscol-rss"]')).toHaveCount(0);

    // RSS platform card should be merged into the chosen category tab
    await page.locator(`.category-tabs .category-tab[data-category="${tabId}"]`).click();
    await expect(page.locator(`#tab-${tabId} .platform-card[data-platform="rss-rsssrc-a"]`)).toBeVisible({ timeout: 20000 });
  });

  test('should support keyboard navigation and looping', async ({ page }) => {
    const sources = [
      { id: 'rsssrc-a', name: 'Feed A', url: 'https://a.example.com/feed.xml', host: 'a.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 6 },
      { id: 'rsssrc-b', name: 'Feed B', url: 'https://b.example.com/feed.xml', host: 'b.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 5 },
      { id: 'rsssrc-c', name: 'Feed C', url: 'https://c.example.com/feed.xml', host: 'c.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 4 },
    ];

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
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
      const entryDate = '2025-12-29T10:11:00+08:00';
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
              published: entryDate,
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

    await page.waitForFunction(() => typeof (window as any).openRssCatalogPreviewModal === 'function');
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssCatalogPreviewModal();
    });
    await expect(page.locator('#rssCatalogPreviewModal')).toBeVisible();

    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(1);

    const title = page.locator('#rssCatalogPreviewGrid .rss-preview-title-text');
    await expect(title).toContainText('rsssrc-a', { timeout: 15000 });

    const firstText = await page.locator('#rssCatalogPreviewGrid').innerText();
    await page.keyboard.press('ArrowRight');
    await expect(title).toContainText('rsssrc-b', { timeout: 15000 });

    await page.keyboard.press('ArrowLeft');
    await expect(title).toContainText('rsssrc-a', { timeout: 15000 });
    const thirdText = await page.locator('#rssCatalogPreviewGrid').innerText();
    expect(thirdText).toEqual(firstText);

    // Space behaves like next
    await page.keyboard.press('Space');
    await expect(title).toContainText('rsssrc-b', { timeout: 15000 });

    // Looping: go prev from first -> last
    await page.keyboard.press('ArrowLeft');
    await expect(title).toContainText('rsssrc-a', { timeout: 15000 });
    await page.keyboard.press('ArrowLeft');
    await expect(title).toContainText('rsssrc-c', { timeout: 15000 });
  });
});
