/**
 * My Tags Module
 * Handles the "我的标签" category tab which displays news filtered by user's followed tags.
 * Implements both frontend (localStorage) and backend caching for fast loading.
 * Integrated with auth-state.js for reactive auth updates.
 */

import { formatNewsDate } from './core.js';
import { authState } from './auth-state.js';

const MY_TAGS_CATEGORY_ID = 'my-tags';
const MY_TAGS_CACHE_KEY = 'hotnews_my_tags_cache';
const MY_TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

let myTagsLoaded = false;
let myTagsLoading = false;

/**
 * Check if user is authenticated using authState
 */
function checkAuth() {
    // Use authState directly for instant check (sync)
    return authState.getUser();
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
 * Check WeChat auth expiration and show warning if needed
 */
async function checkWechatAuthExpiration() {
    try {
        const res = await fetch('/api/wechat/auth/expiration-warning');
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data.ok && data.show_warning) {
            // Show red dot on settings button instead of banner
            showSettingsWarningDot(true);
            return data;
        }
        showSettingsWarningDot(false);
        return null;
    } catch (e) {
        console.error('[MyTags] WeChat auth check failed:', e);
        return null;
    }
}

/**
 * Show/hide red warning dot on settings button
 */
function showSettingsWarningDot(show) {
    const badge = document.getElementById('categorySettingsNewBadge');
    if (badge) {
        if (show) {
            badge.style.display = 'inline-block';
            badge.style.background = '#ef4444';  // Red color for warning
            badge.classList.add('wechat-warning-dot');
        } else if (badge.classList.contains('wechat-warning-dot')) {
            badge.style.display = 'none';
            badge.classList.remove('wechat-warning-dot');
        }
    }
}

/**
 * Render WeChat auth expiration warning banner (disabled - now using red dot)
 */
function renderWechatWarningBanner(container, warningData) {
    // No longer showing banner, using red dot on settings button instead
    return;
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
        ? news.map((item, idx) => {
            // Format date using the imported function
            const dateStr = formatNewsDate(item.published_at);
            // Escape title for HTML attribute
            const safeTitle = (item.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedTitle = safeTitle.replace(/'/g, "\\'");
            const escapedUrl = (item.url || '').replace(/'/g, "\\'");
            const escapedTagName = (tagName || '').replace(/'/g, "\\'");
            return `
            <li class="news-item" data-news-id="${item.id}" data-news-title="${safeTitle}">
                <div class="news-item-content">
                    <span class="news-index">${idx + 1}</span>
                    <a class="news-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                        ${item.title}
                    </a>
                    ${dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${dateStr}</span>` : ''}
                    <button class="news-favorite-btn" data-news-id="${item.id}" onclick="handleFavoriteClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')" title="收藏">☆</button>
                </div>
            </li>
            `;
        }).join('')
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
    console.log('[MyTags] renderTagsNews called, container:', container, 'tagsData:', tagsData);

    if (!container) {
        console.error('[MyTags] renderTagsNews: container is null!');
        return;
    }

    if (!tagsData || tagsData.length === 0) {
        console.log('[MyTags] No tags data, showing empty state');
        renderEmptyState(container);
        return;
    }

    console.log('[MyTags] Rendering', tagsData.length, 'tags');
    const cardsHtml = tagsData.map(tagData => createTagCard(tagData)).join('');
    console.log('[MyTags] Generated HTML length:', cardsHtml.length);
    container.innerHTML = cardsHtml;
    console.log('[MyTags] HTML inserted into container');
    
    // Restore read state for the newly rendered items
    if (window.TR && window.TR.readState) {
        window.TR.readState.restoreReadState();
    }
}

/**
 * Main load function for My Tags
 */
async function loadMyTags(force = false) {
    console.log('[MyTags] loadMyTags called, force:', force, 'loading:', myTagsLoading, 'loaded:', myTagsLoaded);

    if (myTagsLoading) {
        console.log('[MyTags] Already loading, skipping');
        return;
    }
    if (myTagsLoaded && !force) {
        console.log('[MyTags] Already loaded, skipping');
        return;
    }

    const container = document.getElementById('myTagsGrid');
    if (!container) {
        console.error('[MyTags] Container #myTagsGrid not found!');
        return;
    }

    console.log('[MyTags] Container found, starting load...');
    myTagsLoading = true;

    try {
        // Check auth first (sync check from authState)
        console.log('[MyTags] Checking auth...');
        const user = checkAuth();
        if (!user) {
            console.log('[MyTags] User not authenticated');
            renderLoginRequired(container);
            myTagsLoading = false;
            return;
        }
        console.log('[MyTags] User authenticated:', user);

        // Try to load from frontend cache first (if not forcing refresh)
        if (!force) {
            const cachedTags = getCachedData();
            if (cachedTags && cachedTags.length > 0) {
                console.log('[MyTags] Loading from frontend cache, tags:', cachedTags.length);
                renderTagsNews(container, cachedTags);
                myTagsLoaded = true;
                myTagsLoading = false;

                // Fetch fresh data in background to update cache
                fetchAndUpdateCache().catch(e => {
                    console.error('[MyTags] Background update failed:', e);
                });
                return;
            } else {
                console.log('[MyTags] No valid cache found');
            }
        }

        // Show loading state
        console.log('[MyTags] Showing loading state...');
        container.innerHTML = `
            <div class="my-tags-loading" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">🏷️</div>
                <div style="font-size:16px;">加载中...</div>
            </div>
        `;

        // Fetch followed news (will use backend cache if available)
        console.log('[MyTags] Fetching followed news from API...');
        const result = await fetchFollowedNews();
        console.log('[MyTags] API response:', result);

        if (result.needsAuth) {
            console.log('[MyTags] API returned needsAuth');
            renderLoginRequired(container);
            myTagsLoading = false;
            return;
        }

        if (result.error) {
            console.error('[MyTags] API returned error:', result.error);
            renderError(container, result.error);
            myTagsLoading = false;
            return;
        }

        if (!result.ok) {
            console.error('[MyTags] API returned not ok');
            renderError(container, '请求失败');
            myTagsLoading = false;
            return;
        }

        const tags = result.tags || [];
        console.log('[MyTags] Got tags from API:', tags.length, 'tags');

        // Log cache status
        if (result.cached) {
            console.log(`[MyTags] Loaded from backend cache (age: ${result.cache_age}s)`);
        } else {
            console.log('[MyTags] Loaded fresh data from database');
        }

        // Save to frontend cache
        setCachedData(tags);

        // Render the tags
        console.log('[MyTags] Rendering tags...');
        renderTagsNews(container, tags);
        myTagsLoaded = true;
        console.log('[MyTags] Load complete!');
        
        // Check WeChat auth expiration and show warning if needed
        const wechatWarning = await checkWechatAuthExpiration();
        if (wechatWarning) {
            console.log('[MyTags] WeChat auth warning:', wechatWarning);
            renderWechatWarningBanner(container, wechatWarning);
        }

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
    console.log('[MyTags] Initializing module...');

    // Subscribe to auth state changes - reset and reload when auth changes
    let previousUser = authState.getUser();
    authState.subscribe((user) => {
        const wasLoggedIn = !!previousUser;
        const isLoggedIn = !!user;

        if (wasLoggedIn !== isLoggedIn) {
            console.log('[MyTags] Auth state changed, wasLoggedIn:', wasLoggedIn, 'isLoggedIn:', isLoggedIn);
            // Reset loaded state
            myTagsLoaded = false;
            myTagsLoading = false;
            // Clear cache on logout
            if (!isLoggedIn) {
                clearCache();
            }
            // Reload if my-tags tab is active
            const activePane = document.querySelector('#tab-my-tags.active');
            if (activePane) {
                console.log('[MyTags] Tab is active, reloading...');
                loadMyTags(true);
            }
        }
        previousUser = user;
    });

    // Listen for tab switch events
    window.addEventListener('tr_tab_switched', (event) => {
        const categoryId = event?.detail?.categoryId;
        console.log('[MyTags] tr_tab_switched event received, categoryId:', categoryId);
        if (categoryId) {
            handleTabSwitch(categoryId);
        }
    });

    // Also check if my-tags is already the active tab (on page load)
    const activePane = document.querySelector('#tab-my-tags.active');
    if (activePane) {
        console.log('[MyTags] Tab is already active on page load');
        loadMyTags();
    }

    // Add click listener to the my-tags tab button as a fallback
    // This ensures loading even if tr_tab_switched event doesn't fire
    const tryAttachClickListener = () => {
        const tabButton = document.querySelector('.category-tab[data-category="my-tags"]');
        if (tabButton) {
            console.log('[MyTags] Attaching click listener to tab button');
            tabButton.addEventListener('click', () => {
                console.log('[MyTags] Tab button clicked');
                // Use setTimeout to ensure the tab pane is active
                setTimeout(() => {
                    const pane = document.querySelector('#tab-my-tags.active');
                    if (pane) {
                        console.log('[MyTags] Tab pane is now active, loading...');
                        loadMyTags();
                    }
                }, 100);
            });

            // Also add touchstart for better mobile/WeChat support
            tabButton.addEventListener('touchstart', () => {
                console.log('[MyTags] Tab button touched (touchstart)');
                setTimeout(() => {
                    const pane = document.querySelector('#tab-my-tags.active');
                    if (pane) {
                        console.log('[MyTags] Tab pane is now active after touch, loading...');
                        loadMyTags();
                    }
                }, 100);
            }, { passive: true });
        } else {
            console.warn('[MyTags] Tab button not found, will retry...');
            // Retry after a short delay if button not found yet
            setTimeout(tryAttachClickListener, 500);
        }
    };

    // Try to attach click listener
    tryAttachClickListener();

    // Add MutationObserver to watch for tab pane becoming active
    // This is a fallback for WeChat browser and other environments where events may not fire
    const observeTabActivation = () => {
        const tabPane = document.getElementById('tab-my-tags');
        if (!tabPane) {
            console.warn('[MyTags] Tab pane not found for MutationObserver');
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('active')) {
                        console.log('[MyTags] Tab pane became active (MutationObserver)');
                        // Only load if not already loaded or loading
                        if (!myTagsLoaded && !myTagsLoading) {
                            loadMyTags();
                        }
                    }
                }
            }
        });

        observer.observe(tabPane, {
            attributes: true,
            attributeFilter: ['class']
        });

        console.log('[MyTags] MutationObserver attached to tab pane');
    };

    // Attach observer after a short delay to ensure DOM is ready
    setTimeout(observeTabActivation, 100);

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
