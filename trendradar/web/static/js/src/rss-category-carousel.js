import { TR, ready, escapeHtml } from './core.js';

const ENTRIES_PER_SOURCE = 15;
const CATEGORY_ID = 'rsscol-rss';
const PREFETCH_AHEAD = 3;

let _open = false;
let _loading = false;
let _sources = [];
let _total = 0;
let _offset = 0;
let _sourcesExhausted = false;
let _cursor = -1;
let _currentCard = null;
let _previewCache = new Map();
let _pendingTargetIndex = null;
let _inFlightIndex = null;
let _entryPage = 0;

let _pickerOpen = false;

let _touchActive = false;
let _touchStartX = 0;
let _touchStartY = 0;
let _touchMode = null;

function _isMobile() {
    try {
        return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    } catch (e) {
        return false;
    }
}

function _onTouchStart(e) {
    if (!_isCarouselActive()) return;
    if (!_isMobile()) return;
    if (document.querySelector('.settings-modal-overlay.show')) return;
    if (_pickerOpen) return;
    const t = e?.target;
    if (!t || !(t instanceof Element)) return;
    if (t.closest('a,button,input,textarea,select')) return;
    if (!t.closest('.rss-carousel-frame')) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    _touchActive = true;
    _touchMode = null;
    _touchStartX = Number(touches[0]?.clientX || 0);
    _touchStartY = Number(touches[0]?.clientY || 0);
}

function _onTouchMove(e) {
    if (!_touchActive) return;
    if (!_isCarouselActive()) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX;
    const dy = y - _touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (!_touchMode) {
        if (adx < 10 && ady < 10) return;
        _touchMode = adx >= ady ? 'x' : 'y';
    }
    try {
        e.preventDefault();
    } catch (e2) {
        // ignore
    }
}

function _onTouchEnd(e) {
    if (!_touchActive) return;
    _touchActive = false;
    if (!_isCarouselActive()) return;
    if (!_isMobile()) return;
    const touches = e?.changedTouches;
    if (!touches || touches.length < 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX;
    const dy = y - _touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const THRESH = 44;
    if ((_touchMode === 'x' || _touchMode == null) && adx >= THRESH && adx > ady) {
        if (dx < 0) next();
        else prev();
        return;
    }
    if ((_touchMode === 'y' || _touchMode == null) && ady >= THRESH && ady > adx) {
        if (dy < 0) _pageEntries(-1);
        else _pageEntries(1);
    }
}

function _getActiveTabId() {
    try {
        return TR.tabs?.getActiveTabId ? TR.tabs.getActiveTabId() : null;
    } catch (e) {
        return null;
    }
}

function _prefetchAround(index) {
    if (!_isCarouselActive()) return;
    const runner = async () => {
        if (_loading) return;
        if (_pendingTargetIndex != null) return;
        const targets = [];
        for (let i = 1; i <= PREFETCH_AHEAD; i += 1) {
            targets.push(index + i);
        }

        const maxWanted = Math.max(...targets);
        if (Number.isFinite(maxWanted) && maxWanted >= 0) {
            await _ensureSourcesAt(maxWanted);
        }

        for (const t of targets) {
            try {
                if (t < 0) continue;
                await _ensureSourcesAt(t);
                const src = _sources[t];
                if (!src) continue;
                await _buildCardForSource(src);
            } catch (e) {
                // ignore
            }
        }
    };

    try {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => runner().catch(() => {}), { timeout: 1200 });
            return;
        }
    } catch (e) {
        // ignore
    }
    setTimeout(() => runner().catch(() => {}), 0);
}

function _getPickerEl() {
    return document.getElementById('rssCategoryPickerModal');
}

function _ensurePickerModal() {
    if (_getPickerEl()) return;

    const overlay = document.createElement('div');
    overlay.id = 'rssCategoryPickerModal';
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
                <div id="rssCategoryPickerList" style="display:flex;flex-direction:column;gap:8px;"></div>
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

function _openPicker() {
    _ensurePickerModal();
    const el = _getPickerEl();
    if (!el) return;

    const listEl = el.querySelector('#rssCategoryPickerList');
    if (listEl) {
        const options = _collectCategoryOptions();
        listEl.innerHTML = options.map((o) => {
            return `
                <button type="button" class="platform-select-action-btn" data-cat-id="${escapeHtml(o.id)}" style="text-align:left;">
                    ${escapeHtml(o.icon)} ${escapeHtml(o.name)}
                </button>`;
        }).join('');

        listEl.querySelectorAll('button[data-cat-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const catId = String(btn.getAttribute('data-cat-id') || '').trim();
                const options2 = _collectCategoryOptions();
                const hit = options2.find((x) => x.id === catId);
                const picked = hit ? hit : { id: catId, name: catId, icon: '📁', isCustom: false };
                _closePicker();
                await _addCurrentToCategory(picked);
            });
        });
    }

    _pickerOpen = true;
    el.classList.add('show');

    try {
        const modal = el.querySelector('.settings-modal');
        if (modal) {
            modal.setAttribute('tabindex', '0');
            modal.focus();
        }
    } catch (e) {
        // ignore
    }
}

async function _addCurrentToCategory(pickedCategory) {
    if (!_currentCard || !_currentCard.source_id) return;

    const pickedId = String(pickedCategory?.id || '').trim();
    const pickedName = String(pickedCategory?.name || pickedId).trim() || pickedId || 'RSS';
    const isCustom = !!pickedCategory?.isCustom;

    const sid = String(_currentCard.source_id || '').trim();
    const platformId = sid ? `rss-${sid}` : '';

    let col = 'RSS';
    if (pickedId && pickedId !== 'rsscol-rss' && !isCustom) {
        // For default categories, use categoryId as column so server generates rsscol-<catId>.
        col = pickedId;
    }

    try {
        TR.subscription?.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }

    try {
        TR.subscription?.stageFromCatalogPreview?.({
            source_id: _currentCard.source_id,
            url: _currentCard.url,
            feed_title: _currentCard.feed_title || _currentCard.platform_name,
            column: col,
            entries_count: _currentCard.entries_count || 0
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

    _currentCard.already_added = true;
    try {
        _renderCard(_currentCard);
    } catch (e) {
        // ignore
    }

    try {
        TR.toast?.show?.(`已加入栏目：${pickedName}`, { variant: 'loading', durationMs: 1200 });
    } catch (e) {
        // ignore
    }

    try {
        if (TR.subscription?.saveOnly) {
            await TR.subscription.saveOnly();
        } else if (TR.subscription?.saveAndRefresh) {
            await TR.subscription.saveAndRefresh();
        } else {
            await window.saveRssSubscriptions?.();
        }
    } catch (e) {
        _setStatus(String(e?.message || e), { variant: 'error' });
        try {
            TR.toast?.show?.(`加入失败：${String(e?.message || e)}`, { variant: 'error', durationMs: 2500 });
        } catch (_) {}
        return;
    }

    try {
        _warmupSourceIds([_currentCard.source_id], 'high').catch(() => {});
    } catch (e) {
        // ignore
    }

    try {
        TR.toast?.show?.(`已加入栏目：${pickedName}`, { variant: 'success', durationMs: 1500 });
    } catch (e) {
        // ignore
    }
}

function _isCarouselActive() {
    return _open && _getActiveTabId() === CATEGORY_ID;
}

function _getGridEl() {
    return document.getElementById('rssCategoryCarouselGrid');
}

function _getStatusEl() {
    return document.getElementById('rssCategoryCarouselStatus');
}

function _setStatus(msg, opts = {}) {
    const el = _getStatusEl();
    if (!el) return;
    const variant = String(opts.variant || '').toLowerCase();
    const color = variant === 'error' ? '#dc2626' : (variant === 'success' ? '#16a34a' : '#6b7280');
    el.style.color = color;
    el.textContent = msg == null ? '' : String(msg);
}

function _formatTs(ts) {
    const n = Number(ts || 0) || 0;
    if (!n) return '';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (x) => String(x).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
}

function _formatTsDateTime(ts) {
    const n = Number(ts || 0) || 0;
    if (!n) return '';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (x) => String(x).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function _pickEntryTs(e) {
    const cand = [
        e?.published,
        e?.published_at,
        e?.pubDate,
        e?.updated,
        e?.updated_at,
        e?.date,
        e?.datetime,
        e?.date_published,
        e?.date_modified,
    ];

    const now = Date.now();
    const maxFuture = now + 365 * 24 * 60 * 60 * 1000;

    const normalizeEpoch = (n) => {
        const num = Number(n);
        if (!Number.isFinite(num) || num <= 0) return 0;
        // seconds -> ms
        if (num < 1e11) return Math.floor(num * 1000);
        // ms
        return Math.floor(num);
    };

    for (const v of cand) {
        if (v == null) continue;

        if (typeof v === 'number') {
            const t0 = normalizeEpoch(v);
            if (t0 > 0 && t0 <= maxFuture) return t0;
            continue;
        }

        const s = String(v).trim();
        if (!s) continue;

        if (/^\d{10,13}$/.test(s)) {
            const t0 = normalizeEpoch(s);
            if (t0 > 0 && t0 <= maxFuture) return t0;
            continue;
        }

        // Try Date.parse
        const t = Date.parse(s);
        if (!Number.isNaN(t) && t > 0) return t;
    }

    return 0;
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

async function _ensureSourcesAt(index) {
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (_sourcesExhausted) return;
    let safety = 0;
    while (_sources.length <= idx && !_sourcesExhausted && safety < 50) {
        safety += 1;
        const page = await _fetchSourcesPage(50, _offset);
        _total = page.total;
        _offset = page.nextOffset;
        for (const src of page.items) {
            const sid = String(src?.id || '').trim();
            if (!sid) continue;
            _sources.push(src);
        }
        if (!page.items.length || _offset >= _total) {
            _sourcesExhausted = true;
        }
    }
}

async function _ensureAllSourcesLoaded() {
    if (_sourcesExhausted) return;
    let safety = 0;
    while (!_sourcesExhausted && safety < 200) {
        safety += 1;
        await _ensureSourcesAt(_sources.length);
        if (_sourcesExhausted) break;
    }
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
            const ts = _pickEntryTs(e);
            return { title: title || link, link, ts };
        })
        .filter((x) => !!x.link);
    return { feedTitle, entries: normalized };
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

async function _buildCardForSource(src) {
    const sid = String(src?.id || '').trim();
    if (!sid) return null;
    if (_previewCache.has(sid)) return _previewCache.get(sid);

    const url = String(src?.url || '').trim();
    const name = _safeNameFromSource(src);
    const alreadyAdded = _computeAlreadyAddedSet();

    let entries = [];
    let feedTitle = '';
    let payload = null;
    try {
        const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sid)}`);
        payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.detail || 'Preview failed');
        const parsed = _extractEntries(payload);
        feedTitle = parsed.feedTitle;
        entries = parsed.entries;
    } catch (e) {
        const bad = { source_id: sid, error: String(e?.message || e) };
        _previewCache.set(sid, bad);
        return bad;
    }

    if (!Array.isArray(entries) || entries.length <= 0) {
        const bad = { source_id: sid, error: 'No entries' };
        _previewCache.set(sid, bad);
        return bad;
    }

    let ts = 0;
    for (const e of entries) {
        const t = Number(e?.ts || 0) || 0;
        if (t > ts) ts = t;
    }

    if (!ts && payload) {
        const fb = _pickEntryTs({
            published:
                payload?.last_modified ||
                payload?.data?.feed?.updated ||
                payload?.data?.feed?.published ||
                payload?.data?.feed?.lastBuildDate
        });
        if (fb > ts) ts = fb;
    }
    const dateStr = _formatTs(ts);
    const platformName = feedTitle || name;

    const card = {
        source_id: sid,
        url,
        feed_title: feedTitle || name,
        platform_name: platformName,
        entries,
        entries_count: entries.length,
        date_str: dateStr,
        error: '',
        already_added: alreadyAdded.has(sid)
    };
    _previewCache.set(sid, card);
    return card;
}

function _renderCard(card) {
    const grid = _getGridEl();
    if (!grid) return;

    const c = card;
    const sid = String(c?.source_id || '').trim();
    const platformName = escapeHtml(c?.platform_name || 'RSS');
    const btnLabel = c?.already_added ? '已加入' : '加入栏目';
    const btnDisabled = c?.already_added ? 'disabled' : '';
    const items = Array.isArray(c?.entries) ? c.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE) - 1);
    if (_entryPage > maxPage) _entryPage = maxPage;
    if (_entryPage < 0) _entryPage = 0;
    const start = _entryPage * ENTRIES_PER_SOURCE;
    const pageItems = items.slice(start, start + ENTRIES_PER_SOURCE);
    const listHtml = pageItems.map((e, idx) => {
        const title = escapeHtml(e?.title || '');
        const link = escapeHtml(e?.link || '#');
        const itemDate = escapeHtml(_formatTs(e?.ts || 0));
        return `
            <li class="news-item" data-news-id="" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(start + idx + 1)}</span>
                    <a class="news-title tr-news-title-lg tr-title-hover-accent tr-hover-glass tr-title-hover-wave" href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>
                    <span class="rss-entry-date" style="flex:0 0 auto;margin-left:8px;color:#6b7280;font-size:0.75rem;white-space:nowrap;${itemDate ? '' : 'display:none;'}">${itemDate}</span>
                </div>
            </li>`;
    }).join('');

    const placeholderCount = Math.max(0, ENTRIES_PER_SOURCE - pageItems.length);
    const placeholderHtml = placeholderCount
        ? Array.from({ length: placeholderCount }).map((_, i) => {
              const n = start + pageItems.length + i + 1;
              return `
            <li class="news-item rss-entry-placeholder" data-news-id="">
                <div class="news-item-content">
                    <span class="news-index">${String(n)}</span>
                    <span class="news-title tr-news-title-lg tr-hover-glass">&nbsp;</span>
                    <span class="rss-entry-date" style="display:none;">&nbsp;</span>
                </div>
            </li>`;
          }).join('')
        : '';

    grid.innerHTML = `
        <div class="rss-carousel-frame" style="margin:0 auto;max-width:980px;width:min(980px,100%);box-sizing:border-box;position:relative;padding:52px 56px;">
            <div class="rss-carousel-nav-hints" style="position:absolute;inset:0;pointer-events:none;">
                <div class="rss-nav-hint rss-nav-left" aria-hidden="true" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">‹</div>
                <div class="rss-nav-hint rss-nav-right" aria-hidden="true" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">›</div>
                <div class="rss-nav-hint rss-nav-up" aria-hidden="true" style="position:absolute;left:50%;top:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">˄</div>
                <div class="rss-nav-hint rss-nav-down" aria-hidden="true" style="position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">˅</div>
            </div>
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}" style="margin:0 auto;max-width:980px;width:100%;box-sizing:border-box;">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;flex:1;min-width:0;white-space:nowrap;overflow:hidden;">
                        <div class="rss-preview-title-row" style="display:flex;align-items:baseline;gap:12px;min-width:0;">
                            <span class="rss-preview-title-text tr-title-compact tr-title-ellipsis tr-title-hover-accent" style="flex:1;min-width:0;">📱 ${platformName}</span>
                        </div>
                    </div>
                    <div class="platform-header-actions">
                        <button type="button" class="platform-select-action-btn" data-action="add" ${btnDisabled}>${btnLabel}</button>
                    </div>
                </div>
                <ul class="news-list">${listHtml}${placeholderHtml}</ul>
            </div>
        </div>`;

    try {
        window.requestAnimationFrame(() => {
            const titles = grid.querySelectorAll('.news-title');
            titles.forEach((el) => {
                if (!(el instanceof HTMLElement)) return;
                if (el.closest('.rss-entry-placeholder')) return;
                el.classList.remove('tr-title-overflow-shrink');
                if (el.scrollWidth > el.clientWidth + 1) {
                    el.classList.add('tr-title-overflow-shrink');
                }
            });
        });
    } catch (e) {
        // ignore
    }

    const btn = grid.querySelector('button[data-action="add"]');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!_currentCard) return;
            if (_pickerOpen) return;
            if (_currentCard.already_added) return;
            _setStatus('', { variant: 'info' });
            _openPicker();
        });
    }
}

async function _showAt(index, dir = 1) {
    if (_loading) return;
    _loading = true;
    _inFlightIndex = Number(index);
    try {
        await _ensureSourcesAt(index);
        if (_sources.length <= 0) {
            const grid = _getGridEl();
            if (grid) grid.innerHTML = '<div style="color:#6b7280;">暂无可预览源</div>';
            _setStatus('', { variant: 'info' });
            return;
        }

        let idx = index;
        const step = dir >= 0 ? 1 : -1;
        let safety = 0;
        while (safety < 200) {
            safety += 1;
            if (idx < 0) {
                await _ensureAllSourcesLoaded();
                idx = _sources.length - 1;
            }
            await _ensureSourcesAt(idx);
            if (idx >= _sources.length) {
                idx = 0;
            }
            const src = _sources[idx];
            if (!src) {
                idx += step;
                continue;
            }

            const card = await _buildCardForSource(src);
            if (!card || card.error) {
                idx += step;
                continue;
            }

            _cursor = idx;
            _currentCard = card;
            _entryPage = 0;
            _renderCard(card);
            _setStatus('', { variant: 'info' });
            try {
                _warmupSourceIds([card.source_id], 'normal').catch(() => {});
            } catch (e) {
                // ignore
            }
            try {
                _prefetchAround(idx);
            } catch (e) {
                // ignore
            }
            return;
        }

        const grid = _getGridEl();
        if (grid) grid.innerHTML = '<div style="color:#6b7280;">暂无可预览源</div>';
        _setStatus('', { variant: 'info' });
    } catch (e) {
        _setStatus(String(e?.message || e), { variant: 'error' });
    } finally {
        _loading = false;
        _inFlightIndex = null;

        if (_isCarouselActive() && _pendingTargetIndex != null) {
            const target = Number(_pendingTargetIndex);
            _pendingTargetIndex = null;
            const base = Number.isFinite(_cursor) ? _cursor : 0;
            const dir2 = target >= base ? 1 : -1;
            _showAt(target, dir2).catch((e) => _setStatus(String(e?.message || e), { variant: 'error' }));
        }
    }
}

function next() {
    if (!_isCarouselActive()) return;
    if (_loading) {
        const base = _pendingTargetIndex != null ? Number(_pendingTargetIndex) : (_inFlightIndex != null ? Number(_inFlightIndex) : _cursor);
        _pendingTargetIndex = base + 1;
        return;
    }
    const nextIdx = _cursor + 1;
    _showAt(nextIdx, 1).catch((e) => _setStatus(String(e?.message || e), { variant: 'error' }));
}

function prev() {
    if (!_isCarouselActive()) return;
    if (_loading) {
        const base = _pendingTargetIndex != null ? Number(_pendingTargetIndex) : (_inFlightIndex != null ? Number(_inFlightIndex) : _cursor);
        _pendingTargetIndex = base - 1;
        return;
    }
    const prevIdx = _cursor - 1;
    _showAt(prevIdx, -1).catch((e) => _setStatus(String(e?.message || e), { variant: 'error' }));
}

function _resetState() {
    _loading = false;
    _pendingTargetIndex = null;
    _inFlightIndex = null;
    _sources = [];
    _total = 0;
    _offset = 0;
    _sourcesExhausted = false;
    _cursor = -1;
    _currentCard = null;
    _previewCache = new Map();
    _entryPage = 0;
}

function _pageEntries(delta) {
    if (!_isCarouselActive()) return;
    if (!_currentCard) return;
    const items = Array.isArray(_currentCard?.entries) ? _currentCard.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, _entryPage + delta));
    if (nextPage === _entryPage) return;
    _entryPage = nextPage;
    _renderCard(_currentCard);
}

function open() {
    _open = true;
    try {
        TR.subscription?.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }
    _resetState();
    next();
}

function close() {
    _open = false;
}

window.rssCategoryCarouselNext = () => next();
window.rssCategoryCarouselPrev = () => prev();
window.rssCategoryCarouselAddToCategory = () => {
    if (!_isCarouselActive()) return;
    if (!_currentCard) return;
    if (_currentCard.already_added) return;
    _openPicker();
};

TR.rssCategoryCarousel = {
    open,
    close,
    next,
    prev
};

ready(function() {
    try {
        const orig = TR.tabs?.switchTab;
        if (typeof orig === 'function') {
            TR.tabs.switchTab = function(categoryId) {
                orig.call(TR.tabs, categoryId);
                try {
                    if (String(categoryId) === CATEGORY_ID) {
                        open();
                    } else {
                        close();
                    }
                } catch (e) {
                    // ignore
                }
            };
        }
    } catch (e) {
        // ignore
    }

    document.addEventListener('keydown', (e) => {
        if (!_isCarouselActive()) return;
        if (document.querySelector('.settings-modal-overlay.show')) return;
        const t = e?.target;
        if (t && t instanceof Element) {
            if (t.closest('input,textarea,select')) return;
        }
        if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
            e.preventDefault();
            next();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            _pageEntries(-1);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _pageEntries(1);
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            next();
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prev();
            return;
        }
    });

    document.addEventListener('click', (e) => {
        if (!_isCarouselActive()) return;
        if (document.querySelector('.settings-modal-overlay.show')) return;
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;
        if (t.closest('a,button,input,textarea,select')) return;
        const pane = document.getElementById(`tab-${CATEGORY_ID}`);
        if (!pane) return;
        const x = Number(e?.clientX || 0);
        const y = Number(e?.clientY || 0);
        const card = pane.querySelector('#rssCategoryCarouselGrid .platform-card');
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const HIT_PAD = 140;
        const hitLeft = rect.left - HIT_PAD;
        const hitRight = rect.right + HIT_PAD;
        const hitTop = rect.top - HIT_PAD;
        const hitBottom = rect.bottom + HIT_PAD;
        if (x < hitLeft || x > hitRight || y < hitTop || y > hitBottom) return;

        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return;

        if (y < rect.top) {
            _pageEntries(-1);
            return;
        }
        if (y > rect.bottom) {
            _pageEntries(1);
            return;
        }
        if (x < rect.left) {
            prev();
            return;
        }
        if (x > rect.right) {
            next();
            return;
        }
    });

    document.addEventListener('touchstart', _onTouchStart, { passive: true });
    document.addEventListener('touchmove', _onTouchMove, { passive: false });
    document.addEventListener('touchend', _onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', _onTouchEnd, { passive: true });

    try {
        if (_getActiveTabId() === CATEGORY_ID) {
            open();
        }
    } catch (e) {
        // ignore
    }
});
