/**
 * Hotnews Paging Module
 * 分页功能
 */

import { TR, ready } from './core.js';

const CATEGORY_PAGE_SIZE = 20;
const MORNING_BRIEF_PAGE_SIZE = 50;
const AUTOFILL_STEP = 20;
const AUTOFILL_MIN_VISIBLE = 10;
const AUTOFILL_MAX_STEPS = 8;
const AUTOFILL_GAP_PX = 80;
const AUTOFILL_SCROLL_BOTTOM_PX = 160;

export const paging = {
    PAGE_SIZE: CATEGORY_PAGE_SIZE,

    getCardMaxPageSize(card) {
        try {
            if (card?.classList?.contains('tr-morning-brief-card')) return MORNING_BRIEF_PAGE_SIZE;
        } catch (e) {
            // ignore
        }
        return CATEGORY_PAGE_SIZE;
    },

    getCardPageSize(card) {
        const raw = card?.dataset?.pageSize;
        const n = parseInt(raw || '', 10);
        const base = Number.isFinite(n) && n > 0 ? n : CATEGORY_PAGE_SIZE;
        const max = this.getCardMaxPageSize(card);
        return Math.min(max, Math.max(1, base));
    },

    setCardPageSize(card, pageSize) {
        if (!card) return;
        const n = parseInt(String(pageSize || ''), 10);
        const safe = Number.isFinite(n) && n > 0 ? n : CATEGORY_PAGE_SIZE;
        const max = this.getCardMaxPageSize(card);
        card.dataset.pageSize = String(Math.min(max, Math.max(1, safe)));
    },

    applyPagingToCard(card, offset) {
        const items = Array.from(card.querySelectorAll('.news-item'));
        const total = items.length;
        const pageSize = this.getCardPageSize(card);
        if (total <= pageSize) {
            items.forEach((it) => it.classList.remove('paged-hidden'));
            card.dataset.pageOffset = '0';
            return;
        }

        const safeOffset = Math.max(0, Math.min(offset, total - 1));
        const end = Math.min(safeOffset + pageSize, total);

        items.forEach((it, idx) => {
            if (idx >= safeOffset && idx < end) it.classList.remove('paged-hidden');
            else it.classList.add('paged-hidden');
        });

        card.dataset.pageOffset = String(safeOffset);
    },

    initPaging() {
        document.querySelectorAll('.platform-card').forEach((card) => {
            const max = this.getCardMaxPageSize(card);
            this.setCardPageSize(card, max);
            this.applyPagingToCard(card, 0);
        });
        TR.counts.updateAllCounts();
    },

    refreshPlatform(btn) {
        const card = btn.closest('.platform-card');
        if (!card) return;
        const items = card.querySelectorAll('.news-item');
        const total = items.length;
        const pageSize = this.getCardPageSize(card);
        if (total <= pageSize) return;
        const current = parseInt(card.dataset.pageOffset || '0', 10);
        const next = (current + pageSize >= total) ? 0 : (current + pageSize);
        this.applyPagingToCard(card, next);
        TR.counts.updateAllCounts();
    },

    getVisibleNewsItems(card) {
        if (!card) return [];
        return Array.from(card.querySelectorAll('.news-item'))
            .filter((it) => !it.classList.contains('filtered')
                && !it.classList.contains('search-hidden')
                && !it.classList.contains('paged-hidden')
                && !it.classList.contains('read'));
    },

    shouldAutofillCard(card, minVisible) {
        if (!card || card.classList.contains('platform-empty-hidden')) return false;
        try {
            if (card.classList.contains('tr-morning-brief-card')) return false;
        } catch (e) {
        }
        const visible = this.getVisibleNewsItems(card);
        const target = Number.isFinite(minVisible) ? minVisible : AUTOFILL_MIN_VISIBLE;
        if (visible.length < target) return true;
        const last = visible[visible.length - 1];
        if (!last) return true;
        const cardRect = card.getBoundingClientRect();
        const lastRect = last.getBoundingClientRect();
        if (!Number.isFinite(cardRect.bottom) || !Number.isFinite(lastRect.bottom)) return false;
        return (cardRect.bottom - lastRect.bottom) >= AUTOFILL_GAP_PX;
    },

    autofillCard(card, opts = {}) {
        if (!card) return false;
        try {
            if (card.classList.contains('tr-morning-brief-card')) return false;
        } catch (e) {
        }
        const minVisible = Number.isFinite(opts.minVisible) ? opts.minVisible : AUTOFILL_MIN_VISIBLE;
        const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : AUTOFILL_MAX_STEPS;
        const force = opts.force === true;

        const total = card.querySelectorAll('.news-item').length;
        if (total <= 0) return false;

        const offset = parseInt(card.dataset.pageOffset || '0', 10) || 0;
        let pageSize = this.getCardPageSize(card);
        let changed = false;

        // Keep page size stable (<= CATEGORY_PAGE_SIZE). If there is blank space due to
        // filters/read/search hiding items, advance the paging window instead of enlarging it.
        let curOffset = Math.max(0, offset);

        for (let i = 0; i < maxSteps; i++) {
            if (!force && !this.shouldAutofillCard(card, minVisible)) break;
            if (total <= pageSize) break;

            // Move to next page window. Loop back to 0 when reaching the end.
            let nextOffset = curOffset + pageSize;
            if (nextOffset + pageSize > total) nextOffset = 0;
            if (nextOffset === curOffset) break;

            curOffset = nextOffset;
            this.setCardPageSize(card, pageSize);
            this.applyPagingToCard(card, curOffset);
            changed = true;
        }
        if (changed) TR.counts.updateAllCounts();
        return changed;
    },

    autofillForCategory(categoryId, opts = {}) {
        const paneEl = document.getElementById(`tab-${categoryId}`);
        if (!paneEl) return false;
        let changed = false;
        paneEl.querySelectorAll('.platform-card').forEach((card) => {
            if (this.autofillCard(card, opts)) changed = true;
        });
        return changed;
    },

    autofillActiveTab(opts = {}) {
        const active = document.querySelector('.category-tabs .category-tab.active');
        const catId = active?.dataset?.category;
        if (!catId) return false;
        return this.autofillForCategory(catId, opts);
    },

    scheduleAutofillActiveTab(opts = {}) {
        clearTimeout(this._autofillTimer);
        this._autofillTimer = setTimeout(() => {
            this._autofillTimer = null;
            this.autofillActiveTab(opts);
        }, 120);
    },

    attachAutofillScrollListener() {
        if (this._autofillScrollBound) return;
        this._autofillScrollBound = true;

        window.addEventListener('scroll', () => {
            const doc = document.documentElement;
            const remaining = (doc.scrollHeight || 0) - (window.scrollY + window.innerHeight);
            if (remaining <= AUTOFILL_SCROLL_BOTTOM_PX) {
                this.scheduleAutofillActiveTab({ force: true });
            }
        }, { passive: true });
    }
};

// 全局函数
window.refreshPlatform = (btn) => paging.refreshPlatform(btn);

TR.paging = paging;

// 初始化
ready(function() {
    paging.initPaging();
    paging.attachAutofillScrollListener();
    paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
});
