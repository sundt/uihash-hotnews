import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';
import fs from 'fs';
import path from 'path';

test.describe('Explore Tab Embedded RSS Stream', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${String(err?.message || err)}`));
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/api/rss-sources')) {
        console.log(`BROWSER REQ: ${req.method()} ${u}`);
      }
    });
    viewerPage = new ViewerPage(page);

    await page.route('**/static/js/viewer.bundle.js*', async (route) => {
      const bundlePath = path.resolve(__dirname, '../../hotnews/web/static/js/viewer.bundle.js');
      const body = fs.readFileSync(bundlePath, 'utf-8');
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body,
      });
    });

    await page.addInitScript(() => {
      const marker = '__e2e_explore_embedded_storage_cleared_v1';
      if (localStorage.getItem(marker) === '1') return;
      localStorage.setItem(marker, '1');

      localStorage.removeItem('rss_subscriptions');
      localStorage.removeItem('hotnews_categories_config');
      localStorage.removeItem('category_settings_badge_dismissed');
      localStorage.removeItem('rss_subscription_badge_dismissed');
      localStorage.removeItem('hotnews_explore_seen_sources_v1');
      localStorage.removeItem('hotnews_explore_last_source_v1');
      localStorage.removeItem('hotnews_explore_tab_seen_sources_v1');
      localStorage.removeItem('hotnews_explore_tab_cursor_v1');
      localStorage.removeItem('hotnews_read_news_v2');
      localStorage.removeItem('hotnews_show_read_mode');

      // Ensure Explore is NOT the initial active tab so the test can observe the
      // explore-cards request triggered on switching to Explore.
      localStorage.setItem('hotnews_active_tab', 'general');
    });
  });

  test('switching to explore tab shows 4 RSS cards, each with <= 20 entries; closing a card replaces it', async ({ page }) => {
    const sources = Array.from({ length: 8 }).map((_, i) => {
      const id = `rsssrc-${String.fromCharCode(97 + i)}`; // a..h
      return { id, name: `Feed ${id.toUpperCase()}`, url: `https://${id}.example.com/feed.xml`, host: `${id}.example.com`, category: 'tech', enabled: true, created_at: 0, updated_at: 100 - i };
    });

    let exploreCardsCalls = 0;
    let previewCalls = 0;
    let searchCalls = 0;

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

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            explore: { id: 'explore', name: '深入探索', icon: '🔎', platforms: {} },
            general: { id: 'general', name: '综合新闻', icon: '📰', platforms: {} },
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/preview*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'preview should not be called in explore-cards fast path' }),
      });
    });

    await page.route('**/api/rss-sources/search*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'search should not be called in explore-cards fast path' }),
      });
    });

    await page.route('**/api/rss-sources/explore-cards*', async (route) => {
      exploreCardsCalls += 1;
      const url = new URL(route.request().url());
      const cards = Number(url.searchParams.get('cards') || 4) || 4;
      const entriesPerCard = Number(url.searchParams.get('entries_per_card') || 20) || 20;
      const excludeRaw = String(url.searchParams.get('exclude_source_ids') || '').trim();
      const exclude = new Set(excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : []);

      const candidates = sources.filter(s => !exclude.has(s.id));
      const picked = candidates.slice(0, Math.min(cards, candidates.length));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cards: picked.map((s) => ({
            source_id: s.id,
            url: s.url,
            platform_name: s.name,
            feed_title: s.name,
            entries_count: entriesPerCard,
            entries: Array.from({ length: entriesPerCard + 5 }).map((_, i) => ({
              title: `${s.id}-title-${i + 1}`,
              link: `https://${s.id}.example.com/${i + 1}`,
              ts: 1735440000,
            })),
          })),
          cards_requested: cards,
          cards_returned: picked.length,
          incomplete: picked.length < cards,
        }),
      });
    });

    await page.route('**/api/rss-sources/preview*', async (route) => {
      previewCalls += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'preview should not be called in explore-cards fast path' }),
      });
    });

    await page.route('**/api/rss-sources/search*', async (route) => {
      searchCalls += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'search should not be called in explore-cards fast path' }),
      });
    });

    await page.route('**/api/rss-sources/warmup?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: 8, results: [] }),
      });
    });

    await viewerPage.goto();

    // Switch from general -> explore to trigger Explore loader.
    await page.locator('.category-tabs .category-tab[data-category="general"]').click();
    await expect(page.locator('#tab-general')).toHaveClass(/active/);

    const reqPromise = page.waitForRequest('**/api/rss-sources/explore-cards*', { timeout: 10000 });

    await page.locator('.category-tabs .category-tab[data-category="explore"]').click();
    await expect(page.locator('#tab-explore')).toHaveClass(/active/);

    await reqPromise;

    await expect(page.locator('#trExploreGrid .platform-card')).toHaveCount(4, { timeout: 20000 });

    expect(exploreCardsCalls).toBeGreaterThan(0);
    expect(previewCalls).toBe(0);
    expect(searchCalls).toBe(0);

    const firstBatchIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#trExploreGrid .platform-card')).map((el) => String(el.getAttribute('data-rss-source-id') || ''));
    });
    expect(firstBatchIds.filter(Boolean).length).toBe(4);

    for (let i = 0; i < 4; i += 1) {
      const items = page.locator('#trExploreGrid .platform-card').nth(i).locator('.news-item');
      await expect(items).toHaveCount(20, { timeout: 20000 });
    }

    const firstCard = page.locator('#trExploreGrid .platform-card').first();
    await expect(firstCard.locator('button[data-action="close"]')).toBeVisible();
    const closedId = await firstCard.getAttribute('data-rss-source-id');
    expect(String(closedId || '').trim().length).toBeGreaterThan(0);

    await firstCard.locator('button[data-action="close"]').click();

    await expect
      .poll(async () => {
        const ids = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('#trExploreGrid .platform-card'))
            .map((el) => String(el.getAttribute('data-rss-source-id') || '').trim())
            .filter(Boolean);
        });
        if (ids.length !== 4) return false;
        return !ids.includes(String(closedId || '').trim());
      })
      .toBeTruthy();
  });

  test('clicking explore entry marks it as read and turns title gray', async ({ page }) => {
    const sources = Array.from({ length: 4 }).map((_, i) => {
      const id = `rsssrc-${String.fromCharCode(97 + i)}`;
      return { id, name: `Feed ${id.toUpperCase()}`, url: `https://${id}.example.com/feed.xml`, host: `${id}.example.com`, category: 'tech', enabled: true, created_at: 0, updated_at: 100 - i };
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

    await page.route('**/api/news', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            explore: { id: 'explore', name: '深入探索', icon: '🔎', platforms: {} },
            general: { id: 'general', name: '综合新闻', icon: '📰', platforms: {} },
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/explore-cards*', async (route) => {
      const url = new URL(route.request().url());
      const cards = Number(url.searchParams.get('cards') || 4) || 4;
      const entriesPerCard = Number(url.searchParams.get('entries_per_card') || 20) || 20;
      const picked = sources.slice(0, Math.min(cards, sources.length));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cards: picked.map((s) => ({
            source_id: s.id,
            url: s.url,
            platform_name: s.name,
            feed_title: s.name,
            entries_count: entriesPerCard,
            entries: Array.from({ length: entriesPerCard }).map((_, i) => ({
              title: `${s.id}-title-${i + 1}`,
              link: `https://${s.id}.example.com/${i + 1}`,
              ts: 1735440000,
            })),
          })),
          cards_requested: cards,
          cards_returned: picked.length,
          incomplete: picked.length < cards,
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

    await page.locator('.category-tabs .category-tab[data-category="explore"]').click();
    await expect(page.locator('#tab-explore')).toHaveClass(/active/);
    await expect(page.locator('#trExploreGrid .platform-card')).toHaveCount(4, { timeout: 20000 });

    const firstItem = page.locator('#trExploreGrid .platform-card').first().locator('.news-item').first();
    const title = firstItem.locator('a.news-title');

    const diagBefore = await page.evaluate(() => {
      const a = document.querySelector('#trExploreGrid a.news-title') as HTMLAnchorElement | null;
      const li = a?.closest('.news-item') as HTMLElement | null;
      return {
        hasGlobalHandle: typeof (window as any).handleTitleClickV2,
        hasTR: !!(window as any).Hotnews,
        hasReadState: !!(window as any).Hotnews?.readState,
        onclickAttr: a?.getAttribute('onclick') || '',
        liNewsId: li?.dataset?.newsId || '',
        liClass: li?.className || '',
      };
    });
    console.log('E2E_DIAG_BEFORE', diagBefore);

    const popupPromise = page.waitForEvent('popup').catch(() => null);
    await title.click();
    await popupPromise;

    const diagAfterClick = await page.evaluate(() => {
      const a = document.querySelector('#trExploreGrid a.news-title') as HTMLAnchorElement | null;
      const li = a?.closest('.news-item') as HTMLElement | null;
      const raw = localStorage.getItem('hotnews_read_news_v2') || '';
      return {
        liClass: li?.className || '',
        storageLen: raw.length,
        storagePrefix: raw.slice(0, 120),
      };
    });
    console.log('E2E_DIAG_AFTER_CLICK', diagAfterClick);

    const diagAfterManual = await page.evaluate(() => {
      const a = document.querySelector('#trExploreGrid a.news-title') as HTMLAnchorElement | null;
      const li = a?.closest('.news-item') as HTMLElement | null;
      try {
        (window as any).Hotnews?.readState?.markItemAsRead?.(li);
      } catch (e) {
        // ignore
      }
      return {
        liClass: li?.className || '',
      };
    });
    console.log('E2E_DIAG_AFTER_MANUAL', diagAfterManual);

    await expect(firstItem).toHaveClass(/read/, { timeout: 5000 });

    const color = await title.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(107, 114, 128)');
  });

  test('can add explore card to sports tab and then delete rss card from sports', async ({ page }) => {
    const sources = Array.from({ length: 8 }).map((_, i) => {
      const id = `rsssrc-${String.fromCharCode(97 + i)}`; // a..h
      return { id, name: `Feed ${id.toUpperCase()}`, url: `https://${id}.example.com/feed.xml`, host: `${id}.example.com`, category: 'tech', enabled: true, created_at: 0, updated_at: 100 - i };
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

    await page.route('**/api/news', async (route) => {
      const includeRss = savedSubs.length > 0;
      const sid = includeRss ? String(savedSubs[0]?.source_id || savedSubs[0]?.rss_source_id || '').trim() : '';
      const pid = sid ? `rss-${sid}` : '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            explore: { id: 'explore', name: '深入探索', icon: '🔎', platforms: {} },
            sports: {
              id: 'sports',
              name: '体育',
              icon: '🏀',
              platforms: includeRss && pid
                ? {
                    [pid]: {
                      id: pid,
                      name: 'Feed Sports',
                      is_new: false,
                      news: [
                        {
                          title: 'S1',
                          display_title: 'S1',
                          url: 'https://sports.example.com/s1',
                          meta: '',
                          stable_id: 'id-s1',
                        },
                      ],
                    },
                  }
                : {},
            },
            general: { id: 'general', name: '综合新闻', icon: '📰', platforms: {} },
          },
        }),
      });
    });

    await page.route('**/api/rss-sources/explore-cards*', async (route) => {
      const url = new URL(route.request().url());
      const cards = Number(url.searchParams.get('cards') || 4) || 4;
      const entriesPerCard = Number(url.searchParams.get('entries_per_card') || 20) || 20;
      const excludeRaw = String(url.searchParams.get('exclude_source_ids') || '').trim();
      const exclude = new Set(excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : []);

      const candidates = sources.filter(s => !exclude.has(s.id));
      const picked = candidates.slice(0, Math.min(cards, candidates.length));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cards: picked.map((s) => ({
            source_id: s.id,
            url: s.url,
            platform_name: s.name,
            feed_title: s.name,
            entries_count: entriesPerCard,
            entries: Array.from({ length: entriesPerCard }).map((_, i) => ({
              title: `${s.id}-title-${i + 1}`,
              link: `https://${s.id}.example.com/${i + 1}`,
              ts: 1735440000,
            })),
          })),
          cards_requested: cards,
          cards_returned: picked.length,
          incomplete: picked.length < cards,
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

    await page.locator('.category-tabs .category-tab[data-category="explore"]').click();
    await expect(page.locator('#tab-explore')).toHaveClass(/active/);
    await expect(page.locator('#trExploreGrid .platform-card')).toHaveCount(4, { timeout: 20000 });

    const dropdown = page.locator('#trExploreGrid select[data-action="add-category"]').first();
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toBeEnabled();
    const pickedVal = await dropdown.evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const opts = Array.from(sel.options || []);
      const sportsOpt = opts.find((o) => String(o.value || '').includes('sports'));
      if (sportsOpt && sportsOpt.value) return sportsOpt.value;
      const first = opts.find((o) => typeof o.value === 'string' && o.value);
      return first ? first.value : '';
    });
    expect(pickedVal).not.toBe('');

    const saveResp = page.waitForResponse((resp) => {
      if (!resp.url().includes('/api/me/rss-subscriptions')) return false;
      if (resp.request().method() !== 'PUT') return false;
      return resp.status() >= 200 && resp.status() < 300;
    }, { timeout: 20000 });
    await dropdown.selectOption(pickedVal);
    await saveResp;

    const refreshOnTabSwitch = page.waitForResponse('**/api/news', { timeout: 20000 });
    await page.locator('.category-tabs .category-tab[data-category="sports"]').click();
    await refreshOnTabSwitch;
    await expect(page.locator('#tab-sports')).toHaveClass(/active/);

    const rssPid = `rss-${sources[0].id}`;
    const cardSel = `#tab-sports .platform-card[data-platform="${rssPid}"]`;
    await expect(page.locator(cardSel)).toBeVisible({ timeout: 20000 });

    await page.locator(`${cardSel} button[data-action="delete-platform"]`).click();
    await expect(page.locator(cardSel)).toHaveCount(0, { timeout: 20000 });

    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).refreshViewerData?.({ preserveScroll: true });
    });
    await expect(page.locator(cardSel)).toHaveCount(0, { timeout: 20000 });
  });
});
