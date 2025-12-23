/**
 * TrendRadar Init Module
 * 初始化入口 - 处理栏目闪烁问题
 */

import { TR, ready } from './core.js';

// 初始化：检查用户配置并决定是否需要刷新数据
ready(function() {
    // 检查栏目设置 NEW 标记是否应该隐藏
    if (localStorage.getItem('category_settings_badge_dismissed') === 'true') {
        const badge = document.getElementById('categorySettingsNewBadge');
        if (badge) badge.style.display = 'none';
    }

    const settingsBtn = document.querySelector('.category-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const badge = document.getElementById('categorySettingsNewBadge');
            if (badge) badge.style.display = 'none';
            localStorage.setItem('category_settings_badge_dismissed', 'true');
        });
    }

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
