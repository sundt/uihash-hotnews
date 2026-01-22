/**
 * Favorites Module
 * Handles user favorites functionality with local storage fallback
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

const FAVORITES_STORAGE_KEY = 'hotnews_favorites_v1';
const FAVORITES_WIDTH_KEY = 'hotnews_favorites_width';
const DEFAULT_PANEL_WIDTH = 500;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;

let favoritesCache = null;
let isPanelOpen = false;
let isResizing = false;

/**
 * Get favorites from local storage (for non-logged-in users or as cache)
 */
function getLocalFavorites() {
    try {
        const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Save favorites to local storage
 */
function saveLocalFavorites(favorites) {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (e) {
        console.error('[Favorites] Failed to save to localStorage:', e);
    }
}

/**
 * Fetch favorites from server
 */
async function fetchFavorites() {
    try {
        const res = await fetch('/api/user/favorites');
        if (res.status === 401) {
            return { needsAuth: true };
        }
        if (!res.ok) {
            throw new Error('Failed to fetch favorites');
        }
        const data = await res.json();
        if (data.ok) {
            favoritesCache = data.favorites || [];
            return { favorites: favoritesCache };
        }
        return { error: data.message || 'Unknown error' };
    } catch (e) {
        console.error('[Favorites] Fetch error:', e);
        return { error: e.message };
    }
}

/**
 * Add a favorite
 */
async function addFavorite(newsItem) {
    const user = authState.getUser();
    
    if (!user) {
        // Save to local storage for non-logged-in users
        const locals = getLocalFavorites();
        const exists = locals.some(f => f.news_id === newsItem.news_id);
        if (!exists) {
            locals.unshift({
                ...newsItem,
                created_at: Math.floor(Date.now() / 1000)
            });
            saveLocalFavorites(locals);
        }
        return { ok: true, local: true };
    }
    
    try {
        const res = await fetch('/api/user/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newsItem)
        });
        const data = await res.json();
        if (data.ok) {
            // Update cache
            if (favoritesCache) {
                favoritesCache.unshift(data.favorite);
            }
        }
        return data;
    } catch (e) {
        console.error('[Favorites] Add error:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Remove a favorite
 */
async function removeFavorite(newsId) {
    const user = authState.getUser();
    
    if (!user) {
        // Remove from local storage
        const locals = getLocalFavorites();
        const filtered = locals.filter(f => f.news_id !== newsId);
        saveLocalFavorites(filtered);
        return { ok: true, local: true };
    }
    
    try {
        const res = await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.ok && favoritesCache) {
            favoritesCache = favoritesCache.filter(f => f.news_id !== newsId);
        }
        return data;
    } catch (e) {
        console.error('[Favorites] Remove error:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Check if a news item is favorited
 */
function isFavorited(newsId) {
    const user = authState.getUser();
    
    if (!user) {
        const locals = getLocalFavorites();
        return locals.some(f => f.news_id === newsId);
    }
    
    if (favoritesCache) {
        return favoritesCache.some(f => f.news_id === newsId);
    }
    
    return false;
}

/**
 * Toggle favorite status for a news item
 */
async function toggleFavorite(newsItem, button) {
    const newsId = newsItem.news_id;
    const wasFavorited = isFavorited(newsId);
    
    // Optimistic UI update
    if (button) {
        button.classList.toggle('favorited', !wasFavorited);
        button.textContent = wasFavorited ? '☆' : '★';
    }
    
    let result;
    if (wasFavorited) {
        result = await removeFavorite(newsId);
    } else {
        result = await addFavorite(newsItem);
    }
    
    if (!result.ok) {
        // Revert on failure
        if (button) {
            button.classList.toggle('favorited', wasFavorited);
            button.textContent = wasFavorited ? '★' : '☆';
        }
    }
    
    return result;
}

/**
 * Format date for display
 */
function formatFavoriteDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${MM}-${DD}`;
}

/**
 * Render favorites list in the panel
 */
function renderFavoritesList(favorites) {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    if (!favorites || favorites.length === 0) {
        body.innerHTML = `
            <div class="favorites-empty">
                <div class="favorites-empty-icon">⭐</div>
                <div>暂无收藏</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    点击新闻标题旁的 ☆ 添加收藏
                </div>
            </div>
        `;
        return;
    }
    
    const html = `
        <div class="favorites-list">
            ${favorites.map(f => `
                <div class="favorite-item" data-news-id="${f.news_id}">
                    <a class="favorite-item-title" href="${f.url || '#'}" target="_blank" rel="noopener noreferrer">
                        ${f.title || '无标题'}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${f.source_name ? `<span>${f.source_name}</span>` : ''}
                            ${f.created_at ? `<span>收藏于 ${formatFavoriteDate(f.created_at)}</span>` : ''}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-summary-btn${f.summary ? ' has-summary' : ''}" 
                                    onclick="handleSummaryClick('${f.news_id}')" 
                                    title="${f.summary ? '查看总结' : 'AI 总结'}">
                                ${f.summary ? '📄' : '📝'}
                            </button>
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${f.news_id}')" title="取消收藏">
                                删除
                            </button>
                        </div>
                    </div>
                    <div class="favorite-item-summary" id="summary-${f.news_id}" style="display:${f.summary ? 'block' : 'none'};">
                        <div class="summary-content">${f.summary ? renderMarkdown(f.summary) : ''}</div>
                        ${f.summary ? `
                            <div class="summary-actions">
                                <button class="summary-regenerate-btn" onclick="regenerateSummary('${f.news_id}')" title="重新生成">
                                    🔄 重新生成
                                </button>
                                <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${f.news_id}')">
                                    收起
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    body.innerHTML = html;
}

/**
 * Render login required state
 */
function renderLoginRequired() {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    // Check if there are local favorites
    const locals = getLocalFavorites();
    if (locals.length > 0) {
        // Show local favorites with login prompt
        body.innerHTML = `
            <div style="padding:12px;background:#334155;border-radius:8px;margin-bottom:16px;font-size:13px;color:#94a3b8;">
                <span style="color:#fbbf24;">💡</span> 登录后可同步收藏到云端
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();" style="margin-left:8px;padding:4px 12px;font-size:12px;">
                    登录
                </button>
            </div>
            <div class="favorites-list">
                ${locals.map(f => `
                    <div class="favorite-item" data-news-id="${f.news_id}">
                        <a class="favorite-item-title" href="${f.url || '#'}" target="_blank" rel="noopener noreferrer">
                            ${f.title || '无标题'}
                        </a>
                        <div class="favorite-item-meta">
                            <span class="favorite-item-source">
                                ${f.source_name ? `<span>${f.source_name}</span>` : ''}
                                ${f.created_at ? `<span>收藏于 ${formatFavoriteDate(f.created_at)}</span>` : ''}
                            </span>
                            <div class="favorite-item-actions">
                                <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${f.news_id}')" title="取消收藏">
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        body.innerHTML = `
            <div class="favorites-login-required">
                <div class="favorites-login-icon">🔒</div>
                <div>登录后可使用收藏功能</div>
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();">
                    立即登录
                </button>
            </div>
        `;
    }
}

/**
 * Load and display favorites in the panel
 */
async function loadFavoritesPanel() {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    body.innerHTML = '<div class="favorites-loading">加载中...</div>';
    
    const user = authState.getUser();
    
    if (!user) {
        // Show local favorites or login prompt
        renderLoginRequired();
        return;
    }
    
    const result = await fetchFavorites();
    
    if (result.needsAuth) {
        renderLoginRequired();
        return;
    }
    
    if (result.error) {
        body.innerHTML = `
            <div class="favorites-empty">
                <div>加载失败: ${result.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    重试
                </button>
            </div>
        `;
        return;
    }
    
    renderFavoritesList(result.favorites);
}

/**
 * Toggle favorites panel visibility
 */
function toggleFavoritesPanel() {
    const user = authState.getUser();
    
    // If not logged in, show login modal instead of panel
    if (!user) {
        openLoginModal();
        return;
    }
    
    const panel = document.getElementById('favoritesPanel');
    let overlay = document.getElementById('favoritesOverlay');
    
    if (!panel) return;
    
    // Create overlay if not exists
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'favoritesOverlay';
        overlay.className = 'favorites-overlay';
        overlay.onclick = closeFavoritesPanel;
        document.body.appendChild(overlay);
    }
    
    isPanelOpen = !isPanelOpen;
    
    if (isPanelOpen) {
        panel.classList.add('open');
        overlay.classList.add('open');
        loadFavoritesPanel();
    } else {
        panel.classList.remove('open');
        overlay.classList.remove('open');
    }
}

/**
 * Close favorites panel
 */
function closeFavoritesPanel() {
    const panel = document.getElementById('favoritesPanel');
    const overlay = document.getElementById('favoritesOverlay');
    
    isPanelOpen = false;
    
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

/**
 * Remove favorite from panel (called from panel UI)
 */
async function removeFavoriteFromPanel(newsId) {
    const result = await removeFavorite(newsId);
    if (result.ok) {
        // Remove from DOM
        const item = document.querySelector(`.favorite-item[data-news-id="${newsId}"]`);
        if (item) {
            item.remove();
        }
        // Update button in news list if visible
        const btn = document.querySelector(`.news-favorite-btn[data-news-id="${newsId}"]`);
        if (btn) {
            btn.classList.remove('favorited');
            btn.textContent = '☆';
        }
        // Check if list is now empty
        const list = document.querySelector('.favorites-list');
        if (list && list.children.length === 0) {
            loadFavoritesPanel();
        }
    }
}

/**
 * Handle favorite button click on news item
 */
function handleFavoriteClick(event, newsId, title, url, sourceId, sourceName) {
    event.preventDefault();
    event.stopPropagation();
    
    const user = authState.getUser();
    
    // If not logged in, show login modal
    if (!user) {
        openLoginModal();
        return;
    }
    
    const button = event.currentTarget;
    const newsItem = {
        news_id: newsId,
        title: title,
        url: url,
        source_id: sourceId || '',
        source_name: sourceName || ''
    };
    
    toggleFavorite(newsItem, button);
}

/**
 * Get saved panel width from localStorage
 */
function getSavedPanelWidth() {
    try {
        const saved = localStorage.getItem(FAVORITES_WIDTH_KEY);
        if (saved) {
            const width = parseInt(saved, 10);
            if (width >= MIN_PANEL_WIDTH && width <= MAX_PANEL_WIDTH) {
                return width;
            }
        }
    } catch (e) {}
    return DEFAULT_PANEL_WIDTH;
}

/**
 * Save panel width to localStorage
 */
function savePanelWidth(width) {
    try {
        localStorage.setItem(FAVORITES_WIDTH_KEY, String(width));
    } catch (e) {}
}

/**
 * Apply panel width
 */
function applyPanelWidth(width) {
    const panel = document.getElementById('favoritesPanel');
    if (panel) {
        panel.style.width = width + 'px';
    }
}

/**
 * Initialize panel resize functionality
 */
function initPanelResize() {
    const panel = document.getElementById('favoritesPanel');
    const handle = document.getElementById('favoritesResizeHandle');
    
    if (!panel || !handle) return;
    
    // Apply saved width
    const savedWidth = getSavedPanelWidth();
    applyPanelWidth(savedWidth);
    
    let startX = 0;
    let startWidth = 0;
    
    function onMouseDown(e) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        
        panel.classList.add('resizing');
        handle.classList.add('active');
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    function onMouseMove(e) {
        if (!isResizing) return;
        
        // Dragging left increases width, dragging right decreases
        const delta = startX - e.clientX;
        let newWidth = startWidth + delta;
        
        // Clamp to min/max
        newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
        
        panel.style.width = newWidth + 'px';
    }
    
    function onMouseUp() {
        if (!isResizing) return;
        
        isResizing = false;
        panel.classList.remove('resizing');
        handle.classList.remove('active');
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Save the new width
        savePanelWidth(panel.offsetWidth);
    }
    
    // Touch support
    function onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = panel.offsetWidth;
        
        panel.classList.add('resizing');
        handle.classList.add('active');
        
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }
    
    function onTouchMove(e) {
        if (!isResizing || e.touches.length !== 1) return;
        e.preventDefault();
        
        const delta = startX - e.touches[0].clientX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
        
        panel.style.width = newWidth + 'px';
    }
    
    function onTouchEnd() {
        if (!isResizing) return;
        
        isResizing = false;
        panel.classList.remove('resizing');
        handle.classList.remove('active');
        
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        
        savePanelWidth(panel.offsetWidth);
    }
    
    handle.addEventListener('mousedown', onMouseDown);
    handle.addEventListener('touchstart', onTouchStart, { passive: false });
}

// Initialize resize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanelResize);
} else {
    initPanelResize();
}

/**
 * Simple markdown renderer for summaries
 */
function renderMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    
    // Wrap consecutive li in ul
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[234]>)/g, '$1');
    html = html.replace(/(<\/h[234]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    
    return html;
}

/**
 * Handle summary button click
 */
async function handleSummaryClick(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    const btn = document.querySelector(`.favorite-item[data-news-id="${newsId}"] .favorite-summary-btn`);
    
    if (!summaryDiv || !btn) return;
    
    // If already has summary, toggle display
    if (btn.classList.contains('has-summary')) {
        toggleSummaryDisplay(newsId);
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btn.textContent = '⏳';
    btn.title = '生成中...';
    
    summaryDiv.style.display = 'block';
    summaryDiv.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>正在生成 AI 总结...</span>
        </div>
    `;
    
    try {
        const res = await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}/summary`, {
            method: 'POST'
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.detail || '生成失败');
        }
        
        if (data.ok && data.summary) {
            btn.classList.add('has-summary');
            btn.textContent = '📄';
            btn.title = '查看总结';
            
            summaryDiv.innerHTML = `
                <div class="summary-content">${renderMarkdown(data.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${newsId}')" title="重新生成">
                        🔄 重新生成
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${newsId}')">
                        收起
                    </button>
                </div>
            `;
            
            // Update cache
            if (favoritesCache) {
                const fav = favoritesCache.find(f => f.news_id === newsId);
                if (fav) {
                    fav.summary = data.summary;
                    fav.summary_at = data.summary_at;
                }
            }
        } else {
            throw new Error(data.error || '生成失败');
        }
    } catch (e) {
        console.error('[Favorites] Summary error:', e);
        summaryDiv.innerHTML = `
            <div class="summary-error">
                <span>❌ ${e.message}</span>
                <button onclick="handleSummaryClick('${newsId}')" style="margin-left:8px;">重试</button>
            </div>
        `;
        btn.textContent = '📝';
        btn.title = 'AI 总结';
    } finally {
        btn.disabled = false;
    }
}

/**
 * Toggle summary display
 */
function toggleSummaryDisplay(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    if (!summaryDiv) return;
    
    const isVisible = summaryDiv.style.display !== 'none';
    summaryDiv.style.display = isVisible ? 'none' : 'block';
    
    // Update toggle button text
    const toggleBtn = summaryDiv.querySelector('.summary-toggle-btn');
    if (toggleBtn) {
        toggleBtn.textContent = isVisible ? '展开' : '收起';
    }
}

/**
 * Regenerate summary (delete cache and regenerate)
 */
async function regenerateSummary(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    const btn = document.querySelector(`.favorite-item[data-news-id="${newsId}"] .favorite-summary-btn`);
    
    if (!summaryDiv) return;
    
    // Delete cached summary first
    try {
        await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}/summary`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error('[Favorites] Delete summary error:', e);
    }
    
    // Reset button state
    if (btn) {
        btn.classList.remove('has-summary');
        btn.textContent = '📝';
    }
    
    // Update cache
    if (favoritesCache) {
        const fav = favoritesCache.find(f => f.news_id === newsId);
        if (fav) {
            fav.summary = null;
            fav.summary_at = null;
        }
    }
    
    // Regenerate
    await handleSummaryClick(newsId);
}

// Expose to window
window.toggleFavoritesPanel = toggleFavoritesPanel;
window.closeFavoritesPanel = closeFavoritesPanel;
window.removeFavoriteFromPanel = removeFavoriteFromPanel;
window.handleFavoriteClick = handleFavoriteClick;
window.isFavorited = isFavorited;
window.handleSummaryClick = handleSummaryClick;
window.toggleSummaryDisplay = toggleSummaryDisplay;
window.regenerateSummary = regenerateSummary;

export {
    toggleFavoritesPanel,
    closeFavoritesPanel,
    addFavorite,
    removeFavorite,
    isFavorited,
    toggleFavorite,
    handleFavoriteClick
};
