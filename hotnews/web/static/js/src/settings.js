/**
 * Hotnews Settings Module
 * 栏目配置管理
 */

import { TR, ready, escapeHtml } from './core.js';
import { storage } from './storage.js';

const CATEGORY_CONFIG_KEY = 'hotnews_categories_config';
const CATEGORY_CONFIG_VERSION = 1;

let _defaultCategories = null;
let _allPlatforms = null;
let _editingCategoryId = null;
let _isAddingNew = false;
let _settingsHideDefaultCategories = false;
let _settingsCategoryListCollapsed = true;
let _settingsAllCategoriesOffSnapshot = null;
let _platformSearchQuery = '';
let _categoryConfigChanged = false;

function promoteCategoryOrder(order, desiredFront) {
    const base = Array.isArray(order) ? order : [];
    const seen = new Set();
    const cleaned = [];
    base.forEach((x) => {
        const id = String(x || '').trim();
        if (!id) return;
        if (seen.has(id)) return;
        seen.add(id);
        cleaned.push(id);
    });

    const front = Array.isArray(desiredFront) ? desiredFront : [];
    front.forEach((id) => {
        const idx = cleaned.indexOf(id);
        if (idx >= 0) cleaned.splice(idx, 1);
    });

    for (let i = front.length - 1; i >= 0; i -= 1) {
        const id = String(front[i] || '').trim();
        if (!id) continue;
        cleaned.unshift(id);
    }

    return cleaned;
}

function ensureCategoryFilters(config) {
    if (!config.categoryFilters || typeof config.categoryFilters !== 'object') {
        config.categoryFilters = {};
    }
}

function normalizeCategoryConfig(config) {
    const base = config && typeof config === 'object' ? config : {};
    if (!Array.isArray(base.customCategories)) base.customCategories = [];
    if (!Array.isArray(base.hiddenDefaultCategories)) base.hiddenDefaultCategories = [];
    if (!Array.isArray(base.hiddenPlatforms)) base.hiddenPlatforms = [];
    if (!Array.isArray(base.categoryOrder)) base.categoryOrder = [];
    if (!base.platformOrder || typeof base.platformOrder !== 'object') base.platformOrder = {};
    ensureCategoryFilters(base);
    return base;
}

export const settings = {
    CATEGORY_CONFIG_KEY,

    ensureCategoryFilters,
    normalizeCategoryConfig,

    getCategoryConfig() {
        try {
            const raw = storage.getRaw(CATEGORY_CONFIG_KEY);
            if (!raw) return null;
            const config = JSON.parse(raw);
            if (config.version !== CATEGORY_CONFIG_VERSION) {
                return null;
            }
            return normalizeCategoryConfig(config);
        } catch (e) {
            return null;
        }
    },

    saveCategoryConfig(config) {
        config.version = CATEGORY_CONFIG_VERSION;
        storage.setRaw(CATEGORY_CONFIG_KEY, JSON.stringify(config));
        this.syncConfigToCookie(config);
    },

    syncConfigToCookie(config) {
        try {
            const maxAge = 365 * 24 * 60 * 60;
            const hasCustom = (config.customCategories?.length > 0) ||
                (config.hiddenDefaultCategories?.length > 0) ||
                (config.hiddenPlatforms?.length > 0) ||
                (config.categoryOrder?.length > 0);

            if (hasCustom) {
                document.cookie = `hotnews_has_config=1; path=/; max-age=${maxAge}; SameSite=Lax`;
            } else {
                document.cookie = `hotnews_has_config=; path=/; max-age=0`;
            }
        } catch (e) {
            console.error('Failed to sync config to cookie:', e);
        }
    },

    getDefaultCategoryConfig() {
        if (!_defaultCategories) {
            _defaultCategories = {};
            _allPlatforms = {};
            document.querySelectorAll('.category-tab').forEach(tab => {
                const catId = tab.dataset.category;
                const icon = tab.querySelector('.category-tab-icon')?.textContent?.trim() || '📁';
                const name = tab.querySelector('.category-tab-name')?.textContent?.replace(/NEW$/, '')?.trim() || catId;
                _defaultCategories[catId] = { id: catId, name, icon, isDefault: true };
            });
            document.querySelectorAll('.platform-card:not(.tr-morning-brief-card)').forEach(card => {
                const platformId = card.dataset.platform;
                const platformName = (card.querySelector('.platform-name')?.textContent || '')
                    .replace(/NEW\s*$/i, '')
                    .replace(/📱\s*/g, '')
                    .trim() || platformId;
                const tabPane = card.closest('.tab-pane');
                const catId = tabPane?.id?.replace('tab-', '') || 'other';
                _allPlatforms[platformId] = { id: platformId, name: platformName, defaultCategory: catId };
                if (_defaultCategories[catId]) {
                    if (!_defaultCategories[catId].platforms) _defaultCategories[catId].platforms = [];
                    _defaultCategories[catId].platforms.push(platformId);
                }
            });
        }
        return {
            version: CATEGORY_CONFIG_VERSION,
            customCategories: [],
            hiddenDefaultCategories: [],
            hiddenPlatforms: [],
            categoryOrder: Object.keys(_defaultCategories),
            platformOrder: {},
            categoryFilters: {}
        };
    },

    getMergedCategoryConfig() {
        const defaultConfig = this.getDefaultCategoryConfig();
        const userConfig = this.getCategoryConfig();
        if (!userConfig) return defaultConfig;

        const merged = {
            ...defaultConfig,
            customCategories: userConfig.customCategories || [],
            hiddenDefaultCategories: userConfig.hiddenDefaultCategories || [],
            hiddenPlatforms: userConfig.hiddenPlatforms || [],
            categoryOrder: userConfig.categoryOrder || defaultConfig.categoryOrder,
            platformOrder: userConfig.platformOrder || {},
            categoryFilters: userConfig.categoryFilters || {}
        };

        // Get server's category order (already sorted by sort_order from backend)
        const serverOrder = Object.keys(_defaultCategories);

        // Insert missing categories at their proper position based on server order
        serverOrder.forEach((catId, serverIndex) => {
            if (!merged.categoryOrder.includes(catId)) {
                // Find the best position: after the last server category that exists in user order
                // and appears before this one in server order
                let insertIndex = merged.categoryOrder.length; // default: end
                for (let i = serverIndex - 1; i >= 0; i--) {
                    const prevCatId = serverOrder[i];
                    const prevUserIndex = merged.categoryOrder.indexOf(prevCatId);
                    if (prevUserIndex !== -1) {
                        insertIndex = prevUserIndex + 1;
                        break;
                    }
                }
                merged.categoryOrder.splice(insertIndex, 0, catId);
            }
        });

        merged.customCategories.forEach(cat => {
            if (!merged.categoryOrder.includes(cat.id)) {
                merged.categoryOrder.push(cat.id);
            }
        });

        try {
            const flagKey = '__migrated_explore_knowledge_front_v1';
            const idxExplore = Array.isArray(userConfig.categoryOrder) ? userConfig.categoryOrder.indexOf('explore') : -1;
            const idxKnowledge = Array.isArray(userConfig.categoryOrder) ? userConfig.categoryOrder.indexOf('knowledge') : -1;
            const needsPromote = (idxExplore !== 0) || (idxKnowledge !== 1);
            if (!userConfig[flagKey] && needsPromote) {
                const promoted = promoteCategoryOrder(merged.categoryOrder, ['explore', 'knowledge']);
                merged.categoryOrder = promoted;
                userConfig.categoryOrder = promoted;
                userConfig[flagKey] = Date.now();
                this.saveCategoryConfig(userConfig);
            }
        } catch (e) {
            // ignore
        }

        return merged;
    },

    getDefaultCategories() {
        return _defaultCategories;
    },

    getAllPlatforms() {
        return _allPlatforms;
    },

    addPlatformToCustomCategory(customCategoryId, platformId) {
        const catId = String(customCategoryId || '').trim();
        const pid = String(platformId || '').trim();
        if (!catId || !pid) return false;

        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        ensureCategoryFilters(config);

        const idx = Array.isArray(config.customCategories)
            ? config.customCategories.findIndex((c) => String(c?.id || '').trim() === catId)
            : -1;
        if (idx < 0) return false;

        const cat = config.customCategories[idx] || {};
        const platforms = Array.isArray(cat.platforms) ? [...cat.platforms] : [];
        if (!platforms.includes(pid)) {
            platforms.push(pid);
        }

        config.customCategories[idx] = {
            ...cat,
            platforms
        };

        if (Array.isArray(config.categoryOrder) && !config.categoryOrder.includes(catId)) {
            config.categoryOrder.unshift(catId);
        }

        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
        return true;
    },

    setDefaultCategories(categories) {
        _defaultCategories = categories;
    },

    setAllPlatforms(platforms) {
        _allPlatforms = platforms;
    },

    async openCategorySettings() {
        // 隐藏 NEW 标记并记录到 localStorage
        const newBadge = document.getElementById('categorySettingsNewBadge');
        if (newBadge) {
            newBadge.style.display = 'none';
            localStorage.setItem('category_settings_badge_dismissed', 'true');
        }
        // Always fetch fresh categories to ensure admin-added categories appear
        try {
            const response = await fetch('/api/news');
            const data = await response.json();
            if (data?.categories) {
                _defaultCategories = {};
                _allPlatforms = {};
                Object.entries(data.categories).forEach(([catId, cat]) => {
                    _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
                    Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                        _allPlatforms[pid] = { id: pid, name: p.name, defaultCategory: catId, data: p };
                    });
                });
            }
        } catch (e) {
            console.error('Failed to fetch categories:', e);
        }
        const modal = document.getElementById('categorySettingsModal');
        modal.classList.add('show');
        _settingsCategoryListCollapsed = true;
        _settingsAllCategoriesOffSnapshot = null;
        this.applyCategoryListCollapseState();
        this.renderCategoryList();
        this.hideEditPanel();
    },

    applyCategoryListCollapseState() {
        const wrapper = document.getElementById('categoryListWrapper');
        if (wrapper) {
            if (_settingsCategoryListCollapsed) wrapper.classList.add('collapsed');
            else wrapper.classList.remove('collapsed');
        }

        const btn = document.getElementById('categoryListToggleBtn');
        if (btn) {
            btn.textContent = _settingsCategoryListCollapsed ? '展开栏目列表' : '收起栏目列表';
        }
    },

    toggleCategoryListCollapseInSettings() {
        _settingsCategoryListCollapsed = !_settingsCategoryListCollapsed;
        this.applyCategoryListCollapseState();
    },

    closeCategorySettings() {
        const modal = document.getElementById('categorySettingsModal');
        modal.classList.remove('show');
        if (_categoryConfigChanged) {
            _categoryConfigChanged = false;
            this.applyCategoryConfig();
        }
    },

    saveCategorySettings() {
        const editPanel = document.getElementById('categoryEditPanel');
        const isEditing = editPanel && editPanel.classList.contains('show');
        if (isEditing) {
            const ok = this.saveCategory();
            if (!ok) return;
        }
        this.closeCategorySettings();
    },

    cancelCategorySettings() {
        _categoryConfigChanged = false;
        const modal = document.getElementById('categorySettingsModal');
        modal.classList.remove('show');
    },

    renderCategoryList() {
        const container = document.getElementById('categoryList');
        const config = this.getMergedCategoryConfig();

        let html = '';
        config.categoryOrder.forEach(catId => {
            const isCustom = config.customCategories.find(c => c.id === catId);
            const isHidden = config.hiddenDefaultCategories.includes(catId);

            let cat;
            if (isCustom) {
                cat = isCustom;
            } else if (_defaultCategories[catId]) {
                cat = _defaultCategories[catId];
            } else {
                return;
            }

            const platformCount = isCustom ? (cat.platforms?.length || 0) : (_defaultCategories[catId]?.platforms?.length || 0);

            html += `
                <div class="category-item ${isCustom ? 'custom' : ''}" data-category-id="${catId}" draggable="true">
                    <span class="category-item-drag">☰</span>
                    <span class="category-item-name">${cat.name}</span>
                    <span class="category-item-platforms">${platformCount} 个平台</span>
                    <label class="category-item-toggle">
                        <input type="checkbox" ${!isHidden ? 'checked' : ''} onchange="toggleCategoryVisibility('${catId}')">
                        <span class="slider"></span>
                    </label>
                    <div class="category-item-actions">
                        <button class="category-item-btn" onclick="editCategory('${catId}')">编辑</button>
                        ${isCustom ? `<button class="category-item-btn delete" onclick="deleteCategory('${catId}')">删除</button>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        const allOffEl = document.getElementById('allCategoriesOffToggle');
        if (allOffEl) {
            const hidden = config.hiddenDefaultCategories || [];
            const allIds = config.categoryOrder || [];
            allOffEl.checked = allIds.length > 0 && allIds.every(id => hidden.includes(id));
        }

        if (_settingsHideDefaultCategories) {
            container.classList.add('hide-default');
        } else {
            container.classList.remove('hide-default');
        }

        this.setupCategoryDragAndDrop();
    },

    toggleDefaultCategoryListInSettings() {
        _settingsHideDefaultCategories = !_settingsHideDefaultCategories;
        this.renderCategoryList();
    },

    toggleAllCategoriesOffInSettings(input) {
        // 该入口在 UI 中已移除（保留函数避免旧页面/缓存脚本调用时报错）
        return;
    },

    setupCategoryDragAndDrop() {
        const container = document.getElementById('categoryList');
        const items = container.querySelectorAll('.category-item');

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.saveCategoryOrder();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        container.insertBefore(dragging, item);
                    } else {
                        container.insertBefore(dragging, item.nextSibling);
                    }
                }
            });
        });
    },

    saveCategoryOrder() {
        const container = document.getElementById('categoryList');
        const items = container.querySelectorAll('.category-item');
        const order = Array.from(items).map(item => item.dataset.categoryId);

        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        config.categoryOrder = order;
        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
    },

    toggleCategoryVisibility(catId) {
        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        const idx = config.hiddenDefaultCategories.indexOf(catId);
        if (idx >= 0) {
            config.hiddenDefaultCategories.splice(idx, 1);
        } else {
            config.hiddenDefaultCategories.push(catId);
        }
        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
        this.renderCategoryList();
    },

    togglePlatformHidden(platformId) {
        const pid = String(platformId || '').trim();
        if (!pid) return false;
        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        if (!Array.isArray(config.hiddenPlatforms)) config.hiddenPlatforms = [];

        const idx = config.hiddenPlatforms.findIndex((x) => String(x || '').trim() === pid);
        if (idx >= 0) {
            config.hiddenPlatforms.splice(idx, 1);
        } else {
            config.hiddenPlatforms.push(pid);
        }

        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
        this.applyCategoryConfig();
        return true;
    },

    showAddCategoryPanel() {
        _isAddingNew = true;
        _editingCategoryId = null;

        _settingsCategoryListCollapsed = true;
        this.applyCategoryListCollapseState();

        _settingsHideDefaultCategories = true;

        document.getElementById('editCategoryName').value = '';
        const platformField = document.getElementById('platformSelectField');
        if (platformField) platformField.style.display = '';
        const searchEl = document.getElementById('platformSearchInput');
        if (searchEl) searchEl.value = '';
        _platformSearchQuery = '';

        this.renderPlatformSelectList([], true);

        TR.filter.setCategoryFilterEditorState('exclude', []);

        document.getElementById('categoryEditPanel').classList.add('show');
    },

    editCategory(catId) {
        _isAddingNew = false;
        _editingCategoryId = catId;

        const platformField = document.getElementById('platformSelectField');
        if (platformField) platformField.style.display = '';

        const config = this.getMergedCategoryConfig();
        const isCustom = config.customCategories.find(c => c.id === catId);

        let cat, platforms;
        if (isCustom) {
            cat = isCustom;
            platforms = cat.platforms || [];
        } else {
            cat = _defaultCategories[catId];
            platforms = config.platformOrder[catId] || cat.platforms || [];
        }

        document.getElementById('editCategoryName').value = cat.name;

        this.renderPlatformSelectList(platforms, isCustom);

        const fc = TR.filter.getCategoryFilterConfig(catId);
        TR.filter.setCategoryFilterEditorState(fc.mode, fc.keywords);

        _settingsHideDefaultCategories = true;
        _settingsCategoryListCollapsed = true;
        this.applyCategoryListCollapseState();
        const searchEl = document.getElementById('platformSearchInput');
        if (searchEl) searchEl.value = '';
        _platformSearchQuery = '';

        document.getElementById('categoryEditPanel').classList.add('show');
    },

    hideEditPanel() {
        document.getElementById('categoryEditPanel').classList.remove('show');
        _editingCategoryId = null;
        _isAddingNew = false;

        // 重置隐藏默认栏目的状态
        _settingsHideDefaultCategories = false;
        this.renderCategoryList();

        const searchEl = document.getElementById('platformSearchInput');
        if (searchEl) searchEl.value = '';
        _platformSearchQuery = '';
    },

    cancelEditCategory() {
        this.hideEditPanel();
    },

    renderPlatformSelectList(selectedPlatforms, isCustomCategory = false) {
        const container = document.getElementById('platformSelectList');

        const merged = this.getMergedCategoryConfig();
        const hiddenPlatforms = (merged.hiddenPlatforms || []).map((x) => String(x || '').trim()).filter(Boolean);
        const hiddenSet = new Set(hiddenPlatforms);

        const sortedPlatforms = [];
        selectedPlatforms.forEach(pid => {
            if (_allPlatforms[pid]) sortedPlatforms.push(pid);
        });

        if (isCustomCategory) {
            const allPlatformIds = Object.keys(_allPlatforms);
            allPlatformIds.forEach(pid => {
                if (!sortedPlatforms.includes(pid)) sortedPlatforms.push(pid);
            });
        }

        const query = (_platformSearchQuery || '').trim().toLowerCase();
        const visiblePlatforms = query
            ? sortedPlatforms.filter(pid => (_allPlatforms[pid]?.name || '').toLowerCase().includes(query))
            : sortedPlatforms;

        const disableDrag = query.length > 0;

        container.innerHTML = visiblePlatforms.map(pid => {
            const p = _allPlatforms[pid];
            const isSelected = selectedPlatforms.includes(pid) && !hiddenSet.has(String(pid || '').trim());
            return `
                <label class="platform-select-item ${isSelected ? 'selected' : ''} ${disableDrag ? 'no-drag' : ''}" data-platform-id="${pid}" draggable="${disableDrag ? 'false' : 'true'}">
                    <span class="drag-handle">☰</span>
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePlatformSelect('${pid}')">
                    <span>${p.name}</span>
                </label>
            `;
        }).join('');

        if (!disableDrag) {
            this.setupPlatformDragAndDrop();
        }
    },

    setPlatformSearchQuery(query) {
        _platformSearchQuery = String(query || '');
        const platforms = this.getSelectedPlatforms();
        this.renderPlatformSelectList(platforms, _isAddingNew === true);
    },

    bulkSelectPlatforms(mode) {
        const container = document.getElementById('platformSelectList');
        if (!container) return;

        const items = container.querySelectorAll('.platform-select-item');
        items.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (mode === 'all') {
                item.classList.add('selected');
                if (checkbox) checkbox.checked = true;
            } else if (mode === 'none' || mode === 'clear') {
                item.classList.remove('selected');
                if (checkbox) checkbox.checked = false;
            }
        });
    },

    setupPlatformDragAndDrop() {
        const container = document.getElementById('platformSelectList');
        const items = container.querySelectorAll('.platform-select-item');

        // Auto-scroll state
        const AUTO_SCROLL_EDGE_PX = 60;
        const AUTO_SCROLL_MAX_SPEED = 20;
        let autoScrollRaf = null;
        let autoScrollDir = 0;
        let autoScrollSpeed = 0;

        const stopAutoScroll = () => {
            if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
            autoScrollRaf = null;
            autoScrollDir = 0;
            autoScrollSpeed = 0;
        };

        const runAutoScroll = () => {
            if (!autoScrollDir || !autoScrollSpeed) {
                stopAutoScroll();
                return;
            }
            const maxScroll = Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
            if (maxScroll <= 0) {
                stopAutoScroll();
                return;
            }
            const next = Math.max(0, Math.min(maxScroll, (container.scrollTop || 0) + autoScrollDir * autoScrollSpeed));
            container.scrollTop = next;
            autoScrollRaf = requestAnimationFrame(runAutoScroll);
        };

        const updateAutoScroll = (e) => {
            const rect = container.getBoundingClientRect();
            const y = e.clientY;
            const distTop = y - rect.top;
            const distBottom = rect.bottom - y;

            let dir = 0, dist = 0;
            if (distTop >= 0 && distTop <= AUTO_SCROLL_EDGE_PX) {
                dir = -1;
                dist = distTop;
            } else if (distBottom >= 0 && distBottom <= AUTO_SCROLL_EDGE_PX) {
                dir = 1;
                dist = distBottom;
            } else {
                stopAutoScroll();
                return;
            }

            const intensity = Math.max(0, Math.min(1, (AUTO_SCROLL_EDGE_PX - dist) / AUTO_SCROLL_EDGE_PX));
            autoScrollSpeed = Math.max(2, Math.round(intensity * intensity * AUTO_SCROLL_MAX_SPEED));
            autoScrollDir = dir;

            if (!autoScrollRaf) {
                autoScrollRaf = requestAnimationFrame(runAutoScroll);
            }
        };

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                stopAutoScroll();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                updateAutoScroll(e);

                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        container.insertBefore(dragging, item);
                    } else {
                        container.insertBefore(dragging, item.nextSibling);
                    }
                }
            });
        });

        // Container-level dragover for continuous auto-scroll (especially at edges)
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            // Only run auto-scroll if something is being dragged
            if (container.querySelector('.dragging')) {
                updateAutoScroll(e);
            }
        });
    },

    togglePlatformSelect(platformId) {
        const item = document.querySelector(`.platform-select-item[data-platform-id="${platformId}"]`);
        if (item) {
            item.classList.toggle('selected');
        }
    },

    getSelectedPlatforms() {
        const items = document.querySelectorAll('.platform-select-item');
        const selected = [];
        items.forEach(item => {
            if (item.classList.contains('selected')) {
                selected.push(item.dataset.platformId);
            }
        });
        return selected;
    },

    getOrderedPlatforms() {
        const items = document.querySelectorAll('.platform-select-item');
        const ordered = [];
        items.forEach(item => {
            const pid = String(item?.dataset?.platformId || '').trim();
            if (pid) ordered.push(pid);
        });
        return ordered;
    },

    saveCategory() {
        const name = document.getElementById('editCategoryName').value.trim();
        const icon = '📱';
        const platforms = this.getSelectedPlatforms();
        const orderedPlatforms = this.getOrderedPlatforms();

        if (!name) {
            alert('请输入栏目名称');
            return false;
        }

        if (platforms.length === 0) {
            alert('请至少选择一个平台');
            return false;
        }

        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        ensureCategoryFilters(config);

        const filterState = TR.filter.getEditingFilterState();

        if (_isAddingNew) {
            const newId = 'custom-' + Date.now();
            config.customCategories.push({
                id: newId,
                name,
                icon,
                platforms,
                isCustom: true
            });
            config.categoryOrder.unshift(newId);

            config.categoryFilters[newId] = {
                mode: filterState.mode,
                keywords: [...filterState.keywords]
            };
        } else if (_editingCategoryId) {
            const customIdx = config.customCategories.findIndex(c => c.id === _editingCategoryId);
            if (customIdx >= 0) {
                config.customCategories[customIdx] = {
                    ...config.customCategories[customIdx],
                    name,
                    icon,
                    platforms
                };
            } else {
                config.platformOrder[_editingCategoryId] = orderedPlatforms;

                if (!Array.isArray(config.hiddenPlatforms)) config.hiddenPlatforms = [];
                const hiddenSet = new Set((config.hiddenPlatforms || []).map((x) => String(x || '').trim()).filter(Boolean));
                orderedPlatforms.forEach((pid) => {
                    if (!pid) return;
                    if (platforms.includes(pid)) {
                        hiddenSet.delete(pid);
                    } else {
                        hiddenSet.add(pid);
                    }
                });
                config.hiddenPlatforms = Array.from(hiddenSet);
            }

            config.categoryFilters[_editingCategoryId] = {
                mode: filterState.mode,
                keywords: [...filterState.keywords]
            };
        }

        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
        this.hideEditPanel();
        this.renderCategoryList();

        _settingsCategoryListCollapsed = false;
        this.applyCategoryListCollapseState();

        return true;
    },

    deleteCategory(catId) {
        if (!confirm('确定要删除这个自定义栏目吗？')) return;

        const config = this.getCategoryConfig() || this.getDefaultCategoryConfig();
        config.customCategories = config.customCategories.filter(c => c.id !== catId);
        config.categoryOrder = config.categoryOrder.filter(id => id !== catId);
        delete config.platformOrder[catId];

        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;
        this.renderCategoryList();
    },

    resetDefaultCategoryConfig() {
        if (!confirm('确定要初始化默认栏目与卡片吗？自定义栏目将保留。')) return;

        const userConfig = this.getCategoryConfig();
        if (!userConfig) {
            this.renderCategoryList();
            this.applyCategoryConfig();
            return;
        }

        const defaultConfig = this.getDefaultCategoryConfig();
        const defaultIds = Array.isArray(defaultConfig?.categoryOrder) ? defaultConfig.categoryOrder : [];
        const defaultSet = new Set(defaultIds.map((x) => String(x || '').trim()).filter(Boolean));

        const config = userConfig;

        config.hiddenDefaultCategories = (config.hiddenDefaultCategories || []).filter((id) => !defaultSet.has(String(id || '').trim()));
        config.hiddenPlatforms = [];
        config.platformOrder = {};

        // Reset category order back to current defaults, while preserving custom categories.
        // This ensures changes in server-side default ordering take effect when user clicks "初始化".
        const customIds = Array.isArray(config.customCategories)
            ? config.customCategories.map((c) => String(c?.id || '').trim()).filter(Boolean)
            : [];
        const nextOrder = defaultIds.slice();
        for (const cid of customIds) {
            if (!nextOrder.includes(cid)) nextOrder.push(cid);
        }
        config.categoryOrder = nextOrder;

        this.saveCategoryConfig(config);
        _categoryConfigChanged = true;

        this.renderCategoryList();
        this.applyCategoryConfig();
    },

    resetCategoryConfig() {
        if (!confirm('确定要恢复默认栏目配置吗？所有自定义栏目将被删除。')) return;

        storage.remove(CATEGORY_CONFIG_KEY);
        _defaultCategories = null;
        _allPlatforms = null;

        this.renderCategoryList();
        this.applyCategoryConfig();
    },

    applyCategoryConfig() {
        TR.data.refreshViewerData({ preserveScroll: false });
    },

    applyCategoryConfigToData(serverCategories) {
        const merged = this.getMergedCategoryConfig();

        if (!_defaultCategories) {
            _defaultCategories = {};
            _allPlatforms = {};
            Object.entries(serverCategories).forEach(([catId, cat]) => {
                _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
                Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                    _allPlatforms[pid] = { id: pid, name: p.name, defaultCategory: catId, data: p };
                });
            });
        } else {
            Object.entries(serverCategories).forEach(([catId, cat]) => {
                if (!_defaultCategories[catId]) {
                    _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
                } else {
                    if (!_defaultCategories[catId].platforms) _defaultCategories[catId].platforms = [];
                    const existingPlatforms = new Set(_defaultCategories[catId].platforms || []);
                    Object.keys(cat.platforms || {}).forEach((pid) => {
                        if (!existingPlatforms.has(pid)) {
                            _defaultCategories[catId].platforms.push(pid);
                        }
                    });
                }

                Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                    if (!_allPlatforms[pid]) {
                        _allPlatforms[pid] = { id: pid, name: p.name, defaultCategory: catId, data: p };
                    }
                });
            });
        }

        const allPlatformData = {};
        Object.values(serverCategories).forEach(cat => {
            Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                allPlatformData[pid] = p;
            });
        });

        const result = {};
        const hiddenCategories = merged.hiddenDefaultCategories || [];
        const hiddenPlatforms = (merged.hiddenPlatforms || []).map((x) => String(x || '').trim()).filter(Boolean);
        const hiddenPlatformSet = new Set(hiddenPlatforms);
        const categoryOrder = merged.categoryOrder || Object.keys(serverCategories);
        const customCategories = merged.customCategories || [];
        const platformOrder = merged.platformOrder || {};

        categoryOrder.forEach(catId => {
            if (hiddenCategories.includes(catId)) return;

            if (String(catId || '').startsWith('rsscol-')) return;

            const customCat = customCategories.find(c => c.id === catId);
            if (customCat) {
                const platforms = {};
                (customCat.platforms || []).forEach(pid => {
                    if (hiddenPlatformSet.has(String(pid || '').trim())) return;
                    if (allPlatformData[pid]) {
                        platforms[pid] = allPlatformData[pid];
                    }
                });
                result[catId] = {
                    name: customCat.name,
                    icon: '📱',
                    platforms: platforms
                };
            } else if (serverCategories[catId]) {
                const serverCat = serverCategories[catId];
                const userPlatformOrder = platformOrder[catId];

                if (userPlatformOrder && userPlatformOrder.length > 0) {
                    const inOrder = [];
                    const inOrderSet = new Set();
                    userPlatformOrder.forEach(pid => {
                        if (hiddenPlatformSet.has(String(pid || '').trim())) return;
                        if (serverCat.platforms && serverCat.platforms[pid]) {
                            inOrder.push(pid);
                            inOrderSet.add(pid);
                        }
                    });

                    const rssMissing = [];
                    const otherMissing = [];
                    Object.keys(serverCat.platforms || {}).forEach(pid => {
                        if (inOrderSet.has(pid)) return;
                        if (hiddenPlatformSet.has(String(pid || '').trim())) return;
                        if (String(pid || '').startsWith('rss-')) {
                            rssMissing.push(pid);
                        } else {
                            otherMissing.push(pid);
                        }
                    });

                    const finalOrder = rssMissing.concat(inOrder, otherMissing);
                    const platforms = {};
                    finalOrder.forEach(pid => {
                        if (hiddenPlatformSet.has(String(pid || '').trim())) return;
                        if (serverCat.platforms && serverCat.platforms[pid]) {
                            platforms[pid] = serverCat.platforms[pid];
                        }
                    });
                    result[catId] = { ...serverCat, platforms };
                } else {
                    const platforms = {};
                    Object.entries(serverCat.platforms || {}).forEach(([pid, p]) => {
                        if (hiddenPlatformSet.has(String(pid || '').trim())) return;
                        platforms[pid] = p;
                    });
                    result[catId] = { ...serverCat, platforms };
                }
            }
        });

        Object.keys(serverCategories).forEach(catId => {
            if (String(catId || '').startsWith('rsscol-') && String(catId) !== 'rsscol-rss') return;
            if (!result[catId] && !hiddenCategories.includes(catId)) {
                result[catId] = serverCategories[catId];
            }
        });

        return result;
    }
};

// 全局函数
window.openCategorySettings = () => settings.openCategorySettings();
window.closeCategorySettings = () => settings.closeCategorySettings();
window.saveCategorySettings = () => settings.saveCategorySettings();
window.cancelCategorySettings = () => settings.cancelCategorySettings();
window.showAddCategoryPanel = () => settings.showAddCategoryPanel();
window.editCategory = (catId) => settings.editCategory(catId);
window.cancelEditCategory = () => settings.cancelEditCategory();
window.saveCategory = () => settings.saveCategory();
window.deleteCategory = (catId) => settings.deleteCategory(catId);
window.resetDefaultCategoryConfig = () => settings.resetDefaultCategoryConfig();
window.resetCategoryConfig = () => settings.resetCategoryConfig();
window.toggleCategoryVisibility = (catId) => settings.toggleCategoryVisibility(catId);
window.toggleCategoryListCollapseInSettings = () => settings.toggleCategoryListCollapseInSettings();
window.toggleAllCategoriesOffInSettings = (input) => settings.toggleAllCategoriesOffInSettings(input);
window.togglePlatformSelect = (platformId) => settings.togglePlatformSelect(platformId);
window.bulkSelectPlatforms = (mode) => settings.bulkSelectPlatforms(mode);
window.setPlatformSearchQuery = (query) => settings.setPlatformSearchQuery(query);

TR.settings = settings;

// 初始化时同步现有配置到 Cookie
ready(function () {
    const existingConfig = settings.getCategoryConfig();
    if (existingConfig) {
        settings.syncConfigToCookie(existingConfig);
    }
});
