/**
 * Hotnews Paging Module
 * 分页功能
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    const CATEGORY_PAGE_SIZE = 20;

    TR.paging = {
        PAGE_SIZE: CATEGORY_PAGE_SIZE,

        applyPagingToCard: function(card, offset) {
            const items = Array.from(card.querySelectorAll('.news-item'));
            const total = items.length;
            if (total <= CATEGORY_PAGE_SIZE) {
                items.forEach(it => it.classList.remove('paged-hidden'));
                card.dataset.pageOffset = '0';
                return;
            }

            const safeOffset = Math.max(0, Math.min(offset, total - 1));
            const end = Math.min(safeOffset + CATEGORY_PAGE_SIZE, total);

            items.forEach((it, idx) => {
                if (idx >= safeOffset && idx < end) it.classList.remove('paged-hidden');
                else it.classList.add('paged-hidden');
            });

            card.dataset.pageOffset = String(safeOffset);
        },

        initPaging: function() {
            document.querySelectorAll('.platform-card').forEach(card => {
                this.applyPagingToCard(card, 0);
            });
            TR.counts.updateAllCounts();
        }
    };

    // === 全局函数 ===
    global.refreshPlatform = function(btn) {
        const card = btn.closest('.platform-card');
        if (!card) return;
        const items = card.querySelectorAll('.news-item');
        const total = items.length;
        if (total <= CATEGORY_PAGE_SIZE) return;
        const current = parseInt(card.dataset.pageOffset || '0', 10);
        const next = (current + CATEGORY_PAGE_SIZE >= total) ? 0 : (current + CATEGORY_PAGE_SIZE);
        TR.paging.applyPagingToCard(card, next);
        TR.counts.updateAllCounts();
    };

    // === 初始化 ===
    TR.ready(function() {
        TR.paging.initPaging();
    });

})(window);
