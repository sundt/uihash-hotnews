/**
 * Hotnews Filter Module
 * 关键词过滤功能
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};
    const storage = TR.storage;

    const LEGACY_FILTER_STORAGE_KEY = 'hotnews_filter_keywords';
    const LEGACY_FILTER_MODE_KEY = 'hotnews_filter_mode_v1';

    let _editingCategoryFilterKeywords = [];
    let _editingCategoryFilterMode = 'exclude';

    function normalizeFilterMode(v) {
        return v === 'include' ? 'include' : 'exclude';
    }

    TR.filter = {
        normalizeFilterMode: normalizeFilterMode,

        getEditingKeywords: function() { return _editingCategoryFilterKeywords; },
        getEditingMode: function() { return _editingCategoryFilterMode; },
        setEditingKeywords: function(kw) { _editingCategoryFilterKeywords = kw; },
        setEditingMode: function(mode) { _editingCategoryFilterMode = mode; },

        ensureCategoryFilters: function(config) {
            if (!config.categoryFilters || typeof config.categoryFilters !== 'object') {
                config.categoryFilters = {};
            }
        },

        normalizeCategoryConfig: function(config) {
            const base = config && typeof config === 'object' ? config : {};
            if (!Array.isArray(base.customCategories)) base.customCategories = [];
            if (!Array.isArray(base.hiddenDefaultCategories)) base.hiddenDefaultCategories = [];
            if (!Array.isArray(base.categoryOrder)) base.categoryOrder = [];
            if (!base.platformOrder || typeof base.platformOrder !== 'object') base.platformOrder = {};
            this.ensureCategoryFilters(base);
            return base;
        },

        migrateLegacyGlobalFilter: function() {
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
            this.ensureCategoryFilters(config);

            const merged = TR.settings.getMergedCategoryConfig();
            const allIds = merged.categoryOrder || [];
            allIds.forEach(catId => {
                if (!config.categoryFilters[catId]) {
                    config.categoryFilters[catId] = { mode, keywords: [...keywords] };
                }
            });

            TR.settings.saveCategoryConfig(config);

            storage.remove(LEGACY_FILTER_STORAGE_KEY);
            storage.remove(LEGACY_FILTER_MODE_KEY);
        },

        getCategoryFilterConfig: function(catId) {
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

        applyCategoryFilter: function(categoryId) {
            const paneEl = document.getElementById(`tab-${categoryId}`);
            if (!paneEl) return;

            const cfg = this.getCategoryFilterConfig(categoryId);
            const mode = cfg.mode;
            const keywords = cfg.keywords;

            paneEl.querySelectorAll('.news-item').forEach(item => {
                const title = (item.textContent || '').toLowerCase();
                const matched = keywords.length > 0 ? keywords.some(k => title.includes(k)) : false;
                const shouldFilter = keywords.length === 0 ? false : (mode === 'include' ? !matched : matched);

                if (shouldFilter) item.classList.add('filtered');
                else item.classList.remove('filtered');
            });

            paneEl.querySelectorAll('.platform-card').forEach(card => {
                card.classList.remove('platform-empty-hidden');
            });

            if (mode === 'include') {
                paneEl.querySelectorAll('.platform-card').forEach(card => {
                    const visibleItems = card.querySelectorAll('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
                    if (visibleItems <= 0) {
                        card.classList.add('platform-empty-hidden');
                    }
                });
            }

            TR.counts.updateAllCounts();
        },

        applyCategoryFilterForActiveTab: function() {
            const active = document.querySelector('.category-tabs .category-tab.active');
            const catId = active?.dataset?.category;
            if (catId) this.applyCategoryFilter(catId);
        },

        setCategoryFilterEditorState: function(mode, keywords) {
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

        renderCategoryFilterTags: function() {
            const tagsEl = document.getElementById('categoryFilterTags');
            if (!tagsEl) return;
            tagsEl.innerHTML = _editingCategoryFilterKeywords.map(k =>
                `<span class="filter-tag">${TR.escapeHtml(k)}<span class="filter-remove" onclick="removeCategoryFilterKeyword('${TR.escapeHtml(k)}')">×</span></span>`
            ).join('');
        }
    };

    // === 全局函数 ===
    global.handleCategoryFilterModeToggle = function(input) {
        _editingCategoryFilterMode = input && input.checked ? 'include' : 'exclude';
    };

    global.handleCategoryFilterKeypress = function(event) {
        if (event.key === 'Enter') {
            addCategoryFilterKeyword();
        }
    };

    global.addCategoryFilterKeyword = function() {
        const input = document.getElementById('categoryFilterInput');
        const keyword = (input?.value || '').trim().toLowerCase();
        if (!keyword) return;

        if (!_editingCategoryFilterKeywords.includes(keyword)) {
            _editingCategoryFilterKeywords.push(keyword);
            TR.filter.renderCategoryFilterTags();
        }
        if (input) input.value = '';
    };

    global.removeCategoryFilterKeyword = function(keyword) {
        _editingCategoryFilterKeywords = _editingCategoryFilterKeywords.filter(k => k !== keyword);
        TR.filter.renderCategoryFilterTags();
    };

    // === 初始化 ===
    TR.ready(function() {
        TR.filter.migrateLegacyGlobalFilter();
    });

})(window);
