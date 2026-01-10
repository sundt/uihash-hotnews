import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

function normalizeText(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

test.describe('Category Tab Reorder', () => {
  test('should drag reorder category tabs and persist after reload', async ({ page }) => {
    const viewer = new ViewerPage(page);

    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e_category_tab_reorder_cleared')) {
        localStorage.removeItem('hotnews_categories_config');
        localStorage.removeItem('hotnews_active_tab');
        sessionStorage.setItem('__e2e_category_tab_reorder_cleared', '1');
      }
    });

    await viewer.goto();

    const tabs = page.locator('.category-tabs .category-tab');
    await expect(tabs.first()).toBeVisible();

    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const beforeIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-tabs .category-tab'))
        .map((el) => String((el as HTMLElement).getAttribute('data-category') || '').trim())
        .filter(Boolean);
    });
    expect(beforeIds.length).toBeGreaterThanOrEqual(2);
    const firstId = beforeIds[0];
    const secondId = beforeIds[1];
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();

    // Deterministic HTML5 drag-and-drop: only one dragover/drop on the target tab.
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.category-tabs .category-tab')) as HTMLElement[];
      const sourceTab = tabs[0];
      const targetTab = tabs[1];
      const handle = sourceTab?.querySelector('.category-drag-handle') as HTMLElement | null;
      if (!sourceTab || !targetTab || !handle) return;

      const dt = new DataTransfer();
      const srcRect = handle.getBoundingClientRect();
      const tgtRect = targetTab.getBoundingClientRect();

      const startX = srcRect.left + srcRect.width / 2;
      const startY = srcRect.top + srcRect.height / 2;
      const x = tgtRect.left + tgtRect.width / 2;
      const y = tgtRect.top + tgtRect.height / 2;

      handle.dispatchEvent(
        new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: startX,
          clientY: startY,
        })
      );

      targetTab.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        })
      );

      targetTab.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        })
      );

      handle.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        })
      );
    });

    const afterIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-tabs .category-tab'))
        .map((el) => String((el as HTMLElement).getAttribute('data-category') || '').trim())
        .filter(Boolean);
    });
    expect(afterIds[0]).toBe(secondId);
    expect(afterIds[1]).toBe(firstId);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });

    const tabsAfter = page.locator('.category-tabs .category-tab');
    await expect(tabsAfter.first()).toBeVisible();

    const reloadIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-tabs .category-tab'))
        .map((el) => String((el as HTMLElement).getAttribute('data-category') || '').trim())
        .filter(Boolean);
    });
    expect(reloadIds[0]).toBe(secondId);
    expect(reloadIds[1]).toBe(firstId);
  });
});
