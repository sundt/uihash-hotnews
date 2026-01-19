/**
 * Hotnews Viewer - 模块化入口
 * 按依赖顺序导入所有模块
 */

// 核心模块（必须最先导入）
import './core.js';
import './storage.js';

// 基础功能模块
import './counts.js';
import './link.js';
import './search.js';
import './scroll.js';
import './badges.js';
import './paging.js';

// 依赖基础模块的功能
// 依赖基础模块的功能
import './read-state.js';
import './theme.js';
import './settings.js';
import './filter.js';
import './tabs.js';
import './data.js';
import './infinite-scroll.js';
import './category-tab-reorder.js';
import './explore-timeline.js';
import './rss-category-carousel.js';
import './title-drag-scroll.js';
import './morning-brief.js';
import './click-tracker.js';
import './auth.js';

// 异步加载非关键 heavy 模块 (Code Splitting)
import('./platform-reorder.js');
import('./subscription.js');
import('./rss-catalog-preview-parity.js');
import('./explore-embedded-rss.js');

// 初始化模块（必须最后导入）
import './init.js';

// 导出 TR 命名空间供外部使用
export { TR } from './core.js';
