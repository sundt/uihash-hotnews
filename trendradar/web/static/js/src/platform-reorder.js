import { TR, ready } from './core.js';

function getCategoryIdFromGrid(grid) {
    const pane = grid?.closest?.('.tab-pane');
    const id = pane?.id || '';
    return id.startsWith('tab-') ? id.slice(4) : null;
}

function getClosestCard(grid, x, y) {
    const cards = Array.from(grid.querySelectorAll('.platform-card:not(.dragging)'));
    let best = null;
    let bestDist = Infinity;
    for (const c of cards) {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
            bestDist = d;
            best = { card: c, rect: r, cx, cy };
        }
    }
    return best;
}

function persistPlatformOrder(categoryId, orderedPlatformIds) {
    if (!categoryId || !Array.isArray(orderedPlatformIds)) return;

    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    const merged = TR.settings.getMergedCategoryConfig();

    const mergedCustom = (merged.customCategories || []).find(c => c.id === categoryId);
    if (mergedCustom) {
        const idx = (config.customCategories || []).findIndex(c => c.id === categoryId);
        if (idx >= 0) {
            config.customCategories[idx] = {
                ...config.customCategories[idx],
                platforms: orderedPlatformIds
            };
        }
    } else {
        if (!config.platformOrder || typeof config.platformOrder !== 'object') config.platformOrder = {};
        config.platformOrder[categoryId] = orderedPlatformIds;
    }

    TR.settings.saveCategoryConfig(config);
}

export const platformReorder = {
    _draggingCard: null,
    _draggingPlatformId: null,
    _originGrid: null,
    _originCategoryId: null,
    _autoScrollRaf: null,
    _autoScrollGrid: null,
    _autoScrollDir: 0,
    _autoScrollSpeed: 0,

    attach() {
        if (this._attached) return;
        this._attached = true;

        const AUTO_SCROLL_EDGE_PX = 40;
        const AUTO_SCROLL_MAX_SPEED = 18;

        const stopAutoScroll = () => {
            if (this._autoScrollRaf) {
                cancelAnimationFrame(this._autoScrollRaf);
            }
            this._autoScrollRaf = null;
            this._autoScrollGrid = null;
            this._autoScrollDir = 0;
            this._autoScrollSpeed = 0;
        };

        const ensureAutoScrollLoop = () => {
            if (this._autoScrollRaf) return;
            const tick = () => {
                if (!this._autoScrollGrid || !this._autoScrollDir || !this._autoScrollSpeed) {
                    stopAutoScroll();
                    return;
                }
                const g = this._autoScrollGrid;
                const maxScrollLeft = Math.max(0, (g.scrollWidth || 0) - (g.clientWidth || 0));
                if (maxScrollLeft <= 0) {
                    stopAutoScroll();
                    return;
                }

                const next = Math.max(0, Math.min(maxScrollLeft, (g.scrollLeft || 0) + this._autoScrollDir * this._autoScrollSpeed));
                g.scrollLeft = next;
                this._autoScrollRaf = requestAnimationFrame(tick);
            };
            this._autoScrollRaf = requestAnimationFrame(tick);
        };

        const updateAutoScrollFromEvent = (e, grid) => {
            if (!this._draggingCard || !grid) {
                stopAutoScroll();
                return;
            }
            const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
            if (maxScrollLeft <= 0) {
                stopAutoScroll();
                return;
            }

            const rect = grid.getBoundingClientRect();
            const x = e.clientX;
            const distLeft = x - rect.left;
            const distRight = rect.right - x;

            let dir = 0;
            let dist = 0;
            if (distLeft >= 0 && distLeft <= AUTO_SCROLL_EDGE_PX) {
                dir = -1;
                dist = distLeft;
            } else if (distRight >= 0 && distRight <= AUTO_SCROLL_EDGE_PX) {
                dir = 1;
                dist = distRight;
            } else {
                stopAutoScroll();
                return;
            }

            const intensity = Math.max(0, Math.min(1, (AUTO_SCROLL_EDGE_PX - dist) / AUTO_SCROLL_EDGE_PX));
            const speed = Math.max(1, Math.round((intensity * intensity) * AUTO_SCROLL_MAX_SPEED));

            this._autoScrollGrid = grid;
            this._autoScrollDir = dir;
            this._autoScrollSpeed = speed;
            ensureAutoScrollLoop();
        };

        document.addEventListener('dragstart', (e) => {
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            const card = handle.closest('.platform-card');
            const grid = handle.closest('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);
            const platformId = card?.dataset?.platform || null;
            if (!card || !grid || !categoryId || !platformId) return;

            this._draggingCard = card;
            this._draggingPlatformId = platformId;
            this._originGrid = grid;
            this._originCategoryId = categoryId;
            card.classList.add('dragging');

            e.dataTransfer.effectAllowed = 'move';
            try {
                e.dataTransfer.setData('text/plain', platformId);
            } catch (_) {
            }
        }, true);

        document.addEventListener('dragend', (e) => {
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            const card = handle.closest('.platform-card');
            const grid = handle.closest('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);
            if (!card || !grid || !categoryId) {
                if (this._draggingCard) this._draggingCard.classList.remove('dragging');
                this._draggingCard = null;
                this._draggingPlatformId = null;
                this._originGrid = null;
                this._originCategoryId = null;
                stopAutoScroll();
                return;
            }

            const ordered = Array.from(grid.querySelectorAll('.platform-card')).map(c => c.dataset.platform).filter(Boolean);
            persistPlatformOrder(categoryId, ordered);

            card.classList.remove('dragging');
            this._draggingCard = null;
            this._draggingPlatformId = null;
            this._originGrid = null;
            this._originCategoryId = null;
            stopAutoScroll();
        }, true);

        document.addEventListener('dragover', (e) => {
            const grid = e.target?.closest?.('.platform-grid');
            if (!grid || !this._draggingCard) return;
            if (this._originGrid && grid !== this._originGrid) return;
            const categoryId = getCategoryIdFromGrid(grid);
            if (!categoryId || (this._originCategoryId && categoryId !== this._originCategoryId)) return;

            e.preventDefault();

            updateAutoScrollFromEvent(e, grid);

            const overCard = e.target?.closest?.('.platform-card');
            if (!overCard || overCard === this._draggingCard) return;

            const cards = Array.from(grid.querySelectorAll('.platform-card'));
            const draggingIndex = cards.indexOf(this._draggingCard);
            const overIndex = cards.indexOf(overCard);
            if (draggingIndex < 0 || overIndex < 0 || draggingIndex === overIndex) return;

            if (draggingIndex < overIndex) {
                grid.insertBefore(this._draggingCard, overCard.nextSibling);
            } else {
                grid.insertBefore(this._draggingCard, overCard);
            }
        }, true);

        document.addEventListener('drop', (e) => {
            const grid = e.target?.closest?.('.platform-grid');
            if (!grid || !this._draggingCard) return;
            if (this._originGrid && grid !== this._originGrid) return;
            e.preventDefault();
            stopAutoScroll();
        }, true);
    }
};

TR.platformReorder = platformReorder;

ready(() => {
    platformReorder.attach();
});
