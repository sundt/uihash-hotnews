/**
 * Hotnews Counts Module
 * 计数更新
 */

import { TR } from './core.js';

export const counts = {
    updatePlatformCount(card) {
        if (!card) return;
        const visibleItems = card.querySelectorAll('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)');
        const visibleEl = card.querySelector('.platform-visible-count');
        if (visibleEl) visibleEl.textContent = visibleItems.length;
    },

    updateAllCounts() {
        document.querySelectorAll('.platform-card').forEach(card => {
            this.updatePlatformCount(card);
        });
        const totalVisible = document.querySelectorAll('.news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
        const totalEl = document.getElementById('totalNews');
        if (totalEl) totalEl.textContent = totalVisible;
    }
};

TR.counts = counts;
