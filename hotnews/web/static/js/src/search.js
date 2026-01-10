/**
 * Hotnews Search Module
 * 搜索功能
 */

import { TR } from './core.js';

export const search = {
    searchNews() {
        const input = document.getElementById('searchInput');
        const q = (input?.value || '').toLowerCase();

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
        if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === 'function') {
            TR.paging.scheduleAutofillActiveTab();
        }
    }
};

// 全局函数
window.searchNews = () => search.searchNews();

TR.search = search;
