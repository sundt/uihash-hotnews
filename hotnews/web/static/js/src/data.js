/**
 * Hotnews Data Module
 * 数据获取、渲染、自动刷新
 */

import { TR, ready, escapeHtml, formatUpdatedAt, formatNewsDate } from './core.js';
import { storage } from './storage.js';

const TAB_STORAGE_KEY = 'hotnews_active_tab';
const CATEGORY_PAGE_SIZE = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;

let _ajaxRefreshInFlight = false;
let _ajaxLastRefreshAt = 0;
let _ajaxRefreshPending = null;

let _latestCategories = null;
let _platformCloseHandlersAttached = false;

let _lazyPlatformObserver = null;

function _getCategoryIdFromCard(card) {
    const pane = card?.closest?.('.tab-pane');
    const id = pane?.id || '';
    return id.startsWith('tab-') ? id.slice(4) : null;
}

function _isCustomCategoryId(catId) {
    try {
        const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
        const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];
        return custom.some((c) => String(c?.id || '').trim() === String(catId || '').trim());
    } catch (e) {
        return false;
    }
}

function _renderPlatformHeaderButtonsHtml(catId, platformId) {
    const pid = String(platformId || '').trim();
    const isRss = pid.startsWith('rss-');
    const canDelete = isRss;
    const delBtn = canDelete ? '<button type="button" class="tr-platform-card-delete" data-action="delete-platform">−</button>' : '';
    const hideBtn = !isRss ? '<button type="button" class="tr-platform-card-hide" data-action="hide-platform">🙈</button>' : '';
    return `${delBtn}${hideBtn}`;
}

function _renderSkeletonNewsItemsHtml(count) {
    const n = Math.max(0, Number(count || 0) || 0);
    let html = '';
    for (let i = 0; i < n; i++) {
        html += '<li class="tr-news-skeleton" aria-hidden="true"><div class="tr-news-skeleton-line"></div></li>';
    }
    return html;
}

function _createNewsLi(n, idx, platformId) {
    const li = document.createElement('li');
    li.className = 'news-item';
    li.dataset.newsId = String(n?.stable_id || '');
    li.dataset.newsTitle = String(n?.display_title || n?.title || '');

    const content = document.createElement('div');
    content.className = 'news-item-content';

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

    li.appendChild(content);

    const meta = String(n?.meta || '').trim();
    const isRssPlatform = String(platformId || '').startsWith('rss-');
    if (meta && !isRssPlatform) {
        const sub = document.createElement('div');
        sub.className = 'news-subtitle';
        sub.textContent = meta;
        li.appendChild(sub);
    }

    try {
        const reads = TR.readState?.getReadNews?.() || {};
        if (li.dataset.newsId && reads[li.dataset.newsId]) {
            li.classList.add('read');
            cb.checked = true;
        }
    } catch (e) {
        // ignore
    }

    return li;
}

async function _hydrateLazyPlatformCard(card) {
    if (!card || !(card instanceof Element)) return;
    if (String(card?.dataset?.lazy || '') !== '1') return;
    if (String(card?.dataset?.loading || '') === '1') return;

    const pane = card.closest('.tab-pane');
    if (!pane || !pane.classList.contains('active')) return;

    const pid = String(card.dataset.platform || '').trim();
    if (!pid) return;

    card.dataset.loading = '1';
    try {
        const url = `/api/news/page?platform_id=${encodeURIComponent(pid)}&offset=0&page_size=${encodeURIComponent(String(CATEGORY_PAGE_SIZE))}`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const payload = await resp.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];

        const list = card.querySelector('.news-list');
        if (!list) return;

        list.querySelectorAll('.tr-news-skeleton').forEach((el) => el.remove());
        list.querySelectorAll('.news-placeholder').forEach((el) => el.remove());
        list.querySelectorAll('.news-item').forEach((el) => el.remove());

        const capped = items.slice(0, CATEGORY_PAGE_SIZE);
        for (let i = 0; i < capped.length; i++) {
            list.appendChild(_createNewsLi(capped[i], i + 1, pid));
        }

        const loadedCount = list.querySelectorAll('.news-item').length;
        card.dataset.loadedCount = String(loadedCount);
        card.dataset.hasMore = '0';
        card.dataset.loadedDone = '1';
        card.dataset.lazy = '0';

        try {
            if (TR.paging) {
                TR.paging.setCardPageSize(card, Math.min(CATEGORY_PAGE_SIZE, Math.max(1, loadedCount || CATEGORY_PAGE_SIZE)));
                TR.paging.applyPagingToCard(card, 0);
            }
        } catch (e) {
            // ignore
        }

        try {
            if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
            if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
        } catch (e) {
            // ignore
        }

        try {
            TR.search?.searchNews?.();
        } catch (e) {
            // ignore
        }

        try {
            const activeTab = TR.tabs?.getActiveTabId?.() || null;
            if (activeTab) TR.filter?.applyCategoryFilter?.(activeTab);
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    } finally {
        card.dataset.loading = '0';
    }
}

function _attachLazyPlatformObservers() {
    try {
        if (_lazyPlatformObserver) {
            _lazyPlatformObserver.disconnect();
            _lazyPlatformObserver = null;
        }
    } catch (e) {
        // ignore
    }

    _lazyPlatformObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const card = entry.target;
            if (!card || !(card instanceof Element)) continue;
            if (String(card?.dataset?.lazy || '') !== '1') {
                try { _lazyPlatformObserver?.unobserve?.(card); } catch (e) { /* ignore */ }
                continue;
            }
            _hydrateLazyPlatformCard(card).catch(() => { });
        }
    }, { root: null, rootMargin: '0px 200px 0px 200px', threshold: 0.15 });

    document.querySelectorAll('.platform-card[data-lazy="1"]').forEach((card) => {
        try { _lazyPlatformObserver.observe(card); } catch (e) { /* ignore */ }
    });
}

function _waitAnimationEnd(el, timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            try {
                el?.removeEventListener?.('animationend', onEnd);
            } catch (e) {
                // ignore
            }
            resolve();
        };
        const onEnd = () => finish();
        try {
            el?.addEventListener?.('animationend', onEnd, { once: true });
        } catch (e) {
            // ignore
        }
        setTimeout(finish, Math.max(0, Number(timeoutMs || 0) || 0));
    });
}

let _trConfirmOverlayEl = null;
let _trConfirmResolve = null;

function _showCenteredConfirmModal(message, okText, cancelText) {
    return new Promise((resolve) => {
        if (_trConfirmResolve) {
            try {
                _trConfirmResolve(false);
            } catch (e) {
                // ignore
            }
        }
        _trConfirmResolve = resolve;

        if (!_trConfirmOverlayEl) {
            const overlay = document.createElement('div');
            overlay.className = 'tr-confirm-overlay';
            overlay.innerHTML = `
                <div class="tr-confirm-modal" role="dialog" aria-modal="true">
                    <div class="tr-confirm-message"></div>
                    <div class="tr-confirm-actions">
                        <button type="button" class="tr-confirm-btn tr-confirm-cancel" data-action="cancel"></button>
                        <button type="button" class="tr-confirm-btn tr-confirm-ok" data-action="ok"></button>
                    </div>
                </div>`;

            overlay.addEventListener('click', (e) => {
                const t = e?.target;
                if (!t || !(t instanceof Element)) return;
                const okBtn = t.closest('button[data-action="ok"]');
                const cancelBtn = t.closest('button[data-action="cancel"]');
                if (okBtn) {
                    e.preventDefault();
                    overlay.classList.remove('show');
                    const r = _trConfirmResolve;
                    _trConfirmResolve = null;
                    r?.(true);
                    return;
                }
                if (cancelBtn || t === overlay) {
                    e.preventDefault();
                    overlay.classList.remove('show');
                    const r = _trConfirmResolve;
                    _trConfirmResolve = null;
                    r?.(false);
                }
            });

            document.body.appendChild(overlay);
            _trConfirmOverlayEl = overlay;
        }

        try {
            const msgEl = _trConfirmOverlayEl.querySelector('.tr-confirm-message');
            if (msgEl) msgEl.textContent = String(message || '');
            const okEl = _trConfirmOverlayEl.querySelector('button[data-action="ok"]');
            if (okEl) okEl.textContent = String(okText || '确认');
            const cancelEl = _trConfirmOverlayEl.querySelector('button[data-action="cancel"]');
            if (cancelEl) cancelEl.textContent = String(cancelText || '取消');
        } catch (e) {
            // ignore
        }

        _trConfirmOverlayEl.classList.add('show');
    });
}

function _buildPlatformCardElement(categoryId, platformId, platform, state, opts = {}) {
    const catId = String(categoryId || '').trim();
    const pid = String(platformId || '').trim();
    const p = platform || {};

    const platformName = escapeHtml(p?.name || pid);
    const platformBadge = p?.is_new ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(pid)}">NEW</span>` : '';
    const news = Array.isArray(p?.news) ? p.news : [];
    const totalCount = news.length;
    const initialCount = Math.min(totalCount, CATEGORY_PAGE_SIZE);
    const pagingOffset = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;
    const filteredNews = news.slice(0, initialCount);

    const newsItemsHtml = filteredNews.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '');
        const meta = escapeHtml(n?.meta || '');
        const isRssPlatform = String(pid || '').startsWith('rss-');
        const isCross = !!n?.is_cross_platform;
        const crossPlatforms = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
        const crossTitle = escapeHtml(crossPlatforms.join(', '));
        const crossCount = escapeHtml(n?.cross_platform_count ?? '');
        const crossBadge = isCross ? `<span class="cross-platform-badge" title="同时出现在: ${crossTitle}">🔥 ${crossCount}</span>` : '';
        const crossClass = isCross ? 'cross-platform' : '';
        const checkboxHtml = '<input type="checkbox" class="news-checkbox" title="标记已读" onchange="markAsRead(this)" />';
        const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
        const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + CATEGORY_PAGE_SIZE)) ? ' paged-hidden' : '';
        const metaHtml = (meta && !isRssPlatform) ? `<div class="news-subtitle">${meta}</div>` : '';
        const safeHref = url || '#';
        const dateStr = formatNewsDate(n?.timestamp);
        const dateHtml = dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${escapeHtml(dateStr)}</span>` : '';
        return `
            <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${title}">
                <div class="news-item-content">
                    ${checkboxHtml}
                    ${indexHtml}
                    <a class="news-title ${crossClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                        ${crossBadge}
                    </a>
                    ${dateHtml}
                </div>
                ${metaHtml}
            </li>`;
    }).join('') || '<li class="news-placeholder" aria-hidden="true">待加载...</li>';

    const headerButtons = _renderPlatformHeaderButtonsHtml(catId, pid);
    const dragHandle = `<span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>`;
    const animateIn = opts && opts.animateIn ? ' tr-explore-flip-in' : '';

    const html = `
        <div class="platform-card${animateIn}" data-platform="${escapeHtml(pid)}" data-total-count="${String(totalCount)}" data-loaded-count="${String(initialCount)}" draggable="false">
            <div class="platform-header">
                ${dragHandle}
                <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(pid)}')">📱 ${platformName}${platformBadge}</div>
                <div class="platform-header-actions">${headerButtons}</div>
            </div>
            <ul class="news-list">${newsItemsHtml}
            </ul>
            <div class="news-load-sentinel" aria-hidden="true"></div>
        </div>`;

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
}

async function _deletePlatformFromCustomCategory(catId, platformId) {
    // ... (no changes)
    const custom = Array.isArray(config.customCategories) ? config.customCategories : [];
    const idx = custom.findIndex((c) => String(c?.id || '').trim() === cid);
    if (idx < 0) return false;

    const prev = custom[idx] || {};
    const prevPlatforms = Array.isArray(prev.platforms) ? prev.platforms : [];
    const nextPlatforms = prevPlatforms.filter((x) => String(x || '').trim() !== pid);
    config.customCategories[idx] = { ...prev, platforms: nextPlatforms };

    try {
        TR.settings.saveCategoryConfig(config);
    } catch (e) {
        return false;
    }
    return true;
}

async function _verifyServerRssSubscriptionRemoved(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid) return false;
    try {
        const resp = await fetch('/api/me/rss-subscriptions', { method: 'GET' });
        if (!resp.ok) return false;
        const payload = await resp.json().catch(() => ({}));
        const subs = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
        const exists = subs.some((s) => String(s?.source_id || s?.rss_source_id || '').trim() === sid);
        return !exists;
    } catch (e) {
        return false;
    }
}

async function _deleteRssSubscriptionByPlatformId(platformId) {
    const pid = String(platformId || '').trim();
    if (!pid.startsWith('rss-')) return false;
    const sid = pid.slice(4);
    if (!sid) return false;

    if (!TR.subscription) return false;
    try {
        TR.subscription.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }
    let subs = [];
    try {
        subs = TR.subscription.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    } catch (e) {
        subs = [];
    }
    const next = (Array.isArray(subs) ? subs : []).filter((s) => String(s?.source_id || s?.rss_source_id || '').trim() !== sid);
    try {
        TR.subscription.setSubscriptions?.(next);
    } catch (e) {
        return false;
    }

    try {
        if (TR.subscription.saveOnly) {
            await TR.subscription.saveOnly();
        } else if (TR.subscription.saveAndRefresh) {
            await TR.subscription.saveAndRefresh();
        }
    } catch (e) {
        return false;
    }

    return await _verifyServerRssSubscriptionRemoved(sid);
}

async function _deletePlatformCard(cardEl) {
    if (!cardEl || !(cardEl instanceof Element)) return;
    const catId = _getCategoryIdFromCard(cardEl);
    const pid = String(cardEl.getAttribute('data-platform') || '').trim();
    if (!catId || !pid) return;
    if (catId === 'explore') return;

    const isRss = pid.startsWith('rss-');
    if (!isRss) return;

    try {
        let shouldConfirm = true;
        try {
            const qs = new URLSearchParams(window.location.search);
            if (qs.get('e2e') === '1') {
                shouldConfirm = false;
            }
        } catch (e2) {
            // ignore
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
                shouldConfirm = false;
            }
        } catch (e2) {
            // ignore
        }

        if (shouldConfirm) {
            const ok = await _showCenteredConfirmModal(
                '确定要删除该 RSS 卡片吗？删除后将取消订阅。',
                '确认删除',
                '取消'
            );
            if (!ok) return;
        }
    } catch (e) {
        // ignore
    }

    try {
        const btn = cardEl.querySelector('button[data-action="delete-platform"]');
        if (btn) btn.setAttribute('disabled', 'true');
    } catch (e) {
        // ignore
    }

    const parent = cardEl.parentNode;
    const nextSibling = cardEl.nextSibling;

    try {
        if (parent) parent.removeChild(cardEl);
    } catch (e) {
        // ignore
    }
    try {
        TR.counts?.updateAllCounts?.();
    } catch (e) {
        // ignore
    }

    const ok = await _deleteRssSubscriptionByPlatformId(pid);

    if (!ok) {
        try {
            if (parent) {
                if (nextSibling) parent.insertBefore(cardEl, nextSibling);
                else parent.appendChild(cardEl);
            }
        } catch (e) {
            // ignore
        }
        try {
            const btn2 = cardEl.querySelector('button[data-action="delete-platform"]');
            if (btn2) btn2.removeAttribute('disabled');
        } catch (e) {
            // ignore
        }
        try {
            TR.toast?.show?.('删除失败：订阅未能从服务端移除，请稍后重试', { variant: 'error', durationMs: 2500 });
        } catch (e) {
            // ignore
        }
        return;
    }

    try {
        TR.counts?.updateAllCounts?.();
        TR.readState?.updateReadCount?.();
    } catch (e) {
        // ignore
    }
}

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

        let _knowledgeGridHtml = '';
        try {
            const existingPane = document.getElementById('tab-knowledge');
            const existingGrid = existingPane ? existingPane.querySelector('.platform-grid') : null;
            const hasMb = !!(existingGrid && existingGrid.querySelector('.tr-morning-brief-card'));
            const hasItems = !!(existingGrid && existingGrid.querySelector('.news-item'));
            if (hasMb && hasItems) {
                _knowledgeGridHtml = String(existingGrid.innerHTML || '');
            }
        } catch (e) {
            _knowledgeGridHtml = '';
        }

        const categories = TR.settings.applyCategoryConfigToData(data?.categories || {});
        _latestCategories = categories;
        const preferredActiveTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;
        const isE2E = (() => {
            try {
                return (new URLSearchParams(window.location.search)).get('e2e') === '1';
            } catch (e) {
                return false;
            }
        })();
        const tabIds = Object.keys(categories || {});
        let firstTabId = tabIds[0] || null;
        if (firstTabId === 'explore') {
            firstTabId = tabIds.find((id) => id !== 'explore') || firstTabId;
        }
        if (isE2E && firstTabId === 'rsscol-rss') {
            firstTabId = tabIds.find((id) => id !== 'rsscol-rss') || firstTabId;
        }
        let activeTabId = preferredActiveTab || firstTabId;
        if (activeTabId === 'explore') {
            activeTabId = tabIds.find((id) => id !== 'explore') || activeTabId;
        }
        if (isE2E && activeTabId === 'rsscol-rss') {
            activeTabId = tabIds.find((id) => id !== 'rsscol-rss') || activeTabId;
        }

        const tabsHtml = Object.entries(categories).map(([catId, cat]) => {
            const icon = escapeHtml(cat?.icon || '');
            const name = escapeHtml(cat?.name || catId);
            const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${escapeHtml(catId)}">NEW</span>` : '';
            const badgeSports = catId === 'sports' ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : '';
            const badge = `${badgeCategory}${badgeSports}`;
            const activeClass = (String(catId) === String(activeTabId)) ? ' active' : '';
            return `
            <div class="category-tab${activeClass}" data-category="${escapeHtml(catId)}" draggable="false" onclick="switchTab('${escapeHtml(catId)}')">
                <span class="category-drag-handle" title="拖拽调整栏目顺序" draggable="true">☰</span>
                <div class="category-tab-icon">${icon}</div>
                <div class="category-tab-name">${name}${badge}</div>
            </div>`;
        }).join('');

        const contentHtml = Object.entries(categories).map(([catId, cat]) => {
            const isActiveCategory = !!activeTabId && String(catId) === String(activeTabId);
            const paneActiveClass = isActiveCategory ? ' active' : '';

            if (String(catId) === 'rsscol-rss') {
                const btnRow = `
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <div id="rssCategoryCarouselStatus" style="color:#6b7280;font-size:0.85rem;flex:1;min-width:200px;"></div>
                    </div>`;
                return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" style="display:flex;flex-direction:column;gap:10px;min-height:0;">
                        ${btnRow}
                        <div id="rssCategoryCarouselGrid" style="display:flex;flex-direction:column;gap:10px;min-height:0;"></div>
                    </div>
                    <div class="category-empty-state" style="display:none;" aria-hidden="true">没有匹配内容，请调整关键词或切换模式</div>
                </div>`;
            }

            if (String(catId) === 'explore') {
                return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" id="trExploreGrid"></div>
                </div>`;
            }

            if (String(catId) === 'knowledge') {
                const gridInner = _knowledgeGridHtml || `
                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-1" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">🕒 最新 1-50</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice1">
                            <li class="news-placeholder" aria-hidden="true">加载中...</li>
                        </ul>
                    </div>

                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-2" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">⭐ 最新 51-100</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice2">
                            <li class="news-placeholder" aria-hidden="true">加载中...</li>
                        </ul>
                    </div>

                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-3" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">🧾 最新 101-150</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice3">
                            <li class="news-placeholder" aria-hidden="true">加载中...</li>
                        </ul>
                    </div>
                `;
                return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" data-mb-injected="1">${gridInner}</div>
                </div>`;
            }

            const platforms = cat?.platforms || {};
            const orderedIds = Object.keys(platforms || {});
            const platformCards = orderedIds.map((platformId, idx0) => {
                const platform = platforms?.[platformId];
                if (!platform) return '';
                const platformName = escapeHtml(platform?.name || platformId);
                const platformBadge = platform?.is_new ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(platformId)}">NEW</span>` : '';
                const news = Array.isArray(platform?.news) ? platform.news : [];
                const totalCount = news.length;
                const shouldHydrate = isActiveCategory && idx0 < 3;
                const isLazy = !shouldHydrate;
                const initialCount = shouldHydrate ? Math.min(totalCount, CATEGORY_PAGE_SIZE) : 0;
                const pagingOffset = (platformId && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[platformId])) ? state.pagingOffsets[platformId] : 0;
                const filteredNews = news.slice(0, initialCount);

                const newsItemsHtml = isLazy
                    ? _renderSkeletonNewsItemsHtml(8)
                    : (filteredNews.map((n, idx) => {
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
                        const checkboxHtml = '<input type="checkbox" class="news-checkbox" title="标记已读" onchange="markAsRead(this)" />';
                        const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
                        const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + CATEGORY_PAGE_SIZE)) ? ' paged-hidden' : '';
                        const metaHtml = (meta && !isRssPlatform) ? `<div class="news-subtitle">${meta}</div>` : '';
                        const safeHref = url || '#';
                        const dateStr = formatNewsDate(n?.timestamp);
                        const dateHtml = dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${escapeHtml(dateStr)}</span>` : '';
                        return `
                        <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${title}">
                            <div class="news-item-content">
                                ${checkboxHtml}
                                ${indexHtml}
                                <a class="news-title ${crossClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                                    ${title}
                                    ${crossBadge}
                                </a>
                                ${dateHtml}
                            </div>
                            ${metaHtml}
                        </li>`;
                    }).join(''));

                const headerButtons = _renderPlatformHeaderButtonsHtml(catId, platformId);
                const dragHandle = `<span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>`;

                return `
                <div class="platform-card" data-platform="${escapeHtml(platformId)}" data-total-count="${String(totalCount)}" data-loaded-count="${String(initialCount)}" data-lazy="${isLazy ? '1' : '0'}" data-loaded-done="${isLazy ? '0' : '1'}" draggable="false">
                    <div class="platform-header">
                        ${dragHandle}
                        <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(platformId)}')">📱 ${platformName}${platformBadge}</div>
                        <div class="platform-header-actions">${headerButtons}</div>
                    </div>
                    <ul class="news-list">${newsItemsHtml}
                    </ul>
                    <div class="news-load-sentinel" aria-hidden="true"></div>
                </div>`;
            }).filter(Boolean).join('');

            return `
            <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                <div class="platform-grid">${platformCards}
                </div>
                <div class="category-empty-state" style="display:none;" aria-hidden="true">没有匹配内容，请调整关键词或切换模式</div>
            </div>`;
        }).join('');

        tabsEl.innerHTML = tabsHtml;
        contentEl.innerHTML = contentHtml;

        try {
            const isMobile = !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
            const tabCount = tabsEl.querySelectorAll('.category-tab').length;
            if (isMobile) {
                tabsEl.classList.remove('compact');
            } else {
                tabsEl.classList.toggle('compact', tabCount > 8);
            }
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

        _attachLazyPlatformObservers();

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

            this.renderViewerFromData(baseData, state);
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
        const checkIntervalMs = 300000; // Check every 5 minutes

        // Silent check for updates - only show red dot, don't refresh
        const checkForUpdates = async () => {
            if (document.visibilityState !== 'visible') return;

            try {
                const resp = await fetch('/api/news/check-updates');
                if (!resp.ok) return;

                const data = await resp.json();
                if (data.categories) {
                    for (const [catId, hasNew] of Object.entries(data.categories)) {
                        if (hasNew) {
                            this.showCategoryUpdateDot(catId);
                        }
                    }
                }
            } catch (e) {
                // Silent fail
            }
        };

        // Check periodically
        setInterval(checkForUpdates, checkIntervalMs);

        // Also check when page becomes visible (but no page refresh)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Wait a bit then check
                setTimeout(checkForUpdates, 2000);
            }
        });
    },

    showCategoryUpdateDot(categoryId) {
        const tab = document.querySelector(`.category-tab[data-category="${categoryId}"]`);
        if (!tab) return;

        let dot = tab.querySelector('.update-dot');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'update-dot';
            tab.style.position = 'relative';
            tab.appendChild(dot);
        }
        dot.classList.add('show');
    },

    hideCategoryUpdateDot(categoryId) {
        const tab = document.querySelector(`.category-tab[data-category="${categoryId}"]`);
        if (!tab) return;

        const dot = tab.querySelector('.update-dot');
        if (dot) {
            dot.classList.remove('show');
        }
    }
};

// 全局函数
window.fetchData = () => data.fetchData();
window.refreshViewerData = (opts) => data.refreshViewerData(opts);

TR.data = data;

// 初始化
ready(function () {
    const updatedAtEl = document.getElementById('updatedAt');
    if (updatedAtEl && updatedAtEl.textContent) {
        updatedAtEl.textContent = formatUpdatedAt(updatedAtEl.textContent);
    }
    data.setupAjaxAutoRefresh();

    if (!_platformCloseHandlersAttached) {
        _platformCloseHandlersAttached = true;
        document.addEventListener('click', (e) => {
            const t = e?.target;
            if (!t || !(t instanceof Element)) return;
            const btn = t.closest('button[data-action="delete-platform"]');
            if (!btn) return;
            const card = btn.closest('.platform-card');
            if (!card) return;
            _deletePlatformCard(card).catch(() => { });
        });

        document.addEventListener('click', async (e) => {
            const t = e?.target;
            if (!t || !(t instanceof Element)) return;
            const btn = t.closest('button[data-action="hide-platform"]');
            if (!btn) return;
            const card = btn.closest('.platform-card');
            const pid = String(card?.getAttribute?.('data-platform') || '').trim();
            if (!pid || pid.startsWith('rss-')) return;

            const ok = await _showCenteredConfirmModal(
                '确定要隐藏该卡片吗？隐藏后该卡片将不再显示，你可以在「栏目设置」中重新勾选并保存来恢复显示。',
                '确认隐藏',
                '取消'
            );
            if (!ok) return;
            try {
                btn.setAttribute('disabled', 'true');
            } catch (e) {
                // ignore
            }
            try {
                TR.settings?.togglePlatformHidden?.(pid);
            } catch (e) {
                // ignore
            }
        });
    }

    _attachLazyPlatformObservers();
});
