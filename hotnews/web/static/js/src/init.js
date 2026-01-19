/**
 * Hotnews Init Module
 * 初始化入口 - 处理栏目闪烁问题
 */

import { TR, ready } from './core.js';

const MOBILE_TOP_COLLAPSE_STORAGE_KEY = 'hotnews_mobile_top_collapsed_v1';
const MOBILE_TOP_COLLAPSE_CLASS = 'tr-mobile-top-collapsed';

function _isMobileNarrowScreen() {
    try {
        return !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    } catch (e) {
        return false;
    }
}

function _setMobileTopCollapsed(collapsed) {
    const next = !!collapsed;
    try {
        document.body.classList.toggle(MOBILE_TOP_COLLAPSE_CLASS, next);
    } catch (e) {
        // ignore
    }
    try {
        localStorage.setItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY, next ? '1' : '0');
    } catch (e) {
        // ignore
    }
    try {
        const link = document.getElementById('trFooterTopToggle');
        if (link) {
            link.textContent = next ? '显示顶部' : '隐藏顶部';
        }
    } catch (e) {
        // ignore
    }
}

function _setupMobileTopToggle() {
    let collapsed = true;
    try {
        const raw = localStorage.getItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY);
        if (raw === '0') collapsed = false;
        if (raw === '1') collapsed = true;
    } catch (e) {
        // ignore
    }

    // E2E: always keep the top area visible, so tests can reliably interact with category tabs.
    try {
        const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
        if (isE2E) {
            collapsed = false;
        }
    } catch (e) {
        // ignore
    }

    _setMobileTopCollapsed(collapsed);

    try {
        const link = document.getElementById('trFooterTopToggle');
        if (!link) return;
        if (link.dataset.bound === '1') return;
        link.dataset.bound = '1';
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', '显示或隐藏顶部栏');
        link.addEventListener('click', () => {
            const next = !document.body.classList.contains(MOBILE_TOP_COLLAPSE_CLASS);
            _setMobileTopCollapsed(next);
            if (!next) {
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (e) {
                    // ignore
                }
            }
        });
    } catch (e) {
        // ignore
    }
}

// 初始化：检查用户配置并决定是否需要刷新数据
ready(function () {
    try {
        const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
        if (isE2E) {
            try {
                const early = document.getElementById('early-hide');
                if (early) early.remove();
            } catch (e) {
                // ignore
            }
            try {
                const tabs = document.querySelector('.category-tabs');
                if (tabs && tabs instanceof HTMLElement) {
                    tabs.style.display = 'flex';
                }
            } catch (e) {
                // ignore
            }
            try {
                const content = document.querySelector('.tab-content-area');
                if (content && content instanceof HTMLElement) {
                    content.style.display = 'block';
                }
            } catch (e) {
                // ignore
            }
        }
    } catch (e) {
        // ignore
    }

    _setupMobileTopToggle();

    // Initialize User Menu (Login/Register)
    if (TR.auth && typeof TR.auth.renderUserMenu === 'function') {
        TR.auth.renderUserMenu();
    }

    // 检查栏目设置 NEW 标记是否应该隐藏
    if (localStorage.getItem('category_settings_badge_dismissed') === 'true') {
        const badge = document.getElementById('categorySettingsNewBadge');
        if (badge) badge.style.display = 'none';
    }

    if (localStorage.getItem('rss_subscription_badge_dismissed') === 'true') {
        const badge = document.getElementById('rssSubscriptionNewBadge');
        if (badge) badge.style.display = 'none';
    }

    // 检查用户是否有自定义配置
    const config = TR.settings.getCategoryConfig();
    const hasCustomConfig = config && (
        (config.customCategories && config.customCategories.length > 0) ||
        (config.hiddenDefaultCategories && config.hiddenDefaultCategories.length > 0) ||
        (config.categoryOrder && config.categoryOrder.length > 0) ||
        (config.platformOrder && typeof config.platformOrder === 'object' && Object.keys(config.platformOrder).length > 0)
    );

    if (hasCustomConfig) {
        // 有自定义配置，触发数据刷新来应用用户配置
        // renderViewerFromData 完成后会添加 .categories-ready 类
        TR.data.refreshViewerData({ preserveScroll: false });

        try {
            window.setTimeout(() => {
                try {
                    if (document.body.classList.contains('categories-ready')) return;
                } catch (e) {
                    // ignore
                }
                try {
                    const early = document.getElementById('early-hide');
                    if (early) early.remove();
                } catch (e) {
                    // ignore
                }
                try {
                    const tabs = document.querySelector('.category-tabs');
                    if (tabs && tabs instanceof HTMLElement) {
                        tabs.style.display = 'flex';
                    }
                } catch (e) {
                    // ignore
                }
                try {
                    const content = document.querySelector('.tab-content-area');
                    if (content && content instanceof HTMLElement) {
                        content.style.display = 'block';
                    }
                } catch (e) {
                    // ignore
                }
                try {
                    document.body.classList.add('categories-ready');
                } catch (e) {
                    // ignore
                }
            }, 2500);
        } catch (e) {
            // ignore
        }
    } else {
        // 无自定义配置，直接显示服务端渲染的默认栏目
        document.body.classList.add('categories-ready');
    }
});
