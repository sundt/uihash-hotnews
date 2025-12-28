/**
 * TrendRadar Viewer - 模块化入口
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
import './read-state.js';
import './settings.js';
import './filter.js';
import './tabs.js';
import './data.js';
import './infinite-scroll.js';
import './platform-reorder.js';
import './category-tab-reorder.js';
import './subscription.js';
import './rss-catalog-preview.js';
import './title-drag-scroll.js';

// 初始化模块（必须最后导入）
import './init.js';

// 导出 TR 命名空间供外部使用
export { TR } from './core.js';
