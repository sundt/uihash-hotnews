/**
 * Hotnews Search Module
 * 搜索功能
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    TR.search = {
        searchNews: function() {
            const q = document.getElementById('searchInput').value.toLowerCase();

            document.querySelectorAll('.news-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                const matchSearch = !q || text.includes(q);
                if (matchSearch) {
                    item.classList.remove('search-hidden');
                } else {
                    item.classList.add('search-hidden');
                }
            });

            TR.counts.updateAllCounts();
        }
    };

    // === 全局函数 ===
    global.searchNews = function() {
        TR.search.searchNews();
    };

})(window);
