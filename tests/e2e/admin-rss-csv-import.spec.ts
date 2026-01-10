import { test, expect } from '@playwright/test';

test.describe('Admin RSS CSV Import', () => {
  test('should preview, commit, enforce preview_hash flow, and show validation errors', async ({ page }) => {
    const adminToken = process.env.HOTNEWS_ADMIN_TOKEN || '';
    test.skip(!adminToken, 'HOTNEWS_ADMIN_TOKEN is not set; skipping admin import E2E');

    const urlSeed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const feedUrl = `https://example.com/admin-import-${urlSeed}/feed.xml`;

    const goodLine = `Google Blog AI,${feedUrl},,人工智能,分类订阅,美国,英文,手动添加`;

    await page.goto(`/admin/rss-sources?token=${encodeURIComponent(adminToken)}`);

    await page.locator('#csv-import-text').fill(goodLine);
    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.locator('#csv-import-status')).toContainText('Preview ready');
    await expect(page.locator('#csv-import-result')).toContainText('preview_hash=');
    await expect(page.locator('#csv-import-result')).toContainText('format=');

    // Commit success (confirm dialog)
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Commit' }).click();

    await page.waitForLoadState('domcontentloaded');

    const catalogCard = page.locator(
      'xpath=//h2[contains(normalize-space(.),"Catalog (All)")]/following-sibling::div[1]'
    );
    await expect(catalogCard).toContainText(feedUrl, { timeout: 15000 });

    // preview_hash protection: change textarea after preview, commit should alert
    await page.locator('#csv-import-text').fill(goodLine);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('#csv-import-status')).toContainText('Preview ready');

    const messages: string[] = [];
    const handler = async (dialog: any) => {
      messages.push(String(dialog.message()));
      await dialog.accept();
    };
    page.once('dialog', handler);

    await page.locator('#csv-import-text').fill(`${goodLine} `);
    await page.getByRole('button', { name: 'Commit' }).click();
    await expect
      .poll(() => messages.join('\n'), { timeout: 5000 })
      .toContain('CSV text changed since preview');

    // validation failure on commit: invalid URL should cause commit to alert and not write
    const badLine = `Bad,,人工智能,分类订阅,美国,英文,手动添加`;
    await page.locator('#csv-import-text').fill(badLine);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('#csv-import-status')).toContainText('Preview ready');

    messages.length = 0;
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    page.once('dialog', handler);
    await page.getByRole('button', { name: 'Commit' }).click();
    await expect
      .poll(() => messages.join('\n'), { timeout: 5000 })
      .toContain('invalid rows');
  });
});
