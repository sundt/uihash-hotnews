import { ready } from './core.js';

function normalizeTarget(t) {
    const node = t;
    if (!node) return null;
    if (node.nodeType === 3) return node.parentElement || null;
    return node;
}

function isScrollableX(el) {
    if (!el) return false;
    const sw = el.scrollWidth || 0;
    const cw = el.clientWidth || 0;
    return sw > cw + 1;
}

function findPlatformGridFromTarget(t) {
    const el = normalizeTarget(t);
    const card = el?.closest?.('.platform-card');
    const grid = card?.closest?.('.platform-grid');
    return grid || null;
}

function isInTitleArea(t) {
    const el = normalizeTarget(t);
    if (!el?.closest) return false;
    if (el.closest('.platform-drag-handle')) return false;
    return !!el.closest('.platform-header') || !!el.closest('.platform-name');
}

ready(() => {
    const DRAG_THRESHOLD_PX = 6;

    let activePointerId = null;
    let activeIsMouse = false;
    let activeGrid = null;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressClickUntil = 0;

    const clear = () => {
        activePointerId = null;
        activeIsMouse = false;
        activeGrid = null;
        startX = 0;
        startScrollLeft = 0;
        didDrag = false;
        try { document.body.classList.remove('tr-platform-title-dragging'); } catch (_) {}
    };

    const beginDrag = (target, clientX) => {
        if (!isInTitleArea(target)) return false;
        if (document.querySelector('.platform-card.dragging')) return false;

        const grid = findPlatformGridFromTarget(target);
        if (!grid || !isScrollableX(grid)) return false;

        activeGrid = grid;
        startX = clientX;
        startScrollLeft = grid.scrollLeft || 0;
        didDrag = false;
        try { document.body.classList.add('tr-platform-title-dragging'); } catch (_) {}
        return true;
    };

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const target = normalizeTarget(e.target);
        if (!beginDrag(target, e.clientX)) return;
        activePointerId = e.pointerId;
    }, { passive: true });

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (activePointerId !== null) return;
        const target = normalizeTarget(e.target);
        if (!beginDrag(target, e.clientX)) return;
        activeIsMouse = true;
    }, { passive: true });

    document.addEventListener('pointermove', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        if (!activeGrid) return;
        if (document.querySelector('.platform-card.dragging')) {
            clear();
            return;
        }

        const dx = e.clientX - startX;
        if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

        didDrag = true;
        try { e.preventDefault(); } catch (_) {}

        const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
        const next = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));
        activeGrid.scrollLeft = next;
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
        if (!activeIsMouse) return;
        if (!activeGrid) return;
        if (document.querySelector('.platform-card.dragging')) {
            clear();
            return;
        }

        const dx = e.clientX - startX;
        if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

        didDrag = true;
        try { e.preventDefault(); } catch (_) {}

        const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
        const next = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));
        activeGrid.scrollLeft = next;
    }, { passive: false });

    const onPointerEnd = () => {
        if (activePointerId === null) return;
        if (didDrag) suppressClickUntil = Date.now() + 600;
        clear();
    };

    document.addEventListener('pointerup', onPointerEnd, { passive: true });
    document.addEventListener('pointercancel', onPointerEnd, { passive: true });

    document.addEventListener('mouseup', () => {
        if (!activeIsMouse) return;
        if (didDrag) suppressClickUntil = Date.now() + 600;
        clear();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        const now = Date.now();
        if (now > suppressClickUntil) return;
        const target = normalizeTarget(e.target);
        if (!isInTitleArea(target)) return;
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        try { e.stopImmediatePropagation(); } catch (_) {}
    }, true);

    document.addEventListener('wheel', (e) => {
        const target = normalizeTarget(e.target);
        if (!e.shiftKey) return;
        if (!isInTitleArea(target)) return;
        if (document.querySelector('.platform-card.dragging')) return;

        const grid = findPlatformGridFromTarget(target);
        if (!grid || !isScrollableX(grid)) return;

        const delta = (typeof e.deltaX === 'number' && e.deltaX !== 0) ? e.deltaX : e.deltaY;
        if (!delta) return;

        try { e.preventDefault(); } catch (_) {}

        const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
        const next = Math.max(0, Math.min(maxScrollLeft, (grid.scrollLeft || 0) + delta));
        grid.scrollLeft = next;
    }, { passive: false });
});
