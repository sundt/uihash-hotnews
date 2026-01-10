/**
 * Hotnews Read State Module
 * 已读状态管理
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};
    const storage = TR.storage;

    // === 常量 ===
    const READ_STORAGE_KEY = 'hotnews_read_news_v2';
    const OLD_STORAGE_KEY = 'hotnews_read_news';
    const SHOW_READ_MODE_KEY = 'hotnews_show_read_mode';
    const EXPIRE_HOURS = 24;

    // === 已读状态管理 ===
    TR.readState = {
        getReadNews: function() {
            return storage.get(READ_STORAGE_KEY, {});
        },

        saveReadNews: function(reads) {
            storage.set(READ_STORAGE_KEY, reads);
        },

        getShowReadModePref: function() {
            const raw = storage.getRaw(SHOW_READ_MODE_KEY);
            if (raw === null) return true;
            return raw === '1';
        },

        applyShowReadMode: function(enabled) {
            if (enabled) document.body.classList.add('show-read-mode');
            else document.body.classList.remove('show-read-mode');
            const btn = document.getElementById('showReadBtn');
            if (btn) {
                if (enabled) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        },

        migrateOldFormat: function() {
            if (storage.getRaw(OLD_STORAGE_KEY)) {
                storage.remove(OLD_STORAGE_KEY);
                console.log('已清除旧版本已读记录');
            }
        },

        cleanupExpiredReads: function() {
            const now = Date.now();
            const reads = this.getReadNews();
            let changed = false;
            let removedCount = 0;

            for (const [id, info] of Object.entries(reads)) {
                const ageHours = (now - info.readAt) / (1000 * 60 * 60);
                if (ageHours >= EXPIRE_HOURS) {
                    const item = document.querySelector(`[data-news-id="${id}"]`);
                    if (item) {
                        item.classList.remove('read');
                        const checkbox = item.querySelector('.news-checkbox');
                        if (checkbox) checkbox.checked = false;
                    }
                    delete reads[id];
                    changed = true;
                    removedCount++;
                }
            }

            if (changed) {
                this.saveReadNews(reads);
            }
            return removedCount;
        },

        restoreReadState: function() {
            const reads = this.getReadNews();
            Object.keys(reads).forEach(id => {
                const item = document.querySelector(`[data-news-id="${id}"]`);
                if (item) {
                    item.classList.add('read');
                    const checkbox = item.querySelector('.news-checkbox');
                    if (checkbox) checkbox.checked = true;
                }
            });
            TR.counts.updateAllCounts();
            this.updateReadCount();
        },

        updateReadCount: function() {
            const reads = this.getReadNews();
            const countEl = document.getElementById('readCount');
            if (countEl) countEl.textContent = Object.keys(reads).length;
        }
    };

    // === 全局函数（供 HTML onclick 调用） ===
    global.markAsRead = function(checkbox) {
        const item = checkbox.closest('.news-item');
        const newsId = item.dataset.newsId;
        const newsTitle = item.dataset.newsTitle || '';
        let reads = TR.readState.getReadNews();

        if (checkbox.checked) {
            item.classList.add('read');
            if (!reads[newsId]) {
                reads[newsId] = {
                    title: newsTitle.substring(0, 50),
                    readAt: Date.now()
                };
                TR.readState.saveReadNews(reads);
            }
        } else {
            item.classList.remove('read');
            delete reads[newsId];
            TR.readState.saveReadNews(reads);
        }
        TR.counts.updatePlatformCount(checkbox.closest('.platform-card'));
        TR.readState.updateReadCount();
    };

    global.toggleShowRead = function() {
        const next = !document.body.classList.contains('show-read-mode');
        TR.readState.applyShowReadMode(next);
        storage.setRaw(SHOW_READ_MODE_KEY, next ? '1' : '0');
        TR.counts.updateAllCounts();
    };

    global.clearAllRead = function() {
        if (!confirm('确定要清除所有已读记录吗？所有新闻将恢复显示。')) return;

        document.querySelectorAll('.news-item.read').forEach(item => {
            item.classList.remove('read');
            const checkbox = item.querySelector('.news-checkbox');
            if (checkbox) checkbox.checked = false;
        });

        TR.readState.saveReadNews({});
        TR.counts.updateAllCounts();
        TR.readState.updateReadCount();
    };

    // === 初始化 ===
    TR.ready(function() {
        TR.readState.applyShowReadMode(TR.readState.getShowReadModePref());
        TR.readState.migrateOldFormat();
        const removed = TR.readState.cleanupExpiredReads();
        if (removed > 0) {
            console.log(`已清理 ${removed} 条过期已读记录`);
        }
        TR.readState.restoreReadState();
        TR.readState.updateReadCount();
    });

})(window);
