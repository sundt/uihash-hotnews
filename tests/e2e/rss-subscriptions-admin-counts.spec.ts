import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { ViewerPage } from './pages/viewer.page';

function sh(cmd: string): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' }).trim();
}

function dockerExecPy(py: string): string {
  const b64 = Buffer.from(py, 'utf-8').toString('base64');
  const cmd = `docker exec hotnews-viewer python3 -c "import base64; exec(base64.b64decode('${b64}').decode('utf-8'))"`;
  return sh(cmd);
}

test.describe('RSS Subscriptions Admin Counts', () => {
  test('should write user subscription to user.db and reflect in admin metrics (subscribed/added)', async ({ page, context }) => {
    const viewerPage = new ViewerPage(page);

    const sourceId = `rsssrc-sspai-test-${crypto.randomBytes(4).toString('hex')}`;
    const feedUrl = 'https://sspai.com/feed';

    dockerExecPy(`
import sqlite3
conn=sqlite3.connect('/app/output/user.db')
sid='${sourceId}'
try:
    conn.execute('DELETE FROM user_rss_subscriptions WHERE source_id=?', (sid,))
except Exception:
    pass
try:
    conn.execute('DELETE FROM user_rss_subscription_adds WHERE source_id=?', (sid,))
except Exception:
    pass
conn.commit()
print('cleaned')
`);

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
        body: JSON.stringify({ categories: [{ id: '', name: '全部', count: 1 }] }),
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
              name: '少数派',
              url: feedUrl,
              host: 'sspai.com',
              category: '',
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
            feed: { title: '少数派' },
            entries: [
              { title: 'Post 1', link: 'https://sspai.com/post/1', published: 'Tue, 01 Jan 2030 00:00:00 GMT' },
            ],
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

    const cookies = await context.cookies();
    const hasRssUid = cookies.some((c) => c.name === 'rss_uid' && String(c.value || '').length > 0);
    expect(hasRssUid).toBeTruthy();

    const meGetResp = await page.request.get('/api/me/rss-subscriptions');
    expect(meGetResp.status()).toBe(200);

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

    const saveBtn = page.locator('#rssSubscriptionModal .settings-btn-primary:has-text("保存并刷新")');
    await expect(saveBtn).toBeEnabled({ timeout: 8000 });

    const mePutRespPromise = page.waitForResponse((resp) => {
      const u = resp.url();
      return u.includes('/api/me/rss-subscriptions') && resp.request().method() === 'PUT';
    });
    await saveBtn.click();
    const mePutResp = await mePutRespPromise;
    expect(mePutResp.status()).toBe(200);

    await expect(page.locator('#rssSubscriptionModal')).toBeHidden({ timeout: 20000 });

    const diag = dockerExecPy(`
import sqlite3
conn=sqlite3.connect('/app/output/user.db')
sid='${sourceId}'
sub=int(conn.execute('SELECT COUNT(*) FROM user_rss_subscriptions WHERE source_id=?', (sid,)).fetchone()[0])
tbl=conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_rss_subscription_adds'").fetchone()[0]
adds=0
if int(tbl or 0) > 0:
    adds=int(conn.execute('SELECT COUNT(*) FROM user_rss_subscription_adds WHERE source_id=?', (sid,)).fetchone()[0])
print(f'sub={sub};adds_table={int(tbl or 0)};adds={adds}')
`);

    const mSub = /sub=(\d+)/.exec(diag);
    const mTbl = /adds_table=(\d+)/.exec(diag);
    const mAdds = /adds=(\d+)/.exec(diag);
    const sub = mSub ? parseInt(mSub[1], 10) : -1;
    const addsTable = mTbl ? parseInt(mTbl[1], 10) : -1;
    const adds = mAdds ? parseInt(mAdds[1], 10) : -1;

    expect(sub).toBe(1);
    if (addsTable !== 1) {
      throw new Error(`user_rss_subscription_adds table missing in /app/output/user.db (diag: ${diag}). This usually means the local Docker container is not updated to the latest code that creates this table.`);
    }
    if (adds !== 1) {
      throw new Error(`Subscribed row was written but added row not recorded (diag: ${diag}). Likely replace_rss_subscriptions did not insert into user_rss_subscription_adds (container code mismatch or swallowed DB error).`);
    }
  });
});
