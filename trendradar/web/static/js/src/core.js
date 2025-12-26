/**
 * TrendRadar Core Module
 * 核心工具函数和命名空间
 */

// 全局命名空间
export const TR = window.TrendRadar = window.TrendRadar || {};

// Ready 机制
const readyHandlers = [];
let isReady = false;

export function ready(handler) {
    if (isReady) {
        handler();
    } else {
        readyHandlers.push(handler);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    isReady = true;
    readyHandlers.forEach(h => {
        try { h(); } catch (e) { console.error('Ready handler error:', e); }
    });
});

// 工具函数
export function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function formatUpdatedAt(value) {
    const raw = (value == null) ? '' : String(value).trim();
    if (!raw) return raw;

    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
    if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;

    const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (m2) return raw;

    return raw;
}

// 挂载到 TR 命名空间
TR.ready = ready;
TR.escapeHtml = escapeHtml;
TR.formatUpdatedAt = formatUpdatedAt;

const _toastState = {
    container: null,
    nextId: 1,
    items: new Map(),
};

function _getToastContainer() {
    if (_toastState.container) return _toastState.container;
    const el = document.createElement('div');
    el.id = 'tr-toast-container';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '10px';
    el.style.zIndex = '99999';
    try {
        document.body.appendChild(el);
    } catch (e) {
        // ignore
    }
    _toastState.container = el;
    return el;
}

function _toastStyleForVariant(variant) {
    const v = String(variant || 'info');
    if (v === 'loading') {
        return { bg: '#111827', fg: '#fff', border: '#111827' };
    }
    if (v === 'success') {
        return { bg: '#16a34a', fg: '#fff', border: '#16a34a' };
    }
    if (v === 'error') {
        return { bg: '#dc2626', fg: '#fff', border: '#dc2626' };
    }
    return { bg: '#111827', fg: '#fff', border: '#111827' };
}

function _renderToast(el, message, variant) {
    const styles = _toastStyleForVariant(variant);
    el.className = 'tr-toast';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '10px';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '10px';
    el.style.background = styles.bg;
    el.style.color = styles.fg;
    el.style.border = `1px solid ${styles.border}`;
    el.style.boxShadow = '0 10px 20px rgba(0,0,0,0.18)';
    el.style.fontSize = '0.9rem';
    el.style.maxWidth = '360px';
    el.style.wordBreak = 'break-word';

    const v = String(variant || 'info');
    const prefix = (v === 'loading') ? '<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,0.3);"></span>' : '';
    el.innerHTML = `${prefix}<div class="tr-toast-msg">${escapeHtml(message || '')}</div>`;
}

TR.toast = {
    show(message, opts = {}) {
        const id = `toast-${_toastState.nextId++}`;
        const container = _getToastContainer();
        const el = document.createElement('div');
        el.dataset.toastId = id;
        _renderToast(el, message, opts.variant);
        try {
            container.appendChild(el);
        } catch (e) {
            // ignore
        }
        const item = {
            id,
            el,
            hideTimer: 0,
        };
        _toastState.items.set(id, item);
        const durationMs = Number(opts.durationMs || 0);
        if (durationMs > 0) {
            item.hideTimer = window.setTimeout(() => {
                TR.toast.hide(id);
            }, durationMs);
        }
        return id;
    },
    update(id, message, opts = {}) {
        const item = _toastState.items.get(String(id || ''));
        if (!item) return;
        if (item.hideTimer) {
            window.clearTimeout(item.hideTimer);
            item.hideTimer = 0;
        }
        _renderToast(item.el, message, opts.variant);
        const durationMs = Number(opts.durationMs || 0);
        if (durationMs > 0) {
            item.hideTimer = window.setTimeout(() => {
                TR.toast.hide(id);
            }, durationMs);
        }
    },
    hide(id) {
        const item = _toastState.items.get(String(id || ''));
        if (!item) return;
        if (item.hideTimer) {
            window.clearTimeout(item.hideTimer);
            item.hideTimer = 0;
        }
        try {
            item.el.remove();
        } catch (e) {
            // ignore
        }
        _toastState.items.delete(String(id || ''));
    }
};
