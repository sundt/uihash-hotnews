/**
 * Hotnews Tabs Module
 * Tab 切换
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const TAB_STORAGE_KEY = 'hotnews_active_tab';
const VIEWER_POS_STORAGE_KEY = 'hotnews_viewer_pos_v1';
const EXPLORE_TAB_ID = 'explore';
const TAB_SWITCHED_EVENT = 'tr_tab_switched';
const EXPLORE_MODAL_OPENED_EVENT = 'tr_explore_modal_opened';
const EXPLORE_MODAL_CLOSED_EVENT = 'tr_explore_modal_closed';

let _explorePrevTabId = null;
let _explorePrevScrollY = 0;

function _persistViewerPos(tabId, scrollY) {
    try {
        const t = String(tabId || '').trim();
        if (!t) return;
        const payload = {
            activeTab: t,
            scrollY: Number(scrollY || 0) || 0,
            updatedAt: Date.now(),
        };
        storage.setRaw(VIEWER_POS_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // ignore
    }
}

function _recordBeforeExploreModalOpen() {
    try {
        const prev = tabs.getActiveTabId();
        _explorePrevTabId = prev ? String(prev) : null;
        _explorePrevScrollY = window.scrollY || 0;
        try {
            const grid = _explorePrevTabId ? document.querySelector(`#tab-${_explorePrevTabId} .platform-grid`) : null;
            if (_explorePrevTabId && grid) {
                TR.scroll.recordPlatformGridScrollForTab(_explorePrevTabId, grid);
            }
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    }
}

function _restoreViewerPosIfAny() {
    try {
        const raw = storage.getRaw(VIEWER_POS_STORAGE_KEY);
        if (!raw) return;
        const pos = JSON.parse(raw);
        const tabId = String(pos?.activeTab || '').trim();
        if (!tabId) return;

        const escaped = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(tabId)) : String(tabId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
        if (!tabEl) return;

        tabs.switchTab(tabId);
        const y = Number(pos?.scrollY || 0) || 0;
        requestAnimationFrame(() => {
            try {
                window.scrollTo({ top: y, behavior: 'auto' });
            } catch (e) {
                // ignore
            }
        });
    } catch (e) {
        // ignore
    }
}

function _openExploreModal() {
    try {
        if (TR.rssCatalogPreview && typeof TR.rssCatalogPreview.open === 'function') {
            TR.rssCatalogPreview.open();
            return;
        }
    } catch (e) {
        // ignore
    }
    try {
        if (typeof window.openRssCatalogPreviewModal === 'function') {
            window.openRssCatalogPreviewModal();
        }
    } catch (e) {
        // ignore
    }
}

function _restoreFromExploreModal() {
    const prevTabId = _explorePrevTabId;
    const prevScrollY = _explorePrevScrollY;
    _explorePrevTabId = null;
    _explorePrevScrollY = 0;

    if (!prevTabId) return;

    try {
        const escaped = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(prevTabId)) : String(prevTabId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
        const paneEl = document.getElementById(`tab-${prevTabId}`);
        if (!tabEl || !paneEl) return;
    } catch (e) {
        // ignore
    }

    try {
        TR.tabs.switchTab(prevTabId);
    } catch (e) {
        // ignore
    }

    _persistViewerPos(prevTabId, prevScrollY);

    requestAnimationFrame(() => {
        try {
            window.scrollTo({ top: prevScrollY, behavior: 'auto' });
        } catch (e) {
            // ignore
        }
        try {
            TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: prevTabId });
        } catch (e) {
            // ignore
        }
    });
}

export const tabs = {
    TAB_STORAGE_KEY,

    switchTab(categoryId) {
        TR.badges.dismissNewCategoryBadge(categoryId);
        document.body.classList.toggle('tr-rss-reading', String(categoryId) === 'rsscol-rss');
        const escapedCategoryId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(categoryId)) : String(categoryId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escapedCategoryId}"]`);
        const paneEl = document.getElementById(`tab-${categoryId}`);
        if (!tabEl || !paneEl) {
            const firstTab = document.querySelector('.category-tab');
            if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
                this.switchTab(firstTab.dataset.category);
            } else {
                storage.remove(TAB_STORAGE_KEY);
            }
            return;
        }

        // Check if this tab has update indicator (red dot)
        const updateDot = tabEl.querySelector('.update-dot.show');
        const hasUpdate = !!updateDot;

        // Hide the red dot
        if (updateDot) {
            updateDot.classList.remove('show');
        }

        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        paneEl.classList.add('active');
        storage.setRaw(TAB_STORAGE_KEY, categoryId);

        try {
            window.dispatchEvent(new CustomEvent(TAB_SWITCHED_EVENT, { detail: { categoryId } }));
        } catch (e) {
        }

        _persistViewerPos(categoryId, window.scrollY || 0);

        TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: categoryId });

        if (categoryId === 'sports') {
            TR.badges.markFeatureSeen('sports-nba-schedule');
            TR.badges.updateNewBadges();
        }

        TR.filter.applyCategoryFilter(categoryId);

        if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === 'function') {
            TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
        }

        try {
            const hasItems = !!paneEl.querySelector('.news-item');
            const hasPlaceholder = !!paneEl.querySelector('.news-placeholder');
            const shouldLoad = !hasItems && hasPlaceholder;

            if (shouldLoad) {
                if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleBulkLoadCategory === 'function') {
                    TR.infiniteScroll.scheduleBulkLoadCategory(categoryId);
                } else if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleEnsureCategoryLoaded === 'function') {
                    TR.infiniteScroll.scheduleEnsureCategoryLoaded(categoryId);
                }
            }
        } catch (e) {
            // ignore
        }
    },

    restoreActiveTab() {
        const savedTab = storage.getRaw(TAB_STORAGE_KEY);
        if (savedTab) {
            try {
                const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
                if (isE2E && String(savedTab) === 'rsscol-rss') {
                    storage.remove(TAB_STORAGE_KEY);
                    return;
                }
            } catch (e) {
                // ignore
            }
            const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
            if (tabEl) {
                this.switchTab(savedTab);
            }
        }
    },

    getActiveTabId() {
        return storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
    },

    restoreActiveTabPlatformGridScroll(state) {
        TR.scroll.restoreActiveTabPlatformGridScroll(state);
    },

    attachPlatformGridScrollPersistence() {
        TR.scroll.attachPlatformGridScrollPersistence();
    }
};

// 全局函数
window.switchTab = (categoryId) => tabs.switchTab(categoryId);

TR.tabs = tabs;

// 初始化
ready(function () {
    try {
        window.addEventListener(EXPLORE_MODAL_OPENED_EVENT, () => {
            _recordBeforeExploreModalOpen();
        });
        window.addEventListener(EXPLORE_MODAL_CLOSED_EVENT, () => {
            _restoreFromExploreModal();
        });
    } catch (e) {
        // ignore
    }
    tabs.restoreActiveTab();
    _restoreViewerPosIfAny();
    tabs.attachPlatformGridScrollPersistence();
    const tabId = tabs.getActiveTabId();
    if (tabId) {
        tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }
});
