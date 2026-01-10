import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('Category Settings', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    await viewerPage.goto();
    // Clear any existing custom config
    await page.evaluate(() => {
      localStorage.removeItem('hotnews_categories_config');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('should open settings modal', async () => {
    await viewerPage.openCategorySettings();
    await expect(viewerPage.settingsModal).toBeVisible();
    await viewerPage.expandCategoryList();
    await expect(viewerPage.categoryList).toBeVisible();
  });

  test('should display category list', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    const categoryItems = viewerPage.categoryList.locator('.category-item');
    const count = await categoryItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should close settings modal', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.closeCategorySettings();
    await expect(viewerPage.settingsModal).not.toBeVisible();
  });

  test('should show add category button', async () => {
    await viewerPage.openCategorySettings();
    await expect(viewerPage.addCategoryButton).toBeVisible();
  });

  test('should open edit panel when add category clicked', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await expect(viewerPage.editPanel).toBeVisible();
  });

  test('should create custom category', async ({ page }) => {
    await viewerPage.openCategorySettings();
    
    // Get initial tab count
    const initialTabCount = await viewerPage.categoryTabs.count();
    
    // Add custom category
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    const categoryName = 'Test Category ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(categoryName);
    
    // Select first available platform
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();
    
    // Save via footer button
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    
    // Reopen to verify category appears in list
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    const newCategoryItem = viewerPage.categoryList.locator('.category-item').filter({ hasText: categoryName });
    await expect(newCategoryItem).toBeVisible();
    
    // Close modal and verify tab appears
    await viewerPage.closeCategorySettings();
    
    // Wait for page to refresh
    await page.waitForLoadState('networkidle');
    
    const newTabCount = await viewerPage.categoryTabs.count();
    expect(newTabCount).toBeGreaterThanOrEqual(initialTabCount);
    
    // CRITICAL: Verify the new tab is visible in main view
    const newTab = viewerPage.categoryTabs.filter({ hasText: categoryName });
    await expect(newTab).toBeVisible();
    
    // Verify we can click on the new tab
    await newTab.click();
    await expect(newTab).toHaveClass(/active/);
  });

  test('should still show default categories in list after creating custom category', async ({ page }) => {
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();

    const defaultCountBefore = await viewerPage.categoryList.locator('.category-item:not(.custom)').count();
    expect(defaultCountBefore).toBeGreaterThan(0);

    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });

    const categoryName = 'Custom Keep Defaults ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(categoryName);

    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();

    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');

    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();

    const defaultCountAfter = await viewerPage.categoryList.locator('.category-item:not(.custom)').count();
    expect(defaultCountAfter).toBeGreaterThan(0);
  });

  test('should create custom category when clicking 完成 without saving', async ({ page }) => {
    await viewerPage.openCategorySettings();

    const initialTabCount = await viewerPage.categoryTabs.count();

    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });

    const categoryName = 'Done Create ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(categoryName);

    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();

    // User behavior: click "完成" directly (without clicking "保存")
    await viewerPage.settingsModal.locator('.settings-modal-footer .settings-btn-primary').click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });

    await page.waitForLoadState('networkidle');

    const newTabCount = await viewerPage.categoryTabs.count();
    expect(newTabCount).toBeGreaterThanOrEqual(initialTabCount);

    const newTab = viewerPage.categoryTabs.filter({ hasText: categoryName });
    await expect(newTab).toBeVisible();
  });

  test('should toggle category visibility', async ({ page }) => {
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    
    // Get first category name
    const firstCategoryItem = viewerPage.categoryList.locator('.category-item').first();
    const categoryName = await firstCategoryItem.locator('.category-item-name').textContent();
    
    // Toggle off - click the slider instead of the hidden input
    const toggle = firstCategoryItem.locator('.category-item-toggle .slider');
    await toggle.click();
    
    // Close and verify
    await viewerPage.closeCategorySettings();
    await page.waitForLoadState('networkidle');
    
    // The category tab should be hidden
    if (categoryName) {
      const tab = viewerPage.categoryTabs.filter({ hasText: categoryName.trim() });
      await expect(tab).toHaveCount(0);
    }
  });

  test('should have save and cancel buttons', async () => {
    await viewerPage.openCategorySettings();
    await expect(viewerPage.saveSettingsButton).toBeVisible();
    await expect(viewerPage.cancelSettingsButton).toBeVisible();
  });

  test('should show validation error when saving without name', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    // Select a platform but don't enter name
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();
    
    // Try to save - should show alert
    viewerPage.page.once('dialog', dialog => dialog.accept());
    await viewerPage.saveSettingsButton.click();
    
    // Modal should still be visible (save failed)
    await expect(viewerPage.settingsModal).toBeVisible();
  });

  test('should show validation error when saving without platforms', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    // Enter name but don't select platforms
    await viewerPage.editPanel.locator('#editCategoryName').fill('Test Category');
    
    // Try to save - should show alert
    viewerPage.page.once('dialog', dialog => dialog.accept());
    await viewerPage.saveSettingsButton.click();
    
    // Modal should still be visible (save failed)
    await expect(viewerPage.settingsModal).toBeVisible();
  });

  test('should edit custom category', async ({ page }) => {
    // First create a custom category
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    const originalName = 'Edit Test ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(originalName);
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    
    // Reopen and edit it
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    const customCategoryItem = viewerPage.categoryList.locator('.category-item.custom').filter({ hasText: originalName });
    await customCategoryItem.locator('.category-item-btn:has-text("编辑")').click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    // Change the name
    const newName = 'Edited ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(newName);
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    
    // Reopen to verify the name changed
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    const updatedItem = viewerPage.categoryList.locator('.category-item').filter({ hasText: newName });
    await expect(updatedItem).toBeVisible();
  });

  test('should delete custom category', async ({ page }) => {
    // First create a custom category
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    const categoryName = 'Delete Test ' + Date.now();
    await viewerPage.editPanel.locator('#editCategoryName').fill(categoryName);
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    await firstPlatform.locator('input[type="checkbox"]').click();
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    
    // Reopen and delete it
    await viewerPage.openCategorySettings();
    await viewerPage.expandCategoryList();
    const customCategoryItem = viewerPage.categoryList.locator('.category-item.custom').filter({ hasText: categoryName });
    await expect(customCategoryItem).toBeVisible();
    
    // Click delete button and confirm
    page.once('dialog', dialog => dialog.accept());
    await customCategoryItem.locator('.category-item-btn:has-text("删除")').click();
    
    // Save and close
    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });
    
    // Verify custom category tab is gone from main view
    const tab = viewerPage.categoryTabs.filter({ hasText: categoryName });
    await expect(tab).toHaveCount(0);
  });

  test('should display platform list when creating category', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    const platformList = viewerPage.editPanel.locator('#platformSelectList');
    await expect(platformList).toBeVisible();
    
    const platformItems = platformList.locator('.platform-select-item');
    const count = await platformItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should toggle platform selection', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    const firstPlatform = viewerPage.editPanel.locator('.platform-select-item').first();
    const checkbox = firstPlatform.locator('input[type="checkbox"]');
    
    // Initially unchecked
    await expect(checkbox).not.toBeChecked();
    
    // Click to select
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(firstPlatform).toHaveClass(/selected/);
    
    // Click to deselect
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect(firstPlatform).not.toHaveClass(/selected/);
  });

  test('should cancel settings without saving', async () => {
    await viewerPage.openCategorySettings();
    await viewerPage.addCategoryButton.click();
    await viewerPage.editPanel.waitFor({ state: 'visible' });
    
    // Enter some data
    await viewerPage.editPanel.locator('#editCategoryName').fill('Cancel Test');
    
    // Click cancel in footer
    await viewerPage.cancelSettingsButton.click();
    
    // Modal should close
    await expect(viewerPage.settingsModal).not.toBeVisible();
  });

  test('should show NEW badge on first visit and hide after clicking', async ({ page }) => {
    // Clear the dismissal flag to simulate first visit
    await page.evaluate(() => {
      localStorage.removeItem('category_settings_badge_dismissed');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // NEW badge should be visible
    const newBadge = page.locator('#categorySettingsNewBadge');
    await expect(newBadge).toBeVisible();
    await expect(newBadge).toHaveText('NEW');

    // Click category settings button
    await viewerPage.openCategorySettings();
    
    // NEW badge should be hidden
    await expect(newBadge).not.toBeVisible();

    // Close modal and reload
    await viewerPage.cancelSettingsButton.click();
    await page.reload();
    await page.waitForLoadState('networkidle');

    // NEW badge should still be hidden (persisted in localStorage)
    const newBadgeAfterReload = page.locator('#categorySettingsNewBadge');
    await expect(newBadgeAfterReload).not.toBeVisible();
  });
});
