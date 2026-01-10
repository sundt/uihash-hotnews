/**
 * Hotnews Filter Module
 * 关键词过滤
 */

import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const LEGACY_FILTER_STORAGE_KEY = 'hotnews_filter_keywords';
const LEGACY_FILTER_MODE_KEY = 'hotnews_filter_mode_v1';

let _editingCategoryFilterKeywords = [];
let _editingCategoryFilterMode = 'exclude';

function normalizeFilterMode(v) {
    return v === 'include' ? 'include' : 'exclude';
}

export const filter = {
    normalizeFilterMode,

    getCategoryFilterConfig(catId) {
        if (!catId) return { mode: 'exclude', keywords: [] };
        const merged = TR.settings.getMergedCategoryConfig();
        const cf = merged.categoryFilters && merged.categoryFilters[catId];
        const mode = normalizeFilterMode(cf && cf.mode);
        const keywords = Array.isArray(cf && cf.keywords) ? cf.keywords : [];
        return {
            mode,
            keywords: keywords.map(k => String(k || '').trim().toLowerCase()).filter(Boolean)
        };
    },

    applyCategoryFilter(categoryId) {
        const paneEl = document.getElementById(`tab-${categoryId}`);
        if (!paneEl) return;

        const cfg = this.getCategoryFilterConfig(categoryId);
        const mode = cfg.mode;
        const keywords = cfg.keywords;

        const sig = `${mode}|${keywords.join(',')}`;
        const prevSig = paneEl.dataset ? paneEl.dataset.filterSig : null;
        const sigChanged = prevSig !== sig;
        if (paneEl.dataset) paneEl.dataset.filterSig = sig;
        const isBulkLoading = (paneEl.dataset && paneEl.dataset.bulkLoading === '1');

        paneEl.querySelectorAll('.news-item').forEach(item => {
            const title = (item.textContent || '').toLowerCase();
            const matched = keywords.length > 0 ? keywords.some(k => title.includes(k)) : false;
            const shouldFilter = keywords.length === 0 ? false : (mode === 'include' ? !matched : matched);

            if (shouldFilter) item.classList.add('filtered');
            else item.classList.remove('filtered');
        });

        if (mode !== 'include') {
            paneEl.querySelectorAll('.platform-card').forEach(card => {
                card.classList.remove('platform-empty-hidden');
            });
        }

        if (mode === 'include') {
            if (keywords.length > 0) {
                try {
                    if (sigChanged && !isBulkLoading) {
                        paneEl.querySelectorAll('.platform-card').forEach(card => {
                            if (card?.dataset) card.dataset.loadedDone = '0';
                        });
                        if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleBulkLoadCategory === 'function') {
                            TR.infiniteScroll.scheduleBulkLoadCategory(categoryId, { pageSize: 40 });
                        } else if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleEnsureCategoryLoaded === 'function') {
                            const cap = paneEl.querySelectorAll('.platform-card').length;
                            TR.infiniteScroll.scheduleEnsureCategoryLoaded(categoryId, { cap, maxPagesPerCard: 2 });
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }

            paneEl.querySelectorAll('.platform-card').forEach(card => {
                const done = card?.dataset?.loadedDone === '1';
                const isPending = !done || (card?.dataset?.loading === '1');

                if (keywords.length > 0 && isPending) {
                    card.classList.add('platform-empty-hidden');
                    return;
                }

                card.classList.remove('platform-empty-hidden');

                const visibleItems = card.querySelectorAll('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
                if (visibleItems <= 0 && done) {
                    card.classList.add('platform-empty-hidden');
                }
            });
        }

        try {
            const emptyEl = paneEl.querySelector('.category-empty-state');
            if (emptyEl) {
                if (mode === 'include' && keywords.length > 0) {
                    const cards = Array.from(paneEl.querySelectorAll('.platform-card'));
                    const allDone = cards.length > 0 && cards.every(c => (c?.dataset?.loadedDone === '1') && (c?.dataset?.loading !== '1'));
                    const visiblePlatforms = paneEl.querySelectorAll('.platform-card:not(.platform-empty-hidden)').length;
                    emptyEl.style.display = (allDone && visiblePlatforms === 0) ? 'block' : 'none';
                } else {
                    emptyEl.style.display = 'none';
                }
            }
        } catch (e) {
            // ignore
        }

        TR.counts.updateAllCounts();
        if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === 'function') {
            TR.paging.scheduleAutofillActiveTab();
        }
    },

    applyCategoryFilterForActiveTab() {
        const active = document.querySelector('.category-tabs .category-tab.active');
        const catId = active?.dataset?.category;
        if (catId) this.applyCategoryFilter(catId);
    },

    setCategoryFilterEditorState(mode, keywords) {
        _editingCategoryFilterMode = normalizeFilterMode(mode);
        _editingCategoryFilterKeywords = (Array.isArray(keywords) ? keywords : [])
            .map(k => String(k || '').trim().toLowerCase())
            .filter(Boolean);

        const toggle = document.getElementById('categoryFilterModeToggle');
        if (toggle) toggle.checked = _editingCategoryFilterMode === 'include';
        const input = document.getElementById('categoryFilterInput');
        if (input) input.value = '';
        this.renderCategoryFilterTags();
    },

    handleCategoryFilterModeToggle(input) {
        _editingCategoryFilterMode = input && input.checked ? 'include' : 'exclude';
    },

    handleCategoryFilterKeypress(event) {
        if (event.key === 'Enter') {
            this.addCategoryFilterKeyword();
        }
    },

    addCategoryFilterKeyword() {
        const input = document.getElementById('categoryFilterInput');
        const keyword = (input?.value || '').trim().toLowerCase();
        if (!keyword) return;

        if (!_editingCategoryFilterKeywords.includes(keyword)) {
            _editingCategoryFilterKeywords.push(keyword);
            this.renderCategoryFilterTags();
        }
        if (input) input.value = '';
    },

    removeCategoryFilterKeyword(keyword) {
        _editingCategoryFilterKeywords = _editingCategoryFilterKeywords.filter(k => k !== keyword);
        this.renderCategoryFilterTags();
    },

    renderCategoryFilterTags() {
        const tagsEl = document.getElementById('categoryFilterTags');
        if (!tagsEl) return;
        tagsEl.innerHTML = _editingCategoryFilterKeywords.map(k =>
            `<span class="filter-tag">${escapeHtml(k)}<span class="filter-remove" onclick="removeCategoryFilterKeyword('${escapeHtml(k)}')">×</span></span>`
        ).join('');
    },

    getEditingFilterState() {
        return {
            mode: _editingCategoryFilterMode,
            keywords: [..._editingCategoryFilterKeywords]
        };
    },

    migrateLegacyGlobalFilter() {
        const rawKeywords = storage.getRaw(LEGACY_FILTER_STORAGE_KEY);
        const rawMode = storage.getRaw(LEGACY_FILTER_MODE_KEY);
        if (!rawKeywords && !rawMode) return;

        let keywords = [];
        try {
            keywords = rawKeywords ? JSON.parse(rawKeywords) : [];
        } catch (e) {
            keywords = [];
        }
        if (!Array.isArray(keywords)) keywords = [];
        keywords = keywords.map(k => String(k || '').trim().toLowerCase()).filter(Boolean);

        const mode = normalizeFilterMode(rawMode);

        const config = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
        TR.settings.ensureCategoryFilters(config);

        const merged = TR.settings.getMergedCategoryConfig();
        const allIds = merged.categoryOrder || [];
        allIds.forEach((catId) => {
            if (!config.categoryFilters[catId]) {
                config.categoryFilters[catId] = { mode, keywords: [...keywords] };
            }
        });

        TR.settings.saveCategoryConfig(config);

        storage.remove(LEGACY_FILTER_STORAGE_KEY);
        storage.remove(LEGACY_FILTER_MODE_KEY);
    }
};

// 全局函数
window.handleCategoryFilterModeToggle = (input) => filter.handleCategoryFilterModeToggle(input);
window.handleCategoryFilterKeypress = (event) => filter.handleCategoryFilterKeypress(event);
window.addCategoryFilterKeyword = () => filter.addCategoryFilterKeyword();
window.removeCategoryFilterKeyword = (keyword) => filter.removeCategoryFilterKeyword(keyword);

TR.filter = filter;

// 初始化
ready(function() {
    filter.migrateLegacyGlobalFilter();
    filter.applyCategoryFilterForActiveTab();
});
