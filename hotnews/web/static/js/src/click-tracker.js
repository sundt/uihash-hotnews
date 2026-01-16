/**
 * Click Tracker Module
 * - Tracks last visit time per category
 * - Shows red dots for new content
 * - Reports clicks to backend for analytics
 */
import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const LAST_VISIT_KEY = 'tr_category_last_visit_v1';
const NEW_CONTENT_WINDOW_SEC = 24 * 3600; // 24 hours

/**
 * Get last visit timestamps for all categories
 */
function getLastVisitMap() {
    return storage.get(LAST_VISIT_KEY, {});
}

/**
 * Update last visit time for a category
 */
function updateLastVisit(categoryId) {
    if (!categoryId) return;
    const map = getLastVisitMap();
    map[categoryId] = Math.floor(Date.now() / 1000);
    storage.set(LAST_VISIT_KEY, map);
}

/**
 * Get last visit time for a specific category (in seconds)
 */
function getLastVisit(categoryId) {
    if (!categoryId) return 0;
    const map = getLastVisitMap();
    return Number(map[categoryId]) || 0;
}

/**
 * Check if a news item is "new" based on published_at and last visit
 */
function isNewContent(publishedAt, categoryId) {
    const ts = Number(publishedAt) || 0;
    if (!ts) return false;

    const now = Math.floor(Date.now() / 1000);
    const lastVisit = getLastVisit(categoryId);

    // Must be newer than last visit AND within 24 hours
    return ts > lastVisit && (now - ts) < NEW_CONTENT_WINDOW_SEC;
}

/**
 * Report a click to the backend
 */
async function reportClick(newsId, url, title, sourceName, category) {
    try {
        await fetch('/api/news/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                news_id: newsId,
                url: url,
                title: title,
                source_name: sourceName || '',
                category: category || ''
            })
        });
    } catch (e) {
        // Silent fail - analytics should not break UX
    }
}

/**
 * Handle news title click - remove red dot and report
 */
function handleNewsClick(newsItem, categoryId) {
    if (!newsItem) return;

    // Remove red dot
    const dot = newsItem.querySelector('.tr-new-dot');
    if (dot) {
        dot.remove();
    }

    // Get data for reporting
    const newsId = newsItem.dataset.newsId || '';
    const title = newsItem.dataset.newsTitle || '';
    const link = newsItem.querySelector('.news-title');
    const url = link ? link.href : '';
    const sourceName = newsItem.closest('.platform-card')?.querySelector('.platform-name')?.textContent?.trim() || '';

    // Report click (async, non-blocking)
    if (newsId) {
        reportClick(newsId, url, title, sourceName, categoryId);
    }
}

/**
 * Attach click listeners to news items
 */
function attachClickListeners() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.news-title');
        if (!link) return;

        const newsItem = link.closest('.news-item');
        if (!newsItem) return;

        const pane = newsItem.closest('.tab-pane');
        const categoryId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : '';

        handleNewsClick(newsItem, categoryId);
    });
}

/**
 * Update last visit time when switching to a category tab
 */
function attachTabSwitchListener() {
    window.addEventListener('tr_tab_switched', (ev) => {
        const categoryId = String(ev?.detail?.categoryId || '').trim();
        if (categoryId) {
            // Delay update slightly to not affect current render
            setTimeout(() => {
                updateLastVisit(categoryId);
            }, 1000);
        }
    });
}

// Export for other modules
TR.clickTracker = {
    getLastVisit,
    updateLastVisit,
    isNewContent,
    reportClick,
    handleNewsClick
};

ready(function () {
    attachClickListeners();
    attachTabSwitchListener();
});
