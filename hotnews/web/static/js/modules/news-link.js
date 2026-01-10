/**
 * Hotnews News Link Module
 * 新闻链接点击处理
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    function openLink(el) {
        const url = el.dataset.url;
        if (url) {
            window.open(url, '_blank');
        }
    }

    function isHoverDevice() {
        return (window.matchMedia && window.matchMedia('(hover: hover)').matches);
    }

    function closeAllPreviews(exceptItem) {
        document.querySelectorAll('.news-item.preview').forEach(it => {
            if (exceptItem && it === exceptItem) return;
            it.classList.remove('preview');
        });
    }

    // === 全局函数 ===
    global.handleTitleClickV2 = function(el, evt) {
        evt.stopPropagation();
        const item = el.closest('.news-item');
        if (!item) return;

        if (isHoverDevice()) {
            openLink(el);
            return;
        }

        const isSame = item.classList.contains('preview');
        if (isSame) {
            openLink(el);
            item.classList.remove('preview');
            return;
        }

        closeAllPreviews(item);
        item.classList.add('preview');
    };

    global.handleTitleKeydownV2 = function(el, evt) {
        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            handleTitleClickV2(el, evt);
        } else if (evt.key === 'Escape') {
            closeAllPreviews(null);
        }
    };

    // === 事件监听 ===
    document.addEventListener('click', function(e) {
        if (e.target.closest('.news-item')) return;
        closeAllPreviews(null);
    });

    document.addEventListener('touchstart', function(e) {
        if (e.target.closest('.news-item')) return;
        closeAllPreviews(null);
    }, { passive: true });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeAllPreviews(null);
    });

})(window);
