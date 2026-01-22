import { TR, ready, formatNewsDate, escapeHtml } from './core.js';
import { storage } from './storage.js';

const STEP = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
const ROOT_MARGIN = '240px 0px 240px 0px';
const MAX_ITEMS_PER_PLATFORM = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
const LAST_VISIT_KEY = 'tr_category_last_visit_v1';
const NEW_CONTENT_WINDOW_SEC = 24 * 3600; // 24 hours

let _observer = null;
let _armed = false;
let _inFlight = 0;
const MAX_IN_FLIGHT = 1;
let _cooldownUntil = 0;
const COOLDOWN_MS = 600;
let _ensureTimer = null;
let _ensureAbort = null;
const ENSURE_DEBOUNCE_MS = 160;
let _bulkTimer = null;
let _bulkAbort = null;
const BULK_DEBOUNCE_MS = 250;

function getActiveCategoryId() {
    return document.querySelector('.category-tabs .category-tab.active')?.dataset?.category || null;
}

// Session start timestamp for red dot logic
const SESSION_START_TIME = Math.floor(Date.now() / 1000);
const viewedCategories = new Set();

function markCategoryViewed(categoryId) {
    if (categoryId) viewedCategories.add(categoryId);
}

// Categories that should never show red dots (special data sources with unreliable timestamps)
const NO_RED_DOT_CATEGORIES = ['explore', 'knowledge'];

function isNewContent(publishedAt, categoryId) {
    const ts = Number(publishedAt) || 0;
    if (!ts) return false;

    // Disable red dots for specific categories
    if (NO_RED_DOT_CATEGORIES.includes(categoryId)) return false;

    // Only show red dot if category was already viewed AND item is newer than session start
    if (!viewedCategories.has(categoryId)) return false;
    return ts > SESSION_START_TIME;
}

function setPlaceholderText(card, text) {
    try {
        const list = card?.querySelector?.('.news-list');
        if (!list) return;
        let el = list.querySelector('.news-placeholder');
        if (!el) {
            el = document.createElement('li');
            el.className = 'news-placeholder';
            el.setAttribute('aria-hidden', 'true');
            list.appendChild(el);
        }
        el.textContent = String(text || '');
    } catch (e) {
        // ignore
    }
}

function cancelEnsureCategoryLoaded() {
    clearTimeout(_ensureTimer);
    _ensureTimer = null;
    if (_ensureAbort) {
        try { _ensureAbort.abort(); } catch (e) { /* ignore */ }
        _ensureAbort = null;
    }

    try {
        document.querySelectorAll('.platform-card').forEach((card) => {
            const list = card?.querySelector?.('.news-list');
            if (!list) return;
            const placeholder = list.querySelector('.news-placeholder');
            if (!placeholder) return;
            const hasItems = list.querySelectorAll('.news-item').length > 0;
            if (hasItems) return;
            if ((placeholder.textContent || '').includes('加载中')) {
                placeholder.textContent = '待加载...';
            }
        });
    } catch (e) {
        // ignore
    }
}

function scheduleEnsureCategoryLoaded(categoryId, opts = {}) {
    cancelEnsureCategoryLoaded();
    _ensureAbort = new AbortController();
    const signal = _ensureAbort.signal;
    _ensureTimer = setTimeout(() => {
        _ensureTimer = null;
        ensureCategoryLoaded(categoryId, { ...opts, signal }).catch(() => { });
    }, ENSURE_DEBOUNCE_MS);
}

function cancelBulkLoadCategory() {
    clearTimeout(_bulkTimer);
    _bulkTimer = null;
    if (_bulkAbort) {
        try { _bulkAbort.abort(); } catch (e) { /* ignore */ }
        _bulkAbort = null;
    }
}

function createNewsLi(n, idx, platformId, categoryId, platformName) {
    const li = document.createElement('li');
    li.className = 'news-item';
    const newsId = String(n?.stable_id || '');
    li.dataset.newsId = newsId;
    li.dataset.newsTitle = String(n?.display_title || n?.title || '');

    const content = document.createElement('div');
    content.className = 'news-item-content';

    // Add red dot for new content
    const publishedAt = n?.published_at || n?.created_at || n?.timestamp || 0;
    if (isNewContent(publishedAt, categoryId || getActiveCategoryId())) {
        const dot = document.createElement('span');
        dot.className = 'tr-new-dot';
        content.appendChild(dot);
    }

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'news-checkbox';
    cb.title = '标记已读';
    cb.addEventListener('change', () => {
        try { window.markAsRead(cb); } catch (e) { /* ignore */ }
    });

    const indexSpan = document.createElement('span');
    indexSpan.className = 'news-index';
    indexSpan.textContent = String(idx);

    const a = document.createElement('a');
    a.className = 'news-title';
    if (n?.is_cross_platform) a.classList.add('cross-platform');
    a.href = String(n?.url || '#');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('onclick', 'handleTitleClickV2(this, event)');
    a.setAttribute('onauxclick', 'handleTitleClickV2(this, event)');
    a.setAttribute('oncontextmenu', 'handleTitleClickV2(this, event)');
    a.setAttribute('onkeydown', 'handleTitleKeydownV2(this, event)');
    a.textContent = String(n?.display_title || n?.title || '');

    if (n?.is_cross_platform) {
        const cps = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
        const badge = document.createElement('span');
        badge.className = 'cross-platform-badge';
        badge.title = `同时出现在: ${cps.join(', ')}`;
        badge.textContent = `🔥 ${String(n?.cross_platform_count ?? '')}`;
        a.appendChild(document.createTextNode(' '));
        a.appendChild(badge);
    }

    content.appendChild(cb);
    content.appendChild(indexSpan);
    content.appendChild(a);

    // Add date display if timestamp is available
    const dateStr = formatNewsDate(n?.timestamp);
    if (dateStr) {
        const dateSpan = document.createElement('span');
        dateSpan.className = 'tr-news-date';
        dateSpan.style.marginLeft = '8px';
        dateSpan.style.color = '#9ca3af';
        dateSpan.style.fontSize = '12px';
        dateSpan.style.whiteSpace = 'nowrap';
        dateSpan.textContent = dateStr;
        content.appendChild(dateSpan);
    }

    // Add summary button
    const summaryBtn = document.createElement('button');
    summaryBtn.className = 'news-summary-btn';
    summaryBtn.dataset.newsId = newsId;
    summaryBtn.dataset.title = String(n?.display_title || n?.title || '');
    summaryBtn.dataset.url = String(n?.url || '');
    summaryBtn.dataset.sourceId = platformId;
    summaryBtn.dataset.sourceName = platformName || '';
    summaryBtn.title = 'AI 总结';
    summaryBtn.textContent = '📝';
    summaryBtn.onclick = (e) => {
        if (typeof window.handleSummaryClick === 'function') {
            window.handleSummaryClick(e, newsId, String(n?.display_title || n?.title || ''), String(n?.url || ''), platformId, platformName || '');
        }
    };
    content.appendChild(summaryBtn);

    li.appendChild(content);

    const meta = String(n?.meta || '').trim();
    const isRssPlatform = String(platformId || '').startsWith('rss-');
    if (meta && !isRssPlatform) {
        const sub = document.createElement('div');
        sub.className = 'news-subtitle';
        sub.textContent = meta;
        li.appendChild(sub);
    }

    applyReadStateToItem(li);
    applyCategoryFilterToItem(li);
    return li;
}

async function bulkLoadCategory(categoryId, opts = {}) {
    const pane = document.getElementById(`tab-${categoryId}`);
    if (!pane) return;
    if (!pane.classList.contains('active')) return;

    try {
        if (pane.dataset) pane.dataset.bulkLoading = '1';
    } catch (e) {
        // ignore
    }

    const signal = opts.signal;
    if (signal?.aborted) {
        try {
            if (pane.dataset) delete pane.dataset.bulkLoading;
        } catch (e) {
            // ignore
        }
        return;
    }

    let cfg = null;
    try {
        if (TR.filter && typeof TR.filter.getCategoryFilterConfig === 'function') {
            cfg = TR.filter.getCategoryFilterConfig(categoryId);
        }
    } catch (e) {
        cfg = null;
    }
    const mode = cfg?.mode || 'exclude';
    const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
    const pageSize = Number.isFinite(opts.pageSize)
        ? opts.pageSize
        : MAX_ITEMS_PER_PLATFORM;

    const effectivePageSize = Math.min(Math.max(1, pageSize), MAX_ITEMS_PER_PLATFORM);

    const cards = Array.from(pane.querySelectorAll('.platform-card'));
    const platformIds = cards.map(c => (c?.dataset?.platform || '').trim()).filter(Boolean);
    if (platformIds.length <= 0) {
        try {
            if (pane.dataset) delete pane.dataset.bulkLoading;
        } catch (e) {
            // ignore
        }
        return;
    }

    for (const card of cards) {
        if (!card) continue;
        card.dataset.loading = '1';
        setPlaceholderText(card, '加载中...');
    }

    let payload;
    try {
        const resp = await fetch(`/api/news/pages?page_size=${encodeURIComponent(String(effectivePageSize))}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform_ids: platformIds }),
                signal,
            }
        );
        if (!resp.ok) return;
        payload = await resp.json();
    } catch (e) {
        return;
    } finally {
        try {
            if (pane.dataset) delete pane.dataset.bulkLoading;
        } catch (e) {
            // ignore
        }
    }

    const byPid = (payload && payload.platforms) || {};
    for (const card of cards) {
        if (signal?.aborted) return;
        const pid = (card?.dataset?.platform || '').trim();
        if (!pid) continue;
        const list = card.querySelector('.news-list');
        if (!list) continue;

        list.querySelectorAll('.news-placeholder').forEach((el) => el.remove());
        list.querySelectorAll('.news-item').forEach((el) => el.remove());

        const p = byPid[pid] || {};
        const items = Array.isArray(p.items) ? p.items : [];
        // Get platform name from card header
        const platformNameEl = card.querySelector('.platform-name');
        const platformName = platformNameEl ? platformNameEl.textContent.trim() : pid;
        for (let i = 0; i < items.length; i++) {
            list.appendChild(createNewsLi(items[i], i + 1, pid, categoryId, platformName));
        }

        const loadedCount = list.querySelectorAll('.news-item').length;
        card.dataset.loadedCount = String(loadedCount);
        card.dataset.hasMore = (p.has_more && loadedCount < MAX_ITEMS_PER_PLATFORM) ? '1' : '0';
        card.dataset.loading = '0';
        card.dataset.loadedDone = '1';

        try {
            if (TR.paging) {
                const pageSz = Math.min(MAX_ITEMS_PER_PLATFORM, loadedCount);
                TR.paging.setCardPageSize(card, pageSz);
                TR.paging.applyPagingToCard(card, 0);
            }
        } catch (e) {
            // ignore
        }

        if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
    }

    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
    try {
        if (TR.filter && typeof TR.filter.applyCategoryFilter === 'function') {
            TR.filter.applyCategoryFilter(categoryId);
        }
    } catch (e) {
        // ignore
    }
}

function scheduleBulkLoadCategory(categoryId, opts = {}) {
    cancelBulkLoadCategory();
    _bulkAbort = new AbortController();
    const signal = _bulkAbort.signal;
    _bulkTimer = setTimeout(() => {
        _bulkTimer = null;
        bulkLoadCategory(categoryId, { ...opts, signal }).catch(() => { });
    }, BULK_DEBOUNCE_MS);
}

async function ensureCategoryLoaded(categoryId, opts = {}) {
    const pane = document.getElementById(`tab-${categoryId}`);
    if (!pane) return;
    if (!pane.classList.contains('active')) return;

    const signal = opts.signal;
    if (signal?.aborted) return;

    let cfg = null;
    try {
        if (TR.filter && typeof TR.filter.getCategoryFilterConfig === 'function') {
            cfg = TR.filter.getCategoryFilterConfig(categoryId);
        }
    } catch (e) {
        cfg = null;
    }
    const mode = cfg?.mode || 'exclude';
    const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
    const wantFindMatch = mode === 'include' && keywords.length > 0;
    const maxPagesPerCard = Number.isFinite(opts.maxPagesPerCard)
        ? opts.maxPagesPerCard
        : (wantFindMatch ? 2 : 1);

    const cap = Number.isFinite(opts.cap) ? opts.cap : (wantFindMatch ? 10 : 4);
    const cards = Array.from(pane.querySelectorAll('.platform-card')).slice(0, Math.max(0, cap));
    for (const card of cards) {
        if (signal?.aborted) return;
        if (!card) continue;
        const list = card.querySelector('.news-list');
        if (!list) continue;

        const existingItems = list.querySelectorAll('.news-item').length;
        if (wantFindMatch && existingItems > 0) {
            card.dataset.loadedDone = '1';
            continue;
        }
        if (!wantFindMatch && existingItems > 0) {
            card.dataset.loadedDone = '1';
            continue;
        }

        let desiredTotal = STEP;
        for (let page = 0; page < maxPagesPerCard; page++) {
            if (signal?.aborted) return;

            setPlaceholderText(card, '加载中...');
            await fetchNextPage(card, Math.min(desiredTotal, MAX_ITEMS_PER_PLATFORM), { signal });

            try {
                if (TR.paging) {
                    TR.paging.setCardPageSize(card, Math.min(desiredTotal, MAX_ITEMS_PER_PLATFORM));
                    TR.paging.applyPagingToCard(card, 0);
                }
            } catch (e) {
                // ignore
            }

            const visibleItems = card.querySelectorAll(
                '.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)'
            ).length;
            if (!wantFindMatch) break;
            if (visibleItems > 0) break;

            const hasMore = card.dataset.hasMore !== '0';
            if (!hasMore) break;
            desiredTotal += STEP;
        }

        card.dataset.loadedDone = '1';
    }
    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();

    try {
        if (TR.filter && typeof TR.filter.applyCategoryFilter === 'function') {
            TR.filter.applyCategoryFilter(categoryId);
        }
    } catch (e) {
        // ignore
    }
}

function applyCategoryFilterToItem(li) {
    try {
        const catId = getActiveCategoryId();
        if (!catId || !TR.filter?.getCategoryFilterConfig) return;
        const cfg = TR.filter.getCategoryFilterConfig(catId);
        const mode = cfg?.mode || 'exclude';
        const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
        const title = (li?.textContent || '').toLowerCase();
        const matched = keywords.length > 0 ? keywords.some(k => title.includes(k)) : false;
        const shouldFilter = keywords.length === 0 ? false : (mode === 'include' ? !matched : matched);
        if (shouldFilter) li.classList.add('filtered');
        else li.classList.remove('filtered');
    } catch (e) {
        // ignore
    }
}

function applyReadStateToItem(li) {
    try {
        const id = li?.dataset?.newsId;
        if (!id || !TR.readState?.getReadNews) return;
        const reads = TR.readState.getReadNews() || {};
        if (!reads[id]) return;
        li.classList.add('read');
    } catch (e) {
        // ignore
    }
}

async function fetchNextPage(card, neededTotal, opts = {}) {
    const pid = (card?.dataset?.platform || '').trim();
    if (!pid) return { ok: false, hasMore: false };

    const signal = opts.signal;
    if (signal?.aborted) return { ok: false, hasMore: true };

    if (card.dataset.loading === '1') return { ok: false, hasMore: true };
    if (card.dataset.hasMore === '0') return { ok: false, hasMore: false };

    const list = card.querySelector('.news-list');
    if (!list) return { ok: false, hasMore: false };

    list.querySelectorAll('.news-placeholder').forEach((el) => el.remove());

    neededTotal = Math.min(Math.max(0, neededTotal || 0), MAX_ITEMS_PER_PLATFORM);

    const currentTotal = list.querySelectorAll('.news-item').length;
    if (currentTotal >= MAX_ITEMS_PER_PLATFORM) {
        card.dataset.hasMore = '0';
        return { ok: false, hasMore: false };
    }
    if (currentTotal >= neededTotal) return { ok: true, hasMore: true };

    card.dataset.loading = '1';
    try {
        if (_inFlight >= MAX_IN_FLIGHT) return { ok: false, hasMore: true };
        _inFlight += 1;
        const requestSize = Math.min(STEP, Math.max(0, MAX_ITEMS_PER_PLATFORM - currentTotal));
        if (requestSize <= 0) {
            card.dataset.hasMore = '0';
            return { ok: false, hasMore: false };
        }
        const url = `/api/news/page?platform_id=${encodeURIComponent(pid)}&offset=${encodeURIComponent(String(currentTotal))}&page_size=${encodeURIComponent(String(requestSize))}`;
        let resp;
        try {
            resp = await fetch(url, { signal });
        } catch (e) {
            if (signal?.aborted || (e && e.name === 'AbortError')) {
                if (card.querySelectorAll('.news-item').length <= 0) {
                    setPlaceholderText(card, '待加载...');
                }
                return { ok: false, hasMore: true };
            }
            throw e;
        }
        if (!resp.ok) return { ok: false, hasMore: true };

        const data = await resp.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        const hasMore = !!data?.has_more;
        if (!hasMore || (currentTotal + items.length) >= MAX_ITEMS_PER_PLATFORM) card.dataset.hasMore = '0';

        // Get platform name from card header
        const platformNameEl = card.querySelector('.platform-name');
        const platformName = platformNameEl ? platformNameEl.textContent.trim() : pid;
        for (let i = 0; i < items.length; i++) {
            const n = items[i] || {};
            const idx = currentTotal + i + 1;
            const li = createNewsLi(n, idx, pid, getActiveCategoryId(), platformName);
            list.appendChild(li);
        }

        card.dataset.loadedCount = String(list.querySelectorAll('.news-item').length);

        if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);

        return { ok: true, hasMore };
    } finally {
        _inFlight = Math.max(0, _inFlight - 1);
        card.dataset.loading = '0';
    }
}

async function expandIfNeeded(card) {
    if (!card || !TR.paging) return;

    const pane = card.closest('.tab-pane');
    if (pane && !pane.classList.contains('active')) return;

    const now = Date.now();
    if (now < _cooldownUntil) return;
    _cooldownUntil = now + COOLDOWN_MS;

    const offset = parseInt(card.dataset.pageOffset || '0', 10) || 0;
    const curPageSize = TR.paging.getCardPageSize(card);
    const maxAllowed = Math.max(0, MAX_ITEMS_PER_PLATFORM - offset);
    if (curPageSize >= maxAllowed) {
        card.dataset.hasMore = '0';
        return;
    }
    const desiredPageSize = Math.min(curPageSize + STEP, maxAllowed);
    const neededTotal = offset + desiredPageSize;

    await fetchNextPage(card, neededTotal);

    const total = card.querySelectorAll('.news-item').length;
    const nextPageSize0 = Math.min(Math.max(curPageSize, desiredPageSize), Math.max(total - offset, curPageSize));
    const nextPageSize = Math.min(nextPageSize0, maxAllowed);

    TR.paging.setCardPageSize(card, nextPageSize);
    TR.paging.applyPagingToCard(card, offset);

    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
}

function attach() {
    if (_observer) {
        try { _observer.disconnect(); } catch (e) { /* ignore */ }
        _observer = null;
    }

    _observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            if (!_armed) continue;
            if (_inFlight > 0) continue;
            const sentinel = entry.target;
            const card = sentinel?.closest?.('.platform-card');
            if (!card) continue;
            expandIfNeeded(card).catch(() => { });
        }
    }, { root: null, rootMargin: ROOT_MARGIN, threshold: 0.01 });

    document.querySelectorAll('.news-load-sentinel').forEach((el) => _observer.observe(el));
}

TR.infiniteScroll = { attach, ensureCategoryLoaded, scheduleEnsureCategoryLoaded, cancelEnsureCategoryLoaded, bulkLoadCategory, scheduleBulkLoadCategory, cancelBulkLoadCategory, markCategoryViewed };

ready(function () {
    // Avoid triggering loads immediately on first paint. Arm only after user/page scroll.
    try {
        window.addEventListener('scroll', () => {
            _armed = true;
        }, { passive: true, once: true });
    } catch (e) {
        // ignore
    }

    // Fallback: arm after a short delay to avoid tests getting stuck when the sentinel is already visible.
    setTimeout(() => {
        _armed = true;
    }, 1200);

    attach();

    // Mark initial category as viewed after a delay (for red dot logic)
    // This delay ensures first render completes without red dots
    setTimeout(() => {
        const activeTab = document.querySelector('.category-tabs .category-tab.active');
        if (activeTab && activeTab.dataset.category) {
            markCategoryViewed(activeTab.dataset.category);
        }
    }, 3000);

    // Listen for tab switches to mark new categories as viewed
    window.addEventListener('tr_tab_switched', (ev) => {
        const categoryId = String(ev?.detail?.categoryId || '').trim();
        if (categoryId) {
            setTimeout(() => markCategoryViewed(categoryId), 2000);
        }
    });
});
