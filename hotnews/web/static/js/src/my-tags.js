/**
 * My Tags Module
 * Handles the "我的标签" category tab which displays news filtered by user's followed tags.
 * Implements both frontend (localStorage) and backend caching for fast loading.
 */

const MY_TAGS_CATEGORY_ID = 'my-tags';
const MY_TAGS_CACHE_KEY = 'hotnews_my_tags_cache';
const MY_TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

let myTagsLoaded = false;
let myTagsLoading = false;

/**
 * Check if user is authenticated
 */
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return null;
        const data = await res.json();
        return data.ok && data.user ? data.user : null;
    } catch (e) {
        console.error('[MyTags] Auth check failed:', e);
        return null;
    }
}

/**
 * Get cached data from localStorage
 */
function getCachedData() {
    try {
        const cached = localStorage.getItem(MY_TAGS_CACHE_KEY);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is expired
        if (!data.timestamp || (now - data.timestamp) > MY_TAGS_CACHE_TTL) {
            localStorage.removeItem(MY_TAGS_CACHE_KEY);
            return null;
        }
        
        return data.tags;
    } catch (e) {
        console.error('[MyTags] Cache read error:', e);
        localStorage.removeItem(MY_TAGS_CACHE_KEY);
        return null;
    }
}

/**
 * Save data to localStorage cache
 */
function setCachedData(tags) {
    try {
        const data = {
            tags: tags,
            timestamp: Date.now(),
        };
        localStorage.setItem(MY_TAGS_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('[MyTags] Cache write error:', e);
    }
}

/**
 * Clear cached data
 */
function clearCache() {
    try {
        localStorage.removeItem(MY_TAGS_CACHE_KEY);
        console.log('[MyTags] Cache cleared');
    } catch (e) {
        console.error('[MyTags] Cache clear error:', e);
    }
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    window.location.href = '/api/auth/page';
}

/**
 * Fetch followed news from API
 */
async function fetchFollowedNews() {
    try {
        const res = await fetch('/api/user/preferences/followed-news?limit=50');
        if (!res.ok) {
            if (res.status === 401) {
                return { needsAuth: true };
            }
            throw new Error('Failed to fetch');
        }
        return await res.json();
    } catch (e) {
        console.error('[MyTags] Fetch failed:', e);
        return { error: e.message };
    }
}

/**
 * Render the empty state when user has no followed tags
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;">
            <div style="font-size:64px;margin-bottom:20px;">🏷️</div>
            <div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">您还未关注任何标签</div>
            <div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">
                前往「我的设置」添加感兴趣的标签，<br>
                这里将为您聚合相关新闻
            </div>
            <a href="/api/user/preferences/page" 
               style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;text-decoration:none;border-radius:8px;font-weight:500;transition:transform 0.2s;"
               onmouseover="this.style.transform='scale(1.05)'"
               onmouseout="this.style.transform='scale(1)'">
                去设置标签
            </a>
        </div>
    `;
}

/**
 * Render the login required state
 */
function renderLoginRequired(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;">
            <div style="font-size:64px;margin-bottom:20px;">🔒</div>
            <div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">请先登录</div>
            <div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">
                登录后即可查看您关注的标签新闻
            </div>
            <a href="/api/auth/page" 
               style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;text-decoration:none;border-radius:8px;font-weight:500;transition:transform 0.2s;"
               onmouseover="this.style.transform='scale(1.05)'"
               onmouseout="this.style.transform='scale(1)'">
                立即登录
            </a>
        </div>
    `;
}

/**
 * Render error state
 */
function renderError(container, message) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;">
            <div style="font-size:48px;margin-bottom:16px;">😕</div>
            <div style="font-size:16px;">加载失败: ${message || '未知错误'}</div>
            <button onclick="window.HotNews?.myTags?.load(true)" 
                    style="margin-top:16px;padding:8px 16px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;">
                重试
            </button>
        </div>
    `;
}

/**
 * Create a news card HTML for a tag
 */
function createTagCard(tagData) {
    const { tag, news, count } = tagData;
    const tagIcon = tag.icon || '🏷️';
    const tagName = tag.name || tag.id;

    const newsListHtml = news.length > 0
        ? news.map((item, idx) => `
            <li class="news-item" data-news-id="${item.id}">
                <div class="news-item-content">
                    <span class="news-index">${idx + 1}</span>
                    <a class="news-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                        ${item.title}
                    </a>
                    ${item.published_at ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${String(item.published_at).slice(0, 10)}</span>` : ''}
                </div>
            </li>
        `).join('')
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';

    return `
        <div class="platform-card" data-tag-id="${tag.id}" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                    ${tagIcon} ${tagName}
                    <span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${count}条)</span>
                </div>
                <div class="platform-header-actions"></div>
            </div>
            <ul class="news-list">
                ${newsListHtml}
            </ul>
        </div>
    `;
}

/**
 * Render the tags with news
 */
function renderTagsNews(container, tagsData) {
    if (!tagsData || tagsData.length === 0) {
        renderEmptyState(container);
        return;
    }

    const cardsHtml = tagsData.map(tagData => createTagCard(tagData)).join('');
    container.innerHTML = cardsHtml;
}

/**
 * Main load function for My Tags
 */
async function loadMyTags(force = false) {
    if (myTagsLoading) return;
    if (myTagsLoaded && !force) return;

    const container = document.getElementById('myTagsGrid');
    if (!container) {
        console.warn('[MyTags] Container #myTagsGrid not found');
        return;
    }

    myTagsLoading = true;

    try {
        // Check auth first
        const user = await checkAuth();
        if (!user) {
            renderLoginRequired(container);
            myTagsLoading = false;
            return;
        }

        // Try to load from frontend cache first (if not forcing refresh)
        if (!force) {
            const cachedTags = getCachedData();
            if (cachedTags && cachedTags.length > 0) {
                console.log('[MyTags] Loading from frontend cache');
                renderTagsNews(container, cachedTags);
                myTagsLoaded = true;
                myTagsLoading = false;
                
                // Fetch fresh data in background to update cache
                fetchAndUpdateCache().catch(e => {
                    console.error('[MyTags] Background update failed:', e);
                });
                return;
            }
        }

        // Show loading state
        container.innerHTML = `
            <div class="my-tags-loading" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">🏷️</div>
                <div style="font-size:16px;">加载中...</div>
            </div>
        `;

        // Fetch followed news (will use backend cache if available)
        const result = await fetchFollowedNews();

        if (result.needsAuth) {
            renderLoginRequired(container);
            myTagsLoading = false;
            return;
        }

        if (result.error) {
            renderError(container, result.error);
            myTagsLoading = false;
            return;
        }

        if (!result.ok) {
            renderError(container, '请求失败');
            myTagsLoading = false;
            return;
        }

        const tags = result.tags || [];
        
        // Log cache status
        if (result.cached) {
            console.log(`[MyTags] Loaded from backend cache (age: ${result.cache_age}s)`);
        } else {
            console.log('[MyTags] Loaded fresh data from database');
        }

        // Save to frontend cache
        setCachedData(tags);

        // Render the tags
        renderTagsNews(container, tags);
        myTagsLoaded = true;

    } catch (e) {
        console.error('[MyTags] Load error:', e);
        renderError(container, e.message);
    } finally {
        myTagsLoading = false;
    }
}

/**
 * Fetch and update cache in background
 */
async function fetchAndUpdateCache() {
    try {
        const result = await fetchFollowedNews();
        if (result.ok && result.tags) {
            setCachedData(result.tags);
            console.log('[MyTags] Background cache update completed');
        }
    } catch (e) {
        console.error('[MyTags] Background cache update error:', e);
    }
}

/**
 * Handle tab switch event
 */
function handleTabSwitch(categoryId) {
    if (categoryId === MY_TAGS_CATEGORY_ID) {
        loadMyTags();
    }
}

/**
 * Initialize the module
 */
function init() {
    // Listen for tab switch events
    window.addEventListener('tr_tab_switched', (event) => {
        const categoryId = event?.detail?.categoryId;
        if (categoryId) {
            handleTabSwitch(categoryId);
        }
    });

    // Also check if my-tags is already the active tab (on page load)
    const activePane = document.querySelector('#tab-my-tags.active');
    if (activePane) {
        loadMyTags();
    }

    console.log('[MyTags] Module initialized');
}

// Export for global access
if (typeof window !== 'undefined') {
    window.HotNews = window.HotNews || {};
    window.HotNews.myTags = {
        load: loadMyTags,
        init: init,
        clearCache: clearCache,
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { loadMyTags, init, handleTabSwitch, clearCache };
