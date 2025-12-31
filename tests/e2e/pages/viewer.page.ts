import { Page, Locator, expect } from '@playwright/test';

export class ViewerPage {
  readonly page: Page;
  readonly categoryTabs: Locator;
  readonly platformCards: Locator;
  readonly categorySettingsButton: Locator;
  readonly settingsModal: Locator;
  readonly categoryListWrapper: Locator;
  readonly categoryList: Locator;
  readonly categoryListToggleButton: Locator;
  readonly addCategoryButton: Locator;
  readonly editPanel: Locator;
  readonly categoryFilterModePill: Locator;
  readonly categoryFilterInput: Locator;
  readonly categoryFilterAddButton: Locator;
  readonly categoryFilterTags: Locator;
  readonly saveSettingsButton: Locator;
  readonly cancelSettingsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.categoryTabs = page.locator('.category-tabs .category-tab');
    this.platformCards = page.locator('.platform-card');
    this.categorySettingsButton = page.locator('button.category-settings-btn:has-text("栏目设置")');
    this.settingsModal = page.locator('#categorySettingsModal');
    this.categoryListWrapper = page.locator('#categoryListWrapper');
    this.categoryList = page.locator('#categoryList');
    this.categoryListToggleButton = page.locator('#categoryListToggleBtn');
    this.addCategoryButton = page.locator('.add-category-btn');
    this.editPanel = page.locator('#categoryEditPanel');
    this.categoryFilterModePill = this.editPanel.locator('label.filter-mode-toggle .filter-mode-pill');
    this.categoryFilterInput = this.editPanel.locator('#categoryFilterInput');
    this.categoryFilterAddButton = this.editPanel.locator('button:has-text("+ 添加")');
    this.categoryFilterTags = this.editPanel.locator('#categoryFilterTags .filter-tag');
    this.saveSettingsButton = this.settingsModal.locator('.settings-modal-footer .settings-btn-primary');
    this.cancelSettingsButton = this.settingsModal.locator('.settings-modal-footer .settings-btn-secondary');
  }

  async goto() {
    const path = process.env.VIEWER_PATH || '/';
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });
    await expect(this.page.locator('.category-tabs .category-tab').first()).toBeVisible({ timeout: 15000 });
  }

  async getActiveTab(): Promise<Locator> {
    return this.page.locator('.category-tabs .category-tab.active');
  }

  async switchTab(index: number) {
    await this.categoryTabs.nth(index).click();
  }

  async switchTabByName(name: string) {
    await this.categoryTabs.filter({ hasText: name }).click();
  }

  async getVisiblePlatformCards(): Promise<Locator> {
    return this.platformCards.filter({ has: this.page.locator(':visible') });
  }

  async getNewsItems(platformIndex: number = 0): Promise<Locator> {
    return this.platformCards.nth(platformIndex).locator('.news-item');
  }


  async openCategorySettings() {
    await this.categorySettingsButton.click();
    await this.settingsModal.waitFor({ state: 'visible' });
  }

  async expandCategoryList() {
    const isVisible = await this.categoryListWrapper.isVisible();
    if (!isVisible) {
      await this.categoryListToggleButton.scrollIntoViewIfNeeded();
      await this.categoryListToggleButton.click();
      await this.categoryListWrapper.waitFor({ state: 'visible' });
    }
  }

  async closeCategorySettings() {
    await this.settingsModal.locator('.settings-modal-close').click();
    await this.settingsModal.waitFor({ state: 'hidden' });
  }

  async addCustomCategory(name: string, platforms: string[]) {
    await this.addCategoryButton.click();
    await this.editPanel.waitFor({ state: 'visible' });
    
    await this.editPanel.locator('#editCategoryName').fill(name);
    
    // Select platforms
    for (const platform of platforms) {
      const platformItem = this.editPanel.locator('.platform-select-item').filter({ hasText: platform });
      const checkbox = platformItem.locator('input[type="checkbox"]');
      if (!(await checkbox.isChecked())) {
        await checkbox.click();
      }
    }
    
    await this.editPanel.locator('.settings-btn-primary').first().click();
    await this.editPanel.waitFor({ state: 'hidden' });
  }

  async toggleCategoryVisibility(categoryName: string) {
    const categoryItem = this.categoryList.locator('.category-item').filter({ hasText: categoryName });
    await categoryItem.locator('.category-item-toggle .slider').click();
  }

  async openFirstCategoryEditPanel() {
    await this.expandCategoryList();
    const firstCategoryItem = this.categoryList.locator('.category-item:not([data-category-id="explore"])').first();
    await firstCategoryItem.locator('button:has-text("编辑")').click();
    await this.editPanel.waitFor({ state: 'visible' });
  }

  async setCategoryFilterIncludeMode() {
    await this.categoryFilterModePill.scrollIntoViewIfNeeded();
    const checkbox = this.editPanel.locator('#categoryFilterModeToggle');
    if (!(await checkbox.isChecked())) {
      await this.categoryFilterModePill.click();
    }
  }

  async addCategoryFilterKeyword(keyword: string) {
    await this.categoryFilterInput.scrollIntoViewIfNeeded();
    await this.categoryFilterInput.fill(keyword);
    await this.categoryFilterAddButton.scrollIntoViewIfNeeded();
    await this.categoryFilterAddButton.click();
  }

  async resetCategoryConfig() {
    await this.settingsModal.locator('button:has-text("恢复默认")').click();
    // Handle confirmation dialog
    this.page.once('dialog', dialog => dialog.accept());
  }

  async markNewsAsRead(platformIndex: number, newsIndex: number) {
    const newsItem = this.platformCards.nth(platformIndex).locator('.news-item').nth(newsIndex);
    await newsItem.locator('.news-checkbox').click();
  }

  async isNewsRead(platformIndex: number, newsIndex: number): Promise<boolean> {
    const newsItem = this.platformCards.nth(platformIndex).locator('.news-item').nth(newsIndex);
    return newsItem.locator('.news-checkbox').isChecked();
  }
}
