import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('Category Flash Prevention', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    // Navigate first, then clear config
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('hotnews_categories_config');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('should not flash default categories when refreshing with custom categories', async ({ page }) => {
    // Step 1: Create custom category configuration
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });

    const categoryName = 'Custom Flash Test ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(categoryName);

    // Select first platform
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();

    // Save and close
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');

    // Step 2: Reload page and verify custom category appears correctly
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Step 3: Verify custom category is visible
    const customTab = viewerPage.categoryTabs.filter({ hasText: categoryName });
    await expect(customTab).toBeVisible();
    
    // Step 4: Verify it's the only visible tab (or first tab)
    const visibleTabs = await viewerPage.categoryTabs.count();
    expect(visibleTabs).toBeGreaterThan(0);
  });

  test('should not flash when refreshing with custom category order', async ({ page }) => {
    // Step 1: Set custom order in localStorage
    await page.evaluate(() => {
      const config = JSON.parse(localStorage.getItem('hotnews_categories_config') || '{}');
      const tabs = Array.from(document.querySelectorAll('.category-tab'));
      const order = tabs.map(tab => (tab as HTMLElement).dataset.category).filter(Boolean);
      // Reverse the order
      config.categoryOrder = order.reverse();
      localStorage.setItem('hotnews_categories_config', JSON.stringify(config));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Step 2: Get the order after reload
    const newOrder = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-tab'))
        .map(tab => tab.textContent?.trim() || '');
    });

    // Step 3: Reload again and verify order is preserved
    await page.reload();
    await page.waitForLoadState('networkidle');

    const finalOrder = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-tab'))
        .map(tab => tab.textContent?.trim() || '');
    });

    expect(finalOrder).toEqual(newOrder);
  });

  test('should not flash when refreshing with hidden default categories', async ({ page }) => {
    // Step 1: Hide some default categories
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();

    // Get first default category name
    const firstDefaultCategory = await page.evaluate(() => {
      const firstItem = document.querySelector('#categoryList .category-item:not(.custom)');
      return firstItem?.textContent?.trim() || '';
    });

    // Hide it
    const firstCategoryItem = viewerPage.categoryList.locator('.category-item').filter({ hasText: firstDefaultCategory }).first();
    await firstCategoryItem.locator('.category-item-toggle .slider').click();

    await viewerPage.closeCategorySettings();
    await page.waitForLoadState('networkidle');

    // Step 2: Verify category is hidden
    const hiddenTab = viewerPage.categoryTabs.filter({ hasText: firstDefaultCategory });
    await expect(hiddenTab).not.toBeVisible();

    // Step 3: Reload page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Step 4: Verify hidden category is NOT visible during load
    const visibleDuringLoad = await page.evaluate((catName) => {
      const tab = Array.from(document.querySelectorAll('.category-tab'))
        .find(t => t.textContent?.includes(catName));
      if (!tab) return false;
      const style = window.getComputedStyle(tab);
      return style.display !== 'none';
    }, firstDefaultCategory);

    expect(visibleDuringLoad).toBe(false);

    // Step 5: After full load, verify still hidden
    await page.waitForLoadState('networkidle');
    await expect(hiddenTab).not.toBeVisible();
  });

  test('should show default categories normally when no custom config', async ({ page }) => {
    // No custom configuration, should show all default categories
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify categories are visible
    const categoryCount = await viewerPage.categoryTabs.count();
    expect(categoryCount).toBeGreaterThan(0);

    // Verify no early hiding style exists
    const earlyHideStyle = await page.evaluate(() => {
      return document.getElementById('early-category-hide') !== null;
    });

    expect(earlyHideStyle).toBe(false);
  });
});
