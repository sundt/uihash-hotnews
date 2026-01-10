import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const SEEN_KEY = 'rss_catalog_preview_seen_v1';
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

const BATCH_SIZE = 4;
const ENTRIES_PER_SOURCE = 20;

let _open = false;

let _offset = 0;
let _total = 0;
let _loading = false;

let _currentBatch = [];

function _sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms || 0)));
}

function _getModalEl() {
    return document.getElementById('rssCatalogPreviewModal');
}

function _getGridEl() {
    return document.getElementById('rssCatalogPreviewGrid');
}

function _getStatusEl() {
    return document.getElementById('rssCatalogPreviewStatus');
}

function _setStatus(msg, opts = {}) {
    const el = _getStatusEl();
    if (!el) return;
    const variant = String(opts.variant || '').toLowerCase();
    const color = variant === 'error' ? '#dc2626' : (variant === 'success' ? '#16a34a' : '#6b7280');
    el.style.color = color;
    el.textContent = msg == null ? '' : String(msg);
}

function _loadSeenState() {
    const raw = storage.get(SEEN_KEY, null);
    if (!raw || typeof raw !== 'object') return { ts: 0, ids: [] };
    const ts = Number(raw.ts || 0) || 0;
    const ids = Array.isArray(raw.ids) ? raw.ids.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!ts || (Date.now() - ts) > SEEN_TTL_MS) {
        return { ts: 0, ids: [] };
    }
    return { ts, ids };
}

function _saveSeenState(ids) {
    const arr = Array.isArray(ids) ? ids.map((x) => String(x || '').trim()).filter(Boolean) : [];
    storage.set(SEEN_KEY, { ts: Date.now(), ids: Array.from(new Set(arr)) });
}

function _getSeenSet() {
    const st = _loadSeenState();
    return new Set(st.ids);
}

function _clearSeen() {
    storage.remove(SEEN_KEY);
}

async function _warmupSourceIds(sourceIds, priority = 'normal') {
    const ids = Array.isArray(sourceIds) ? sourceIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!ids.length) return;
    try {
        await fetch('/api/rss-sources/warmup?wait_ms=0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_ids: ids, priority })
        });
    } catch (e) {
        // ignore
    }
}

async function _fetchSourcesPage(limit, offset) {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));
    const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Failed to load RSS sources');
    const items = Array.isArray(payload?.sources) ? payload.sources : [];
    const total = Number(payload?.total || 0) || 0;
    const nextOffset = Number(payload?.next_offset ?? (offset + items.length)) || (offset + items.length);
    return { items, total, nextOffset };
}

function _safeNameFromSource(src) {
    const name = String(src?.name || src?.host || src?.id || '').trim();
    return name || 'RSS';
}

function _extractEntries(payload) {
    const data = payload?.data || {};
    const feedTitle = String(data?.feed?.title || '').trim();
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const normalized = entries
        .map((e) => {
            const title = String(e?.title || '').trim();
            const link = String(e?.link || '').trim();
            return { title: title || link, link };
        })
        .filter((x) => !!x.link);
    return { feedTitle, entries: normalized };
}

function _renderBatch(cards) {
    const grid = _getGridEl();
    if (!grid) return;

    const html = (cards || []).map((c) => {
        const sid = String(c?.source_id || '').trim();
        const platformName = escapeHtml(c?.platform_name || 'RSS');
        const statusLine = c?.error ? `<div style="color:#dc2626;font-size:0.78rem;">${escapeHtml(c.error)}</div>` : `<div style="color:#6b7280;font-size:0.78rem;">条目数：${String(c.entries_count || 0)}</div>`;

        const btnLabel = c?.already_added ? '已加入' : '加入待保存';
        const btnDisabled = c?.already_added ? 'disabled' : '';

        const items = Array.isArray(c?.entries) ? c.entries : [];
        const listHtml = items.slice(0, ENTRIES_PER_SOURCE).map((e, idx) => {
            const title = escapeHtml(e?.title || '');
            const link = escapeHtml(e?.link || '#');
            return `
                <li class="news-item" data-news-id="" data-news-title="${title}">
                    <div class="news-item-content">
                        <span class="news-index">${String(idx + 1)}</span>
                        <a class="news-title" href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>
                    </div>
                </li>`;
        }).join('');

        return `
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}" style="margin:0;">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; flex: 1; min-width: 0; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">📱 ${platformName}</div>
                    <div class="platform-header-actions">
                        <button type="button" class="platform-select-action-btn" data-action="add" ${btnDisabled}>${btnLabel}</button>
                    </div>
                </div>
                ${statusLine}
                <ul class="news-list">${listHtml}</ul>
            </div>`;
    }).join('');

    grid.innerHTML = html || '<div style="color:#6b7280;">暂无可预览源</div>';

    grid.querySelectorAll('button[data-action="add"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.platform-card');
            const sid = String(card?.getAttribute('data-rss-source-id') || '').trim();
            if (!sid) return;
            const meta = _currentBatch.find((x) => String(x.source_id || '').trim() === sid);
            if (!meta) return;
            if (meta.already_added) return;

            meta.already_added = true;
            try {
                btn.setAttribute('disabled', 'true');
                btn.textContent = '已加入';
            } catch (e) {
                // ignore
            }

            // Ensure snapshot exists so save gating works even if subscription modal never opened.
            try {
                TR.subscription?.ensureSnapshot?.();
            } catch (e) {
                // ignore
            }

            // Stage into subscriptions with preview status so save gating passes.
            try {
                TR.subscription?.stageFromCatalogPreview?.({
                    source_id: meta.source_id,
                    url: meta.url,
                    feed_title: meta.feed_title || meta.platform_name,
                    column: 'RSS',
                    entries_count: meta.entries_count || 0
                });
            } catch (e) {
                // ignore
            }

            // Warmup again (dedup handled server-side; client keeps it light).
            _warmupSourceIds([meta.source_id], 'high').catch(() => {});

            _setStatus(`已加入待保存：${meta.platform_name}`, { variant: 'success' });
        });
    });
}

function _computeAlreadyAddedSet() {
    const subs = TR.subscription?.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    const set = new Set();
    for (const s of Array.isArray(subs) ? subs : []) {
        const sid = String(s?.source_id || s?.rss_source_id || '').trim();
        if (sid) set.add(sid);
    }
    return set;
}

async function _loadNextBatch() {
    if (_loading) return;
    _loading = true;
    try {
        _setStatus('加载中...', { variant: 'info' });
        const seen = _getSeenSet();
        const alreadyAdded = _computeAlreadyAddedSet();

        const cards = [];
        let nextOffset = _offset;
        let safety = 0;

        // Read sequentially and keep previewing until we collect up to BATCH_SIZE valid sources.
        // Invalid sources (preview error or entries=0) are skipped, but still recorded in `seen`.
        while (cards.length < BATCH_SIZE && safety < 80) {
            safety += 1;
            const page = await _fetchSourcesPage(50, nextOffset);
            _total = page.total;
            nextOffset = page.nextOffset;

            const candidates = [];
            for (const src of page.items) {
                const sid = String(src?.id || '').trim();
                if (!sid) continue;
                if (seen.has(sid)) continue;
                seen.add(sid);
                candidates.push(src);
            }

            if (candidates.length > 0) {
                try {
                    _warmupSourceIds(candidates.map((x) => x.id), 'normal').catch(() => {});
                } catch (e) {
                    // ignore
                }
            }

            for (const src of candidates) {
                if (cards.length >= BATCH_SIZE) break;

                const sid = String(src?.id || '').trim();
                const url = String(src?.url || '').trim();
                const name = _safeNameFromSource(src);

                _setStatus(`加载预览 ${cards.length + 1}/${BATCH_SIZE}：${name}`, { variant: 'info' });

                let entries = [];
                let feedTitle = '';
                let error = '';
                try {
                    const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sid)}`);
                    const payload = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(payload?.detail || 'Preview failed');
                    const parsed = _extractEntries(payload);
                    feedTitle = parsed.feedTitle;
                    entries = parsed.entries;
                } catch (e) {
                    error = String(e?.message || e);
                }

                // Skip empty / invalid feeds to avoid blank cards.
                if (error || !Array.isArray(entries) || entries.length <= 0) {
                    continue;
                }

                const platformName = feedTitle || name;
                cards.push({
                    source_id: sid,
                    url,
                    feed_title: feedTitle || name,
                    platform_name: platformName,
                    entries,
                    entries_count: entries.length,
                    error: '',
                    already_added: alreadyAdded.has(sid)
                });

                _renderBatch(cards);
                await _sleep(0);
            }

            if (page.items.length === 0) break;
            if (nextOffset >= _total) break;
        }

        _offset = nextOffset;
        _saveSeenState(Array.from(seen));

        _currentBatch = cards;
        _renderBatch(cards);
        if (!cards.length) {
            _setStatus('当前没有可预览源（可点击“重置已浏览”从头开始）', { variant: 'info' });
            return;
        }
        _setStatus(`已加载 ${cards.length} 个源（已浏览：${seen.size}${_total ? ` / ${_total}` : ''}）`, { variant: 'info' });
    } finally {
        _loading = false;
    }
}

function open() {
    const modal = _getModalEl();
    if (!modal) return;
    _open = true;
    modal.classList.add('show');

    // Make sure snapshot exists to support save gating.
    try {
        TR.subscription?.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }

    // Load first batch.
    _loadNextBatch().catch((e) => {
        _setStatus(String(e?.message || e), { variant: 'error' });
    });
}

function close() {
    const modal = _getModalEl();
    if (!modal) return;
    _open = false;
    modal.classList.remove('show');
}

function closeOnOverlay(e) {
    const modal = _getModalEl();
    if (!modal) return;
    if (e && e.target === modal) {
        close();
    }
}

function nextBatch() {
    _loadNextBatch().catch((e) => {
        _setStatus(String(e?.message || e), { variant: 'error' });
    });
}

function resetSeen() {
    _clearSeen();
    _offset = 0;
    _total = 0;
    _setStatus('已重置已浏览列表，将从头开始', { variant: 'success' });
    _loadNextBatch().catch((e) => {
        _setStatus(String(e?.message || e), { variant: 'error' });
    });
}

async function saveAndRefresh() {
    // Reuse existing save flow.
    try {
        await (TR.subscription?.saveAndRefresh ? TR.subscription.saveAndRefresh() : window.saveRssSubscriptions?.());
    } catch (e) {
        _setStatus(String(e?.message || e), { variant: 'error' });
        return;
    }
    close();
}

window.openRssCatalogPreviewModal = () => open();
window.closeRssCatalogPreviewModal = () => close();
window.closeRssCatalogPreviewModalOnOverlay = (e) => closeOnOverlay(e);
window.rssCatalogPreviewNextBatch = () => nextBatch();
window.rssCatalogPreviewResetSeen = () => resetSeen();
window.rssCatalogPreviewSaveAndRefresh = () => saveAndRefresh();

TR.rssCatalogPreview = {
    open,
    close,
    nextBatch,
    resetSeen,
    saveAndRefresh
};

ready(function() {
    const modal = _getModalEl();
    if (modal) {
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                close();
            }
        });
    }
});
