import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const EXPLORE_TAB_ID = 'explore';

const ENTRIES_PER_SOURCE = 20;
const BATCH_SIZE = 4;

const PREVIEW_CONCURRENCY = 6;
const PREVIEW_CACHE_TTL_MS = 3 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = 2000;

const EXPLORE_CARDS_ENDPOINT = '/api/rss-sources/explore-cards';

const EXPLORE_TAB_SEEN_STORAGE_KEY = 'hotnews_explore_tab_seen_sources_v1';
const EXPLORE_TAB_CURSOR_STORAGE_KEY = 'hotnews_explore_tab_cursor_v1';

let _loading = false;
let _currentBatch = [];
let _pendingCursor = null;
let _delegatedHandlersAttached = false;
let _cursor = null;
let _seenCache = null;
let _totalCache = 0;

const _previewCache = new Map();
const _previewInFlight = new Map();

let _pickerOpen = false;
let _pickerPending = null;

let _pendingNonExploreRefresh = false;

function _renderGridMessage(message, opts = {}) {
    const grid = _getGridEl();
    if (!grid) return;
    const msg = message == null ? '' : String(message);
    const retry = opts.retry === true;
    const btn = retry
        ? '<div style="margin-top:8px;"><button type="button" class="platform-select-action-btn" data-action="retry">重试</button></div>'
        : '';
    grid.innerHTML = `<div class="category-empty-state">${escapeHtml(msg)}${btn}</div>`;
}

function _buildExploreExcludeSourceIds() {
    const exclude = new Set();
    try {
        const seen = _seenCache || _loadSeenSet();
        _seenCache = seen;
        for (const sid of seen) {
            if (sid) exclude.add(String(sid));
        }
    } catch (e) {
        // ignore
    }

    try {
        const alreadyAdded = _computeAlreadyAddedSet();
        for (const sid of alreadyAdded) {
            if (sid) exclude.add(String(sid));
        }
    } catch (e) {
        // ignore
    }

    try {
        for (const card of (Array.isArray(_currentBatch) ? _currentBatch : [])) {
            const sid = String(card?.source_id || '').trim();
            if (sid) exclude.add(sid);
        }
    } catch (e) {
        // ignore
    }

    return Array.from(exclude);
}

async function _tryFetchExploreCards(want) {
    const n = Math.max(0, Number(want || 0) || 0);
    if (n <= 0) return [];

    const pane = _getPaneEl();
    if (!pane || !pane.classList.contains('active')) return [];

    try {
        const exclude = _buildExploreExcludeSourceIds();
        const params = new URLSearchParams();
        params.set('cards', String(n));
        params.set('entries_per_card', String(ENTRIES_PER_SOURCE));
        if (exclude.length) {
            params.set('exclude_source_ids', exclude.join(','));
        }

        const reqUrl = `${EXPLORE_CARDS_ENDPOINT}?${params.toString()}`;
        const resp = await fetch(reqUrl, { method: 'GET' });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) return [];
        const cards = Array.isArray(payload?.cards) ? payload.cards : [];
        return cards.map((c) => {
            const sid = String(c?.source_id || '').trim();
            const url2 = String(c?.url || '').trim();
            const platformName = String(c?.platform_name || c?.feed_title || 'RSS').trim() || 'RSS';
            const entries = Array.isArray(c?.entries) ? c.entries : [];
            return {
                source_id: sid,
                url: url2,
                feed_title: String(c?.feed_title || platformName).trim() || platformName,
                platform_name: platformName,
                entries: entries.slice(0, ENTRIES_PER_SOURCE).map((e) => ({
                    title: String(e?.title || '').trim(),
                    link: String(e?.link || '').trim(),
                    published: e?.published || e?.ts || '',
                })),
                entries_count: entries.length,
                already_added: false,
            };
        }).filter((x) => x.source_id && Array.isArray(x.entries) && x.entries.length > 0);
    } catch (e) {
        return [];
    }
}

function _waitAnimationEnd(el, fallbackMs) {
    return new Promise((resolve) => {
        if (!el) {
            resolve();
            return;
        }
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            try {
                el.removeEventListener('animationend', onEnd);
            } catch (e) {
                // ignore
            }
            resolve();
        };
        const onEnd = () => finish();
        try {
            el.addEventListener('animationend', onEnd, { once: true });
        } catch (e) {
            // ignore
        }
        setTimeout(finish, Math.max(0, Number(fallbackMs || 0) || 0));
    });
}

function _getPaneEl() {
    return document.getElementById('tab-explore');
}

async function _loadNextValidCard() {
    const alreadyAdded = _computeAlreadyAddedSet();
    const seen = _seenCache || _loadSeenSet();
    _seenCache = seen;

    if (_cursor == null) {
        _cursor = _loadCursor();
    }

    const existingInBatch = new Set((Array.isArray(_currentBatch) ? _currentBatch : []).map((x) => String(x?.source_id || '').trim()).filter(Boolean));

    let safety = 0;
    while (safety < 200) {
        safety += 1;
        const pageOffset = _cursor;
        const page = await _fetchSourcesPage(50, pageOffset);
        _totalCache = page.total;

        if (!page.items.length) return null;

        const candidates = [];
        for (const src of page.items) {
            _cursor += 1;

            const sid = String(src?.id || '').trim();
            if (!sid) continue;
            if (seen.has(sid)) continue;
            if (alreadyAdded.has(sid)) continue;
            if (existingInBatch.has(sid)) continue;

            const url = String(src?.url || '').trim();
            const name = _safeNameFromSource(src);
            candidates.push({ sid, url, name });
        }

        const card = await _pickFirstValidCardFromCandidates(candidates);
        if (card) return card;

        if (_cursor >= _totalCache) return null;

        // Ensure cursor moves forward even if API returns weird offsets.
        if (_cursor === pageOffset) {
            _cursor += page.items.length;
        }
    }
    return null;
}

function _getCachedPreview(sid) {
    const hit = _previewCache.get(sid);
    if (!hit) return null;
    const age = Date.now() - Number(hit.ts || 0);
    if (age > PREVIEW_CACHE_TTL_MS) {
        _previewCache.delete(sid);
        return null;
    }
    return hit;
}

async function _fetchPreviewCached(sid) {
    const key = String(sid || '').trim();
    if (!key) return null;

    const cached = _getCachedPreview(key);
    if (cached) return cached;

    const inFlight = _previewInFlight.get(key);
    if (inFlight) return inFlight;

    const p = (async () => {
        try {
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const timer = controller ? window.setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS) : 0;
            const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(key)}`, controller ? { signal: controller.signal } : undefined);
            try {
                if (timer) window.clearTimeout(timer);
            } catch (e) {
                // ignore
            }
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const out = { ts: Date.now(), ok: false, feedTitle: '', entries: [], error: payload?.detail || 'Preview failed' };
                _previewCache.set(key, out);
                return out;
            }
            const parsed = _extractEntries(payload);
            const out = { ts: Date.now(), ok: true, feedTitle: parsed.feedTitle, entries: parsed.entries, error: '' };
            _previewCache.set(key, out);
            return out;
        } catch (e) {
            const out = { ts: Date.now(), ok: false, feedTitle: '', entries: [], error: String(e?.message || e) };
            _previewCache.set(key, out);
            return out;
        } finally {
            _previewInFlight.delete(key);
        }
    })();

    _previewInFlight.set(key, p);
    return p;
}

async function _pickFirstValidCardFromCandidates(candidates) {
    const queue = Array.isArray(candidates) ? [...candidates] : [];
    if (queue.length === 0) return null;

    let found = null;

    let doneResolve = null;
    const done = new Promise((resolve) => {
        doneResolve = resolve;
    });

    const worker = async () => {
        while (queue.length > 0 && !found) {
            const item = queue.shift();
            if (!item || !item.sid) continue;

            const preview = await _fetchPreviewCached(item.sid);
            if (!preview || preview.ok !== true) continue;
            const entries = Array.isArray(preview.entries) ? preview.entries : [];
            if (entries.length <= 0) continue;

            found = {
                source_id: item.sid,
                url: item.url,
                feed_title: (preview.feedTitle || item.name),
                platform_name: (preview.feedTitle || item.name),
                entries,
                entries_count: entries.length,
                already_added: false,
            };
            try {
                if (doneResolve) doneResolve();
                doneResolve = null;
            } catch (e) {
                // ignore
            }
            return;
        }
    };

    const k = Math.max(1, Math.min(PREVIEW_CONCURRENCY, queue.length));
    const workers = Array.from({ length: k }).map(() => worker().catch(() => {}));
    await Promise.race([Promise.all(workers), done]);
    return found;
}

async function _loadNextValidCards(maxCount) {
    const want = Math.max(0, Number(maxCount || 0) || 0);
    if (want <= 0) return [];

    const alreadyAdded = _computeAlreadyAddedSet();
    const seen = _seenCache || _loadSeenSet();
    _seenCache = seen;

    if (_cursor == null) {
        _cursor = _loadCursor();
    }

    const existing = new Set((Array.isArray(_currentBatch) ? _currentBatch : []).map((x) => String(x?.source_id || '').trim()).filter(Boolean));
    const picked = [];

    let doneResolve = null;
    const done = new Promise((resolve) => {
        doneResolve = resolve;
    });

    let safety = 0;
    while (safety < 200 && picked.length < want) {
        safety += 1;
        const pageOffset = _cursor;
        const page = await _fetchSourcesPage(50, pageOffset);
        _totalCache = page.total;
        if (!page.items.length) break;

        const candidates = [];
        for (const src of page.items) {
            _cursor += 1;
            const sid = String(src?.id || '').trim();
            if (!sid) continue;
            if (seen.has(sid)) continue;
            if (alreadyAdded.has(sid)) continue;
            if (existing.has(sid)) continue;
            if (picked.some((x) => String(x?.source_id || '').trim() === sid)) continue;

            const url = String(src?.url || '').trim();
            const name = _safeNameFromSource(src);
            candidates.push({ sid, url, name });
        }

        const queue = [...candidates];
        const worker = async () => {
            while (queue.length > 0 && picked.length < want) {
                const item = queue.shift();
                if (!item || !item.sid) continue;
                const preview = await _fetchPreviewCached(item.sid);
                if (!preview || preview.ok !== true) continue;
                const entries = Array.isArray(preview.entries) ? preview.entries : [];
                if (entries.length <= 0) continue;
                if (picked.length >= want) return;
                picked.push({
                    source_id: item.sid,
                    url: item.url,
                    feed_title: (preview.feedTitle || item.name),
                    platform_name: (preview.feedTitle || item.name),
                    entries,
                    entries_count: entries.length,
                    already_added: false,
                });

                if (picked.length >= want) {
                    try {
                        if (doneResolve) doneResolve();
                        doneResolve = null;
                    } catch (e) {
                        // ignore
                    }
                    return;
                }
            }
        };

        const k = Math.max(1, Math.min(PREVIEW_CONCURRENCY, queue.length));
        const workers = Array.from({ length: k }).map(() => worker().catch(() => {}));
        await Promise.race([Promise.all(workers), done]);

        if (picked.length >= want) break;

        if (_cursor >= _totalCache) break;
        if (_cursor === pageOffset) {
            _cursor += page.items.length;
        }
    }

    return picked.slice(0, want);
}

async function _fillToBatchSize() {
    if (_loading) return;

    const pane = _getPaneEl();
    const grid = _getGridEl();
    if (!pane || !grid) return;
    if (!pane.classList.contains('active')) return;

    _loading = true;
    _setLoadingUI(true);

    try {
        if (_currentBatch.length < BATCH_SIZE) {
            const remaining = BATCH_SIZE - _currentBatch.length;
            const cached = await _tryFetchExploreCards(remaining);
            if (cached.length) {
                _currentBatch = [..._currentBatch, ...cached];
                _renderBatch(_currentBatch);
            }
        }

        while (_currentBatch.length < BATCH_SIZE) {
            const remaining = BATCH_SIZE - _currentBatch.length;
            const cards = await _loadNextValidCards(remaining);
            if (!cards.length) break;
            _currentBatch = [..._currentBatch, ...cards];
            _renderBatch(_currentBatch);
        }
        if (_cursor != null) {
            _persistCursor(_cursor);
        }
        if (_currentBatch.length <= 0) {
            // If cursor exhausted, restart from beginning so Explore doesn't get stuck empty.
            if (_cursor != null && _totalCache > 0 && _cursor >= _totalCache) {
                _cursor = 0;
                _persistCursor(_cursor);
            }
        }
    } catch (e) {
        if (_currentBatch.length <= 0) {
            _renderGridMessage('加载失败', { retry: true });
        }
    } finally {
        _loading = false;
        _setLoadingUI(false);
        _renderBatch(_currentBatch);
    }
}

function _getGridEl() {
    return document.getElementById('trExploreGrid');
}

function _getStatusEl() {
    return document.getElementById('trExploreStatus');
}

function _setStatus(msg, opts = {}) {
    const el = _getStatusEl();
    if (!el) return;
    const variant = String(opts.variant || '').toLowerCase();
    const color = variant === 'error' ? '#dc2626' : (variant === 'success' ? '#16a34a' : '#6b7280');
    el.style.color = color;
    el.textContent = msg == null ? '' : String(msg);
}

function _setLoadingUI(isLoading) {
    if (!isLoading) return;
    if (_currentBatch.length > 0) return;
    _renderGridMessage('加载中...');
}

function _isGridEmpty() {
    const grid = _getGridEl();
    if (!grid) return true;
    try {
        return grid.querySelectorAll('.platform-card').length === 0;
    } catch (e) {
        return true;
    }
}

function _getPickerEl() {
    return document.getElementById('rssExploreCategoryPickerModal');
}

function _ensurePickerModal() {
    if (_getPickerEl()) return;

    const overlay = document.createElement('div');
    overlay.id = 'rssExploreCategoryPickerModal';
    overlay.className = 'settings-modal-overlay';
    overlay.style.zIndex = '9999';
    overlay.addEventListener('click', (e) => {
        if (e && e.target === overlay) {
            _closePicker();
        }
    });

    overlay.innerHTML = `
        <div class="settings-modal" onclick="event.stopPropagation()" style="max-width:520px;">
            <div class="settings-modal-header">
                <span class="settings-modal-title">加入栏目</span>
                <button class="settings-modal-close" type="button" data-action="close">&times;</button>
            </div>
            <div class="settings-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                <div style="color:#6b7280;font-size:0.9rem;">选择要加入的栏目</div>
                <div id="rssExploreCategoryPickerList" style="display:flex;flex-direction:column;gap:8px;"></div>
            </div>
        </div>`;

    const closeBtn = overlay.querySelector('button[data-action="close"]');
    if (closeBtn) closeBtn.addEventListener('click', () => _closePicker());

    try {
        document.body.appendChild(overlay);
    } catch (e) {
        // ignore
    }
}

function _closePicker() {
    const el = _getPickerEl();
    if (!el) return;
    _pickerOpen = false;
    _pickerPending = null;
    el.classList.remove('show');
}

function _collectCategoryOptions() {
    const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
    const defaults = TR.settings?.getDefaultCategories ? TR.settings.getDefaultCategories() : null;
    const order = Array.isArray(merged?.categoryOrder) ? merged.categoryOrder : [];
    const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];

    const options = [];
    const seen = new Set();
    for (const catId of order) {
        const id = String(catId || '').trim();
        if (!id || seen.has(id)) continue;
        if (id === 'explore') continue;
        if (id.startsWith('rsscol-')) continue;
        seen.add(id);
        const customCat = custom.find((c) => String(c?.id || '') === id);
        if (customCat) {
            const name = String(customCat?.name || id).trim() || id;
            options.push({ id, name, icon: '📱', isCustom: true });
            continue;
        }
        const def = defaults && defaults[id] ? defaults[id] : null;
        if (!def) continue;
        const name = String(def?.name || id).trim() || id;
        const icon = String(def?.icon || '📁');
        options.push({ id, name, icon, isCustom: false });
    }

    for (const c of custom) {
        const id = String(c?.id || '').trim();
        if (!id || seen.has(id)) continue;
        if (id === 'explore') continue;
        if (id.startsWith('rsscol-')) continue;
        seen.add(id);
        const name = String(c?.name || id).trim() || id;
        options.push({ id, name, icon: '📱', isCustom: true });
    }

    return options;
}

async function _addMetaToCategory(meta, pickedCategory) {
    if (!meta || !meta.source_id) return;
    const pickedId = String(pickedCategory?.id || '').trim();
    const pickedName = String(pickedCategory?.name || pickedId).trim() || pickedId || 'RSS';
    const isCustom = !!pickedCategory?.isCustom;

    const sid = String(meta.source_id || '').trim();
    const platformId = sid ? `rss-${sid}` : '';

    let col = 'RSS';
    if (pickedId && pickedId !== 'rsscol-rss' && !isCustom) {
        col = pickedId;
    }

    try {
        TR.subscription?.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }

    try {
        TR.subscription?.stageFromCatalogPreview?.({
            source_id: meta.source_id,
            url: meta.url,
            feed_title: meta.feed_title || meta.platform_name,
            column: col,
            entries_count: meta.entries_count || 0
        });
    } catch (e) {
        _setStatus(String(e?.message || e), { variant: 'error' });
        return;
    }

    if (isCustom && pickedId && platformId) {
        try {
            TR.settings?.addPlatformToCustomCategory?.(pickedId, platformId);
        } catch (e) {
            // ignore
        }
    }

    try {
        _setStatus(`保存中：${pickedName}`, { variant: 'info' });
        if (TR.subscription?.saveOnly) {
            await TR.subscription.saveOnly();
        } else if (TR.subscription?.saveAndRefresh) {
            await TR.subscription.saveAndRefresh();
        } else {
            await window.saveRssSubscriptions?.();
        }
        _setStatus(`已加入栏目：${pickedName}`, { variant: 'success' });
    } catch (e) {
        _setStatus(String(e?.message || e), { variant: 'error' });
        try {
            TR.toast?.show?.(`保存失败：${String(e?.message || e)}`, { variant: 'error', durationMs: 2500 });
        } catch (_) {}
        return;
    }

    try {
        TR.toast?.show?.(`已加入栏目：${pickedName}`, { variant: 'success', durationMs: 1500 });
    } catch (e) {
        // ignore
    }

    try {
        _pendingNonExploreRefresh = true;
    } catch (e) {
        // ignore
    }

    try {
        _warmupSourceIds([meta.source_id], 'high').catch(() => {});
    } catch (e) {
        // ignore
    }
}

function _openPickerForMeta(meta, cardEl, addBtnEl) {
    _ensurePickerModal();
    const el = _getPickerEl();
    if (!el) return;

    const options = _collectCategoryOptions();
    const listEl = el.querySelector('#rssExploreCategoryPickerList');
    if (listEl) {
        listEl.innerHTML = options.length
            ? options.map((o) => {
                return `
                <button type="button" class="platform-select-action-btn" data-cat-id="${escapeHtml(o.id)}" style="text-align:left;">
                    ${escapeHtml(o.icon)} ${escapeHtml(o.name)}
                </button>`;
            }).join('')
            : '<div style="color:#6b7280;">暂无可用栏目</div>';

        listEl.querySelectorAll('button[data-cat-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const catId = String(btn.getAttribute('data-cat-id') || '').trim();
                const options2 = _collectCategoryOptions();
                const hit = options2.find((x) => String(x?.id || '').trim() === catId);
                const picked = hit ? hit : { id: catId, name: catId, icon: '📁', isCustom: false };

                _closePicker();

                await _addMetaToCategory(meta, picked);

                meta.already_added = true;
                try {
                    if (addBtnEl) {
                        addBtnEl.setAttribute('disabled', 'true');
                        addBtnEl.textContent = '已加入';
                    }
                } catch (e) {
                    // ignore
                }
            });
        });
    }

    _pickerOpen = true;
    _pickerPending = { meta, cardEl };
    el.classList.add('show');
}

function _loadSeenSet() {
    try {
        const raw = storage.getRaw(EXPLORE_TAB_SEEN_STORAGE_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return new Set();
        const out = new Set();
        for (const x of arr) {
            const sid = String(x || '').trim();
            if (sid) out.add(sid);
        }
        return out;
    } catch (e) {
        return new Set();
    }
}

function _persistSeenSet(set) {
    try {
        const arr = Array.from(set || []).map((x) => String(x || '').trim()).filter(Boolean);
        const capped = arr.slice(-2000);
        storage.setRaw(EXPLORE_TAB_SEEN_STORAGE_KEY, JSON.stringify(capped));
    } catch (e) {
        // ignore
    }
}

function _loadCursor() {
    try {
        const raw = storage.getRaw(EXPLORE_TAB_CURSOR_STORAGE_KEY);
        const n = Number(raw || 0) || 0;
        return n < 0 ? 0 : n;
    } catch (e) {
        return 0;
    }
}

function _persistCursor(offset) {
    try {
        const n = Number(offset || 0) || 0;
        storage.setRaw(EXPLORE_TAB_CURSOR_STORAGE_KEY, String(n < 0 ? 0 : n));
    } catch (e) {
        // ignore
    }
}

function _clearState() {
    try {
        storage.remove(EXPLORE_TAB_SEEN_STORAGE_KEY);
    } catch (e) {
        // ignore
    }
    try {
        storage.remove(EXPLORE_TAB_CURSOR_STORAGE_KEY);
    } catch (e) {
        // ignore
    }
    _currentBatch = [];
    _pendingCursor = null;
    _cursor = null;
    _seenCache = null;
    _totalCache = 0;
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

function _safeNameFromSource(src) {
    const name = String(src?.name || src?.host || src?.id || '').trim();
    return name || 'RSS';
}

function _renderAddCategoryDropdownHtml(card) {
    const c = card || {};
    const disabled = c?.already_added ? 'disabled' : '';
    const placeholder = c?.already_added ? '已加入' : '加入栏目';
    const options = _collectCategoryOptions();
    const dropdownOptionsHtml = options.map((o) => {
        const kind = o?.isCustom ? 'custom' : 'default';
        const val = `${kind}:${String(o?.id || '').trim()}`;
        return `<option value="${escapeHtml(val)}">${escapeHtml(String(o?.icon || '📁'))} ${escapeHtml(String(o?.name || o?.id || ''))}</option>`;
    }).join('');
    return `
        <select class="platform-select-action-btn" data-action="add-category" ${disabled} style="padding:6px 10px;">
            <option value="" selected>${escapeHtml(placeholder)}</option>
            ${dropdownOptionsHtml}
        </select>`;
}

function _applyReadStateToExploreRoot(root) {
    try {
        if (!root) return;
        if (!TR.readState || typeof TR.readState.getReadNews !== 'function') return;
        const reads = TR.readState.getReadNews() || {};
        const items = root.querySelectorAll('.news-item[data-news-id]');
        items.forEach((el) => {
            try {
                const id = String(el?.dataset?.newsId || '').trim();
                if (!id) return;
                if (!reads[id]) return;
                el.classList.add('read');
            } catch (e) {
                // ignore
            }
        });
    } catch (e) {
        // ignore
    }
}

function _renderBatch(cards) {
    const grid = _getGridEl();
    if (!grid) return;

    const html = (cards || []).map((c) => {
        const sid = String(c?.source_id || '').trim();
        const platformName = escapeHtml(c?.platform_name || 'RSS');

        const addDropdownHtml = _renderAddCategoryDropdownHtml(c);

        const items = Array.isArray(c?.entries) ? c.entries : [];
        const listHtml = items.slice(0, ENTRIES_PER_SOURCE).map((e, idx) => {
            const title = escapeHtml(e?.title || '');
            const link = escapeHtml(e?.link || '#');
            const newsId = escapeHtml(`rssx:${sid}:${e?.link || ''}`);
            return `
                <li class="news-item" data-news-id="${newsId}" data-news-title="${title}">
                    <div class="news-item-content">
                        <span class="news-index">${String(idx + 1)}</span>
                        <a class="news-title" href="${link}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">${title}</a>
                    </div>
                </li>`;
        }).join('');

        return `
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}" style="margin:0;">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; flex: 1; min-width: 0; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">📱 ${platformName}</div>
                    <div class="platform-header-actions">
                        ${addDropdownHtml}
                        <button type="button" class="tr-explore-card-close" data-action="close">⇄</button>
                    </div>
                </div>
                <ul class="news-list">${listHtml}</ul>
            </div>`;
    }).join('');

    if (html) {
        grid.innerHTML = html;
        _applyReadStateToExploreRoot(grid);
        return;
    }
    _renderGridMessage('暂无可预览源', { retry: true });
}

function _renderCardElement(card, opts = {}) {
    const sid = String(card?.source_id || '').trim();
    const platformName = escapeHtml(card?.platform_name || 'RSS');

    const addDropdownHtml = _renderAddCategoryDropdownHtml(card);

    const items = Array.isArray(card?.entries) ? card.entries : [];
    const listHtml = items.slice(0, ENTRIES_PER_SOURCE).map((e, idx) => {
        const title = escapeHtml(e?.title || '');
        const link = escapeHtml(e?.link || '#');
        const newsId = escapeHtml(`rssx:${sid}:${e?.link || ''}`);
        return `
            <li class="news-item" data-news-id="${newsId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${link}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">${title}</a>
                </div>
            </li>`;
    }).join('');

    const extraClass = opts.animateIn ? ' tr-explore-flip-in' : '';
    const html = `
        <div class="platform-card${extraClass}" data-rss-source-id="${escapeHtml(sid)}" style="margin:0;">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; flex: 1; min-width: 0; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">📱 ${platformName}</div>
                <div class="platform-header-actions">
                    ${addDropdownHtml}
                    <button type="button" class="tr-explore-card-close" data-action="close">⇄</button>
                </div>
            </div>
            <ul class="news-list">${listHtml}</ul>
        </div>`;

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
}

async function _replaceCardInPlace(oldSid, cardEl) {
    if (_loading) return;

    const idx = (Array.isArray(_currentBatch) ? _currentBatch : []).findIndex((x) => String(x?.source_id || '').trim() === String(oldSid || '').trim());
    if (idx < 0) return;

    const seen = _seenCache || _loadSeenSet();
    _seenCache = seen;
    seen.add(String(oldSid || '').trim());
    _persistSeenSet(seen);

    _loading = true;

    const nextPromise = _loadNextValidCard().catch(() => null);
    const nextCachedPromise = _tryFetchExploreCards(1).then((xs) => (xs && xs[0]) ? xs[0] : null).catch(() => null);

    try {
        try {
            const closeBtn = cardEl?.querySelector?.('button[data-action="close"]');
            if (closeBtn) closeBtn.setAttribute('disabled', 'true');
        } catch (e) {
            // ignore
        }

        try {
            cardEl?.classList?.add('tr-explore-flip-out');
        } catch (e) {
            // ignore
        }
        await _waitAnimationEnd(cardEl, 260);

        let nextCard = await nextCachedPromise;
        if (!nextCard) {
            nextCard = await nextPromise;
        }
        if (!nextCard) {
            _currentBatch = (Array.isArray(_currentBatch) ? _currentBatch : []).filter((x) => String(x?.source_id || '').trim() !== String(oldSid || '').trim());
            _renderBatch(_currentBatch);
            await _fillToBatchSize();
            return;
        }

        if (Array.isArray(_currentBatch) && _currentBatch[idx] && String(_currentBatch[idx]?.source_id || '').trim() === String(oldSid || '').trim()) {
            _currentBatch[idx] = nextCard;
        }

        const newEl = _renderCardElement(nextCard, { animateIn: true });
        try {
            if (cardEl && cardEl.parentNode) {
                cardEl.parentNode.replaceChild(newEl, cardEl);
                _applyReadStateToExploreRoot(newEl);
            } else {
                _renderBatch(_currentBatch);
            }
        } catch (e) {
            _renderBatch(_currentBatch);
        }
    } finally {
        _loading = false;
        try {
            if (_cursor != null) {
                _persistCursor(_cursor);
            }
        } catch (e) {
            // ignore
        }
    }
}

async function _loadBatch(opts = {}) {
    // Legacy batch-switch API kept for compatibility; now just fill to 4.
    await _fillToBatchSize();
}

function _ensureInitialLoaded() {
    const pane = _getPaneEl();
    if (!pane || !pane.classList.contains('active')) return;

    // If DOM gets cleared by other renders but we still have cached batch in memory,
    // re-render to avoid an empty Explore tab.
    if (_currentBatch.length > 0) {
        if (_isGridEmpty()) {
            _renderBatch(_currentBatch);
        }
        return;
    }

    _fillToBatchSize().catch((e) => {
        _setStatus(String(e?.message || e), { variant: 'error' });
    });
}

function _markReadFromTitleClickTarget(t) {
    try {
        if (!t || !(t instanceof Element)) return false;
        const titleEl = t.closest('a.news-title');
        if (!titleEl) return false;
        const item = titleEl.closest('.news-item');
        if (!item) return true;
        if (TR.readState && typeof TR.readState.markItemAsRead === 'function') {
            TR.readState.markItemAsRead(item);
        } else {
            item.classList.add('read');
        }
        return true;
    } catch (e) {
        try {
            const item = t?.closest?.('.news-item');
            if (item) item.classList.add('read');
        } catch (_) {}
        return true;
    }
}

function _attachHandlers() {
    if (_delegatedHandlersAttached) return;
    _delegatedHandlersAttached = true;

    document.addEventListener('click', (e) => {
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;

        const pane = _getPaneEl();
        if (!pane || !pane.classList.contains('active')) return;

        _markReadFromTitleClickTarget(t);
    }, true);

    document.addEventListener('click', (e) => {
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;

        const pane = _getPaneEl();
        if (!pane || !pane.classList.contains('active')) return;

        const closeBtn = t.closest('button[data-action="close"]');
        if (closeBtn) {
            const cardEl = closeBtn.closest('.platform-card');
            const sid = String(cardEl?.getAttribute('data-rss-source-id') || '').trim();
            if (!sid) return;
            _replaceCardInPlace(sid, cardEl).catch((e2) => {
                _setStatus(String(e2?.message || e2), { variant: 'error' });
            });
            return;
        }

        const retryBtn = t.closest('button[data-action="retry"]');
        if (retryBtn) {
            if (_loading) return;
            // If we previously exhausted the cursor, restart.
            if (_cursor != null && _totalCache > 0 && _cursor >= _totalCache) {
                _cursor = 0;
                try {
                    _persistCursor(_cursor);
                } catch (e) {
                    // ignore
                }
            }
            _fillToBatchSize().catch((e2) => {
                _renderGridMessage(String(e2?.message || e2 || '加载失败'), { retry: true });
            });
            return;
        }
    });

    document.addEventListener('change', (e) => {
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;

        const pane = _getPaneEl();
        if (!pane || !pane.classList.contains('active')) return;

        const selectEl = t.closest('select[data-action="add-category"]');
        if (!selectEl) return;
        if (!(selectEl instanceof HTMLSelectElement)) return;

        const cardEl = selectEl.closest('.platform-card');
        const sid = String(cardEl?.getAttribute('data-rss-source-id') || '').trim();
        if (!sid) return;

        const meta = (Array.isArray(_currentBatch) ? _currentBatch : []).find((x) => String(x?.source_id || '').trim() === sid);
        if (!meta) return;
        if (meta.already_added) return;

        const raw = String(selectEl.value || '').trim();
        if (!raw) return;
        const parts = raw.split(':');
        const kind = String(parts[0] || '').trim();
        const pickedId = String(parts[1] || '').trim();
        if (!pickedId) return;

        const options2 = _collectCategoryOptions();
        const hit = options2.find((x) => String(x?.id || '').trim() === pickedId);
        const picked = hit
            ? hit
            : { id: pickedId, name: pickedId, icon: '📁', isCustom: (kind === 'custom') };

        try {
            selectEl.setAttribute('disabled', 'true');
        } catch (e2) {
            // ignore
        }

        _addMetaToCategory(meta, picked).then(() => {
            meta.already_added = true;
            try {
                const firstOpt = selectEl.querySelector('option[value=""]');
                if (firstOpt) firstOpt.textContent = '已加入';
                selectEl.value = '';
                selectEl.setAttribute('disabled', 'true');
            } catch (_) {}

        }).catch(() => {
            try {
                selectEl.value = '';
            } catch (_) {}
        });
    });
}

function _wrapTabsSwitchIfAny() {
    try {
        if (!TR.tabs || typeof TR.tabs.switchTab !== 'function') return;
        if (TR.tabs.__trExploreEmbeddedWrapped) return;
        const orig = TR.tabs.switchTab;
        TR.tabs.switchTab = function(categoryId) {
            const ret = orig.call(TR.tabs, categoryId);
            try {
                if (String(categoryId) === EXPLORE_TAB_ID) {
                    // Defer to next frame so "active" class & DOM updates from tab switch settle.
                    window.requestAnimationFrame(() => {
                        _ensureInitialLoaded();
                    });
                }
            } catch (e) {
                // ignore
            }

            try {
                if (_pendingNonExploreRefresh && String(categoryId) !== EXPLORE_TAB_ID) {
                    _pendingNonExploreRefresh = false;
                    window.requestAnimationFrame(() => {
                        TR.data?.refreshViewerData?.({ preserveScroll: true });
                    });
                }
            } catch (e) {
                // ignore
            }
            return ret;
        };
        TR.tabs.__trExploreEmbeddedWrapped = true;
    } catch (e) {
        // ignore
    }
}

ready(function() {
    _attachHandlers();
    _wrapTabsSwitchIfAny();

    try {
        if (TR.tabs?.getActiveTabId && String(TR.tabs.getActiveTabId()) === EXPLORE_TAB_ID) {
            _ensureInitialLoaded();
        }
    } catch (e) {
        // ignore
    }
});
