import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

function normalizeTexts(items: string[]) {
  return items
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

test.describe('Platform Reorder', () => {
  test('should drag reorder platform cards within active category and persist after reload', async ({ page }) => {
    const viewer = new ViewerPage(page);

    await page.addInitScript(() => {
      // NOTE: addInitScript runs on every navigation (including reload).
      // We only want to clear storage once at the beginning of the test.
      if (!sessionStorage.getItem('__e2e_platform_reorder_cleared')) {
        localStorage.removeItem('trendradar_categories_config');
        localStorage.removeItem('trendradar_active_tab');
        sessionStorage.setItem('__e2e_platform_reorder_cleared', '1');
      }
    });

    await viewer.goto();

    // Ensure we have at least 2 visible platform cards in the active tab.
    const activeTabId = await page.evaluate(() => {
      return document.querySelector('.category-tab.active')?.getAttribute('data-category') || null;
    });
    expect(activeTabId).toBeTruthy();

    const gridSelector = `#tab-${activeTabId} .platform-grid`;
    const cards = page.locator(`${gridSelector} .platform-card`);
    await expect(cards.first()).toBeVisible();

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const firstName = await cards.nth(0).locator('.platform-name').innerText();
    const secondName = await cards.nth(1).locator('.platform-name').innerText();

    // Drag the first card to after the second card using the dedicated handle.
    const sourceHandle = cards.nth(0).locator('.platform-drag-handle');
    const targetCard = cards.nth(1);

    await expect(sourceHandle).toBeVisible();
    await targetCard.scrollIntoViewIfNeeded();

    await sourceHandle.dragTo(targetCard);

    // Verify order changed immediately.
    const afterFirst = normalizeTexts([await cards.nth(0).locator('.platform-name').innerText()])[0];
    const afterSecond = normalizeTexts([await cards.nth(1).locator('.platform-name').innerText()])[0];
    expect(afterFirst).toContain(secondName.trim());
    expect(afterSecond).toContain(firstName.trim());

    // Reload and verify persisted order.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });

    // After reload, the app may restore a different active tab; explicitly switch back.
    await page.locator(`.category-tab[data-category="${activeTabId}"]`).click();

    const cardsAfterReload = page.locator(`${gridSelector} .platform-card`);
    await expect(cardsAfterReload.first()).toBeVisible();

    const reloadFirst = normalizeTexts([await cardsAfterReload.nth(0).locator('.platform-name').innerText()])[0];
    const reloadSecond = normalizeTexts([await cardsAfterReload.nth(1).locator('.platform-name').innerText()])[0];

    expect(reloadFirst).toContain(secondName.trim());
    expect(reloadSecond).toContain(firstName.trim());
  });

  test('should auto-scroll platform grid during drag so card can be moved beyond visible area', async ({ page }) => {
    const viewer = new ViewerPage(page);

    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e_platform_reorder_autoscroll_cleared')) {
        localStorage.removeItem('trendradar_categories_config');
        localStorage.removeItem('trendradar_active_tab');
        sessionStorage.setItem('__e2e_platform_reorder_autoscroll_cleared', '1');
      }
    });

    await viewer.goto();

    const targetTabId = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.category-tab'))
        .map(t => t.getAttribute('data-category'))
        .filter(Boolean);
      for (const catId of tabs) {
        const cards = document.querySelectorAll(`#tab-${catId} .platform-card`);
        if (cards.length >= 6) return catId;
      }
      return null;
    });
    expect(targetTabId).toBeTruthy();

    await page.locator(`.category-tab[data-category="${targetTabId}"]`).click();

    const grid = page.locator(`#tab-${targetTabId} .platform-grid`);
    await expect(grid).toBeVisible();

    const cards = page.locator(`#tab-${targetTabId} .platform-grid .platform-card`);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(6);

    const firstCard = cards.nth(0);
    const firstPlatformId = await firstCard.getAttribute('data-platform');
    expect(firstPlatformId).toBeTruthy();

    // Ensure we're at the leftmost position.
    await page.evaluate((id) => {
      const g = document.querySelector(`#tab-${id} .platform-grid`);
      if (g) g.scrollLeft = 0;
    }, targetTabId);

    const handle = firstCard.locator('.platform-drag-handle');
    await expect(handle).toBeVisible();

    // Start dragging (HTML5 DnD) and move to the right edge to trigger auto-scroll.
    await page.evaluate((id) => {
      const grid = document.querySelector(`#tab-${id} .platform-grid`);
      const firstHandle = grid?.querySelector('.platform-card .platform-drag-handle');
      if (!grid || !firstHandle) return;

      const dt = new DataTransfer();
      const handleRect = firstHandle.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();

      const startX = handleRect.left + handleRect.width / 2;
      const startY = handleRect.top + handleRect.height / 2;
      const edgeX = gridRect.right - 5;

      firstHandle.dispatchEvent(
        new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: startX,
          clientY: startY
        })
      );

      // One dragover is enough to start the RAF-based auto-scroll loop.
      grid.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: edgeX,
          clientY: startY
        })
      );

      (window as any).__e2e_autoscroll_dt = dt;
    }, targetTabId);

    await expect
      .poll(
        async () => {
          return page.evaluate((id) => {
            const g = document.querySelector(`#tab-${id} .platform-grid`);
            return g ? (g.scrollLeft || 0) : 0;
          }, targetTabId);
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);

    // Drop on a later card once it becomes visible.
    const targetIndex = 5;
    const targetCard = cards.nth(targetIndex);
    await expect(targetCard).toBeVisible({ timeout: 10000 });

    await page.evaluate(
      ({ catId, idx }) => {
        const grid = document.querySelector(`#tab-${catId} .platform-grid`);
        const cards = Array.from(document.querySelectorAll(`#tab-${catId} .platform-grid .platform-card`));
        const firstHandle = grid?.querySelector('.platform-card .platform-drag-handle') as HTMLElement | null;
        const target = cards[idx] as HTMLElement | undefined;
        const dt = (window as any).__e2e_autoscroll_dt as DataTransfer | undefined;

        if (!grid || !firstHandle || !target || !dt) return;

        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        target.dispatchEvent(
          new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y
          })
        );

        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y
          })
        );

        firstHandle.dispatchEvent(
          new DragEvent('dragend', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y
          })
        );

        delete (window as any).__e2e_autoscroll_dt;
      },
      { catId: targetTabId, idx: targetIndex }
    );

    // Assert the dragged platform moved to a later index (>= 5).
    const movedIndex = await page.evaluate(
      ({ catId, pid }) => {
        const cards = Array.from(document.querySelectorAll(`#tab-${catId} .platform-grid .platform-card`));
        return cards.findIndex(c => c.getAttribute('data-platform') === pid);
      },
      { catId: targetTabId, pid: firstPlatformId }
    );
    expect(movedIndex).toBeGreaterThanOrEqual(5);

    // Reload and verify the moved index persists.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });
    await page.locator(`.category-tab[data-category="${targetTabId}"]`).click();

    const persistedIndex = await page.evaluate(
      ({ catId, pid }) => {
        const cards = Array.from(document.querySelectorAll(`#tab-${catId} .platform-grid .platform-card`));
        return cards.findIndex(c => c.getAttribute('data-platform') === pid);
      },
      { catId: targetTabId, pid: firstPlatformId }
    );
    expect(persistedIndex).toBeGreaterThanOrEqual(5);
  });
});
