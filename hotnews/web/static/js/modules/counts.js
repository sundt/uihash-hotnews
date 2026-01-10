/**
 * Hotnews Counts Module
 * 计数更新功能
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    TR.counts = {
        updatePlatformCount: function(card) {
            if (!card) return;
            const visibleItems = card.querySelectorAll('.news-item:not(.read):not(.filtered):not(.search-hidden):not(.paged-hidden)');
            const visibleEl = card.querySelector('.platform-visible-count');
            if (visibleEl) visibleEl.textContent = visibleItems.length;
        },

        updateAllCounts: function() {
            document.querySelectorAll('.platform-card').forEach(card => {
                this.updatePlatformCount(card);
            });
            const totalVisible = document.querySelectorAll('.news-item:not(.read):not(.filtered):not(.search-hidden):not(.paged-hidden)').length;
            const totalEl = document.getElementById('totalNews');
            if (totalEl) totalEl.textContent = totalVisible;
        }
    };

})(window);
