import { TR, ready } from './core.js';

function _getOrderedCategoryIdsFromDom(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('.category-tab'))
        .map((el) => String(el?.dataset?.category || '').trim())
        .filter(Boolean);
}

function _persistCategoryOrder(orderedCategoryIds) {
    if (!Array.isArray(orderedCategoryIds) || orderedCategoryIds.length === 0) return;

    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    // Preserve non-visible categories (e.g., hidden defaults) by only reordering the
    // visible subset within the existing order.
    const merged = TR.settings.getMergedCategoryConfig();
    const existingOrder = Array.isArray(merged?.categoryOrder) && merged.categoryOrder.length > 0
        ? merged.categoryOrder.slice()
        : orderedCategoryIds.slice();

    const visibleSet = new Set(orderedCategoryIds);
    let idx = 0;
    const nextOrder = existingOrder.map((catId) => {
        const id = String(catId || '').trim();
        if (!id) return id;
        if (!visibleSet.has(id)) return id;
        const next = orderedCategoryIds[idx];
        idx += 1;
        return next;
    });
    config.categoryOrder = nextOrder;
    config.__migrated_explore_ai_front_v1 = Date.now();
    config.__migrated_explore_knowledge_front_v1 = Date.now();
    TR.settings.saveCategoryConfig(config);
}

function _reorderTabPanes(orderedCategoryIds) {
    const contentEl = document.querySelector('.tab-content-area');
    if (!contentEl) return;

    const panes = new Map();
    contentEl.querySelectorAll('.tab-pane').forEach((p) => {
        const id = String(p?.id || '');
        if (id.startsWith('tab-')) {
            panes.set(id.slice(4), p);
        }
    });

    const frag = document.createDocumentFragment();
    for (const catId of orderedCategoryIds) {
        const pane = panes.get(catId);
        if (pane) frag.appendChild(pane);
    }

    // Keep any remaining panes (if any) appended (safety).
    for (const [catId, pane] of panes.entries()) {
        if (!orderedCategoryIds.includes(catId)) {
            frag.appendChild(pane);
        }
    }

    contentEl.appendChild(frag);
}

function _ensureTabHandles() {
    const tabsEl = document.querySelector('.category-tabs');
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.category-tab').forEach((tab) => {
        try {
            tab.setAttribute('draggable', 'false');
            let handle = tab.querySelector(':scope > .category-drag-handle');
            if (!handle) {
                handle = document.createElement('span');
                handle.className = 'category-drag-handle';
                handle.setAttribute('title', '拖拽调整栏目顺序');
                handle.setAttribute('draggable', 'true');
                handle.textContent = '☰';
                tab.insertBefore(handle, tab.firstChild);
            } else {
                handle.setAttribute('draggable', 'true');
            }
        } catch (e) {
            // ignore
        }
    });
}

function _observeTabRerenders() {
    const tabsEl = document.querySelector('.category-tabs');
    if (!tabsEl) return;
    try {
        const obs = new MutationObserver(() => {
            _ensureTabHandles();
        });
        obs.observe(tabsEl, { childList: true, subtree: true });
    } catch (e) {
        // ignore
    }
}

function _enableLongPressHint() {
    // Minimal mobile-friendly behavior: long-press on tab bar reveals drag handles for a short time.
    const root = document.body;
    if (!root) return;

    let timer = 0;
    let hideTimer = 0;
    let active = false;

    const clearTimers = () => {
        if (timer) {
            window.clearTimeout(timer);
            timer = 0;
        }
        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = 0;
        }
    };

    const hide = () => {
        active = false;
        root.classList.remove('category-tabs-drag-mode');
    };

    document.addEventListener(
        'pointerdown',
        (e) => {
            const tabs = e.target?.closest?.('.category-tabs');
            if (!tabs) return;
            const tab = e.target?.closest?.('.category-tab');
            if (!tab) return;
            const handle = e.target?.closest?.('.category-drag-handle');
            if (handle) return;

            clearTimers();
            timer = window.setTimeout(() => {
                active = true;
                root.classList.add('category-tabs-drag-mode');
                hideTimer = window.setTimeout(() => {
                    hide();
                }, 2500);
            }, 380);
        },
        true
    );

    const cancel = () => {
        clearTimers();
        if (active) hide();
    };

    document.addEventListener('pointerup', cancel, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('scroll', cancel, true);
}

export const categoryTabReorder = {
    _attached: false,
    _draggingTab: null,
    _originTabsEl: null,

    attach() {
        if (this._attached) return;
        this._attached = true;

        _ensureTabHandles();
        _observeTabRerenders();
        _enableLongPressHint();

        // Prevent clicking the tab when user interacts with the handle.
        document.addEventListener(
            'click',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;
                e.preventDefault();
                e.stopPropagation();
            },
            true
        );

        document.addEventListener(
            'dragstart',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;

                const tab = handle.closest('.category-tab');
                const tabsEl = handle.closest('.category-tabs');
                const catId = tab?.dataset?.category;
                if (!tab || !tabsEl || !catId) return;

                this._draggingTab = tab;
                this._originTabsEl = tabsEl;
                tab.classList.add('dragging');

                e.dataTransfer.effectAllowed = 'move';
                try {
                    e.dataTransfer.setData('text/plain', String(catId));
                } catch (_) {
                }
            },
            true
        );

        document.addEventListener(
            'dragover',
            (e) => {
                const tabsEl = e.target?.closest?.('.category-tabs');
                if (!tabsEl || !this._draggingTab) return;
                if (this._originTabsEl && tabsEl !== this._originTabsEl) return;

                const overTab = e.target?.closest?.('.category-tab');
                if (!overTab || overTab === this._draggingTab) return;

                e.preventDefault();

                const tabs = Array.from(tabsEl.querySelectorAll('.category-tab'));
                const draggingIndex = tabs.indexOf(this._draggingTab);
                const overIndex = tabs.indexOf(overTab);
                if (draggingIndex < 0 || overIndex < 0 || draggingIndex === overIndex) return;

                if (draggingIndex < overIndex) {
                    tabsEl.insertBefore(this._draggingTab, overTab.nextSibling);
                } else {
                    tabsEl.insertBefore(this._draggingTab, overTab);
                }
            },
            true
        );

        document.addEventListener(
            'drop',
            (e) => {
                const tabsEl = e.target?.closest?.('.category-tabs');
                if (!tabsEl || !this._draggingTab) return;
                if (this._originTabsEl && tabsEl !== this._originTabsEl) return;
                e.preventDefault();
            },
            true
        );

        document.addEventListener(
            'dragend',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;

                const tabsEl = handle.closest('.category-tabs');
                if (!tabsEl || !this._draggingTab) {
                    if (this._draggingTab) this._draggingTab.classList.remove('dragging');
                    this._draggingTab = null;
                    this._originTabsEl = null;
                    return;
                }

                const ordered = _getOrderedCategoryIdsFromDom(tabsEl);
                _persistCategoryOrder(ordered);
                _reorderTabPanes(ordered);

                this._draggingTab.classList.remove('dragging');
                this._draggingTab = null;
                this._originTabsEl = null;
            },
            true
        );
    }
};

TR.categoryTabReorder = categoryTabReorder;

ready(() => {
    categoryTabReorder.attach();
});
