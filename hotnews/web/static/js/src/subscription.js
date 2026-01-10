import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const STORAGE_KEY = 'rss_subscriptions';

let _selectedSource = null;
let _subsSnapshot = null;

let _serverEnabled = false;
let _serverChecked = false;
let _serverSyncInFlight = false;

let _rssFeedTitleUserEdited = false;
let _rssFeedTitleAutoFilled = false;

const _previewStatusBySourceId = new Map();
const _pendingSyncBySourceId = new Set();

let _pickerOpen = false;
let _pickerCategory = '';
let _pickerQuery = '';
let _pickerLimit = 80;
let _pickerOffset = 0;
let _pickerTotal = 0;
let _pickerLoading = false;
let _pickerItems = [];
let _pickerRenderRaf = 0;
let _pickerDebounceTimer = 0;
const _ROW_H = 44;
const _OVERSCAN = 10;

let _prefetchWarmupTimer = 0;
let _prefetchWarmupLastAt = 0;
const _prefetchWarmupDedup = new Map();

function _sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms || 0)));
}

function _cssEscape(s) {
    try {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(s || ''));
    } catch (e) {
        // ignore
    }
    return String(s || '').replace(/"/g, '\\"');
}

function _hasRssPlatformNews(sourceIds) {
    const ids = Array.isArray(sourceIds) ? sourceIds : [];
    for (const sidRaw of ids) {
        const sid = String(sidRaw || '').trim();
        if (!sid) continue;
        const pid = `rss-${sid}`;
        const selector = `.platform-card[data-platform="${_cssEscape(pid)}"]`;
        const card = document.querySelector(selector);
        if (!card) continue;
        const items = card.querySelectorAll('.news-item');
        if (items && items.length > 0) return true;
    }
    return false;
}

function _setPendingSync(sourceIds, pending) {
    const ids = Array.isArray(sourceIds) ? sourceIds : [];
    for (const sidRaw of ids) {
        const sid = String(sidRaw || '').trim();
        if (!sid) continue;
        if (pending) _pendingSyncBySourceId.add(sid);
        else _pendingSyncBySourceId.delete(sid);
    }
}

function _getModalEl() {
    return document.getElementById('rssSubscriptionModal');
}

function _getPickerModalEl() {
    return document.getElementById('rssSourcePickerModal');
}

function _normalizeSubsForServer(subs) {
    const arr = Array.isArray(subs) ? subs : [];
    return arr
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
            return {
                source_id: String(s.source_id || s.rss_source_id || '').trim(),
                url: String(s.url || '').trim(),
                feed_title: String(s.feed_title || s.display_name || '').trim(),
                column: String(s.column || 'RSS').trim() || 'RSS',
                platform_id: String(s.platform_id || '').trim(),
            };
        })
        .filter((s) => !!s.source_id);
}

async function _syncSubscriptionsFromServer({ showHintOn403 } = {}) {
    if (_serverSyncInFlight) return;
    _serverSyncInFlight = true;
    try {
        const resp = await fetch('/api/me/rss-subscriptions');
        if (resp.status === 403) {
            _serverEnabled = false;
            _serverChecked = true;
            try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }
            if (showHintOn403) {
                _setSaveStatus('未开启服务端同步（Not allowlisted），当前使用本地订阅', { variant: 'info' });
            }
            return;
        }
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            _serverChecked = true;
            _serverEnabled = false;
            return;
        }

        const subs = _normalizeSubsForServer(payload?.subscriptions);
        _serverChecked = true;
        _serverEnabled = true;
        try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }

        try {
            subscription.setSubscriptions(subs);
        } catch (e) {
            // ignore
        }

        try {
            _subsSnapshot = subscription.getSubscriptions();
        } catch (e) {
            _subsSnapshot = null;
        }
        _renderList();
        _updateRssGatingUI();
    } finally {
        _serverSyncInFlight = false;
    }
}

function _getSaveBtnEl() {
    try {
        return document.querySelector('#rssSubscriptionModal .settings-btn-primary');
    } catch (e) {
        return null;
    }
}

function _getPreviewBtnEl() {
    try {
        return document.querySelector('#rssSubscriptionModal button[onclick="previewRssSubscription()"]');
    } catch (e) {
        return null;
    }
}

function _subsKey(items) {
    const arr = Array.isArray(items) ? items : [];
    const normalized = arr
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
            return {
                source_id: String(s.source_id || s.rss_source_id || '').trim(),
                url: String(s.url || '').trim(),
                feed_title: String(s.feed_title || '').trim(),
                column: String(s.column || 'RSS').trim() || 'RSS'
            };
        })
        .filter((s) => !!s.source_id || !!s.url)
        .sort((a, b) => (a.source_id || '').localeCompare(b.source_id || ''));
    return JSON.stringify(normalized);
}

function _diffNewSourceIds(prev, next) {
    const prevArr = Array.isArray(prev) ? prev : [];
    const nextArr = Array.isArray(next) ? next : [];
    const prevSet = new Set(prevArr.map((s) => String(s?.source_id || s?.rss_source_id || '').trim()).filter(Boolean));
    const out = [];
    for (const s of nextArr) {
        const sid = String(s?.source_id || s?.rss_source_id || '').trim();
        if (!sid) continue;
        if (prevSet.has(sid)) continue;
        out.push(sid);
    }
    return out;
}

function _setBtnEnabled(btn, enabled) {
    if (!btn) return;
    try {
        if (enabled) btn.removeAttribute('disabled');
        else btn.setAttribute('disabled', 'true');
    } catch (e) {
        // ignore
    }
}

function _setBtnAriaDisabled(btn, disabled) {
    if (!btn) return;
    const isDisabled = !!disabled;
    try {
        if (isDisabled) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
    } catch (e) {
        // ignore
    }
    try {
        if (isDisabled) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    } catch (e) {
        // ignore
    }
}

function _updateRssGatingUI() {
    const previewBtn = _getPreviewBtnEl();
    const saveBtn = _getSaveBtnEl();

    const selectedId = _getSelectedSourceId();
    // NOTE: do not use the native `disabled` attr for preview button, because many browsers
    // will not show hover tooltips on disabled elements.
    try {
        if (previewBtn) previewBtn.removeAttribute('disabled');
    } catch (e) {
        // ignore
    }
    _setBtnAriaDisabled(previewBtn, !selectedId);

    try {
        if (previewBtn) {
            if (!selectedId) {
                previewBtn.setAttribute('title', '请先选择 RSS 源再预览');
            } else {
                previewBtn.removeAttribute('title');
            }
        }
    } catch (e) {
        // ignore
    }

    if (selectedId) {
        const st = _previewStatusBySourceId.get(String(selectedId || '').trim());
        if (st && st.ok === true && Number(st.entries_count || 0) === 0) {
            _setSaveStatus('预览成功但暂无条目（entries=0），请稍后重试', { variant: 'info' });
        }
    }

    const prev = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
    const next = subscription.getSubscriptions();
    const changed = _subsKey(prev) !== _subsKey(next);
    const newIds = _diffNewSourceIds(prev, next);
    const allNewOk = newIds.every((sid) => {
        const st = _previewStatusBySourceId.get(sid);
        return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
    });

    const canSave = changed && allNewOk;
    _setBtnEnabled(saveBtn, canSave);

    if (!changed) {
        if (!(selectedId && (() => {
            const st = _previewStatusBySourceId.get(String(selectedId || '').trim());
            return st && st.ok === true && Number(st.entries_count || 0) === 0;
        })())) {
            _setSaveStatus('请先通过预览加入至少一个订阅，再保存并刷新', { variant: 'info' });
        }
        return;
    }
    if (!allNewOk) {
        if (!(selectedId && (() => {
            const st = _previewStatusBySourceId.get(String(selectedId || '').trim());
            return st && st.ok === true && Number(st.entries_count || 0) === 0;
        })())) {
            _setSaveStatus('新增订阅需要先预览且必须有条目（entries>0）', { variant: 'info' });
        }
        return;
    }
    _setSaveStatus('', { variant: 'info' });
}

async function _previewSource(sourceId) {
    const previewEl = _getPreviewEl();
    if (previewEl) previewEl.innerHTML = '<div style="color:#6b7280;">预览中...</div>';

    const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sourceId)}`);
    const payload = await resp.json();
    if (!resp.ok) {
        throw new Error(payload?.detail || 'Preview failed');
    }

    const parsed = payload?.data || {};
    const feedTitle = parsed?.feed?.title || '';
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const entriesCount = entries.length;

    const lines = entries.slice(0, 5).map((e) => {
        const t = escapeHtml(e?.title || '');
        const l = escapeHtml(e?.link || '');
        if (l) {
            return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><a href="${l}" target="_blank" rel="noopener noreferrer">${t || l}</a></div>`;
        }
        return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t}</div>`;
    }).join('');

    if (!_rssFeedTitleUserEdited && feedTitle) {
        _setInputValue('rssFeedTitle', feedTitle);
        _rssFeedTitleAutoFilled = true;
    }

    _previewStatusBySourceId.set(String(sourceId || '').trim(), {
        ok: true,
        entries_count: entriesCount,
        ts: Date.now()
    });

    if (entriesCount > 0) {
        try {
            const urlFromSelected = _selectedSource ? String(_selectedSource.url || '').trim() : '';
            const urlFinal = urlFromSelected || String(payload?.final_url || payload?.url || '').trim();
            let column = _getInputValue('rssColumn') || '';
            if (!column || String(column).trim().toUpperCase() === 'RSS') {
                try {
                    const activeTab = (TR.tabs && typeof TR.tabs.getActiveTabId === 'function') ? TR.tabs.getActiveTabId() : '';
                    if (activeTab) column = String(activeTab);
                } catch (e) {
                    // ignore
                }
            }
            if (!column) column = 'general';
            const feedTitleFinal = _getInputValue('rssFeedTitle') || String(_selectedSource?.name || _selectedSource?.host || '').trim();

            const subs = subscription.getSubscriptions();
            const idx = subs.findIndex((s) => (s.source_id && s.source_id === String(sourceId || '').trim()));
            const item = {
                source_id: String(sourceId || '').trim(),
                url: urlFinal,
                feed_title: feedTitleFinal,
                column,
                platform_id: ''
            };
            if (idx >= 0) subs[idx] = item;
            else subs.unshift(item);
            subscription.setSubscriptions(subs);
            _renderList();
        } catch (e) {
            // ignore
        }
    } else {
        _setSaveStatus('预览成功但暂无条目（entries=0），请稍后重试', { variant: 'info' });
    }

    _updateRssGatingUI();

    if (previewEl) {
        previewEl.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="font-weight:800;">${escapeHtml(feedTitle || 'Feed')}</div>
                <div style="font-size:0.78rem;color:#6b7280;">条目数：${entries.length}</div>
                <div style="display:flex;flex-direction:column;gap:4px;">${lines}</div>
            </div>`;
    }
}

function _getListEl() {
    return document.getElementById('rssSubscriptionList');
}

function _getPreviewEl() {
    return document.getElementById('rssSubscriptionPreview');
}

function _getSaveStatusEl() {
    return document.getElementById('rssSubscriptionSaveStatus');
}

function _setSaveStatus(msg, opts = {}) {
    const el = _getSaveStatusEl();
    if (!el) return;
    const variant = String(opts.variant || '').toLowerCase();
    const color = variant === 'error' ? '#dc2626' : (variant === 'success' ? '#16a34a' : (variant === 'info' ? '#6b7280' : '#6b7280'));
    el.style.color = color;
    el.textContent = msg == null ? '' : String(msg);
}

function _getSelectedSourceIdInputEl() {
    return document.getElementById('rssSelectedSourceId');
}

function _getSelectedSourceLabelEl() {
    return document.getElementById('rssSelectedSourceLabel');
}

function _getRequestSectionEl() {
    return document.getElementById('rssRequestSection');
}

function _getCategoryListEl() {
    return document.getElementById('rssSourceCategoryList');
}

function _getSearchInputEl() {
    return document.getElementById('rssSourceSearchInput');
}

function _getResultsEl() {
    return document.getElementById('rssSourceResults');
}

function _getPickerStatusEl() {
    return document.getElementById('rssSourcePickerStatus');
}

function _getInputValue(id) {
    const el = document.getElementById(id);
    return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

function _setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? '' : String(value);
}

function _getSelectedSourceId() {
    const el = _getSelectedSourceIdInputEl();
    return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

function _setSelectedSource(source) {
    _selectedSource = source && typeof source === 'object' ? source : null;
    const idEl = _getSelectedSourceIdInputEl();
    const labelEl = _getSelectedSourceLabelEl();
    const sid = _selectedSource ? String(_selectedSource.id || '').trim() : '';
    const name = _selectedSource ? String(_selectedSource.name || _selectedSource.host || sid) : '';
    const url = _selectedSource ? String(_selectedSource.url || '').trim() : '';
    if (idEl) idEl.value = sid;
    if (labelEl) {
        labelEl.textContent = sid ? `${name}${url ? ` (${url})` : ''}` : '未选择';
    }

    if (sid && !_rssFeedTitleUserEdited) {
        const cur = _getInputValue('rssFeedTitle');
        if (!cur || _rssFeedTitleAutoFilled) {
            _setInputValue('rssFeedTitle', name);
            _rssFeedTitleAutoFilled = true;
        }
    }

    if (sid) {
        _schedulePrefetchWarmup(sid);
    }

    _updateRssGatingUI();
}

function _schedulePrefetchWarmup(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid) return;

    const now = Date.now();
    const dedupMs = 15000;
    const last = _prefetchWarmupDedup.get(sid) || 0;
    if (now - last < dedupMs) return;

    _prefetchWarmupDedup.set(sid, now);

    if (_prefetchWarmupTimer) {
        window.clearTimeout(_prefetchWarmupTimer);
        _prefetchWarmupTimer = 0;
    }

    _prefetchWarmupTimer = window.setTimeout(async () => {
        _prefetchWarmupTimer = 0;
        const sinceLast = Date.now() - (_prefetchWarmupLastAt || 0);
        if (sinceLast < 400) {
            // small global debounce
            _prefetchWarmupTimer = window.setTimeout(() => {
                _prefetchWarmupTimer = 0;
                _schedulePrefetchWarmup(sid);
            }, 400 - sinceLast);
            return;
        }
        _prefetchWarmupLastAt = Date.now();
        try {
            await fetch('/api/rss-sources/warmup?wait_ms=0', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_ids: [sid], priority: 'high' })
            });
        } catch (e) {
            // ignore
        }
    }, 300);
}

function _setPickerStatus(msg) {
    const el = _getPickerStatusEl();
    if (!el) return;
    el.textContent = msg == null ? '' : String(msg);
}

function _normalizeName(s) {
    return String(s || '').trim().toLowerCase();
}

function _getBuiltinPlatformNameSet() {
    const set = new Set();
    try {
        document.querySelectorAll('.platform-card').forEach((card) => {
            const pid = String(card?.dataset?.platform || '').trim();
            if (!pid) return;
            if (pid.startsWith('rss-')) return;
            const nameEl = card.querySelector('.platform-name');
            const raw = (nameEl?.textContent || '').trim();
            if (!raw) return;
            const cleaned = raw
                .replace(/📱/g, '')
                .replace(/NEW/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            const key = _normalizeName(cleaned);
            if (key) set.add(key);
        });
    } catch (e) {
        // ignore
    }
    return set;
}

async function _loadCategories() {
    const resp = await fetch('/api/rss-source-categories');
    const payload = await resp.json();
    if (!resp.ok) {
        throw new Error(payload?.detail || 'Failed to load categories');
    }
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const listEl = _getCategoryListEl();
    if (!listEl) return categories;
    const html = categories.map((c) => {
        const id = String(c?.id || '');
        const name = String(c?.name || id || '');
        const count = Number(c?.count || 0);
        const active = id === _pickerCategory;
        return `
          <button type="button" class="platform-select-action-btn" data-cat="${escapeHtml(id)}" style="justify-content:flex-start;${active ? 'background:#111827;color:#fff;border-color:#111827;' : ''}">
            ${escapeHtml(name)} <span style="opacity:0.7;">(${count})</span>
          </button>`;
    }).join('');
    listEl.innerHTML = html;
    listEl.querySelectorAll('button[data-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
            _pickerCategory = String(btn.getAttribute('data-cat') || '');
            _loadCategories().catch(() => {});
            _startSearch({ reset: true });
        });
    });
    return categories;
}

async function _searchSourcesPage(opts = {}) {
    const reset = opts.reset === true;
    if (_pickerLoading) return;
    _pickerLoading = true;
    try {
        if (reset) {
            _pickerItems = [];
            _pickerOffset = 0;
            _pickerTotal = 0;
        }
        _setPickerStatus('加载中...');
        const qs = new URLSearchParams();
        if (_pickerQuery) qs.set('q', _pickerQuery);
        if (_pickerCategory) qs.set('category', _pickerCategory);
        qs.set('limit', String(_pickerLimit));
        qs.set('offset', String(_pickerOffset));
        const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
        const payload = await resp.json();
        if (!resp.ok) throw new Error(payload?.detail || 'Search failed');
        const items = Array.isArray(payload?.sources) ? payload.sources : [];
        const total = Number(payload?.total || 0);
        _pickerTotal = total;
        if (reset) {
            _pickerItems = items;
        } else {
            _pickerItems = _pickerItems.concat(items);
        }
        _pickerOffset = Number(payload?.next_offset ?? (_pickerOffset + items.length)) || (_pickerOffset + items.length);
        _schedulePickerRender();
        const more = _pickerItems.length < _pickerTotal;
        _setPickerStatus(`已加载 ${_pickerItems.length}/${_pickerTotal}${more ? '（继续滚动加载）' : ''}`);
    } finally {
        _pickerLoading = false;
    }
}

function _schedulePickerRender() {
    if (_pickerRenderRaf) return;
    _pickerRenderRaf = window.requestAnimationFrame(() => {
        _pickerRenderRaf = 0;
        _renderPickerVirtual();
    });
}

function _renderPickerVirtual() {
    const root = _getResultsEl();
    if (!root) return;

    const scrollTop = root.scrollTop || 0;
    const viewH = root.clientHeight || 360;
    const totalItems = _pickerItems.length;
    const totalH = totalItems * _ROW_H;

    const start = Math.max(0, Math.floor(scrollTop / _ROW_H) - _OVERSCAN);
    const end = Math.min(totalItems, Math.ceil((scrollTop + viewH) / _ROW_H) + _OVERSCAN);

    let inner = root.querySelector(':scope > .rss-src-inner');
    if (!inner) {
        root.innerHTML = '<div class="rss-src-inner" style="position:relative;width:100%;"></div>';
        inner = root.querySelector(':scope > .rss-src-inner');
    }
    inner.style.height = `${totalH}px`;

    const parts = [];
    for (let i = start; i < end; i++) {
        const s = _pickerItems[i] || {};
        const sid = String(s.id || '').trim();
        const name = String(s.name || s.host || sid);
        const url = String(s.url || '');
        parts.push(
            `<div class="rss-source-item" data-source-id="${escapeHtml(sid)}" style="position:absolute;left:0;right:0;top:${i * _ROW_H}px;height:${_ROW_H}px;padding:8px 10px;border-bottom:1px solid #f3f4f6;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <div style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                <span style="font-weight:700;font-size:0.9rem;color:#111827;">${escapeHtml(name)}</span>
                <span style="font-weight:400;font-size:0.75rem;color:#9ca3af;"> — </span>
                <span style="font-weight:400;font-size:0.72rem;color:#6b7280;">${escapeHtml(url)}</span>
              </div>
            </div>`
        );
    }
    inner.innerHTML = parts.join('');

    inner.querySelectorAll('.rss-source-item[data-source-id]').forEach((el) => {
        el.addEventListener('click', () => {
            const sid = String(el.getAttribute('data-source-id') || '').trim();
            const source = _pickerItems.find((x) => x && String(x.id || '').trim() === sid) || null;
            _setSelectedSource(source);
            closePicker();
        });
    });

    const nearBottom = scrollTop + viewH >= totalH - _ROW_H * 6;
    if (nearBottom && _pickerItems.length < _pickerTotal) {
        _searchSourcesPage({ reset: false }).catch((e) => {
            _setPickerStatus(e?.message || String(e));
        });
    }
}

function _startSearch(opts = {}) {
    const reset = opts.reset !== false;
    _searchSourcesPage({ reset }).catch((e) => {
        _setPickerStatus(e?.message || String(e));
    });
}

function openPicker() {
    const modal = _getPickerModalEl();
    if (!modal) return;
    _pickerOpen = true;
    modal.classList.add('show');
    const input = _getSearchInputEl();
    if (input) {
        input.value = _pickerQuery;
        input.focus();
    }
    _loadCategories().catch(() => {});
    _startSearch({ reset: true });
}

function closePicker() {
    const modal = _getPickerModalEl();
    if (!modal) return;
    _pickerOpen = false;
    modal.classList.remove('show');
}

function _renderList() {
    const listEl = _getListEl();
    if (!listEl) return;

    const subs = subscription.getSubscriptions();
    if (!subs.length) {
        listEl.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;">暂无订阅</div>';
        return;
    }

    const html = subs.map((s, idx) => {
        const sid = String(s?.source_id || s?.rss_source_id || '').trim();
        const url = escapeHtml(s.url || '');
        const title = escapeHtml(s.feed_title || '');
        const column = escapeHtml(s.column || 'RSS');
        const name = title ? `${title}` : url;
        const pending = sid && _pendingSyncBySourceId.has(sid);
        return `
            <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;gap:8px;align-items:baseline;">
                        <div style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            <span style="font-weight:700;font-size:0.9rem;color:#111827;">${name}</span>
                            ${pending ? '<span style="margin-left:8px;font-weight:400;font-size:0.75rem;color:#9ca3af;">同步中...</span>' : ''}
                            <span style="font-weight:400;font-size:0.75rem;color:#9ca3af;"> — </span>
                            <span style="font-weight:400;font-size:0.72rem;color:#6b7280;">${url}</span>
                        </div>
                        <div style="flex:0 0 auto;font-size:0.72rem;color:#6b7280;white-space:nowrap;">栏目：${column}</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex:0 0 auto;">
                    <button type="button" class="platform-select-action-btn" onclick="removeRssSubscription(${idx})">删除</button>
                </div>
            </div>`;
    }).join('');

    listEl.innerHTML = html;
    _updateRssGatingUI();
}

async function _previewUrl(url) {
    const previewEl = _getPreviewEl();
    if (previewEl) previewEl.innerHTML = '<div style="color:#6b7280;">预览中...</div>';

    const resp = await fetch(`/api/proxy/fetch?url=${encodeURIComponent(url)}`);
    const payload = await resp.json();
    if (!resp.ok) {
        throw new Error(payload?.detail || 'Preview failed');
    }

    const parsed = payload?.data || {};
    const feedTitle = parsed?.feed?.title || '';
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

    const lines = entries.slice(0, 5).map((e) => {
        const t = escapeHtml(e?.title || '');
        const l = escapeHtml(e?.link || '');
        if (l) {
            return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><a href="${l}" target="_blank" rel="noopener noreferrer">${t || l}</a></div>`;
        }
        return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t}</div>`;
    }).join('');

    if (!_rssFeedTitleUserEdited && feedTitle) {
        _setInputValue('rssFeedTitle', feedTitle);
        _rssFeedTitleAutoFilled = true;
    }

    if (previewEl) {
        previewEl.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="font-weight:800;">${escapeHtml(feedTitle || 'Feed')}</div>
                <div style="font-size:0.78rem;color:#6b7280;">条目数：${entries.length}</div>
                <div style="display:flex;flex-direction:column;gap:4px;">${lines}</div>
            </div>`;
    }
}

export const subscription = {
    getSubscriptionsRaw() {
        const raw = storage.get(STORAGE_KEY, []);
        return Array.isArray(raw) ? raw : [];
    },

    setSubscriptionsRaw(subs) {
        if (!Array.isArray(subs)) {
            storage.set(STORAGE_KEY, []);
            return;
        }
        storage.set(STORAGE_KEY, subs);
    },

    getSubscriptions() {
        const raw = this.getSubscriptionsRaw();
        return raw
            .filter((s) => s && typeof s === 'object')
            .map((s) => {
                return {
                    source_id: String(s.source_id || s.rss_source_id || '').trim(),
                    url: String(s.url || '').trim(),
                    feed_title: String(s.feed_title || '').trim(),
                    column: String(s.column || 'RSS').trim() || 'RSS',
                    platform_id: String(s.platform_id || '').trim()
                };
            })
            .filter((s) => !!s.source_id || !!s.url);
    },

    setSubscriptions(subs) {
        this.setSubscriptionsRaw(subs);
    },

    ensureSnapshot() {
        if (Array.isArray(_subsSnapshot)) return;
        try {
            _subsSnapshot = this.getSubscriptions();
        } catch (e) {
            _subsSnapshot = null;
        }
    },

    stageFromCatalogPreview(opts = {}) {
        const sid = String(opts?.source_id || opts?.rss_source_id || '').trim();
        if (!sid) return;

        const url = String(opts?.url || '').trim();
        const feedTitle = String(opts?.feed_title || opts?.name || '').trim();
        const column = String(opts?.column || 'RSS').trim() || 'RSS';

        this.ensureSnapshot();

        const subs = this.getSubscriptions();
        const idx = subs.findIndex((s) => (s?.source_id && s.source_id === sid));
        const item = {
            source_id: sid,
            url,
            feed_title: feedTitle,
            column,
            platform_id: ''
        };
        if (idx >= 0) subs[idx] = item;
        else subs.unshift(item);
        this.setSubscriptions(subs);

        const entriesCount = Number(opts?.entries_count ?? 0) || 0;
        _previewStatusBySourceId.set(sid, {
            ok: true,
            entries_count: entriesCount,
            ts: Date.now()
        });

        try {
            _renderList();
        } catch (e) {
            // ignore
        }
        _updateRssGatingUI();
    },

    open() {
        const modal = _getModalEl();
        if (!modal) return;
        try {
            _subsSnapshot = this.getSubscriptions();
        } catch (e) {
            _subsSnapshot = null;
        }
        _setInputValue('rssFeedTitle', '');
        _rssFeedTitleAutoFilled = false;
        _rssFeedTitleUserEdited = false;
        _previewStatusBySourceId.clear();
        _pendingSyncBySourceId.clear();
        _renderList();
        const previewEl = _getPreviewEl();
        if (previewEl) previewEl.innerHTML = '';
        _setSaveStatus('');
        modal.classList.add('show');
        _updateRssGatingUI();

        // Best-effort: if allowlisted, server is the source of truth.
        // Do not block UI; sync in background and re-render.
        _syncSubscriptionsFromServer({ showHintOn403: false }).catch(() => {});
    },

    close() {
        const modal = _getModalEl();
        if (!modal) return;
        modal.classList.remove('show');
    },

    async previewCurrent() {
        const sid = _getSelectedSourceId();
        if (!sid) {
            alert('请选择 RSS 源');
            return;
        }
        try {
            await _previewSource(sid);
        } catch (e) {
            _previewStatusBySourceId.set(String(sid || '').trim(), {
                ok: false,
                entries_count: 0,
                ts: Date.now(),
                error: String(e?.message || e)
            });
            _updateRssGatingUI();
            const previewEl = _getPreviewEl();
            if (previewEl) previewEl.innerHTML = `<div style="color:#dc2626;">${escapeHtml(e?.message || String(e))}</div>`;
        }
    },

    removeAt(index) {
        const subs = this.getSubscriptions();
        if (index < 0 || index >= subs.length) return;
        try {
            const sid = String(subs[index]?.source_id || subs[index]?.rss_source_id || '').trim();
            if (sid) _pendingSyncBySourceId.delete(sid);
        } catch (e) {
            // ignore
        }
        subs.splice(index, 1);
        this.setSubscriptions(subs);
        _renderList();
    },

    async saveOnly() {
        try {
            const prev = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
            const next = this.getSubscriptions();

            const changed = _subsKey(prev) !== _subsKey(next);
            const newIdsForGate = _diffNewSourceIds(prev, next);
            const allNewOk = newIdsForGate.every((sid) => {
                const st = _previewStatusBySourceId.get(sid);
                return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
            });
            if (!changed) {
                _setSaveStatus('请先通过预览加入至少一个订阅，再保存', { variant: 'info' });
                _updateRssGatingUI();
                return;
            }
            if (!allNewOk) {
                _setSaveStatus('新增订阅需要先预览且必须有条目（entries>0）', { variant: 'info' });
                _updateRssGatingUI();
                return;
            }

            let savedNext = next;
            try {
                const resp = await fetch('/api/me/rss-subscriptions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscriptions: _normalizeSubsForServer(next) })
                });
                if (resp.status === 403) {
                    _serverChecked = true;
                    _serverEnabled = false;
                    try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }
                    _setSaveStatus('未开启服务端同步（Not allowlisted），已保存到本地订阅', { variant: 'info' });
                } else {
                    const payload = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(payload?.detail || 'Save failed');
                    savedNext = _normalizeSubsForServer(payload?.subscriptions);
                    _serverChecked = true;
                    _serverEnabled = true;
                    try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }
                    this.setSubscriptions(savedNext);
                }
            } catch (e) {
                _setSaveStatus(`服务端保存失败，已使用本地订阅：${String(e?.message || e)}`, { variant: 'info' });
            }

            const prevSet = new Set(prev.map((s) => String(s?.source_id || s?.rss_source_id || '').trim()).filter(Boolean));
            const newIds = savedNext
                .map((s) => String(s?.source_id || s?.rss_source_id || '').trim())
                .filter((sid) => !!sid && !prevSet.has(sid));

            if (newIds.length > 0) {
                _setPendingSync(newIds, true);
                _renderList();
            }
            if (newIds.length > 0) {
                try {
                    await fetch('/api/rss-sources/warmup?wait_ms=0', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source_ids: newIds, priority: 'high' })
                    });
                } catch (e) {
                    // ignore
                }
            }

            try {
                _subsSnapshot = this.getSubscriptions();
            } catch (e) {
                _subsSnapshot = null;
            }
            _renderList();
            _updateRssGatingUI();
        } catch (e) {
            console.error('rss save error:', e);
            try {
                _setSaveStatus(String(e?.message || e), { variant: 'error' });
            } catch (_) {}
        }
    },

    async saveAndRefresh() {
        try {
            const prev = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
            const next = this.getSubscriptions();

            const changed = _subsKey(prev) !== _subsKey(next);
            const newIdsForGate = _diffNewSourceIds(prev, next);
            const allNewOk = newIdsForGate.every((sid) => {
                const st = _previewStatusBySourceId.get(sid);
                return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
            });
            if (!changed) {
                _setSaveStatus('请先通过预览加入至少一个订阅，再保存并刷新', { variant: 'info' });
                _updateRssGatingUI();
                return;
            }
            if (!allNewOk) {
                _setSaveStatus('新增订阅需要先预览且必须有条目（entries>0）', { variant: 'info' });
                _updateRssGatingUI();
                return;
            }

            let savedNext = next;
            try {
                const resp = await fetch('/api/me/rss-subscriptions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscriptions: _normalizeSubsForServer(next) })
                });
                if (resp.status === 403) {
                    _serverChecked = true;
                    _serverEnabled = false;
                    try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }
                    _setSaveStatus('未开启服务端同步（Not allowlisted），已保存到本地订阅', { variant: 'info' });
                } else {
                    const payload = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(payload?.detail || 'Save failed');
                    savedNext = _normalizeSubsForServer(payload?.subscriptions);
                    _serverChecked = true;
                    _serverEnabled = true;
                    try { _syncServerEnabledFlag(); } catch (e) { /* ignore */ }
                    this.setSubscriptions(savedNext);
                }
            } catch (e) {
                // If server save fails (network/500), keep local behavior.
                _setSaveStatus(`服务端保存失败，已使用本地订阅：${String(e?.message || e)}`, { variant: 'info' });
            }

            const prevSet = new Set(prev.map((s) => String(s?.source_id || s?.rss_source_id || '').trim()).filter(Boolean));
            const newIds = savedNext
                .map((s) => String(s?.source_id || s?.rss_source_id || '').trim())
                .filter((sid) => !!sid && !prevSet.has(sid));

            if (newIds.length > 0) {
                _setPendingSync(newIds, true);
                _renderList();
            }
            if (newIds.length > 0) {
                try {
                    await fetch('/api/rss-sources/warmup?wait_ms=0', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source_ids: newIds, priority: 'high' })
                    });
                } catch (e) {
                    // ignore
                }
            }

            // Mode A: keep modal open while waiting; show status in modal.
            _setSaveStatus('正在从源获取最新内容...', { variant: 'info' });
            try {
                const btn = document.querySelector('#rssSubscriptionModal .settings-btn-primary');
                if (btn) btn.setAttribute('disabled', 'true');
            } catch (e) {
                // ignore
            }

            const startedAt = Date.now();
            const deadlineMs = 5000;
            const delays = [0, 300, 700, 1500, 2500];
            let found = false;
            for (const d of delays) {
                const elapsed = Date.now() - startedAt;
                const remaining = deadlineMs - elapsed;
                if (remaining <= 0) break;
                if (d > 0) {
                    await _sleep(Math.min(d, remaining));
                }
                await TR.data.refreshViewerData({ preserveScroll: true });

                if (newIds.length > 0) {
                    const stillPending = [];
                    for (const sid of newIds) {
                        if (_pendingSyncBySourceId.has(sid) && _hasRssPlatformNews([sid])) {
                            _pendingSyncBySourceId.delete(sid);
                        }
                        if (_pendingSyncBySourceId.has(sid)) {
                            stillPending.push(sid);
                        }
                    }
                    if (stillPending.length === 0) {
                        found = true;
                        _renderList();
                        break;
                    }
                    _renderList();
                }
                if (newIds.length === 0) {
                    found = true;
                    break;
                }
            }

            if (found) {
                _setSaveStatus('已获取到内容，即将返回…', { variant: 'success' });
            } else {
                if (newIds.length > 0) {
                    _setPendingSync(newIds, false);
                    _renderList();
                }
                _setSaveStatus('已订阅，内容稍后更新', { variant: 'info' });
            }

            try {
                const btn = document.querySelector('#rssSubscriptionModal .settings-btn-primary');
                if (btn) btn.removeAttribute('disabled');
            } catch (e) {
                // ignore
            }

            await _sleep(found ? 200 : 800);
            this.close();
        } catch (e) {
            console.error('rss refresh error:', e);
            try {
                _setSaveStatus(String(e?.message || e), { variant: 'error' });
            } catch (_) {}
            try {
                const btn = document.querySelector('#rssSubscriptionModal .settings-btn-primary');
                if (btn) btn.removeAttribute('disabled');
            } catch (_) {}
        }
    }
};

async function submitSourceRequest() {
    const url = _getInputValue('rssRequestUrl');
    const title = _getInputValue('rssRequestTitle');
    const note = _getInputValue('rssRequestNote');
    if (!url) {
        alert('请输入 URL');
        return;
    }
    if (!title) {
        alert('请输入 标题');
        return;
    }
    if (!note) {
        alert('请输入 备注');
        return;
    }
    const previewEl = _getPreviewEl();
    if (previewEl) previewEl.innerHTML = '<div style="color:#6b7280;">提交申请中...</div>';
    try {
        const resp = await fetch('/api/rss-source-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, title, note })
        });
        const payload = await resp.json();
        if (!resp.ok) throw new Error(payload?.detail || 'Submit failed');
        if (previewEl) previewEl.innerHTML = `<div style="color:#16a34a;">已提交申请，状态：${escapeHtml(payload?.status || 'pending')}</div>`;
        _setInputValue('rssRequestUrl', '');
        _setInputValue('rssRequestTitle', '');
        _setInputValue('rssRequestNote', '');
    } catch (e) {
        if (previewEl) previewEl.innerHTML = `<div style="color:#dc2626;">${escapeHtml(e?.message || String(e))}</div>`;
    }
}

function toggleRequestSection() {
    const sec = _getRequestSectionEl();
    if (!sec) return;
    const visible = sec.style.display !== 'none';
    sec.style.display = visible ? 'none' : 'block';
}

window.openRssSubscriptionModal = () => {
    try {
        const badge = document.getElementById('rssSubscriptionNewBadge');
        if (badge) {
            badge.style.display = 'none';
            localStorage.setItem('rss_subscription_badge_dismissed', 'true');
        }
    } catch (e) {
        // ignore
    }
    subscription.open();
};
window.closeRssSubscriptionModal = () => subscription.close();
window.previewRssSubscription = () => subscription.previewCurrent();
window.saveRssSubscriptions = () => subscription.saveAndRefresh();
window.removeRssSubscription = (idx) => subscription.removeAt(parseInt(idx, 10));
window.submitRssSourceRequest = () => submitSourceRequest();
window.toggleRssRequestSection = () => toggleRequestSection();
window.openRssSourcePicker = () => openPicker();
window.closeRssSourcePicker = () => closePicker();

TR.subscription = subscription;

TR.subscription._serverEnabled = _serverEnabled;

function _syncServerEnabledFlag() {
    try { TR.subscription._serverEnabled = !!_serverEnabled; } catch (e) { /* ignore */ }
}

ready(function() {
    const modal = _getModalEl();

    if (modal) {
        const feedTitleInput = document.getElementById('rssFeedTitle');
        if (feedTitleInput) {
            feedTitleInput.addEventListener('input', () => {
                const v = String(feedTitleInput.value || '').trim();
                _rssFeedTitleUserEdited = v !== '';
                _rssFeedTitleAutoFilled = false;
            });
        }

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                subscription.close();
            }
        });
    }

    const picker = _getPickerModalEl();
    if (picker) {
        picker.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePicker();
            }
        });
    }

    const results = _getResultsEl();
    if (results) {
        results.addEventListener('scroll', () => {
            _schedulePickerRender();
        });
    }

    const input = _getSearchInputEl();
    if (input) {
        input.addEventListener('input', () => {
            const next = String(input.value || '').trim();
            _pickerQuery = next;
            if (_pickerDebounceTimer) {
                window.clearTimeout(_pickerDebounceTimer);
                _pickerDebounceTimer = 0;
            }
            _pickerDebounceTimer = window.setTimeout(() => {
                _pickerDebounceTimer = 0;
                _startSearch({ reset: true });
            }, 250);
        });
    }

    _syncServerEnabledFlag();

    // Attempt server-authoritative subscriptions on page load (allowlisted users).
    _syncSubscriptionsFromServer({ showHintOn403: false }).catch(() => {});
});
