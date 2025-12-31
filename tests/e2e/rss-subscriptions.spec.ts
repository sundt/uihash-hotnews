import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('RSS Subscriptions', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);

    await page.addInitScript(() => {
      localStorage.removeItem('rss_subscriptions');
    });

    await page.route('**/api/me/rss-subscriptions', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscriptions: [] }),
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
        const subs = Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscriptions: subs }),
        });
        return;
      }
      await route.fulfill({ status: 405, body: 'Method Not Allowed' });
    });
  });

  test('should gate save by requiring preview entries>0 (entries=0 should not stage subscription)', async ({ page }) => {
    const sourceId = 'rsssrc-123456789abc';
    const feedUrl = 'https://example.com/feed.xml';

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/rss-source-categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: '', name: '全部', count: 1 },
            { id: 'tech', name: 'tech', count: 1 },
          ],
        }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            {
              id: sourceId,
              name: 'Example Feed',
              url: feedUrl,
              host: 'example.com',
              category: 'tech',
              enabled: true,
              created_at: 0,
              updated_at: 0,
            },
          ],
          total: 1,
          limit: 80,
          offset: 0,
          next_offset: null,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: feedUrl,
          final_url: feedUrl,
          content_type: 'application/xml',
          data: {
            format: 'rss',
            feed: { title: 'Example Feed' },
            entries: [],
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 1, results: [] }),
      });
    });

    await viewerPage.goto();

    await expect(page.locator('.category-tabs .category-tab[data-category="rsscol-rss"]')).toHaveCount(0);

    await page.evaluate(() => {
      // UI button removed; keep feature testable via programmatic open.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssSubscriptionModal?.();
    });
    await expect(page.locator('#rssSubscriptionModal')).toBeVisible();

    const saveBtn = page.locator('#rssSubscriptionModal .settings-btn-primary:has-text("保存并刷新")');
    await expect(saveBtn).toBeDisabled();

    await page.locator('button:has-text("选择RSS源")').click();
    await expect(page.locator('#rssSourcePickerModal')).toBeVisible();
    await expect(page.locator('#rssSourceResults .rss-source-item').first()).toBeVisible({ timeout: 15000 });
    await page.locator('#rssSourceResults .rss-source-item').first().click();
    await expect(page.locator('#rssSourcePickerModal')).toBeHidden();

    await page.locator('#rssSubscriptionModal button:has-text("预览")').click();

    await expect(page.locator('#rssSubscriptionList')).not.toContainText(feedUrl);
    await expect(saveBtn).toBeDisabled();
    await expect(page.locator('#rssSubscriptionSaveStatus')).toContainText('entries=0', { timeout: 9000 });
  });

  test('should autofill Feed title when selecting an RSS source', async ({ page }) => {
    const sourceId = 'rsssrc-123456789abc';
    const feedUrl = 'https://example.com/feed.xml';

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated_at: '2030-01-01 00:00:00', categories: {} }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 1, results: [] }),
      });
    });

    await page.route('**/api/rss-source-categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: '', name: '全部', count: 1 },
            { id: 'tech', name: 'tech', count: 1 },
          ],
        }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            {
              id: sourceId,
              name: 'Example Feed',
              url: feedUrl,
              host: 'example.com',
              category: 'tech',
              enabled: true,
              created_at: 0,
              updated_at: 0,
            },
          ],
          total: 1,
          limit: 80,
          offset: 0,
          next_offset: null,
        }),
      });
    });

    await viewerPage.goto();

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssSubscriptionModal?.();
    });
    await expect(page.locator('#rssSubscriptionModal')).toBeVisible();

    await page.locator('button:has-text("选择RSS源")').click();
    await expect(page.locator('#rssSourcePickerModal')).toBeVisible();
    await expect(page.locator('#rssSourceResults .rss-source-item').first()).toBeVisible({ timeout: 15000 });
    await page.locator('#rssSourceResults .rss-source-item').first().click();
    await expect(page.locator('#rssSourcePickerModal')).toBeHidden();

    await expect(page.locator('#rssSelectedSourceId')).toHaveValue(sourceId);
    await expect(page.locator('#rssFeedTitle')).toHaveValue('Example Feed');
  });

  test('should add subscription, preview, refresh, and show RSS category and platform; should appear in category settings platform list', async ({ page }) => {
    const sourceId = 'rsssrc-123456789abc';
    const feedUrl = 'https://example.com/feed.xml';
    const platformId = `rss-${sourceId}`;

    const warmupCalls: Array<{ url: string; body: any }> = [];
    let savedSubs: any[] = [];
    let newsCalls = 0;

    await page.unroute('**/api/me/rss-subscriptions');
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

    await page.route('**/api/news', async (route) => {
      newsCalls += 1;
      const includeRss = savedSubs.length > 0 && newsCalls >= 3;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            nba: {
              name: 'NBA',
              icon: '🏀',
              platforms: includeRss
                ? {
                    [platformId]: {
                      id: platformId,
                      name: 'Example Feed',
                      is_new: false,
                      news: [
                        {
                          stable_id: 'rss-12345678-aaaaaaa1',
                          display_title: 'Item 1',
                          title: 'Item 1',
                          url: 'https://example.com/1',
                          meta: '',
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

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      const bodyRaw = route.request().postData() || '';
      let parsed: any = null;
      try {
        parsed = JSON.parse(bodyRaw);
      } catch (e) {
        parsed = null;
      }
      warmupCalls.push({ url: route.request().url(), body: parsed });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 1, results: [] }),
      });
    });

    await page.route('**/api/rss-source-categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: '', name: '全部', count: 1 },
            { id: 'tech', name: 'tech', count: 1 },
          ],
        }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      const u = new URL(route.request().url());
      const q = u.searchParams.get('q') || '';
      const category = u.searchParams.get('category') || '';
      // For simplicity, always return one matching item.
      if (category && category !== 'tech') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sources: [], total: 0, limit: 80, offset: 0, next_offset: null }),
        });
        return;
      }
      if (q && !'Example Feed'.toLowerCase().includes(q.toLowerCase()) && !feedUrl.toLowerCase().includes(q.toLowerCase())) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sources: [], total: 0, limit: 80, offset: 0, next_offset: null }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            {
              id: sourceId,
              name: 'Example Feed',
              url: feedUrl,
              host: 'example.com',
              category: 'tech',
              enabled: true,
              created_at: 0,
              updated_at: 0,
            },
          ],
          total: 1,
          limit: 80,
          offset: 0,
          next_offset: null,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview?*', async (route) => {
      const u = new URL(route.request().url());
      const sid = u.searchParams.get('source_id') || '';
      if (sid !== sourceId) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'unexpected source_id' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: feedUrl,
          final_url: feedUrl,
          content_type: 'application/xml',
          data: {
            format: 'rss',
            feed: { title: 'Example Feed' },
            entries: [
              { title: 'Item 1', link: 'https://example.com/1', published: 'Tue, 01 Jan 2030 00:00:00 GMT' },
              { title: 'Item 2', link: 'https://example.com/2', published: 'Tue, 01 Jan 2030 00:00:00 GMT' },
            ],
          },
        }),
      });
    });

    await viewerPage.goto();

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssSubscriptionModal?.();
    });
    await expect(page.locator('#rssSubscriptionModal')).toBeVisible();

    await expect(page.locator('#rssSelectedSourceId')).toHaveValue('');
    await expect(page.locator('#rssRequestSection')).toBeHidden();

    await page.locator('button:has-text("选择RSS源")').click();
    await expect(page.locator('#rssSourcePickerModal')).toBeVisible();
    await expect(page.locator('#rssSourceResults')).toBeVisible();

    // Wait for first search page to render and select.
    await expect(page.locator('#rssSourceResults .rss-source-item').first()).toBeVisible({ timeout: 15000 });
    await page.locator('#rssSourceResults .rss-source-item').first().click();
    await expect(page.locator('#rssSourcePickerModal')).toBeHidden();
    await expect(page.locator('#rssSelectedSourceId')).toHaveValue(sourceId);
    await page.locator('#rssSubscriptionModal button:has-text("预览")').click();
    await expect(page.locator('#rssSubscriptionPreview')).toContainText('Example Feed');
    await expect(page.locator('#rssSubscriptionList')).toContainText(feedUrl);

    await page.locator('#rssSubscriptionModal .settings-btn-primary:has-text("保存并刷新")').click();

    await expect(page.locator('#rssSubscriptionList')).toContainText('同步中', { timeout: 5000 });
    await expect(page.locator('#rssSubscriptionSaveStatus')).toContainText(/获取|已订阅/, { timeout: 15000 });
    await expect(page.locator('#rssSubscriptionModal')).toBeHidden({ timeout: 15000 });

    const sawHighWarmup = warmupCalls.some((c) => {
      const ids = Array.isArray(c?.body?.source_ids) ? c.body.source_ids : [];
      const prio = String(c?.body?.priority || '').toLowerCase();
      return ids.includes(sourceId) && prio === 'high';
    });
    expect(sawHighWarmup).toBeTruthy();

    // RSS tab should NOT exist
    await expect(page.locator('.category-tabs .category-tab[data-category="rsscol-rss"]')).toHaveCount(0);

    // RSS platform card should be merged into nba tab
    await expect(page.locator('#tab-nba .platform-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`#tab-nba .platform-card[data-platform="${platformId}"]`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`#tab-nba .platform-card[data-platform="${platformId}"]`)).toContainText('Example Feed');

    await viewerPage.openCategorySettings();

    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });

    await viewerPage.editPanel.locator('#platformSearchInput').fill('Example');
    await expect(viewerPage.editPanel.locator('.platform-select-item').filter({ hasText: 'Example Feed' })).toBeVisible();

    await viewerPage.closeCategorySettings();
  });

  test('should show a bounded "subscribed, content will update later" message when RSS content is not ready within 5 seconds', async ({ page }) => {
    const sourceId = 'rsssrc-123456789abc';
    const feedUrl = 'https://example.com/feed.xml';

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            nba: { name: 'NBA', icon: '🏀', platforms: {} },
          },
        }),
      });
    });

    await page.route('**/api/rss-source-categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: '', name: '全部', count: 1 },
            { id: 'tech', name: 'tech', count: 1 },
          ],
        }),
      });
    });

    await page.route('**/api/rss-sources/search?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            {
              id: sourceId,
              name: 'Example Feed',
              url: feedUrl,
              host: 'example.com',
              category: 'tech',
              enabled: true,
              created_at: 0,
              updated_at: 0,
            },
          ],
          total: 1,
          limit: 80,
          offset: 0,
          next_offset: null,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: feedUrl,
          final_url: feedUrl,
          content_type: 'application/xml',
          data: {
            format: 'rss',
            feed: { title: 'Example Feed' },
            entries: [
              { title: 'Item 1', link: 'https://example.com/1', published: 'Tue, 01 Jan 2030 00:00:00 GMT' },
            ],
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 1, results: [{ queued: true, source_id: sourceId }] }),
      });
    });

    await viewerPage.goto();

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).openRssSubscriptionModal?.();
    });
    await expect(page.locator('#rssSubscriptionModal')).toBeVisible();

    await page.locator('button:has-text("选择RSS源")').click();
    await expect(page.locator('#rssSourcePickerModal')).toBeVisible();
    await expect(page.locator('#rssSourceResults .rss-source-item').first()).toBeVisible({ timeout: 15000 });
    await page.locator('#rssSourceResults .rss-source-item').first().click();
    await expect(page.locator('#rssSourcePickerModal')).toBeHidden();

    await page.locator('#rssSubscriptionModal button:has-text("预览")').click();
    await expect(page.locator('#rssSubscriptionList')).toContainText(feedUrl);

    await page.locator('#rssSubscriptionModal .settings-btn-primary:has-text("保存并刷新")').click();

    await expect(page.locator('#rssSubscriptionList')).toContainText('同步中', { timeout: 5000 });
    await expect(page.locator('#rssSubscriptionSaveStatus')).toContainText('已订阅，内容稍后更新', { timeout: 9000 });
    await expect(page.locator('#rssSubscriptionList')).not.toContainText('同步中', { timeout: 9000 });
    await expect(page.locator('#rssSubscriptionModal')).toBeHidden({ timeout: 12000 });
  });

  test('manual refresh should be bounded for RSS (warmup + rss-news)', async ({ page }) => {
    const subs = Array.from({ length: 60 }).map((_, i) => {
      return {
        source_id: `rsssrc-${String(i).padStart(12, '0')}`,
        url: `https://example.com/${i}.xml`,
        feed_title: '',
        column: 'general',
        platform_id: ''
      };
    });

    await page.addInitScript((payload) => {
      localStorage.setItem('rss_subscriptions', JSON.stringify(payload));
    }, subs);

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            nba: { name: 'NBA', icon: '🏀', platforms: {} },
          },
        }),
      });
    });

    let warmupCalls = 0;
    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      warmupCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 0, results: [] }),
      });
    });

    await viewerPage.goto();

    const elapsedPromise = page.evaluate(async () => {
      const t0 = Date.now();
      await (window as any).refreshViewerData({ preserveScroll: true });
      return Date.now() - t0;
    });
    const elapsedMs = await elapsedPromise;
    expect(elapsedMs).toBeLessThan(1500);

    expect(warmupCalls).toBe(0);
  });
});
