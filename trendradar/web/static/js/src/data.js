/**
 * TrendRadar Data Module
 * 数据获取、渲染、自动刷新
 */

import { TR, ready, escapeHtml, formatUpdatedAt } from './core.js';
import { storage } from './storage.js';

const TAB_STORAGE_KEY = 'trendradar_active_tab';
const CATEGORY_PAGE_SIZE = 20;

let _ajaxRefreshInFlight = false;
let _ajaxLastRefreshAt = 0;
let _ajaxRefreshPending = null;

export const data = {
    formatUpdatedAt,

    snapshotViewerState() {
        const activeTab = storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
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
            TR.scroll.recordPlatformGridScrollForTab(activeTab, grid);
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
    },

    renderViewerFromData(data, state) {
        const contentEl = document.querySelector('.tab-content-area');
        const tabsEl = document.querySelector('.category-tabs');
        if (!tabsEl || !contentEl) return;

        const categories = TR.settings.applyCategoryConfigToData(data?.categories || {});
        const preferredActiveTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;
        const firstTabId = Object.keys(categories || {})[0] || null;
        const activeTabId = preferredActiveTab || firstTabId;

        const tabsHtml = Object.entries(categories).map(([catId, cat]) => {
            const icon = escapeHtml(cat?.icon || '');
            const name = escapeHtml(cat?.name || catId);
            const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${escapeHtml(catId)}">NEW</span>` : '';
            const badgeSports = catId === 'sports' ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : '';
            const badge = `${badgeCategory}${badgeSports}`;
            return `
            <div class="category-tab" data-category="${escapeHtml(catId)}" draggable="false" onclick="switchTab('${escapeHtml(catId)}')">
                <span class="category-drag-handle" title="拖拽调整栏目顺序" draggable="true">☰</span>
                <div class="category-tab-icon">${icon}</div>
                <div class="category-tab-name">${name}${badge}</div>
            </div>`;
        }).join('');

        const contentHtml = Object.entries(categories).map(([catId, cat]) => {
            const isActiveCategory = !!activeTabId && String(catId) === String(activeTabId);
            const platforms = cat?.platforms || {};
            const platformCards = Object.entries(platforms).map(([platformId, platform]) => {
                const platformName = escapeHtml(platform?.name || platformId);
                const platformBadge = platform?.is_new ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(platformId)}">NEW</span>` : '';
                const news = Array.isArray(platform?.news) ? platform.news : [];
                const totalCount = news.length;
                const initialCount = isActiveCategory ? Math.min(totalCount, CATEGORY_PAGE_SIZE) : 0;
                const pagingOffset = (platformId && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[platformId])) ? state.pagingOffsets[platformId] : 0;
                const filteredNews = news.slice(0, initialCount);

                const newsItemsHtml = filteredNews.map((n, idx) => {
                    const stableId = escapeHtml(n?.stable_id || '');
                    const title = escapeHtml(n?.display_title || n?.title || '');
                    const url = escapeHtml(n?.url || '');
                    const meta = escapeHtml(n?.meta || '');
                    const isRssPlatform = String(platformId || '').startsWith('rss-');
                    const isCross = !!n?.is_cross_platform;
                    const crossPlatforms = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
                    const crossTitle = escapeHtml(crossPlatforms.join(', '));
                    const crossCount = escapeHtml(n?.cross_platform_count ?? '');
                    const crossBadge = isCross ? `<span class="cross-platform-badge" title="同时出现在: ${crossTitle}">🔥 ${crossCount}</span>` : '';
                    const crossClass = isCross ? 'cross-platform' : '';
                    const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
                    const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + CATEGORY_PAGE_SIZE)) ? ' paged-hidden' : '';
                    const metaHtml = (meta && !isRssPlatform) ? `<div class="news-subtitle">${meta}</div>` : '';
                    const safeHref = url || '#';
                    return `
                        <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${title}">
                            <div class="news-item-content">
                                <input type="checkbox" class="news-checkbox" onchange="markAsRead(this)" title="标记已读">
                                ${indexHtml}
                                <a class="news-title ${crossClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                                    ${title}
                                    ${crossBadge}
                                </a>
                            </div>
                            ${metaHtml}
                        </li>`;
                }).join('') || (!isActiveCategory ? '<li class="news-placeholder" aria-hidden="true">待加载...</li>' : '');

                const headerButtons = '';
                const dragHandle = `<span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>`;

                return `
                <div class="platform-card" data-platform="${escapeHtml(platformId)}" data-total-count="${String(totalCount)}" data-loaded-count="${String(initialCount)}" draggable="false">
                    <div class="platform-header">
                        ${dragHandle}
                        <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(platformId)}')">📱 ${platformName}${platformBadge}</div>
                        <div class="platform-header-actions">${headerButtons}</div>
                    </div>
                    <ul class="news-list">${newsItemsHtml}
                    </ul>
                    <div class="news-load-sentinel" aria-hidden="true"></div>
                </div>`;
            }).join('');

            return `
            <div class="tab-pane" id="tab-${escapeHtml(catId)}">
                <div class="platform-grid">${platformCards}
                </div>
                <div class="category-empty-state" style="display:none;" aria-hidden="true">没有匹配内容，请调整关键词或切换模式</div>
            </div>`;
        }).join('');

        tabsEl.innerHTML = tabsHtml;
        contentEl.innerHTML = contentHtml;

        // 栏目数量超过 8 个时，自动启用紧凑模式（避免出现滚动条）
        try {
            const tabCount = tabsEl.querySelectorAll('.category-tab').length;
            tabsEl.classList.toggle('compact', tabCount > 8);
        } catch (e) {
            // ignore
        }

        const updatedAtEl = document.getElementById('updatedAt');
        if (updatedAtEl && data?.updated_at) updatedAtEl.textContent = formatUpdatedAt(data.updated_at);

        const desiredTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;
        if (desiredTab) {
            const escapedDesired = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(desiredTab) : desiredTab;
            const desiredTabEl = document.querySelector(`.category-tab[data-category="${escapedDesired}"]`);
            if (desiredTabEl) {
                TR.tabs.switchTab(desiredTab);
            } else {
                const firstTab = document.querySelector('.category-tab');
                if (firstTab?.dataset?.category) {
                    TR.tabs.switchTab(firstTab.dataset.category);
                } else {
                    storage.remove(TAB_STORAGE_KEY);
                }
            }
        } else {
            const firstTab = document.querySelector('.category-tab');
            if (firstTab?.dataset?.category) {
                TR.tabs.switchTab(firstTab.dataset.category);
            } else {
                storage.remove(TAB_STORAGE_KEY);
            }
        }

        const nextShowReadMode = (typeof state?.showReadMode === 'boolean') ? state.showReadMode : TR.readState.getShowReadModePref();
        TR.readState.applyShowReadMode(nextShowReadMode);

        const searchEl = document.getElementById('searchInput');
        if (searchEl && typeof state?.searchText === 'string') {
            searchEl.value = state.searchText;
        }
        TR.search.searchNews();

        TR.filter.applyCategoryFilterForActiveTab();

        TR.readState.restoreReadState();

        document.querySelectorAll('.platform-card').forEach((card) => {
            const pid = card.dataset.platform;
            const off = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;
            TR.paging.setCardPageSize(card, TR.paging.PAGE_SIZE);
            TR.paging.applyPagingToCard(card, off);
        });

        TR.counts.updateAllCounts();
        TR.readState.updateReadCount();
        TR.scroll.restoreActiveTabPlatformGridScroll(state);
        TR.scroll.attachPlatformGridScrollPersistence();

        // 数据渲染完成，移除早期隐藏样式并揭开幕布显示栏目
        const earlyHide = document.getElementById('early-hide');
        if (earlyHide) earlyHide.remove();
        document.body.classList.add('categories-ready');

        TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });

        try {
            if (TR.infiniteScroll && typeof TR.infiniteScroll.attach === 'function') {
                TR.infiniteScroll.attach();
            }
        } catch (e) {
            // ignore
        }
    },

    async refreshViewerData(opts = {}) {
        const preserveScroll = opts.preserveScroll !== false;

        if (_ajaxRefreshInFlight) {
            if (!_ajaxRefreshPending) {
                _ajaxRefreshPending = { preserveScroll };
            } else {
                _ajaxRefreshPending.preserveScroll = _ajaxRefreshPending.preserveScroll && preserveScroll;
            }
            return;
        }
        _ajaxRefreshInFlight = true;
        try {
            const state = this.snapshotViewerState();
            state.preserveScroll = preserveScroll;
            const response = await fetch('/api/news');
            const baseData = await response.json();

            let mergedData = baseData;
            try {
                const subsAll = TR.subscription?.getSubscriptions ? TR.subscription.getSubscriptions() : [];
                if (Array.isArray(subsAll) && subsAll.length > 0) {
                    const cap = 25;
                    const subs = subsAll.slice(0, cap);
                    const ids = subs.map((s) => String(s?.source_id || s?.rss_source_id || '').trim()).filter(Boolean);
                    if (ids.length > 0) {
                        try {
                            fetch('/api/rss-sources/warmup?wait_ms=0', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ source_ids: ids, priority: 'normal' })
                            }).catch(() => {});
                        } catch (e) {
                            // ignore
                        }
                    }
                    const rssResp = await fetch('/api/subscriptions/rss-news', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ subscriptions: subs })
                    });
                    const rssData = await rssResp.json();
                    if (rssResp.ok && rssData && typeof rssData === 'object') {
                        const baseCategories = (mergedData && typeof mergedData === 'object' && mergedData.categories) ? mergedData.categories : {};
                        const rssCategories = (rssData && typeof rssData === 'object' && rssData.categories) ? rssData.categories : {};
                        mergedData = {
                            ...mergedData,
                            categories: { ...baseCategories, ...rssCategories },
                        };
                    }
                }
            } catch (e) {
                console.error('rss merge error:', e);
            }

            this.renderViewerFromData(mergedData, state);
            if (state.preserveScroll) {
                window.scrollTo({ top: state.scrollY, behavior: 'auto' });
                TR.scroll.restoreActiveTabPlatformGridScroll(state);
            }
            _ajaxLastRefreshAt = Date.now();
        } catch (e) {
            console.error('refreshViewerData error:', e);
        } finally {
            _ajaxRefreshInFlight = false;

            const pending = _ajaxRefreshPending;
            _ajaxRefreshPending = null;
            if (pending) {
                this.refreshViewerData({ preserveScroll: pending.preserveScroll });
            }
        }
    },

    async fetchData() {
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
                setTimeout(() => this.refreshViewerData({ preserveScroll: true }), 300);
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
    },

    setupAjaxAutoRefresh() {
        const intervalMs = 300000;
        setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - _ajaxLastRefreshAt < intervalMs - 5000) return;
            this.refreshViewerData({ preserveScroll: true });
        }, 5000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.refreshViewerData({ preserveScroll: true });
            }
        });
    }
};

// 全局函数
window.fetchData = () => data.fetchData();
window.refreshViewerData = (opts) => data.refreshViewerData(opts);

TR.data = data;

// 初始化
ready(function() {
    const updatedAtEl = document.getElementById('updatedAt');
    if (updatedAtEl && updatedAtEl.textContent) {
        updatedAtEl.textContent = formatUpdatedAt(updatedAtEl.textContent);
    }
    data.setupAjaxAutoRefresh();
});
