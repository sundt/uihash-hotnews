import { TR, ready } from './core.js';

function getCategoryIdFromGrid(grid) {
    const pane = grid?.closest?.('.tab-pane');
    const id = pane?.id || '';
    return id.startsWith('tab-') ? id.slice(4) : null;
}

function getClosestCard(grid, x, y) {
    const cards = Array.from(grid.querySelectorAll('.platform-card:not(.dragging):not(.platform-card-placeholder)'));
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
    _pointerId: null,
    _ghostEl: null,
    _placeholderEl: null,
    _ghostRaf: null,
    _ghostClientX: 0,
    _ghostClientY: 0,
    _ghostOffsetX: 0,
    _ghostOffsetY: 0,
    _prevUserSelect: null,
    _autoScrollRaf: null,
    _autoScrollGrid: null,
    _autoScrollDir: 0,
    _autoScrollSpeed: 0,
    _reorderRaf: null,
    _reorderGrid: null,
    _reorderX: 0,
    _reorderY: 0,
    _reorderOverCard: null,

    attach() {
        if (this._attached) return;
        this._attached = true;

        const AUTO_SCROLL_EDGE_PX = 80;  // Increased from 40 for easier long-distance dragging
        const AUTO_SCROLL_MAX_SPEED = 35; // Increased from 18 for faster scrolling
        const RAPID_SCROLL_BASE_PX_PER_S = 1400;
        const RAPID_SCROLL_MAX_PX_PER_S = 5200;
        const RAPID_SCROLL_ACCEL_PX_PER_S2 = 5200;

        let leftArrow = null;
        let rightArrow = null;
        let rapidScrollRaf = null;

        const createEdgeArrows = () => {
            if (leftArrow || rightArrow) return;

            leftArrow = document.createElement('div');
            leftArrow.className = 'tr-drag-edge-arrow tr-drag-edge-arrow-left';
            leftArrow.innerHTML = '◀';
            leftArrow.style.cssText = `
                position: fixed;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.9) 0%, rgba(99, 102, 241, 0.3) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 0 12px 12px 0;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `;
            leftArrow.style.opacity = '0.25';

            rightArrow = document.createElement('div');
            rightArrow.className = 'tr-drag-edge-arrow tr-drag-edge-arrow-right';
            rightArrow.innerHTML = '▶';
            rightArrow.style.cssText = `
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.9) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 12px 0 0 12px;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `;
            rightArrow.style.opacity = '0.25';

            document.body.appendChild(leftArrow);
            document.body.appendChild(rightArrow);
        };

        const removeEdgeArrows = () => {
            if (leftArrow) {
                leftArrow.remove();
                leftArrow = null;
            }
            if (rightArrow) {
                rightArrow.remove();
                rightArrow = null;
            }
            if (rapidScrollRaf) {
                cancelAnimationFrame(rapidScrollRaf);
                rapidScrollRaf = null;
            }
        };

        const startRapidScroll = (direction, grid) => {
            if (rapidScrollRaf) cancelAnimationFrame(rapidScrollRaf);

            let startTs = 0;
            let lastTs = 0;
            const scroll = (ts) => {
                if (!grid) return;
                if (!startTs) startTs = ts;
                if (!lastTs) lastTs = ts;

                const dt = Math.max(0, ts - lastTs);
                lastTs = ts;
                const elapsed = Math.max(0, ts - startTs);

                const speed = Math.min(
                    RAPID_SCROLL_MAX_PX_PER_S,
                    RAPID_SCROLL_BASE_PX_PER_S + (elapsed / 1000) * RAPID_SCROLL_ACCEL_PX_PER_S2
                );

                const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
                const delta = direction * speed * (dt / 1000);
                const next = Math.max(0, Math.min(maxScrollLeft, (grid.scrollLeft || 0) + delta));
                grid.scrollLeft = next;

                // Continue scrolling
                rapidScrollRaf = requestAnimationFrame(scroll);
            };

            rapidScrollRaf = requestAnimationFrame(scroll);
        };

        const stopRapidScroll = () => {
            if (rapidScrollRaf) {
                cancelAnimationFrame(rapidScrollRaf);
                rapidScrollRaf = null;
            }
        };

        const setEdgeArrowActive = (leftActive, rightActive) => {
            if (leftArrow) leftArrow.style.opacity = leftActive ? '1' : '0.25';
            if (rightArrow) rightArrow.style.opacity = rightActive ? '1' : '0.25';
        };

        const stopAutoScroll = () => {
            if (this._autoScrollRaf) {
                cancelAnimationFrame(this._autoScrollRaf);
            }
            this._autoScrollRaf = null;
            this._autoScrollGrid = null;
            this._autoScrollDir = 0;
            this._autoScrollSpeed = 0;
        };

        const stopGhostMove = () => {
            if (this._ghostRaf) cancelAnimationFrame(this._ghostRaf);
            this._ghostRaf = null;
        };

        const scheduleGhostMove = (clientX, clientY) => {
            this._ghostClientX = clientX;
            this._ghostClientY = clientY;
            if (this._ghostRaf) return;
            this._ghostRaf = requestAnimationFrame(() => {
                this._ghostRaf = null;
                if (!this._ghostEl) return;
                const x = this._ghostClientX - this._ghostOffsetX;
                const y = this._ghostClientY - this._ghostOffsetY;
                this._ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            });
        };

        const ensureAutoScrollLoop = () => {
            if (this._autoScrollRaf) return;
            let lastTs = 0;
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

                const now = performance.now();
                if (!lastTs) lastTs = now;
                const dt = Math.max(0, now - lastTs);
                lastTs = now;

                const scaled = this._autoScrollSpeed * (dt / 16.6667);
                const next = Math.max(0, Math.min(maxScrollLeft, (g.scrollLeft || 0) + this._autoScrollDir * scaled));
                g.scrollLeft = next;
                this._autoScrollRaf = requestAnimationFrame(tick);
            };
            this._autoScrollRaf = requestAnimationFrame(tick);
        };

        const updateAutoScrollFromEvent = (e, grid) => {
            if (!this._draggingCard || !grid) {
                stopAutoScroll();
                setEdgeArrowActive(false, false);
                stopRapidScroll();
                return 'none';
            }

            // Check if mouse is over edge arrows
            const x = e.clientX;
            if (leftArrow && rightArrow) {
                const leftRect = leftArrow.getBoundingClientRect();
                const rightRect = rightArrow.getBoundingClientRect();

                if (x >= leftRect.left && x <= leftRect.right) {
                    setEdgeArrowActive(true, false);
                    stopAutoScroll();
                    startRapidScroll(-1, grid);
                    return 'arrow';
                } else if (x >= rightRect.left && x <= rightRect.right) {
                    setEdgeArrowActive(false, true);
                    stopAutoScroll();
                    startRapidScroll(1, grid);
                    return 'arrow';
                } else {
                    stopRapidScroll();
                }
            }

            const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
            if (maxScrollLeft <= 0) {
                stopAutoScroll();
                setEdgeArrowActive(false, false);
                return 'none';
            }

            const rect = grid.getBoundingClientRect();
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
                setEdgeArrowActive(false, false);
                stopAutoScroll();
                return 'none';
            }

            setEdgeArrowActive(dir === -1, dir === 1);

            const intensity = Math.max(0, Math.min(1, (AUTO_SCROLL_EDGE_PX - dist) / AUTO_SCROLL_EDGE_PX));
            const speed = Math.max(1, Math.round((intensity * intensity) * AUTO_SCROLL_MAX_SPEED));

            this._autoScrollGrid = grid;
            this._autoScrollDir = dir;
            this._autoScrollSpeed = speed;
            ensureAutoScrollLoop();
            return 'edge';
        };

        const stopReorder = () => {
            if (this._reorderRaf) cancelAnimationFrame(this._reorderRaf);
            this._reorderRaf = null;
            this._reorderGrid = null;
            this._reorderOverCard = null;
        };

        const ensureReorderLoop = () => {
            if (this._reorderRaf) return;
            const tick = () => {
                this._reorderRaf = null;
                const grid = this._reorderGrid;
                const moving = this._placeholderEl || this._draggingCard;
                if (!grid || !moving) return;

                let target = this._reorderOverCard;
                if (!target || target === moving || !grid.contains(target) || target.classList?.contains?.('platform-card-placeholder')) {
                    const best = getClosestCard(grid, this._reorderX, this._reorderY);
                    target = best?.card || null;
                }
                if (!target || target === moving) return;

                const r = target.getBoundingClientRect();
                const before = this._reorderX < (r.left + r.width / 2);
                const ref = before ? target : target.nextSibling;
                if (ref === moving || ref === moving.nextSibling) return;
                grid.insertBefore(moving, ref);
            };
            this._reorderRaf = requestAnimationFrame(tick);
        };

        const scheduleReorderFromEvent = (e, grid, overCard) => {
            if (!this._draggingCard || !grid) return;
            this._reorderGrid = grid;
            this._reorderX = e.clientX;
            this._reorderY = e.clientY;
            this._reorderOverCard = overCard;
            ensureReorderLoop();
        };

        const cleanupPointerDrag = () => {
            if (this._ghostEl) {
                this._ghostEl.remove();
                this._ghostEl = null;
            }
            stopGhostMove();

            if (this._prevUserSelect != null) {
                document.body.style.userSelect = this._prevUserSelect;
                this._prevUserSelect = null;
            }

            if (this._draggingCard) this._draggingCard.classList.remove('dragging');
            this._draggingCard = null;
            this._draggingPlatformId = null;
            this._originGrid = null;
            this._originCategoryId = null;
            this._pointerId = null;
            this._placeholderEl = null;
            stopAutoScroll();
            stopRapidScroll();
            stopReorder();
            setEdgeArrowActive(false, false);
            removeEdgeArrows();
        };

        const endPointerDrag = () => {
            const grid = this._originGrid;
            const categoryId = this._originCategoryId;
            const card = this._draggingCard;
            const placeholder = this._placeholderEl;

            if (card && placeholder && placeholder.parentNode) {
                placeholder.replaceWith(card);
            }

            if (grid && categoryId) {
                const ordered = Array.from(grid.querySelectorAll('.platform-card')).map(c => c.dataset.platform).filter(Boolean);
                persistPlatformOrder(categoryId, ordered);
            }

            cleanupPointerDrag();
        };

        document.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            const card = handle.closest('.platform-card');
            const grid = handle.closest('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);
            const platformId = card?.dataset?.platform || null;
            if (!card || !grid || !categoryId || !platformId) return;

            e.preventDefault();

            this._prevUserSelect = document.body.style.userSelect;
            document.body.style.userSelect = 'none';

            handle.style.touchAction = 'none';
            try {
                handle.setPointerCapture(e.pointerId);
            } catch (_) {
            }

            this._pointerId = e.pointerId;
            this._draggingCard = card;
            this._draggingPlatformId = platformId;
            this._originGrid = grid;
            this._originCategoryId = categoryId;

            const rect = card.getBoundingClientRect();
            this._ghostOffsetX = e.clientX - rect.left;
            this._ghostOffsetY = e.clientY - rect.top;

            const placeholder = document.createElement('div');
            placeholder.className = 'platform-card platform-card-placeholder';
            placeholder.style.width = rect.width + 'px';
            placeholder.style.height = rect.height + 'px';
            placeholder.style.boxSizing = 'border-box';
            placeholder.style.border = '2px dashed rgba(99, 102, 241, 0.6)';
            placeholder.style.borderRadius = '12px';
            placeholder.style.background = 'rgba(99, 102, 241, 0.06)';
            this._placeholderEl = placeholder;

            if (card.parentNode) {
                card.parentNode.replaceChild(placeholder, card);
            }

            const ghost = card.cloneNode(true);
            ghost.classList.add('dragging');
            ghost.style.position = 'fixed';
            ghost.style.left = '0';
            ghost.style.top = '0';
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.margin = '0';
            ghost.style.zIndex = '10001';
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.92';
            ghost.style.willChange = 'transform';
            ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
            this._ghostEl = ghost;
            document.body.appendChild(ghost);

            createEdgeArrows();
            setEdgeArrowActive(false, false);
            card.classList.add('dragging');

            scheduleGhostMove(e.clientX, e.clientY);
        }, true);

        document.addEventListener('pointermove', (e) => {
            if (!this._draggingCard || this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;

            e.preventDefault();
            scheduleGhostMove(e.clientX, e.clientY);

            const grid = this._originGrid;
            if (!grid) return;

            const scrollMode = updateAutoScrollFromEvent(e, grid);
            if (scrollMode !== 'none') {
                stopReorder();
                return;
            }

            const gridRect = grid.getBoundingClientRect();
            const inside = e.clientX >= gridRect.left && e.clientX <= gridRect.right && e.clientY >= gridRect.top && e.clientY <= gridRect.bottom;
            if (!inside) {
                stopReorder();
                return;
            }

            const el = document.elementFromPoint(e.clientX, e.clientY);
            const overCard = el?.closest?.('.platform-card');
            if (overCard && overCard.classList?.contains?.('platform-card-placeholder')) {
                scheduleReorderFromEvent(e, grid, null);
                return;
            }
            scheduleReorderFromEvent(e, grid, overCard);
        }, true);

        document.addEventListener('pointerup', (e) => {
            if (this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;
            e.preventDefault();
            endPointerDrag();
        }, true);

        document.addEventListener('pointercancel', (e) => {
            if (this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;
            e.preventDefault();
            endPointerDrag();
        }, true);

        document.addEventListener('dragstart', (e) => {
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            e.preventDefault();
        }, true);

        // ======================================
        // Context Menu: Move to Top / Bottom
        // ======================================
        let contextMenuEl = null;

        const hideContextMenu = () => {
            if (contextMenuEl && contextMenuEl.parentNode) {
                contextMenuEl.parentNode.removeChild(contextMenuEl);
            }
            contextMenuEl = null;
        };

        const showContextMenu = (e, card, grid, categoryId) => {
            hideContextMenu();

            contextMenuEl = document.createElement('div');
            contextMenuEl.className = 'tr-platform-context-menu';
            contextMenuEl.innerHTML = `
                <div class="tr-ctx-item" data-action="top">⬆️ 置顶</div>
                <div class="tr-ctx-item" data-action="bottom">⬇️ 置底</div>
                <div class="tr-ctx-item" data-action="edit" style="border-top:1px solid #e5e7eb;">⚙️ 编辑顺序</div>
            `;
            contextMenuEl.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                min-width: 120px;
                overflow: hidden;
            `;

            const itemStyle = `
                padding: 10px 16px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.15s;
            `;
            contextMenuEl.querySelectorAll('.tr-ctx-item').forEach(item => {
                item.style.cssText = itemStyle;
                item.addEventListener('mouseenter', () => item.style.background = '#f3f4f6');
                item.addEventListener('mouseleave', () => item.style.background = 'white');
            });

            contextMenuEl.addEventListener('click', (ev) => {
                const action = ev.target?.dataset?.action;
                if (!action) return;

                if (action === 'edit') {
                    // Open settings modal and navigate to the category
                    hideContextMenu();
                    if (window.openCategorySettings) {
                        window.openCategorySettings();
                        // Wait for modal to open, then trigger edit for this category
                        setTimeout(() => {
                            try {
                                if (TR.settings && typeof TR.settings.editCategory === 'function') {
                                    TR.settings.editCategory(categoryId);
                                }
                            } catch (e) {
                                console.error('Failed to edit category:', e);
                            }
                        }, 100);
                    }
                    return;
                }

                const cards = Array.from(grid.querySelectorAll('.platform-card'));
                if (action === 'top') {
                    grid.insertBefore(card, cards[0]);
                } else if (action === 'bottom') {
                    grid.appendChild(card);
                }

                // Save order
                const ordered = Array.from(grid.querySelectorAll('.platform-card')).map(c => c.dataset.platform).filter(Boolean);
                persistPlatformOrder(categoryId, ordered);

                hideContextMenu();
            });

            document.body.appendChild(contextMenuEl);

            // Adjust position if off-screen
            const rect = contextMenuEl.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                contextMenuEl.style.left = (window.innerWidth - rect.width - 8) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                contextMenuEl.style.top = (window.innerHeight - rect.height - 8) + 'px';
            }
        };

        document.addEventListener('click', (e) => {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) {
                hideContextMenu();
            }
        }, true);

        document.addEventListener('contextmenu', (e) => {
            // Only trigger on drag handle or platform header
            const handle = e.target?.closest?.('.platform-drag-handle');
            const header = e.target?.closest?.('.platform-header');
            if (!handle && !header) return;

            const card = e.target?.closest?.('.platform-card');
            const grid = e.target?.closest?.('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);

            if (!card || !grid || !categoryId) return;

            // Exclude special categories: explore and knowledge (morning brief)
            if (categoryId === 'explore' || categoryId === 'knowledge') return;

            e.preventDefault();
            showContextMenu(e, card, grid, categoryId);
        }, true);
    }
};

TR.platformReorder = platformReorder;

ready(() => {
    platformReorder.attach();
});
