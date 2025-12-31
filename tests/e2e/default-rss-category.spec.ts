import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('Default RSS Category', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);

    await page.addInitScript(() => {
      localStorage.removeItem('rss_subscriptions');
      localStorage.removeItem('category_settings_badge_dismissed');
      localStorage.removeItem('rss_subscription_badge_dismissed');
      localStorage.removeItem('trendradar_explore_seen_sources_v1');
      localStorage.removeItem('trendradar_explore_last_source_v1');

      // Force client refresh path so /api/news stubs are used.
      localStorage.setItem(
        'trendradar_categories_config',
        JSON.stringify({
          version: 1,
          customCategories: [],
          hiddenDefaultCategories: [],
          categoryOrder: ['nba'],
          platformOrder: {},
          categoryFilters: {},
        })
      );
    });

    let savedSubs: any[] = [];
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

  test('should not show RSS tab, but preview RSS can add subscription and persist', async ({ page }) => {
    const sources = [
      { id: 'rsssrc-a', name: 'Feed A', url: 'https://a.example.com/feed.xml', host: 'a.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 4 },
      { id: 'rsssrc-b', name: 'Feed B', url: 'https://b.example.com/feed.xml', host: 'b.example.com', category: 'tech', enabled: true, created_at: 0, updated_at: 3 },
    ];

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            nba: {
              id: 'nba',
              name: 'NBA',
              icon: '🏀',
              platforms: {
                'rss-rsssrc-a': {
                  id: 'rss-rsssrc-a',
                  name: 'Feed A',
                  news: [
                    {
                      title: 'rsssrc-a-n1',
                      display_title: 'rsssrc-a-n1',
                      url: 'https://rsssrc-a.example.com/1',
                      meta: '',
                      stable_id: 'id-rsssrc-a-1',
                    },
                  ],
                  is_new: false,
                },
              },
            },
          },
        }),
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
        body: JSON.stringify({ queued: 2, results: [] }),
      });
    });

    await viewerPage.goto();

    // RSS tab should NOT exist
    await expect(page.locator('.category-tab[data-category="rsscol-rss"]')).toHaveCount(0);

    // Preview RSS modal should still work
    await page.locator('button.category-settings-btn:has-text("深入探索")').click();
    await expect(page.locator('#rssCatalogPreviewModal')).toBeVisible();
    await expect(page.locator('#rssCatalogPreviewGrid .platform-card')).toHaveCount(1, { timeout: 15000 });

    // Add to category via dropdown (immediate persistence)
    const dropdown = page.locator('#rssCatalogPreviewGrid select[data-action="add-category"]').first();
    await expect(dropdown).toBeVisible();
    const nbaOptValue = await dropdown.evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const opts = Array.from(sel.options || []);
      const nbaOpt = opts.find((o) => String(o.value || '') === 'nba' || String(o.textContent || '').includes('NBA'));
      if (nbaOpt && typeof nbaOpt.value === 'string' && nbaOpt.value) return nbaOpt.value;
      const firstValueOpt = opts.find((o) => typeof o.value === 'string' && o.value);
      return firstValueOpt ? firstValueOpt.value : '';
    });
    expect(nbaOptValue).not.toBe('');
    await dropdown.selectOption(nbaOptValue);

    // Persisted subscription
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
  });
});
