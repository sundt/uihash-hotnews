/**
 * Hotnews Tabs Module
 * Tab 切换和滚动恢复
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};
    const storage = TR.storage;

    const TAB_STORAGE_KEY = 'hotnews_active_tab';
    const SCROLL_STORAGE_KEY = 'hotnews_platform_grid_scroll';

    TR.tabs = {
        TAB_STORAGE_KEY: TAB_STORAGE_KEY,

        switchTab: function(categoryId) {
            TR.badges.dismissNewCategoryBadge(categoryId);
            const escapedCategoryId = TR.cssEscape(String(categoryId));
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
            
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tabEl.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            paneEl.classList.add('active');
            
            storage.setRaw(TAB_STORAGE_KEY, categoryId);

            this.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: categoryId });

            if (categoryId === 'sports') {
                TR.badges.markFeatureSeen('sports-nba-schedule');
                TR.badges.updateNewBadges();
            }

            TR.filter.applyCategoryFilter(categoryId);
        },

        restoreActiveTab: function() {
            const savedTab = storage.getRaw(TAB_STORAGE_KEY);
            if (savedTab) {
                const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
                if (tabEl) {
                    this.switchTab(savedTab);
                }
            }
        },

        // === 滚动位置管理 ===
        getScrollState: function() {
            return storage.get(SCROLL_STORAGE_KEY, {});
        },

        saveScrollState: function(state) {
            storage.set(SCROLL_STORAGE_KEY, state);
        },

        restoreActiveTabPlatformGridScroll: function(opts) {
            const state = this.getScrollState();
            const activeTab = opts?.activeTab || storage.getRaw(TAB_STORAGE_KEY);
            if (!activeTab) return;

            const pane = document.getElementById(`tab-${activeTab}`);
            if (!pane) return;

            const grid = pane.querySelector('.platform-grid');
            if (!grid) return;

            const savedScroll = state[activeTab];
            if (typeof savedScroll === 'number' && opts?.preserveScroll) {
                grid.scrollLeft = savedScroll;
            }
        },

        attachPlatformGridScrollPersistence: function() {
            document.querySelectorAll('.tab-pane').forEach(pane => {
                const catId = pane.id.replace('tab-', '');
                const grid = pane.querySelector('.platform-grid');
                if (!grid) return;

                grid.addEventListener('scroll', () => {
                    const state = this.getScrollState();
                    state[catId] = grid.scrollLeft;
                    this.saveScrollState(state);
                });
            });
        }
    };

    // === 全局函数 ===
    global.switchTab = function(categoryId) {
        TR.tabs.switchTab(categoryId);
    };

    // === 初始化 ===
    TR.ready(function() {
        TR.tabs.restoreActiveTab();
        TR.tabs.attachPlatformGridScrollPersistence();
        
        const tabId = storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
        if (tabId) {
            TR.tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
        }
        
        TR.filter.applyCategoryFilterForActiveTab();
    });

})(window);
