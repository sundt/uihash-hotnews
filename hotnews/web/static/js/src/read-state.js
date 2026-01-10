/**
 * Hotnews Read State Module
 * 已读状态管理
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const READ_STORAGE_KEY = 'hotnews_read_news_v2';
const OLD_STORAGE_KEY = 'hotnews_read_news';
const SHOW_READ_MODE_KEY = 'hotnews_show_read_mode';
const EXPIRE_HOURS = 24;

export const readState = {
    getReadNews() {
        return storage.get(READ_STORAGE_KEY, {});
    },

    saveReadNews(reads) {
        storage.set(READ_STORAGE_KEY, reads);
    },

    getShowReadModePref() {
        const raw = storage.getRaw(SHOW_READ_MODE_KEY);
        if (raw === null) return true;
        return raw === '1';
    },

    applyShowReadMode(enabled) {
        if (enabled) document.body.classList.add('show-read-mode');
        else document.body.classList.remove('show-read-mode');
        const btn = document.getElementById('showReadBtn');
        if (btn) {
            if (enabled) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    },

    migrateOldFormat() {
        if (storage.getRaw(OLD_STORAGE_KEY)) {
            storage.remove(OLD_STORAGE_KEY);
            console.log('已清除旧版本已读记录');
        }
    },

    cleanupExpiredReads() {
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

    markAsRead(checkbox) {
        const item = checkbox.closest('.news-item');
        const newsId = item.dataset.newsId;
        const newsTitle = item.dataset.newsTitle || '';
        let reads = this.getReadNews();

        if (checkbox.checked) {
            item.classList.add('read');
            if (!reads[newsId]) {
                reads[newsId] = {
                    title: newsTitle.substring(0, 50),
                    readAt: Date.now()
                };
                this.saveReadNews(reads);
            }
        } else {
            item.classList.remove('read');
            delete reads[newsId];
            this.saveReadNews(reads);
        }
        TR.counts.updatePlatformCount(checkbox.closest('.platform-card'));
        this.updateReadCount();
    },

    markItemAsRead(item) {
        try {
            if (!item) return;
            const newsId = item.dataset.newsId;
            const newsTitle = item.dataset.newsTitle || '';
            if (!newsId) return;

            item.classList.add('read');
            const reads = this.getReadNews();
            if (!reads[newsId]) {
                reads[newsId] = {
                    title: String(newsTitle || '').substring(0, 50),
                    readAt: Date.now()
                };
                this.saveReadNews(reads);
            }

            TR.counts.updatePlatformCount(item.closest('.platform-card'));
            this.updateReadCount();
        } catch (e) {
            // ignore
        }
    },

    updateReadCount() {
        const reads = this.getReadNews();
        const countEl = document.getElementById('readCount');
        if (countEl) countEl.textContent = Object.keys(reads).length;
    },

    restoreReadState() {
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

    toggleShowRead() {
        const next = !document.body.classList.contains('show-read-mode');
        this.applyShowReadMode(next);
        storage.setRaw(SHOW_READ_MODE_KEY, next ? '1' : '0');
        TR.counts.updateAllCounts();
    },

    clearAllRead() {
        if (!confirm('确定要清除所有已读记录吗？所有新闻将恢复显示。')) return;

        document.querySelectorAll('.news-item.read').forEach(item => {
            item.classList.remove('read');
            const checkbox = item.querySelector('.news-checkbox');
            if (checkbox) checkbox.checked = false;
        });

        this.saveReadNews({});
        TR.counts.updateAllCounts();
        this.updateReadCount();
    }
};

// 全局函数
window.markAsRead = (checkbox) => readState.markAsRead(checkbox);
window.toggleShowRead = () => readState.toggleShowRead();
window.clearAllRead = () => readState.clearAllRead();

TR.readState = readState;

// 初始化
ready(function() {
    readState.applyShowReadMode(readState.getShowReadModePref());
    readState.migrateOldFormat();
    const removed = readState.cleanupExpiredReads();
    if (removed > 0) {
        console.log(`已清理 ${removed} 条过期已读记录`);
    }
    readState.restoreReadState();
    readState.updateReadCount();
});
