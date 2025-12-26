/**
 * TrendRadar Tabs Module
 * Tab 切换
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const TAB_STORAGE_KEY = 'trendradar_active_tab';

export const tabs = {
    TAB_STORAGE_KEY,

    switchTab(categoryId) {
        TR.badges.dismissNewCategoryBadge(categoryId);
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
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        paneEl.classList.add('active');
        storage.setRaw(TAB_STORAGE_KEY, categoryId);

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
ready(function() {
    tabs.restoreActiveTab();
    tabs.attachPlatformGridScrollPersistence();
    const tabId = tabs.getActiveTabId();
    if (tabId) {
        tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }
});
