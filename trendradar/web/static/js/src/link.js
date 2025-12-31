/**
 * TrendRadar Link Module
 * 链接点击处理
 */

import { TR } from './core.js';

export const link = {
    openLink(el) {
        const url = el.dataset.url;
        if (url) {
            window.open(url, '_blank');
        }
    },

    isHoverDevice() {
        return (window.matchMedia && window.matchMedia('(hover: hover)').matches);
    },

    closeAllPreviews(exceptItem) {
        document.querySelectorAll('.news-item.preview').forEach((it) => {
            if (exceptItem && it === exceptItem) return;
            it.classList.remove('preview');
        });
    },

    handleTitleClickV2(el, evt) {
        evt.stopPropagation();
        const item = el.closest('.news-item');
        if (!item) return;

        const checkbox = item.querySelector('.news-checkbox');
        if (checkbox) {
            if (!checkbox.checked) {
                checkbox.checked = true;
                if (typeof window.markAsRead === 'function') {
                    window.markAsRead(checkbox);
                } else if (TR.readState && typeof TR.readState.markAsRead === 'function') {
                    TR.readState.markAsRead(checkbox);
                }
            }
        } else {
            if (TR.readState && typeof TR.readState.markItemAsRead === 'function') {
                TR.readState.markItemAsRead(item);
            }
        }

        if (this.isHoverDevice()) {
            return;
        }

        const isSame = item.classList.contains('preview');
        if (isSame) {
            item.classList.remove('preview');
            return;
        }

        evt.preventDefault();
        this.closeAllPreviews(item);
        item.classList.add('preview');
    },

    handleTitleKeydownV2(el, evt) {
        if (evt.key === 'Enter') {
            this.handleTitleClickV2(el, evt);
        } else if (evt.key === ' ') {
            evt.preventDefault();
            this.handleTitleClickV2(el, evt);
        } else if (evt.key === 'Escape') {
            this.closeAllPreviews(null);
        }
    }
};

// 全局函数
window.handleTitleClickV2 = (el, evt) => link.handleTitleClickV2(el, evt);
window.handleTitleKeydownV2 = (el, evt) => link.handleTitleKeydownV2(el, evt);
window.openLink = (el) => link.openLink(el);

// 全局事件监听
document.addEventListener('click', (e) => {
    if (e.target.closest('.news-item')) return;
    link.closeAllPreviews(null);
});
document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.news-item')) return;
    link.closeAllPreviews(null);
}, { passive: true });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') link.closeAllPreviews(null);
});

TR.link = link;
