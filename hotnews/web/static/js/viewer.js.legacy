// === 已读状态管理（基于内容哈希 + 自动过期） ===
const READ_STORAGE_KEY = 'hotnews_read_news_v2';  // 新版本 key
const OLD_STORAGE_KEY = 'hotnews_read_news';      // 旧版本 key
const SHOW_READ_MODE_KEY = 'hotnews_show_read_mode';
const EXPIRE_HOURS = 24;  // 已读记录过期时间（小时）

function getReadNews() {
    const stored = localStorage.getItem(READ_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
}

function getShowReadModePref() {
    const raw = localStorage.getItem(SHOW_READ_MODE_KEY);
    if (raw === null) return true;
    return raw === '1';
}

function applyShowReadMode(enabled) {
    if (enabled) document.body.classList.add('show-read-mode');
    else document.body.classList.remove('show-read-mode');
    const btn = document.getElementById('showReadBtn');
    if (btn) {
        if (enabled) btn.classList.add('active');
        else btn.classList.remove('active');
    }
}

function saveReadNews(reads) {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(reads));
}

// 迁移旧格式数据（清空）
function migrateOldFormat() {
    if (localStorage.getItem(OLD_STORAGE_KEY)) {
        localStorage.removeItem(OLD_STORAGE_KEY);
        console.log('已清除旧版本已读记录');
    }
}

// 清理过期的已读记录
function cleanupExpiredReads() {
    const now = Date.now();
    const reads = getReadNews();
    let changed = false;
    let removedCount = 0;

    for (const [id, info] of Object.entries(reads)) {
        const ageHours = (now - info.readAt) / (1000 * 60 * 60);
        if (ageHours < EXPIRE_HOURS) {
            // do nothing
        } else {
            // 取消勾选，从已读列表移除
            const item = document.querySelector(`[data-news-id="${id}"]`);
            if (item) {
                item.classList.remove('read');
                const checkbox = item.querySelector('.news-checkbox');
                if (checkbox) checkbox.checked = false;
            }
            delete reads[id];
            changed = true;
            removedCount++;
        }
    }

    if (changed) {
        saveReadNews(reads);
    }
    return removedCount;
}

function markAsRead(checkbox) {
    const item = checkbox.closest('.news-item');
    const newsId = item.dataset.newsId;
    const newsTitle = item.dataset.newsTitle || '';
    let reads = getReadNews();

    if (checkbox.checked) {
        item.classList.add('read');
        if (!reads[newsId]) {
            reads[newsId] = {
                title: newsTitle.substring(0, 50),
                readAt: Date.now()
            };
            saveReadNews(reads);
        }
    } else {
        // 取消勾选，从已读列表移除
        item.classList.remove('read');
        delete reads[newsId];
        saveReadNews(reads);
    }
    // 更新计数
    updatePlatformCount(checkbox.closest('.platform-card'));
    updateReadCount();
}

function updateReadCount() {
    const reads = getReadNews();
    const countEl = document.getElementById('readCount');
    if (countEl) countEl.textContent = Object.keys(reads).length;
}

function updatePlatformCount(card) {
    const visibleItems = card.querySelectorAll('.news-item:not(.read):not(.filtered):not(.search-hidden):not(.paged-hidden)');
    const visibleEl = card.querySelector('.platform-visible-count');
    if (visibleEl) visibleEl.textContent = visibleItems.length;
}

function updateAllCounts() {
    document.querySelectorAll('.platform-card').forEach(card => {
        updatePlatformCount(card);
    });
    // 更新总数
    const totalVisible = document.querySelectorAll('.news-item:not(.read):not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
    const totalEl = document.getElementById('totalNews');
    if (totalEl) totalEl.textContent = totalVisible;
}

function openLink(el) {
    const url = el.dataset.url;
    if (url) {
        window.open(url, '_blank');
    }
}

function isHoverDevice() {
    return (window.matchMedia && window.matchMedia('(hover: hover)').matches);
}

function closeAllPreviews(exceptItem) {
    document.querySelectorAll('.news-item.preview').forEach((it) => {
        if (exceptItem && it === exceptItem) return;
        it.classList.remove('preview');
    });
}

function handleTitleClickV2(el, evt) {
    evt.stopPropagation();
    const item = el.closest('.news-item');
    if (!item) return;

    if (isHoverDevice()) {
        openLink(el);
        return;
    }

    const isSame = item.classList.contains('preview');
    if (isSame) {
        openLink(el);
        item.classList.remove('preview');
        return;
    }

    closeAllPreviews(item);
    item.classList.add('preview');
}

function handleTitleKeydownV2(el, evt) {
    if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        handleTitleClickV2(el, evt);
    } else if (evt.key === 'Escape') {
        closeAllPreviews(null);
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.news-item')) return;
    closeAllPreviews(null);
});
document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.news-item')) return;
    closeAllPreviews(null);
}, { passive: true });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllPreviews(null);
});

function restoreReadState() {
    const reads = getReadNews();
    Object.keys(reads).forEach(id => {
        const item = document.querySelector(`[data-news-id="${id}"]`);
        if (item) {
            item.classList.add('read');
            const checkbox = item.querySelector('.news-checkbox');
            if (checkbox) checkbox.checked = true;
        }
    });
    // 恢复后更新所有计数
    updateAllCounts();
    updateReadCount();
}

function formatUpdatedAt(value) {
    const raw = (value == null) ? '' : String(value).trim();
    if (!raw) return raw;

    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
    if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;

    const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (m2) return raw;

    return raw;
}

function toggleShowRead() {
    const next = !document.body.classList.contains('show-read-mode');
    applyShowReadMode(next);
    localStorage.setItem(SHOW_READ_MODE_KEY, next ? '1' : '0');
    updateAllCounts();
}

function clearAllRead() {
    if (!confirm('确定要清除所有已读记录吗？所有新闻将恢复显示。')) return;

    // 清除所有已读状态
    document.querySelectorAll('.news-item.read').forEach(item => {
        item.classList.remove('read');
        const checkbox = item.querySelector('.news-checkbox');
        if (checkbox) checkbox.checked = false;
    });

    // 清空 localStorage
    saveReadNews({});

    // 更新计数
    updateAllCounts();
    updateReadCount();
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function () {
    applyShowReadMode(getShowReadModePref());
    // 1. 迁移旧格式数据
    migrateOldFormat();
    // 2. 清理过期记录
    const removed = cleanupExpiredReads();
    if (removed > 0) {
        console.log(`已清理 ${removed} 条过期已读记录`);
    }
    // 3. 恢复已读状态
    restoreReadState();
    // 4. 初始化已读计数
    updateReadCount();

    // 5. 初始化分页
    initPaging();

    // 6. 检查栏目设置 NEW 标记是否应该隐藏
    if (localStorage.getItem('category_settings_badge_dismissed') === 'true') {
        const badge = document.getElementById('categorySettingsNewBadge');
        if (badge) badge.style.display = 'none';
    }
});

const CATEGORY_PAGE_SIZE = 20;

function applyPagingToCard(card, offset) {
    const items = Array.from(card.querySelectorAll('.news-item'));
    const total = items.length;
    if (total <= CATEGORY_PAGE_SIZE) {
        items.forEach((it) => it.classList.remove('paged-hidden'));
        card.dataset.pageOffset = '0';
        return;
    }

    const safeOffset = Math.max(0, Math.min(offset, total - 1));
    const end = Math.min(safeOffset + CATEGORY_PAGE_SIZE, total);

    items.forEach((it, idx) => {
        if (idx >= safeOffset && idx < end) it.classList.remove('paged-hidden');
        else it.classList.add('paged-hidden');
    });

    card.dataset.pageOffset = String(safeOffset);
}

function initPaging() {
    document.querySelectorAll('.platform-card').forEach((card) => {
        applyPagingToCard(card, 0);
    });
    updateAllCounts();
}

function refreshPlatform(btn) {
    return;
}

const FEATURE_BADGE_PREFIX = 'hotnews_feature_badge_v1:';

function getFeatureBadgeState(featureId) {
    try {
        const raw = localStorage.getItem(FEATURE_BADGE_PREFIX + featureId);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function setFeatureBadgeState(featureId, state) {
    try {
        localStorage.setItem(FEATURE_BADGE_PREFIX + featureId, JSON.stringify(state));
    } catch (e) {
        // ignore
    }
}

function ensureFeatureFirstSeen(featureId) {
    const st = getFeatureBadgeState(featureId);
    if (st && typeof st.firstSeenAt === 'number') return st;
    const next = { firstSeenAt: Date.now(), seenAt: null };
    setFeatureBadgeState(featureId, next);
    return next;
}

function markFeatureSeen(featureId) {
    const st = ensureFeatureFirstSeen(featureId);
    if (!st.seenAt) {
        st.seenAt = Date.now();
        setFeatureBadgeState(featureId, st);
    }
}

function shouldShowFeatureBadge(featureId, ttlDays) {
    const st = ensureFeatureFirstSeen(featureId);
    if (st.seenAt) return false;
    const ttlMs = (ttlDays || 7) * 24 * 60 * 60 * 1000;
    return (Date.now() - (st.firstSeenAt || 0)) <= ttlMs;
}

function updateNewBadges() {
    const elSports = document.getElementById('newBadgeSportsTab');
    if (elSports) {
        elSports.style.display = shouldShowFeatureBadge('sports-nba-schedule', 7) ? '' : 'none';
    }
}

// === 过滤功能 ===
const LEGACY_FILTER_STORAGE_KEY = 'hotnews_filter_keywords';
const LEGACY_FILTER_MODE_KEY = 'hotnews_filter_mode_v1';

let _editingCategoryFilterKeywords = [];
let _editingCategoryFilterMode = 'exclude';

function normalizeFilterMode(v) {
    return v === 'include' ? 'include' : 'exclude';
}

function ensureCategoryFilters(config) {
    if (!config.categoryFilters || typeof config.categoryFilters !== 'object') {
        config.categoryFilters = {};
    }
}

function normalizeCategoryConfig(config) {
    const base = config && typeof config === 'object' ? config : {};
    if (!Array.isArray(base.customCategories)) base.customCategories = [];
    if (!Array.isArray(base.hiddenDefaultCategories)) base.hiddenDefaultCategories = [];
    if (!Array.isArray(base.categoryOrder)) base.categoryOrder = [];
    if (!base.platformOrder || typeof base.platformOrder !== 'object') base.platformOrder = {};
    ensureCategoryFilters(base);
    return base;
}

function migrateLegacyGlobalFilterToCategoryFilters() {
    const rawKeywords = localStorage.getItem(LEGACY_FILTER_STORAGE_KEY);
    const rawMode = localStorage.getItem(LEGACY_FILTER_MODE_KEY);
    if (!rawKeywords && !rawMode) return;

    let keywords = [];
    try {
        keywords = rawKeywords ? JSON.parse(rawKeywords) : [];
    } catch (e) {
        keywords = [];
    }
    if (!Array.isArray(keywords)) keywords = [];
    keywords = keywords.map(k => String(k || '').trim().toLowerCase()).filter(Boolean);

    const mode = normalizeFilterMode(rawMode);

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    ensureCategoryFilters(config);

    const merged = getMergedCategoryConfig();
    const allIds = merged.categoryOrder || [];
    allIds.forEach((catId) => {
        if (!config.categoryFilters[catId]) {
            config.categoryFilters[catId] = { mode, keywords: [...keywords] };
        }
    });

    saveCategoryConfig(config);

    localStorage.removeItem(LEGACY_FILTER_STORAGE_KEY);
    localStorage.removeItem(LEGACY_FILTER_MODE_KEY);
}

function getCategoryFilterConfig(catId) {
    if (!catId) return { mode: 'exclude', keywords: [] };
    const merged = getMergedCategoryConfig();
    const cf = merged.categoryFilters && merged.categoryFilters[catId];
    const mode = normalizeFilterMode(cf && cf.mode);
    const keywords = Array.isArray(cf && cf.keywords) ? cf.keywords : [];
    return {
        mode,
        keywords: keywords.map(k => String(k || '').trim().toLowerCase()).filter(Boolean)
    };
}

function applyCategoryFilter(categoryId) {
    const paneEl = document.getElementById(`tab-${categoryId}`);
    if (!paneEl) return;

    const cfg = getCategoryFilterConfig(categoryId);
    const mode = cfg.mode;
    const keywords = cfg.keywords;

    paneEl.querySelectorAll('.news-item').forEach(item => {
        const title = (item.textContent || '').toLowerCase();
        const matched = keywords.length > 0 ? keywords.some(k => title.includes(k)) : false;
        const shouldFilter = keywords.length === 0 ? false : (mode === 'include' ? !matched : matched);

        if (shouldFilter) item.classList.add('filtered');
        else item.classList.remove('filtered');
    });

    paneEl.querySelectorAll('.platform-card').forEach(card => {
        card.classList.remove('platform-empty-hidden');
    });

    if (mode === 'include') {
        paneEl.querySelectorAll('.platform-card').forEach(card => {
            const visibleItems = card.querySelectorAll('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
            if (visibleItems <= 0) {
                card.classList.add('platform-empty-hidden');
            }
        });
    }

    updateAllCounts();
}

function applyCategoryFilterForActiveTab() {
    const active = document.querySelector('.category-tabs .category-tab.active');
    const catId = active?.dataset?.category;
    if (catId) applyCategoryFilter(catId);
}

function setCategoryFilterEditorState(mode, keywords) {
    _editingCategoryFilterMode = normalizeFilterMode(mode);
    _editingCategoryFilterKeywords = (Array.isArray(keywords) ? keywords : [])
        .map(k => String(k || '').trim().toLowerCase())
        .filter(Boolean);

    const toggle = document.getElementById('categoryFilterModeToggle');
    if (toggle) toggle.checked = _editingCategoryFilterMode === 'include';
    const input = document.getElementById('categoryFilterInput');
    if (input) input.value = '';
    renderCategoryFilterTags();
}

function handleCategoryFilterModeToggle(input) {
    _editingCategoryFilterMode = input && input.checked ? 'include' : 'exclude';
}

function handleCategoryFilterKeypress(event) {
    if (event.key === 'Enter') {
        addCategoryFilterKeyword();
    }
}

function addCategoryFilterKeyword() {
    const input = document.getElementById('categoryFilterInput');
    const keyword = (input?.value || '').trim().toLowerCase();
    if (!keyword) return;

    if (!_editingCategoryFilterKeywords.includes(keyword)) {
        _editingCategoryFilterKeywords.push(keyword);
        renderCategoryFilterTags();
    }
    if (input) input.value = '';
}

function removeCategoryFilterKeyword(keyword) {
    _editingCategoryFilterKeywords = _editingCategoryFilterKeywords.filter(k => k !== keyword);
    renderCategoryFilterTags();
}

function renderCategoryFilterTags() {
    const tagsEl = document.getElementById('categoryFilterTags');
    if (!tagsEl) return;
    tagsEl.innerHTML = _editingCategoryFilterKeywords.map(k =>
        `<span class="filter-tag">${escapeHtml(k)}<span class="filter-remove" onclick="removeCategoryFilterKeyword('${escapeHtml(k)}')">×</span></span>`
    ).join('');
}

document.addEventListener('DOMContentLoaded', function () {
    migrateLegacyGlobalFilterToCategoryFilters();
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function () {
    restoreActiveTab();
    attachPlatformGridScrollPersistence();
    const tabId = localStorage.getItem(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
    if (tabId) {
        restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }
    applyCategoryFilterForActiveTab();

    // 检查用户是否有自定义配置
    const config = getCategoryConfig();
    const hasCustomConfig = config && (
        (config.customCategories && config.customCategories.length > 0) ||
        (config.hiddenDefaultCategories && config.hiddenDefaultCategories.length > 0) ||
        (config.categoryOrder && config.categoryOrder.length > 0)
    );

    if (hasCustomConfig) {
        // 有自定义配置，触发数据刷新来应用用户配置
        // renderViewerFromData 完成后会添加 .categories-ready 类
        refreshViewerData({ preserveScroll: false });
    } else {
        // 无自定义配置，直接显示服务端渲染的默认栏目
        document.body.classList.add('categories-ready');
    }
});

// === 在线人数（心跳 + 统计） ===
const ONLINE_SESSION_KEY = 'hotnews_online_session_id';

function getOnlineSessionId() {
    let id = localStorage.getItem(ONLINE_SESSION_KEY);
    if (id) return id;
    if (window.crypto && crypto.randomUUID) {
        id = crypto.randomUUID();
    } else {
        id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }
    localStorage.setItem(ONLINE_SESSION_KEY, id);
    return id;
}

async function onlinePing() {
    try {
        await fetch('/api/online/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: getOnlineSessionId() })
        });
    } catch (e) {
        // ignore
    }
}

async function refreshOnlineStats() {
    try {
        const res = await fetch('/api/online');
        const data = await res.json();
        const el5 = document.getElementById('online5m');
        if (el5) el5.textContent = data.online_5m ?? '-';
    } catch (e) {
        // ignore
    }
}

document.addEventListener('DOMContentLoaded', function () {
    onlinePing();
    refreshOnlineStats();
    setInterval(onlinePing, 15000);
    setInterval(refreshOnlineStats, 10000);
});

// === Tab 切换 ===
const TAB_STORAGE_KEY = 'hotnews_active_tab';

const NEW_BADGE_STORAGE_KEY = 'hotnews_new_badges_dismissed_v1';

function getDismissedNewBadges() {
    try {
        const raw = localStorage.getItem(NEW_BADGE_STORAGE_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return {
            categories: obj?.categories || {},
            platforms: obj?.platforms || {},
        };
    } catch (e) {
        return { categories: {}, platforms: {} };
    }
}

function setDismissedNewBadges(next) {
    try {
        localStorage.setItem(NEW_BADGE_STORAGE_KEY, JSON.stringify(next || { categories: {}, platforms: {} }));
    } catch (e) {
        // ignore
    }
}

function applyDismissedNewBadges() {
    const dismissed = getDismissedNewBadges();
    document.querySelectorAll('.new-badge-category').forEach((el) => {
        const cid = el?.dataset?.category;
        if (cid && dismissed.categories?.[cid]) {
            el.style.display = 'none';
        }
    });
    document.querySelectorAll('.new-badge-platform').forEach((el) => {
        const pid = el?.dataset?.platform;
        if (pid && dismissed.platforms?.[pid]) {
            el.style.display = 'none';
        }
    });
}

function dismissNewCategoryBadge(categoryId) {
    if (!categoryId) return;
    const dismissed = getDismissedNewBadges();
    if (!dismissed.categories?.[categoryId]) {
        dismissed.categories[categoryId] = true;
        setDismissedNewBadges(dismissed);
    }
    document.querySelectorAll(`.new-badge-category[data-category="${CSS.escape(categoryId)}"]`).forEach((el) => {
        el.style.display = 'none';
    });
}

function dismissNewPlatformBadge(platformId) {
    if (!platformId) return;
    const dismissed = getDismissedNewBadges();
    if (!dismissed.platforms?.[platformId]) {
        dismissed.platforms[platformId] = true;
        setDismissedNewBadges(dismissed);
    }
    document.querySelectorAll(`.new-badge-platform[data-platform="${CSS.escape(platformId)}"]`).forEach((el) => {
        el.style.display = 'none';
    });
}

function switchTab(categoryId) {
    dismissNewCategoryBadge(categoryId);
    const escapedCategoryId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(categoryId)) : String(categoryId);
    const tabEl = document.querySelector(`.category-tab[data-category="${escapedCategoryId}"]`);
    const paneEl = document.getElementById(`tab-${categoryId}`);
    if (!tabEl || !paneEl) {
        const firstTab = document.querySelector('.category-tab');
        if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
            switchTab(firstTab.dataset.category);
        } else {
            localStorage.removeItem(TAB_STORAGE_KEY);
        }
        return;
    }
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    paneEl.classList.add('active');
    // 保存当前Tab状态
    localStorage.setItem(TAB_STORAGE_KEY, categoryId);

    restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: categoryId });

    if (categoryId === 'sports') {
        markFeatureSeen('sports-nba-schedule');
        updateNewBadges();
    }

    applyCategoryFilter(categoryId);
}

function restoreActiveTab() {
    const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
    if (savedTab) {
        const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
        if (tabEl) {
            switchTab(savedTab);
        }
    }
}

// === 搜索 ===
function searchNews() {
    const q = document.getElementById('searchInput').value.toLowerCase();

    document.querySelectorAll('.news-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        const matchSearch = !q || text.includes(q);
        if (matchSearch) {
            item.classList.remove('search-hidden');
        } else {
            item.classList.add('search-hidden');
        }
    });

    updateAllCounts();
}

// === 数据获取 ===
async function fetchData() {
    const btn = document.getElementById('fetchBtn');
    const progress = document.getElementById('progressContainer');
    const bar = document.getElementById('progressBar');
    const status = document.getElementById('fetchStatus');

    btn.classList.add('loading');
    btn.disabled = true;
    progress.classList.add('show');
    bar.classList.add('indeterminate');
    status.className = 'fetch-status';
    status.textContent = '正在获取数据...';

    try {
        const response = await fetch('/api/fetch', { method: 'POST' });
        const result = await response.json();

        bar.classList.remove('indeterminate');

        if (result.success) {
            bar.style.width = '100%';
            status.className = 'fetch-status success';
            status.textContent = `✅ ${result.platforms} 个平台，${result.news_count} 条新闻`;
            setTimeout(() => refreshViewerData({ preserveScroll: true }), 300);
        } else {
            bar.style.width = '0%';
            status.className = 'fetch-status error';
            status.textContent = `❌ ${result.error}`;
        }
    } catch (error) {
        bar.classList.remove('indeterminate');
        bar.style.width = '0%';
        status.className = 'fetch-status error';
        status.textContent = `❌ ${error.message}`;
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        setTimeout(() => {
            progress.classList.remove('show');
            bar.style.width = '0%';
        }, 5000);
    }
}

let _ajaxRefreshInFlight = false;
let _ajaxLastRefreshAt = 0;
let _ajaxRefreshPending = null;

function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const PLATFORM_GRID_SCROLL_STORAGE_KEY = 'hotnews_platform_grid_scroll_v1';

function getPlatformGridScrollState() {
    const raw = localStorage.getItem(PLATFORM_GRID_SCROLL_STORAGE_KEY);
    if (!raw) return {};
    try {
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
        return {};
    }
}

function setPlatformGridScrollState(state) {
    try {
        localStorage.setItem(PLATFORM_GRID_SCROLL_STORAGE_KEY, JSON.stringify(state || {}));
    } catch (e) {
        // ignore
    }
}

function recordPlatformGridScrollForTab(tabId, grid) {
    if (!tabId || !grid) return;

    const left = grid.scrollLeft || 0;
    let anchorPlatformId = null;
    let anchorOffsetX = 0;

    let anchor = null;
    const cards = grid.querySelectorAll('.platform-card');
    for (const card of cards) {
        if ((card.offsetLeft || 0) <= left + 1) {
            anchor = card;
        } else {
            break;
        }
    }
    if (anchor?.dataset?.platform) {
        anchorPlatformId = anchor.dataset.platform;
        anchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
    }

    const state = getPlatformGridScrollState();
    state[tabId] = {
        left,
        anchorPlatformId,
        anchorOffsetX,
        updatedAt: Date.now(),
    };
    setPlatformGridScrollState(state);
}

function attachPlatformGridScrollPersistence() {
    document.querySelectorAll('.tab-pane .platform-grid').forEach((grid) => {
        if (grid.dataset.scrollPersistBound === '1') return;
        grid.dataset.scrollPersistBound = '1';

        let ticking = false;
        grid.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const pane = grid.closest('.tab-pane');
                const tabId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : null;
                recordPlatformGridScrollForTab(tabId, grid);
            });
        }, { passive: true });
    });
}

function snapshotViewerState() {
    const activeTab = localStorage.getItem(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
    const pagingOffsets = {};
    document.querySelectorAll('.platform-card').forEach((card) => {
        const pid = card.dataset.platform;
        if (!pid) return;
        pagingOffsets[pid] = parseInt(card.dataset.pageOffset || '0', 10) || 0;
    });
    const grid = activeTab ? document.querySelector(`#tab-${activeTab} .platform-grid`) : null;
    const activeTabPlatformGridScrollLeft = grid ? (grid.scrollLeft || 0) : 0;
    let activeTabPlatformAnchorPlatformId = null;
    let activeTabPlatformAnchorOffsetX = 0;
    if (grid) {
        const left = grid.scrollLeft || 0;
        let anchor = null;
        const cards = grid.querySelectorAll('.platform-card');
        for (const card of cards) {
            if ((card.offsetLeft || 0) <= left + 1) {
                anchor = card;
            } else {
                break;
            }
        }
        if (anchor?.dataset?.platform) {
            activeTabPlatformAnchorPlatformId = anchor.dataset.platform;
            activeTabPlatformAnchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
        }
    }
    if (activeTab && grid) {
        recordPlatformGridScrollForTab(activeTab, grid);
    }
    return {
        activeTab,
        pagingOffsets,
        activeTabPlatformGridScrollLeft,
        activeTabPlatformAnchorPlatformId,
        activeTabPlatformAnchorOffsetX,
        showReadMode: document.body.classList.contains('show-read-mode'),
        scrollY: window.scrollY || 0,
        searchText: (document.getElementById('searchInput')?.value || ''),
    };
}

function restoreActiveTabPlatformGridScroll(state) {
    const tabId = state?.activeTab;
    if (!state?.preserveScroll || !tabId) return;

    const saved = getPlatformGridScrollState()?.[tabId];
    const left = Number.isFinite(saved?.left) ? saved.left : (Number.isFinite(state.activeTabPlatformGridScrollLeft) ? state.activeTabPlatformGridScrollLeft : 0);
    const anchorId = (typeof saved?.anchorPlatformId === 'string' && saved.anchorPlatformId) ? saved.anchorPlatformId : state.activeTabPlatformAnchorPlatformId;
    const offsetX = Number.isFinite(saved?.anchorOffsetX) ? saved.anchorOffsetX : (Number.isFinite(state.activeTabPlatformAnchorOffsetX) ? state.activeTabPlatformAnchorOffsetX : 0);

    const applyOnce = () => {
        const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
        if (!grid) return;

        if (anchorId) {
            let anchorCard = null;
            grid.querySelectorAll('.platform-card').forEach((card) => {
                if (!anchorCard && card.dataset.platform === anchorId) {
                    anchorCard = card;
                }
            });
            if (anchorCard && anchorCard.offsetParent !== null) {
                grid.scrollLeft = (anchorCard.offsetLeft || 0) + offsetX;
                return;
            }
        }

        grid.scrollLeft = left;
    };

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            applyOnce();
            setTimeout(applyOnce, 50);
            setTimeout(applyOnce, 200);
            setTimeout(applyOnce, 600);
        });
    });
}

// === 用户菜单 ===
async function renderUserMenu() {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // Check if menu already exists
    if (document.getElementById('userMenu')) return;

    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        const div = document.createElement('div');
        div.id = 'userMenu';
        div.className = 'user-menu';

        if (data.ok && data.user) {
            // Logged in
            const name = data.user.nickname || data.user.email || 'Me';
            const initial = name[0].toUpperCase();

            div.innerHTML = `
                <div class="user-avatar" onclick="toggleUserDropdown()" title="${name}">
                    ${initial}
                </div>
                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-item user-info-item">${name}</div>
                    <div class="dropdown-divider"></div>
                    <a href="/api/user/preferences/page" class="dropdown-item">⚙️ 我的设置</a>
                    <div class="dropdown-item" onclick="logoutUser()">🚪 退出登录</div>
                </div>
            `;

            // Add styles if not present
            if (!document.getElementById('user-menu-styles')) {
                const style = document.createElement('style');
                style.id = 'user-menu-styles';
                style.textContent = `
                    .user-menu { position: relative; margin-left: 10px; }
                    .user-avatar {
                        width: 32px; height: 32px; border-radius: 50%;
                        background: #3B82F6; color: white;
                        display: flex; align-items: center; justify-content: center;
                        font-weight: bold; cursor: pointer; user-select: none;
                        font-size: 14px;
                    }
                    .user-dropdown {
                        display: none; position: absolute; right: 0; top: 40px;
                        background: #1E293B; border: 1px solid #334155;
                        border-radius: 8px; width: 160px; z-index: 1000;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
                    }
                    .user-dropdown.show { display: block; }
                    .dropdown-item {
                        padding: 10px 16px; cursor: pointer; color: #F1F5F9;
                        text-decoration: none; display: block; font-size: 14px;
                    }
                    .dropdown-item:hover { background: #334155; }
                    .user-info-item { color: #94A3B8; font-size: 12px; cursor: default; }
                    .user-info-item:hover { background: transparent; }
                    .dropdown-divider { height: 1px; background: #334155; margin: 4px 0; }
                `;
                document.head.appendChild(style);
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.user-menu')) {
                    document.getElementById('userDropdown')?.classList.remove('show');
                }
            });

        } else {
            // Not logged in
            div.innerHTML = `
                <a href="/api/auth/page" class="login-btn">登录 / 注册</a>
            `;
            if (!document.getElementById('user-login-styles')) {
                const style = document.createElement('style');
                style.id = 'user-login-styles';
                style.textContent = `
                    .login-btn {
                        background: #3B82F6; color: white; padding: 6px 12px;
                        border-radius: 6px; text-decoration: none; font-size: 14px;
                        margin-left: 10px; transition: background 0.2s;
                    }
                    .login-btn:hover { background: #2563EB; }
                `;
                document.head.appendChild(style);
            }
        }

        // Insert as the last item (rightmost)
        headerRight.appendChild(div);

    } catch (e) {
        console.error('Failed to render user menu:', e);
    }
}

function toggleUserDropdown() {
    const d = document.getElementById('userDropdown');
    if (d) d.classList.toggle('show');
}

async function logoutUser() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
    } catch (e) {
        alert('退出失败');
    }
}

function renderViewerFromData(data, state) {
    renderUserMenu();

    const contentEl = document.querySelector('.tab-content-area');
    const tabsEl = document.querySelector('.category-tabs');
    if (!tabsEl || !contentEl) return;

    // 应用用户栏目配置
    const categories = applyCategoryConfigToData(data?.categories || {});

    const tabsHtml = Object.entries(categories).map(([catId, cat]) => {
        const icon = escapeHtml(cat?.icon || '');
        const name = escapeHtml(cat?.name || catId);
        const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${escapeHtml(catId)}">NEW</span>` : '';
        const badgeSports = catId === 'sports' ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : '';
        const badge = `${badgeCategory}${badgeSports}`;
        return `
            <div class="category-tab" data-category="${escapeHtml(catId)}" onclick="switchTab('${escapeHtml(catId)}')">
                <div class="category-tab-icon">${icon}</div>
                <div class="category-tab-name">${name}${badge}</div>
            </div>`;
    }).join('');

    const contentHtml = Object.entries(categories).map(([catId, cat]) => {
        const platforms = cat?.platforms || {};
        const platformCards = Object.entries(platforms).map(([platformId, platform]) => {
            const platformName = escapeHtml(platform?.name || platformId);
            const platformBadge = platform?.is_new ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(platformId)}">NEW</span>` : '';
            const news = Array.isArray(platform?.news) ? platform.news : [];
            const pagingOffset = (platformId && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[platformId])) ? state.pagingOffsets[platformId] : 0;
            const newsItemsHtml = news.map((n, idx) => {
                const stableId = escapeHtml(n?.stable_id || '');
                const title = escapeHtml(n?.display_title || n?.title || '');
                const url = escapeHtml(n?.url || '');
                const meta = escapeHtml(n?.meta || '');
                const rank = escapeHtml(n?.rank ?? '');
                const isCross = !!n?.is_cross_platform;
                const crossPlatforms = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
                const crossTitle = escapeHtml(crossPlatforms.join(', '));
                const crossCount = escapeHtml(n?.cross_platform_count ?? '');
                const crossBadge = isCross ? `<span class="cross-platform-badge" title="同时出现在: ${crossTitle}">🔥 ${crossCount}</span>` : '';
                const crossClass = isCross ? 'cross-platform' : '';
                const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
                const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + CATEGORY_PAGE_SIZE)) ? ' paged-hidden' : '';
                const metaHtml = meta ? `<div class="news-subtitle">${meta}</div>` : '';
                return `
                            <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${title}">
                                <div class="news-item-content">
                                    <input type="checkbox" class="news-checkbox" onchange="markAsRead(this)" title="标记已读">
                                    ${indexHtml}
                                    <div class="news-title ${platformId === 'nba-schedule' ? 'nba-title ' : ''}${crossClass}" onclick="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)" tabindex="0" role="button" data-url="${url}">
                                        ${title}
                                        ${crossBadge}
                                    </div>
                                </div>
                                ${metaHtml}
                            </li>`;
            }).join('');

            return `
                    <div class="platform-card" data-platform="${escapeHtml(platformId)}">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(platformId)}')">📱 ${platformName}${platformBadge}</div>
                            <button class="platform-refresh-btn" type="button" onclick="refreshPlatform(this)" title="仅刷新本平台，换新（20条)"><span>换新</span></button>
                        </div>
                        <ul class="news-list">${newsItemsHtml}
                        </ul>
                    </div>`;
        }).join('');

        return `
            <div class="tab-pane" id="tab-${escapeHtml(catId)}">
                <div class="platform-grid">${platformCards}
                </div>
            </div>`;
    }).join('');

    tabsEl.innerHTML = tabsHtml;
    contentEl.innerHTML = contentHtml;

    const updatedAtEl = document.getElementById('updatedAt');
    if (updatedAtEl && data?.updated_at) updatedAtEl.textContent = formatUpdatedAt(data.updated_at);

    const desiredTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;
    if (desiredTab) {
        const escapedDesired = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(desiredTab) : desiredTab;
        const desiredTabEl = document.querySelector(`.category-tab[data-category="${escapedDesired}"]`);
        if (desiredTabEl) {
            switchTab(desiredTab);
        } else {
            const firstTab = document.querySelector('.category-tab');
            if (firstTab?.dataset?.category) {
                switchTab(firstTab.dataset.category);
            } else {
                localStorage.removeItem(TAB_STORAGE_KEY);
            }
        }
    } else {
        const firstTab = document.querySelector('.category-tab');
        if (firstTab?.dataset?.category) {
            switchTab(firstTab.dataset.category);
        } else {
            localStorage.removeItem(TAB_STORAGE_KEY);
        }
    }

    const nextShowReadMode = (typeof state?.showReadMode === 'boolean') ? state.showReadMode : getShowReadModePref();
    applyShowReadMode(nextShowReadMode);

    const searchEl = document.getElementById('searchInput');
    if (searchEl && typeof state?.searchText === 'string') {
        searchEl.value = state.searchText;
    }
    searchNews();

    applyCategoryFilterForActiveTab();

    restoreReadState();

    document.querySelectorAll('.platform-card').forEach((card) => {
        const pid = card.dataset.platform;
        const off = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;
        applyPagingToCard(card, off);
    });

    updateAllCounts();
    updateReadCount();
    restoreActiveTabPlatformGridScroll(state);
    attachPlatformGridScrollPersistence();

    // 数据渲染完成，揭开幕布显示栏目
    document.body.classList.add('categories-ready');
}

async function refreshViewerData(opts = {}) {
    const preserveScroll = opts.preserveScroll !== false;

    if (_ajaxRefreshInFlight) {
        if (!_ajaxRefreshPending) {
            _ajaxRefreshPending = { preserveScroll };
        } else {
            // preserveScroll=false 优先级更高（更"强"的刷新）
            _ajaxRefreshPending.preserveScroll = _ajaxRefreshPending.preserveScroll && preserveScroll;
        }
        return;
    }
    _ajaxRefreshInFlight = true;
    try {
        const state = snapshotViewerState();
        state.preserveScroll = preserveScroll;
        const response = await fetch('/api/news');
        const data = await response.json();
        renderViewerFromData(data, state);
        if (state.preserveScroll) {
            window.scrollTo({ top: state.scrollY, behavior: 'auto' });
            restoreActiveTabPlatformGridScroll(state);
        }
        _ajaxLastRefreshAt = Date.now();
    } catch (e) {
        // ignore
    } finally {
        _ajaxRefreshInFlight = false;

        const pending = _ajaxRefreshPending;
        _ajaxRefreshPending = null;
        if (pending) {
            refreshViewerData({ preserveScroll: pending.preserveScroll });
        }
    }
}

function setupAjaxAutoRefresh() {
    const intervalMs = 300000;
    setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - _ajaxLastRefreshAt < intervalMs - 5000) return;
        refreshViewerData({ preserveScroll: true });
    }, 5000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshViewerData({ preserveScroll: true });
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const updatedAtEl = document.getElementById('updatedAt');
    if (updatedAtEl && updatedAtEl.textContent) {
        updatedAtEl.textContent = formatUpdatedAt(updatedAtEl.textContent);
    }
    setupAjaxAutoRefresh();
    applyDismissedNewBadges();
});

// === 栏目配置管理 ===
const CATEGORY_CONFIG_KEY = 'hotnews_categories_config';
const CATEGORY_CONFIG_VERSION = 1;

// 默认栏目配置（从后端获取）
let _defaultCategories = null;
let _allPlatforms = null;
let _editingCategoryId = null;
let _isAddingNew = false;
let _settingsHideDefaultCategories = false;
let _settingsCategoryListCollapsed = true;
let _settingsAllCategoriesOffSnapshot = null;
let _platformSearchQuery = '';

function getCategoryConfig() {
    try {
        const raw = localStorage.getItem(CATEGORY_CONFIG_KEY);
        if (!raw) return null;
        const config = JSON.parse(raw);
        if (config.version !== CATEGORY_CONFIG_VERSION) {
            // 版本不匹配，需要迁移或重置
            return null;
        }
        return normalizeCategoryConfig(config);
    } catch (e) {
        return null;
    }
}

function saveCategoryConfig(config) {
    config.version = CATEGORY_CONFIG_VERSION;
    localStorage.setItem(CATEGORY_CONFIG_KEY, JSON.stringify(config));
}

function getDefaultCategoryConfig() {
    // 从页面数据中提取默认栏目配置
    if (!_defaultCategories) {
        _defaultCategories = {};
        _allPlatforms = {};
        document.querySelectorAll('.category-tab').forEach(tab => {
            const catId = tab.dataset.category;
            const icon = tab.querySelector('.category-tab-icon')?.textContent?.trim() || '📁';
            const name = tab.querySelector('.category-tab-name')?.textContent?.replace(/NEW$/, '')?.trim() || catId;
            _defaultCategories[catId] = { id: catId, name, icon, isDefault: true };
        });
        document.querySelectorAll('.platform-card').forEach(card => {
            const platformId = card.dataset.platform;
            const platformName = card.querySelector('.platform-name')?.textContent?.trim()?.replace(/📱\s*/, '')?.split(' ')[0] || platformId;
            const tabPane = card.closest('.tab-pane');
            const catId = tabPane?.id?.replace('tab-', '') || 'other';
            _allPlatforms[platformId] = { id: platformId, name: platformName, defaultCategory: catId };
            if (_defaultCategories[catId]) {
                if (!_defaultCategories[catId].platforms) _defaultCategories[catId].platforms = [];
                _defaultCategories[catId].platforms.push(platformId);
            }
        });
    }
    return {
        version: CATEGORY_CONFIG_VERSION,
        customCategories: [],
        hiddenDefaultCategories: [],
        categoryOrder: Object.keys(_defaultCategories),
        platformOrder: {}, // { categoryId: [platformId, ...] }
        categoryFilters: {} // { categoryId: { mode: 'exclude'|'include', keywords: [] } }
    };
}

function getMergedCategoryConfig() {
    const defaultConfig = getDefaultCategoryConfig();
    const userConfig = getCategoryConfig();
    if (!userConfig) return defaultConfig;

    // 合并配置
    const merged = {
        ...defaultConfig,
        customCategories: userConfig.customCategories || [],
        hiddenDefaultCategories: userConfig.hiddenDefaultCategories || [],
        categoryOrder: userConfig.categoryOrder || defaultConfig.categoryOrder,
        platformOrder: userConfig.platformOrder || {},
        categoryFilters: userConfig.categoryFilters || {}
    };

    // 确保所有默认栏目都在 order 中
    Object.keys(_defaultCategories).forEach(catId => {
        if (!merged.categoryOrder.includes(catId)) {
            merged.categoryOrder.push(catId);
        }
    });

    // 确保所有自定义栏目都在 order 中
    merged.customCategories.forEach(cat => {
        if (!merged.categoryOrder.includes(cat.id)) {
            merged.categoryOrder.push(cat.id);
        }
    });

    return merged;
}

async function openCategorySettings() {
    // 隐藏 NEW 标记并记录到 localStorage
    const newBadge = document.getElementById('categorySettingsNewBadge');
    if (newBadge) {
        newBadge.style.display = 'none';
        localStorage.setItem('category_settings_badge_dismissed', 'true');
    }
    // 先从服务端获取完整数据，确保 _defaultCategories 正确初始化
    if (!_defaultCategories || Object.keys(_defaultCategories).length === 0) {
        try {
            const response = await fetch('/api/news');
            const data = await response.json();
            if (data?.categories) {
                _defaultCategories = {};
                _allPlatforms = {};
                Object.entries(data.categories).forEach(([catId, cat]) => {
                    _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
                    Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                        _allPlatforms[pid] = { id: pid, name: p.name, defaultCategory: catId, data: p };
                    });
                });
            }
        } catch (e) {
            console.error('Failed to fetch categories:', e);
        }
    }
    const modal = document.getElementById('categorySettingsModal');
    modal.classList.add('show');
    _settingsCategoryListCollapsed = true;
    _settingsAllCategoriesOffSnapshot = null;
    applyCategoryListCollapseState();
    renderCategoryList();
    hideEditPanel();
}

function applyCategoryListCollapseState() {
    const wrapper = document.getElementById('categoryListWrapper');
    if (wrapper) {
        if (_settingsCategoryListCollapsed) wrapper.classList.add('collapsed');
        else wrapper.classList.remove('collapsed');
    }

    const btn = document.getElementById('categoryListToggleBtn');
    if (btn) {
        btn.textContent = _settingsCategoryListCollapsed ? '展开栏目列表' : '收起栏目列表';
    }
}

function toggleCategoryListCollapseInSettings() {
    _settingsCategoryListCollapsed = !_settingsCategoryListCollapsed;
    applyCategoryListCollapseState();
}

let _categoryConfigChanged = false;

function closeCategorySettings() {
    const modal = document.getElementById('categorySettingsModal');
    modal.classList.remove('show');
    // 只有在配置有变化时才刷新
    if (_categoryConfigChanged) {
        _categoryConfigChanged = false;
        applyCategoryConfig();
    }
}

function saveCategorySettings() {
    // 如果正在编辑栏目，先保存
    const editPanel = document.getElementById('categoryEditPanel');
    const isEditing = editPanel && editPanel.classList.contains('show');
    if (isEditing) {
        const ok = saveCategory();
        if (!ok) return;
    }
    closeCategorySettings();
}

function cancelCategorySettings() {
    // 取消所有未保存的更改，直接关闭
    _categoryConfigChanged = false;
    const modal = document.getElementById('categorySettingsModal');
    modal.classList.remove('show');
}

function renderCategoryList() {
    const container = document.getElementById('categoryList');
    const config = getMergedCategoryConfig();

    let html = '';
    config.categoryOrder.forEach(catId => {
        const isCustom = config.customCategories.find(c => c.id === catId);
        const isHidden = config.hiddenDefaultCategories.includes(catId);

        let cat;
        if (isCustom) {
            cat = isCustom;
        } else if (_defaultCategories[catId]) {
            cat = _defaultCategories[catId];
        } else {
            return; // 无效的栏目ID
        }

        const platformCount = isCustom ? (cat.platforms?.length || 0) : (_defaultCategories[catId]?.platforms?.length || 0);

        html += `
                    <div class="category-item ${isCustom ? 'custom' : ''}" data-category-id="${catId}" draggable="true">
                        <span class="category-item-drag">☰</span>
                        <span class="category-item-name">${cat.name}</span>
                        <span class="category-item-platforms">${platformCount} 个平台</span>
                        <label class="category-item-toggle">
                            <input type="checkbox" ${!isHidden ? 'checked' : ''} onchange="toggleCategoryVisibility('${catId}')">
                            <span class="slider"></span>
                        </label>
                        <div class="category-item-actions">
                            <button class="category-item-btn" onclick="editCategory('${catId}')">编辑</button>
                            ${isCustom ? `<button class="category-item-btn delete" onclick="deleteCategory('${catId}')">删除</button>` : ''}
                        </div>
                    </div>
                `;
    });

    container.innerHTML = html;

    const allOffEl = document.getElementById('allCategoriesOffToggle');
    if (allOffEl) {
        const hidden = config.hiddenDefaultCategories || [];
        const allIds = config.categoryOrder || [];
        allOffEl.checked = allIds.length > 0 && allIds.every(id => hidden.includes(id));
    }

    if (_settingsHideDefaultCategories) {
        container.classList.add('hide-default');
    } else {
        container.classList.remove('hide-default');
    }

    setupCategoryDragAndDrop();
}

function toggleDefaultCategoryListInSettings() {
    _settingsHideDefaultCategories = !_settingsHideDefaultCategories;
    renderCategoryList();
}

function toggleAllCategoriesOffInSettings(input) {
    const allOff = !!(input && input.checked);
    const config = getCategoryConfig() || getDefaultCategoryConfig();
    const merged = getMergedCategoryConfig();
    const allIds = merged.categoryOrder || [];

    if (allOff) {
        if (_settingsAllCategoriesOffSnapshot === null) {
            _settingsAllCategoriesOffSnapshot = (config.hiddenDefaultCategories || []).slice();
        }
        config.hiddenDefaultCategories = Array.from(new Set(allIds));
    } else {
        config.hiddenDefaultCategories = (_settingsAllCategoriesOffSnapshot || []).slice();
        _settingsAllCategoriesOffSnapshot = null;
    }

    saveCategoryConfig(config);
    _categoryConfigChanged = true;
    renderCategoryList();

    _settingsCategoryListCollapsed = false;
    applyCategoryListCollapseState();
}

function setupCategoryDragAndDrop() {
    const container = document.getElementById('categoryList');
    const items = container.querySelectorAll('.category-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            saveCategoryOrder();
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(dragging, item);
                } else {
                    container.insertBefore(dragging, item.nextSibling);
                }
            }
        });
    });
}

function saveCategoryOrder() {
    const container = document.getElementById('categoryList');
    const items = container.querySelectorAll('.category-item');
    const order = Array.from(items).map(item => item.dataset.categoryId);

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    config.categoryOrder = order;
    saveCategoryConfig(config);
    _categoryConfigChanged = true;
}

function toggleCategoryVisibility(catId) {
    const config = getCategoryConfig() || getDefaultCategoryConfig();
    const idx = config.hiddenDefaultCategories.indexOf(catId);
    if (idx >= 0) {
        config.hiddenDefaultCategories.splice(idx, 1);
    } else {
        config.hiddenDefaultCategories.push(catId);
    }
    saveCategoryConfig(config);
    _categoryConfigChanged = true;
    renderCategoryList();
}

function showAddCategoryPanel() {
    _isAddingNew = true;
    _editingCategoryId = null;

    _settingsCategoryListCollapsed = true;
    applyCategoryListCollapseState();

    _settingsHideDefaultCategories = true;

    document.getElementById('editCategoryName').value = '';
    const searchEl = document.getElementById('platformSearchInput');
    if (searchEl) searchEl.value = '';
    _platformSearchQuery = '';

    renderPlatformSelectList([]);

    setCategoryFilterEditorState('exclude', []);

    document.getElementById('categoryEditPanel').classList.add('show');
}

function editCategory(catId) {
    _isAddingNew = false;
    _editingCategoryId = catId;

    const config = getMergedCategoryConfig();
    const isCustom = config.customCategories.find(c => c.id === catId);

    let cat, platforms;
    if (isCustom) {
        cat = isCustom;
        platforms = cat.platforms || [];
    } else {
        cat = _defaultCategories[catId];
        platforms = config.platformOrder[catId] || cat.platforms || [];
    }

    document.getElementById('editCategoryName').value = cat.name;

    renderPlatformSelectList(platforms, isCustom);

    const fc = getCategoryFilterConfig(catId);
    setCategoryFilterEditorState(fc.mode, fc.keywords);

    _settingsHideDefaultCategories = true;
    _settingsCategoryListCollapsed = true;
    applyCategoryListCollapseState();
    const searchEl = document.getElementById('platformSearchInput');
    if (searchEl) searchEl.value = '';
    _platformSearchQuery = '';

    document.getElementById('categoryEditPanel').classList.add('show');
}

function hideEditPanel() {
    document.getElementById('categoryEditPanel').classList.remove('show');
    _editingCategoryId = null;
    _isAddingNew = false;

    const searchEl = document.getElementById('platformSearchInput');
    if (searchEl) searchEl.value = '';
    _platformSearchQuery = '';
}

function cancelEditCategory() {
    hideEditPanel();
}

function renderPlatformSelectList(selectedPlatforms, isCustomCategory = false) {
    const container = document.getElementById('platformSelectList');

    // 获取所有平台
    const allPlatformIds = Object.keys(_allPlatforms);

    // 排序：已选择的在前，按 selectedPlatforms 顺序
    const sortedPlatforms = [];
    selectedPlatforms.forEach(pid => {
        if (_allPlatforms[pid]) sortedPlatforms.push(pid);
    });
    allPlatformIds.forEach(pid => {
        if (!sortedPlatforms.includes(pid)) sortedPlatforms.push(pid);
    });

    const query = (_platformSearchQuery || '').trim().toLowerCase();
    const visiblePlatforms = query
        ? sortedPlatforms.filter(pid => (_allPlatforms[pid]?.name || '').toLowerCase().includes(query))
        : sortedPlatforms;

    const disableDrag = query.length > 0;

    container.innerHTML = visiblePlatforms.map(pid => {
        const p = _allPlatforms[pid];
        const isSelected = selectedPlatforms.includes(pid);
        return `
                    <label class="platform-select-item ${isSelected ? 'selected' : ''} ${disableDrag ? 'no-drag' : ''}" data-platform-id="${pid}" draggable="${disableDrag ? 'false' : 'true'}">
                        <span class="drag-handle">☰</span>
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePlatformSelect('${pid}')">
                        <span>${p.name}</span>
                    </label>
                `;
    }).join('');

    if (!disableDrag) {
        setupPlatformDragAndDrop();
    }
}

function setPlatformSearchQuery(query) {
    _platformSearchQuery = String(query || '');
    const platforms = getSelectedPlatforms();
    renderPlatformSelectList(platforms);
}

function bulkSelectPlatforms(mode) {
    const container = document.getElementById('platformSelectList');
    if (!container) return;

    const items = container.querySelectorAll('.platform-select-item');
    items.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (mode === 'all') {
            item.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        } else if (mode === 'none' || mode === 'clear') {
            item.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        }
    });
}

function setupPlatformDragAndDrop() {
    const container = document.getElementById('platformSelectList');
    const items = container.querySelectorAll('.platform-select-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(dragging, item);
                } else {
                    container.insertBefore(dragging, item.nextSibling);
                }
            }
        });
    });
}

function togglePlatformSelect(platformId) {
    const item = document.querySelector(`.platform-select-item[data-platform-id="${platformId}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
}

function getSelectedPlatforms() {
    const items = document.querySelectorAll('.platform-select-item');
    const selected = [];
    items.forEach(item => {
        if (item.classList.contains('selected')) {
            selected.push(item.dataset.platformId);
        }
    });
    return selected;
}

function saveCategory() {
    const name = document.getElementById('editCategoryName').value.trim();
    const icon = '📱';
    const platforms = getSelectedPlatforms();

    if (!name) {
        alert('请输入栏目名称');
        return false;
    }

    if (platforms.length === 0) {
        alert('请至少选择一个平台');
        return false;
    }

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    ensureCategoryFilters(config);

    if (_isAddingNew) {
        // 新增自定义栏目
        const newId = 'custom-' + Date.now();
        config.customCategories.push({
            id: newId,
            name,
            icon,
            platforms,
            isCustom: true
        });
        config.categoryOrder.unshift(newId);

        config.categoryFilters[newId] = {
            mode: _editingCategoryFilterMode,
            keywords: [..._editingCategoryFilterKeywords]
        };
    } else if (_editingCategoryId) {
        const customIdx = config.customCategories.findIndex(c => c.id === _editingCategoryId);
        if (customIdx >= 0) {
            // 编辑自定义栏目
            config.customCategories[customIdx] = {
                ...config.customCategories[customIdx],
                name,
                icon,
                platforms
            };
        } else {
            // 编辑默认栏目的平台顺序
            config.platformOrder[_editingCategoryId] = platforms;
        }

        config.categoryFilters[_editingCategoryId] = {
            mode: _editingCategoryFilterMode,
            keywords: [..._editingCategoryFilterKeywords]
        };
    }

    saveCategoryConfig(config);
    _categoryConfigChanged = true;
    hideEditPanel();
    renderCategoryList();

    _settingsCategoryListCollapsed = false;
    applyCategoryListCollapseState();

    return true;
}

function deleteCategory(catId) {
    if (!confirm('确定要删除这个自定义栏目吗？')) return;

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    config.customCategories = config.customCategories.filter(c => c.id !== catId);
    config.categoryOrder = config.categoryOrder.filter(id => id !== catId);
    delete config.platformOrder[catId];

    saveCategoryConfig(config);
    _categoryConfigChanged = true;
    renderCategoryList();
}

function resetCategoryConfig() {
    if (!confirm('确定要恢复默认栏目配置吗？所有自定义栏目将被删除。')) return;

    localStorage.removeItem(CATEGORY_CONFIG_KEY);
    _defaultCategories = null;
    _allPlatforms = null;

    renderCategoryList();
    applyCategoryConfig();
}

function applyCategoryConfig() {
    refreshViewerData({ preserveScroll: false });
}

// 将用户栏目配置应用到后端返回的数据
function applyCategoryConfigToData(serverCategories) {
    const merged = getMergedCategoryConfig();

    // 初始化默认栏目和平台信息（如果还没有）
    if (!_defaultCategories) {
        _defaultCategories = {};
        _allPlatforms = {};
        Object.entries(serverCategories).forEach(([catId, cat]) => {
            _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
            Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                _allPlatforms[pid] = { id: pid, name: p.name, defaultCategory: catId, data: p };
            });
        });
    }

    // 收集所有平台数据（从服务端返回的数据中）
    const allPlatformData = {};
    Object.values(serverCategories).forEach(cat => {
        Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
            allPlatformData[pid] = p;
        });
    });

    const result = {};
    const hiddenCategories = merged.hiddenDefaultCategories || [];
    const categoryOrder = merged.categoryOrder || Object.keys(serverCategories);
    const customCategories = merged.customCategories || [];
    const platformOrder = merged.platformOrder || {};

    // 按用户配置的顺序处理栏目
    categoryOrder.forEach(catId => {
        // 跳过隐藏的栏目
        if (hiddenCategories.includes(catId)) return;

        const customCat = customCategories.find(c => c.id === catId);
        if (customCat) {
            // 自定义栏目
            const platforms = {};
            (customCat.platforms || []).forEach(pid => {
                if (allPlatformData[pid]) {
                    platforms[pid] = allPlatformData[pid];
                }
            });
            // 即使平台暂时没有数据，也显示自定义栏目（避免用户困惑）
            result[catId] = {
                name: customCat.name,
                icon: '📱',
                platforms: platforms
            };
        } else if (serverCategories[catId]) {
            // 默认栏目
            const serverCat = serverCategories[catId];
            const userPlatformOrder = platformOrder[catId];

            if (userPlatformOrder && userPlatformOrder.length > 0) {
                // 用户自定义了平台顺序
                const platforms = {};
                userPlatformOrder.forEach(pid => {
                    if (serverCat.platforms && serverCat.platforms[pid]) {
                        platforms[pid] = serverCat.platforms[pid];
                    }
                });
                // 添加用户未指定但存在的平台
                Object.keys(serverCat.platforms || {}).forEach(pid => {
                    if (!platforms[pid]) {
                        platforms[pid] = serverCat.platforms[pid];
                    }
                });
                result[catId] = { ...serverCat, platforms };
            } else {
                result[catId] = serverCat;
            }
        }
    });

    // 添加未在 categoryOrder 中但存在于服务端数据的栏目（新增的默认栏目）
    Object.keys(serverCategories).forEach(catId => {
        if (!result[catId] && !hiddenCategories.includes(catId)) {
            result[catId] = serverCategories[catId];
        }
    });

    return result;
}

// Initialize components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    renderUserMenu();
});
