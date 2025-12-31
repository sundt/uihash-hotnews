import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('News Viewer Page', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    await viewerPage.goto();
  });

  test.describe('Page Load', () => {
    test('should display page title', async ({ page }) => {
      await expect(page).toHaveTitle(/Hotnews|热点新闻/);
    });

    test('should display category tabs', async () => {
      await expect(viewerPage.categoryTabs.first()).toBeVisible();
      const tabCount = await viewerPage.categoryTabs.count();
      expect(tabCount).toBeGreaterThan(0);
    });

    test('should have first non-explore tab active by default', async ({ page }) => {
      const firstNonExploreTab = page.locator('.category-tabs .category-tab:not([data-category="explore"])').first();
      await expect(firstNonExploreTab).toHaveClass(/active/);
    });

    test('should display platform cards', async () => {
      await expect(viewerPage.platformCards.first()).toBeVisible();
      const cardCount = await viewerPage.platformCards.count();
      expect(cardCount).toBeGreaterThan(0);
    });

    test('should not display platform refresh buttons (换新)', async ({ page }) => {
      await expect(page.locator('.platform-refresh-btn')).toHaveCount(0);
    });

    test('nba should not expand beyond 20 items', async ({ page }) => {
      const sportsTab = page.locator('.category-tab[data-category="sports"]');
      if ((await sportsTab.count()) === 0) return;
      await sportsTab.click();

      const card = page.locator('#tab-sports .platform-card[data-platform="nba-schedule"]');
      if ((await card.count()) === 0) return;

      // Lazy load will start when sentinel becomes visible
      const sentinel = card.locator('.news-load-sentinel');
      if ((await sentinel.count()) === 0) return;
      await sentinel.scrollIntoViewIfNeeded();

      const total = card.locator('.news-item');
      await expect
        .poll(async () => await total.count())
        .toBeGreaterThan(0);

      // Scroll again to trigger another page load so visible items can exceed 20
      await sentinel.scrollIntoViewIfNeeded();

      const visible = card.locator('.news-item:not(.paged-hidden)');
      await expect
        .poll(async () => await visible.count())
        .toBeLessThanOrEqual(20);
    });

    test('should display news items in platform cards', async () => {
      const newsItems = await viewerPage.getNewsItems(0);
      const count = await newsItems.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Tab Navigation', () => {
    test('should switch tabs when clicked', async () => {
      const tabCount = await viewerPage.categoryTabs.count();
      if (tabCount > 1) {
        const secondTab = viewerPage.categoryTabs.nth(1);
        const tabId = await secondTab.getAttribute('data-category');
        
        await secondTab.click();
        
        await expect(secondTab).toHaveClass(/active/);
        const firstTab = viewerPage.categoryTabs.first();
        await expect(firstTab).not.toHaveClass(/active/);
        
        // Verify content pane is visible
        const contentPane = viewerPage.page.locator(`#tab-${tabId}`);
        await expect(contentPane).toHaveClass(/active/);
      }
    });
  });

  test.describe('News Interaction', () => {
    test('should mark news as read when checkbox clicked', async () => {
      const firstNewsCheckbox = viewerPage.platformCards.first()
        .locator('.news-item').first()
        .locator('.news-checkbox');
      
      await expect(firstNewsCheckbox).not.toBeChecked();
      await firstNewsCheckbox.click();
      await expect(firstNewsCheckbox).toBeChecked();
    });

    test('should mark news as read when title clicked', async ({ page }) => {
      const firstNewsItem = viewerPage.platformCards.first()
        .locator('.news-item').first();
      const firstTitle = firstNewsItem.locator('.news-title');
      const firstNewsCheckbox = firstNewsItem.locator('.news-checkbox');

      await expect(firstNewsCheckbox).not.toBeChecked();
      const popupPromise = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
      await firstTitle.click();
      const popup = await popupPromise;
      if (popup) await popup.close();
      await expect(firstNewsCheckbox).toBeChecked();
    });

    test('should mark news as read when title middle clicked', async ({ page }) => {
      const firstNewsItem = viewerPage.platformCards.first()
        .locator('.news-item').first();
      const firstTitle = firstNewsItem.locator('.news-title');
      const firstNewsCheckbox = firstNewsItem.locator('.news-checkbox');

      await expect(firstNewsCheckbox).not.toBeChecked();
      const popupPromise = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
      await firstTitle.click({ button: 'middle' });
      const popup = await popupPromise;
      if (popup) await popup.close();
      await expect(firstNewsCheckbox).toBeChecked();
    });

    test('should not autofill beyond 20 items when filtered items cause blank space', async ({ page }) => {
      await page.evaluate(() => {
        const card = document.querySelector('.platform-card') as HTMLElement | null;
        if (!card) throw new Error('no platform-card');

        const list = card.querySelector('.news-list') as HTMLElement | null;
        if (!list) throw new Error('no news-list');

        list.innerHTML = '';
        for (let i = 0; i < 60; i++) {
          const li = document.createElement('li');
          li.className = 'news-item';
          if (i < 20) li.classList.add('filtered');
          li.innerHTML = `
            <div class="news-item-content">
              <input type="checkbox" class="news-checkbox" />
              <span class="news-index">${i + 1}</span>
              <a class="news-title" href="#" target="_blank" rel="noopener noreferrer">Item ${i + 1}</a>
            </div>`;
          list.appendChild(li);
        }

        const items = Array.from(card.querySelectorAll('.news-item'));
        items.forEach((it, idx) => {
          if (idx >= 20) it.classList.add('paged-hidden');
        });
        card.dataset.pageOffset = '0';
        card.dataset.pageSize = '20';

        // 先应用一次分页窗口
        // @ts-ignore
        window.TrendRadar.paging.applyPagingToCard(card, 0);

        // 再触发自动补全（但不应突破 20 的分页窗口上限）
        // @ts-ignore
        window.TrendRadar.paging.autofillCard(card, { minVisible: 10, maxSteps: 5 });
      });

      const card = viewerPage.platformCards.first();
      const visible = card.locator('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden):not(.read)');
      await expect
        .poll(async () => await visible.count())
        .toBeGreaterThanOrEqual(10);

      await expect
        .poll(async () => {
          return await card.locator('.news-item:not(.paged-hidden)').count();
        })
        .toBeLessThanOrEqual(20);
    });
  });

});

test.describe('Platform Title Horizontal Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 820 });
    const path = process.env.VIEWER_PATH || '/';
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });
    await expect(page.locator('.category-tabs .category-tab').first()).toBeVisible({ timeout: 15000 });
  });

  test('dragging on platform title area scrolls the platform grid horizontally', async ({ page }) => {
    const grid = page.locator('.tab-pane.active .platform-grid');
    await expect(grid).toBeVisible();

    const title = page.locator('.tab-pane.active .platform-card').first().locator('.platform-name');
    await expect(title).toBeVisible();

    // Ensure there is room to scroll; shrink viewport typically guarantees this.
    await expect
      .poll(async () => {
        return await grid.evaluate((el) => {
          const g = el as HTMLElement;
          return (g.scrollWidth || 0) > (g.clientWidth || 0) + 1;
        });
      })
      .toBeTruthy();

    const before = await grid.evaluate((el) => (el as HTMLElement).scrollLeft || 0);

    const box = await title.boundingBox();
    if (!box) throw new Error('no title bounding box');

    // Drag left to scroll right.
    const startX = box.x + box.width * 0.6;
    const startY = box.y + box.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 160, startY, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const after = await grid.evaluate((el) => (el as HTMLElement).scrollLeft || 0);
        return after;
      })
      .toBeGreaterThan(before);
  });

  test('Shift + wheel on platform title area scrolls the platform grid horizontally', async ({ page }) => {
    const grid = page.locator('.tab-pane.active .platform-grid');
    await expect(grid).toBeVisible();

    const title = page.locator('.tab-pane.active .platform-card').first().locator('.platform-name');
    await expect(title).toBeVisible();

    await expect
      .poll(async () => {
        return await grid.evaluate((el) => {
          const g = el as HTMLElement;
          return (g.scrollWidth || 0) > (g.clientWidth || 0) + 1;
        });
      })
      .toBeTruthy();

    const before = await grid.evaluate((el) => (el as HTMLElement).scrollLeft || 0);

    const box = await title.boundingBox();
    if (!box) throw new Error('no title bounding box');
    const x = box.x + box.width * 0.6;
    const y = box.y + box.height * 0.5;

    await page.mouse.move(x, y);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Shift');

    await expect
      .poll(async () => {
        const after = await grid.evaluate((el) => (el as HTMLElement).scrollLeft || 0);
        return after;
      })
      .toBeGreaterThan(before);
  });

  test('click on platform title area is not blocked when not dragging', async ({ page }) => {
    const title = page.locator('.tab-pane.active .platform-card').first().locator('.platform-name');
    await expect(title).toBeVisible();

    await page.evaluate(() => {
      // @ts-ignore
      window.__pw_title_clicks = 0;
      const el = document.querySelector('.tab-pane.active .platform-card .platform-name');
      if (!el) throw new Error('no platform-name');
      el.addEventListener('click', () => {
        // @ts-ignore
        window.__pw_title_clicks += 1;
      });
    });

    await title.click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          // @ts-ignore
          return window.__pw_title_clicks || 0;
        });
      })
      .toBeGreaterThan(0);
  });
});

test.describe('Per-Category Filter', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    await viewerPage.goto();
  });

  test('should hide empty platforms when category filter mode is include (显示)', async ({ page }) => {
    await viewerPage.openCategorySettings();
    await viewerPage.openFirstCategoryEditPanel();
    await viewerPage.setCategoryFilterIncludeMode();

    const keyword = '__pw_unmatchable_keyword__' + Date.now();
    await viewerPage.addCategoryFilterKeyword(keyword);

    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });

    const activeTabId = await page.locator('.category-tabs .category-tab.active').getAttribute('data-category');
    await expect
      .poll(async () => {
        return await page
          .locator(`#tab-${activeTabId} .platform-card:not(.platform-hidden):not(.platform-empty-hidden)`)
          .count();
      })
      .toBe(0);
  });
});

