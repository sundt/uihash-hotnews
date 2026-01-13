import { TR, ready, escapeHtml } from './core.js';

const EXPLORE_TAB_ID = 'explore';
const TAB_SWITCHED_EVENT = 'tr_tab_switched';
const INITIAL_CARDS = 3; // Load 3 cards initially (150 items)
const MAX_CARDS = 20; // Maximum number of cards to load (prevent infinite loading)

function getItemsPerCard() {
    return (window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.items_per_card) || 50;
}

let _exploreInFlight = false;
let _exploreOffset = 0;
let _exploreObserver = null;
let _exploreFinished = false;

function _getActiveTabId() {
    try {
        return document.querySelector('.category-tabs .category-tab.active')?.dataset?.category || null;
    } catch (e) {
        return null;
    }
}

function _fmtTime(tsSec) {
    const ts = Number(tsSec || 0) || 0;
    if (!ts) return '';
    try {
        const d = new Date(ts * 1000);
        const YYYY = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        return `${YYYY}-${MM}-${DD}`;
    } catch (e) {
        return '';
    }
}

function _buildNewsItemsHtml(items, opts = {}) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
        const emptyText = escapeHtml(opts.emptyText || '暂无内容');
        return `<li class="tr-explore-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-explore-time" style="margin-left:8px;color:#9ca3af;font-size:12px;">${escapeHtml(t)}</span>` : '';
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${timeHtml}
                </div>
            </li>`;
    }).join('');
}

function _getPane() {
    return document.getElementById(`tab-${EXPLORE_TAB_ID}`);
}

function _getGrid() {
    const pane = _getPane();
    return pane ? pane.querySelector('.platform-grid') : null;
}

function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;

    let grid = pane.querySelector('.platform-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'platform-grid';
        grid.style.display = 'flex';
        grid.style.flexDirection = 'row';
        grid.style.overflowX = 'auto';
        grid.style.overflowY = 'hidden';
        grid.style.alignItems = 'flex-start';
        grid.style.overscrollBehavior = 'contain';
        pane.appendChild(grid);
    } else {
        grid.style.overscrollBehavior = 'contain';
    }

    try {
        if (grid.dataset) grid.dataset.exploreInjected = '1';
    } catch (e) { }

    return true;
}

async function _fetchJson(url) {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/explore/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
}

function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;

    const card = document.createElement('div');
    card.className = 'platform-card tr-explore-card';
    card.style.minWidth = '360px';
    card.dataset.platform = `explore-slice-${cardIndex}`;
    card.draggable = false;

    const limit = getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                📰 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-explore-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml(items, { emptyText: '暂无内容' })}
        </ul>
    `;

    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => {
        el.textContent = String(displayStart + i);
    });

    const sentinel = container.querySelector('#explore-load-sentinel');
    if (sentinel) {
        container.insertBefore(card, sentinel);
    } else {
        container.appendChild(card);
    }
}

function _createSentinel(container) {
    const existing = container.querySelector('#explore-load-sentinel');
    if (existing) existing.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'explore-load-sentinel';
    sentinel.style.minWidth = '20px';
    sentinel.style.height = '100%';
    sentinel.style.flexShrink = '0';
    sentinel.innerHTML = '<div style="width:20px;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">⏳</div>';
    container.appendChild(sentinel);
    return sentinel;
}

function _attachObserver() {
    if (_exploreObserver) {
        _exploreObserver.disconnect();
        _exploreObserver = null;
    }

    const pane = _getPane();
    if (!pane) return;

    _exploreObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                _loadNextBatch().catch(() => { });
            }
        }
    }, {
        root: pane.querySelector('.platform-grid'),
        rootMargin: '200px',
        threshold: 0.01
    });

    const sentinel = pane.querySelector('#explore-load-sentinel');
    if (sentinel) {
        _exploreObserver.observe(sentinel);

        // Manual check: if sentinel is already visible (e.g., on wide screens),
        // trigger load immediately since Observer callback may not fire
        setTimeout(() => {
            const rect = sentinel.getBoundingClientRect();
            const grid = pane.querySelector('.platform-grid');
            if (grid && rect.left < grid.getBoundingClientRect().right) {
                _loadNextBatch().catch(() => { });
            }
        }, 100);
    }
}

async function _loadNextBatch() {
    if (_exploreInFlight || _exploreFinished) return;

    _exploreInFlight = true;
    try {
        const limit = getItemsPerCard();
        const currentCardCount = Math.floor(_exploreOffset / limit);

        // Safety check: stop if we've loaded too many cards
        if (currentCardCount >= MAX_CARDS) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>';
                s.style.width = '40px';
            }
            return;
        }

        const items = await _fetchTimelineBatch(limit, _exploreOffset);

        if (!items.length) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>';
                s.style.width = '40px';
            }
            return;
        }

        const grid = _getGrid();
        if (grid) {
            const cardIndex = Math.floor(_exploreOffset / getItemsPerCard());
            _appendCard(items, cardIndex, grid);
        }

        _exploreOffset += items.length;

        if (items.length < limit) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) s.remove();
        }

    } catch (e) {
        console.error('Explore load error:', e);
    } finally {
        _exploreInFlight = false;
    }
}

async function _loadTimeline() {
    const grid = _getGrid();
    if (!grid) return;

    _exploreOffset = 0;
    _exploreFinished = false;
    grid.innerHTML = '';

    _createSentinel(grid);

    const limit = getItemsPerCard();
    const initialLimit = limit * INITIAL_CARDS;
    const items = await _fetchTimelineBatch(initialLimit, 0);

    if (!items.length) {
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
        return;
    }

    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        const cardIndex = Math.floor(i / limit);
        _appendCard(chunk, cardIndex, grid);
    }

    _exploreOffset = items.length;

    if (items.length < initialLimit) {
        _exploreFinished = true;
        const s = document.getElementById('explore-load-sentinel');
        if (s) s.remove();
    } else {
        _attachObserver();
    }
}

async function _refreshTimelineIfNeeded() {
    if (_getActiveTabId() !== EXPLORE_TAB_ID) return false;
    if (!_ensureLayout()) return false;

    const grid = _getGrid();
    if (grid && grid.querySelectorAll('.platform-card').length > 0) {
        // Already has content, don't reload
        _exploreInFlight = false;
        return true;
    }

    _exploreInFlight = true;
    try {
        await _loadTimeline();
        return true;
    } catch (e) {
        console.error('Explore refresh error:', e);
        return false;
    } finally {
        _exploreInFlight = false;
    }
}

let _initialized = false;

async function _initialLoad() {
    if (_initialized) return; // Prevent duplicate initialization
    if (!_ensureLayout()) return;
    _initialized = true;
    await _refreshTimelineIfNeeded();
}

function _ensurePolling() {
    try {
        window.addEventListener(TAB_SWITCHED_EVENT, (ev) => {
            const cid = String(ev?.detail?.categoryId || '').trim();
            if (cid !== EXPLORE_TAB_ID) return;
            if (!_exploreFinished) _attachObserver();
            _refreshTimelineIfNeeded().catch(() => { });
        });
    } catch (e) { }
}

function _patchRenderHook() {
    if (TR.exploreTimeline && TR.exploreTimeline._patched === true) return;
    const orig = TR.data?.renderViewerFromData;
    if (typeof orig !== 'function') return;

    TR.data.renderViewerFromData = function patchedRenderViewerFromData(data, state) {
        orig.call(TR.data, data, state);
        try {
            _initialLoad().catch(() => { });
        } catch (e) { }
    };

    TR.exploreTimeline = {
        ...(TR.exploreTimeline || {}),
        _patched: true,
    };
}

ready(function () {
    _patchRenderHook();
    _initialLoad().catch(() => { });
    _ensurePolling();
});
