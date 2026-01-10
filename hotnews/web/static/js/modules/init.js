/**
 * Hotnews Init Module
 * 初始化和自动刷新
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    // === 自动刷新 ===
    function setupAjaxAutoRefresh() {
        setInterval(function() {
            TR.data.refreshViewerData({ preserveScroll: true });
        }, 60000);
    }

    // === 初始化 ===
    TR.ready(function() {
        setupAjaxAutoRefresh();
        TR.badges.applyDismissedNewBadges();
        
        // 检查用户是否有自定义配置
        const config = TR.settings.getCategoryConfig();
        const hasCustomConfig = config && (
            (config.customCategories && config.customCategories.length > 0) ||
            (config.hiddenDefaultCategories && config.hiddenDefaultCategories.length > 0) ||
            (config.categoryOrder && config.categoryOrder.length > 0)
        );
        
        if (hasCustomConfig) {
            // 有自定义配置，触发数据刷新来应用用户配置
            // renderViewerFromData 完成后会添加 .categories-ready 类
            TR.data.refreshViewerData({ preserveScroll: false });
        } else {
            // 无自定义配置，直接显示服务端渲染的默认栏目
            document.body.classList.add('categories-ready');
        }
    });

})(window);
