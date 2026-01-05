import { TR, ready, escapeHtml } from './core.js';

const MORNING_BRIEF_CATEGORY_ID = 'knowledge';
const SINCE_STORAGE_KEY = 'tr_morning_brief_since_v1';
const LATEST_BASELINE_WINDOW_SEC = 2 * 3600;

const TIMELINE_LIMIT = 150;
const SLICE_SIZE = 50;

function _getActiveTabId() {
    try {
        return document.querySelector('.category-tabs .category-tab.active')?.dataset?.category || null;
    } catch (e) {
        return null;
    }
}

function _applyPagingToBriefCards() {
    try {
        const pane = _getPane();
        if (!pane) return;
        const cards = Array.from(pane.querySelectorAll('.platform-card.tr-morning-brief-card'));
        for (const card of cards) {
            try {
                TR.paging?.setCardPageSize?.(card, 50);
                TR.paging?.applyPagingToCard?.(card, 0);
            } catch (e) {
                // ignore
            }
        }
    } catch (e) {
        // ignore
    }
}

function _fmtTime(tsSec) {
    const ts = Number(tsSec || 0) || 0;
    if (!ts) return '';
    try {
        const d = new Date(ts * 1000);
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${MM}-${DD} ${hh}:${mm}`;
    } catch (e) {
        return '';
    }
}

function _buildNewsItemsHtml(items, opts = {}) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
        const emptyText = escapeHtml(opts.emptyText || '暂无内容');
        return `<li class="tr-mb-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-mb-time" style="margin-left:8px;color:#9ca3af;font-size:12px;">${escapeHtml(t)}</span>` : '';
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
    return document.getElementById(`tab-${MORNING_BRIEF_CATEGORY_ID}`);
}

function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;

    const grid = pane.querySelector('.platform-grid');
    if (!grid) return false;

    if (grid.dataset && grid.dataset.mbInjected === '1') return true;

    grid.innerHTML = `
        <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-1" data-page-size="50" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">🕒 最新 1-50</div>
                <div class="platform-header-actions">
                    <button type="button" class="tr-platform-card-close" data-action="mb-refresh" data-target="timeline">↻</button>
                </div>
            </div>
            <ul class="news-list" data-mb-list="slice1"></ul>
        </div>

        <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-2" data-page-size="50" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">⭐ 最新 51-100</div>
                <div class="platform-header-actions">
                    <button type="button" class="tr-platform-card-close" data-action="mb-refresh" data-target="timeline">↻</button>
                </div>
            </div>
            <ul class="news-list" data-mb-list="slice2"></ul>
        </div>

        <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-3" data-page-size="50" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">🧾 最新 101-150</div>
                <div class="platform-header-actions">
                    <button type="button" class="tr-platform-card-close" data-action="mb-refresh" data-target="timeline">↻</button>
                </div>
            </div>
            <ul class="news-list" data-mb-list="slice3"></ul>
        </div>
    `;

    try {
        if (grid.dataset) grid.dataset.mbInjected = '1';
    } catch (e) {
        // ignore
    }

    return true;
}

async function _fetchJson(url) {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

function _loadSince() {
    try {
        const raw = localStorage.getItem(SINCE_STORAGE_KEY);
        const n = parseInt(raw || '', 10);
        if (Number.isFinite(n) && n > 0) return n;
    } catch (e) {
        // ignore
    }
    const now = Math.floor(Date.now() / 1000);
    return now - 2 * 3600;
}

function _saveSince(ts) {
    const n = Number(ts || 0) || 0;
    if (!n) return;
    try {
        localStorage.setItem(SINCE_STORAGE_KEY, String(Math.floor(n)));
    } catch (e) {
        // ignore
    }
}

function _getListEl(kind) {
    const pane = _getPane();
    if (!pane) return null;
    return pane.querySelector(`.news-list[data-mb-list="${kind}"]`);
}

function _renderList(kind, html) {
    const el = _getListEl(kind);
    if (!el) return;
    el.innerHTML = html;
    try {
        TR.readState?.restoreReadState?.();
        TR.counts?.updateAllCounts?.();
    } catch (e) {
        // ignore
    }
}

async function _loadTimeline() {
    const payload = await _fetchJson(`/api/rss/brief/timeline?limit=${encodeURIComponent(String(TIMELINE_LIMIT))}&offset=0`);
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const s1 = items.slice(0, SLICE_SIZE);
    const s2 = items.slice(SLICE_SIZE, SLICE_SIZE * 2);
    const s3 = items.slice(SLICE_SIZE * 2, SLICE_SIZE * 3);

    _renderList('slice1', _buildNewsItemsHtml(s1, { emptyText: '暂无内容' }));
    _renderList('slice2', _buildNewsItemsHtml(s2, { emptyText: '暂无内容' }));
    _renderList('slice3', _buildNewsItemsHtml(s3, { emptyText: '暂无内容' }));

    _applyPagingToBriefCards();
}

async function _loadLatestIncremental(forceReset) {
    let since = TR.morningBrief?.since || 0;
    if (forceReset) {
        // Baseline load: always show recent items instead of pure incremental since last visit.
        const now = Math.floor(Date.now() / 1000);
        since = Math.max(0, now - LATEST_BASELINE_WINDOW_SEC);
        try {
            TR.morningBrief = {
                ...(TR.morningBrief || {}),
                since,
                latestItems: [],
            };
        } catch (e) {
            // ignore
        }
    } else if (!since) {
        since = _loadSince();
    }

    const payload = await _fetchJson(`/api/rss/brief/latest?since=${encodeURIComponent(String(since))}&limit=50`);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const nextSince = Number(payload?.next_since || since) || since;

    const st = TR.morningBrief || {};
    const existing = Array.isArray(st.latestItems) ? st.latestItems : [];

    // Keep existing items; prepend new items; dedupe by url (first occurrence wins).
    const merged = [];
    const seen = new Set();
    for (const x of [...items, ...existing]) {
        const u = String(x?.url || '').trim();
        if (!u) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        merged.push(x);
    }

    const capped = merged.slice(0, 20);

    TR.morningBrief = {
        ...(TR.morningBrief || {}),
        since: nextSince,
        latestItems: capped,
    };

    _saveSince(nextSince);
    _renderList('latest', _buildNewsItemsHtml(capped, { emptyText: '最近暂无上新' }));
}

function _attachHandlersOnce() {
    const pane = _getPane();
    if (!pane) return;
    if (pane.dataset && pane.dataset.mbBound === '1') return;

    pane.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !(t instanceof Element)) return;

        const refresh = t.closest('[data-action="mb-refresh"]');
        if (refresh) {
            e.preventDefault();
            const target = refresh.getAttribute('data-target') || '';
            if (target === 'timeline') {
                _loadTimeline().catch(() => {
                    try { TR.toast?.show('刷新失败', { variant: 'error', durationMs: 2000 }); } catch (_) {}
                });
                return;
            }
        }
    });

    try {
        if (pane.dataset) pane.dataset.mbBound = '1';
    } catch (e) {
        // ignore
    }
}

async function _initialLoad() {
    if (!_ensureLayout()) return;
    _attachHandlersOnce();

    // Initial load once.
    await Promise.allSettled([
        _loadTimeline(),
    ]);
}

function _ensurePolling() {
    if (TR.morningBrief && TR.morningBrief._pollTimer) return;

    const timer = window.setInterval(() => {
        try {
            if (_getActiveTabId() !== MORNING_BRIEF_CATEGORY_ID) return;
        } catch (e) {
            return;
        }
        if (!_ensureLayout()) return;
        _attachHandlersOnce();

        // Timeline mode: no polling by default.
    }, 60 * 1000);

    TR.morningBrief = {
        ...(TR.morningBrief || {}),
        _pollTimer: timer,
    };
}

function _patchRenderHook() {
    if (TR.morningBrief && TR.morningBrief._patched === true) return;

    // TR.data may not be ready at module evaluation time.
    const orig = TR.data?.renderViewerFromData;
    if (typeof orig !== 'function') return;

    TR.data.renderViewerFromData = function patchedRenderViewerFromData(data, state) {
        orig.call(TR.data, data, state);
        try {
            _initialLoad().catch(() => {});
        } catch (e) {
            // ignore
        }
    };

    TR.morningBrief = {
        ...(TR.morningBrief || {}),
        _patched: true,
    };
}

ready(function() {
    // Patch after TR.data is attached.
    _patchRenderHook();

    // When no custom config exists, server-rendered DOM is used and TR.data.renderViewerFromData
    // may not run. Ensure initial render happens.
    _initialLoad().catch(() => {});

    _ensurePolling();
});
