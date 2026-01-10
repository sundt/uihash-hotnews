/**
 * Hotnews Data Module
 * 数据获取和渲染
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};

    let _ajaxRefreshInFlight = false;
    let _ajaxRefreshPending = null;

    TR.data = {
        formatUpdatedAt: function(value) {
            const raw = (value == null) ? '' : String(value).trim();
            if (!raw) return raw;

            const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
            if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;

            const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
            if (m2) return raw;

            return raw;
        },

        fetchData: async function() {
            const btn = document.getElementById('fetchBtn');
            const progress = document.getElementById('progressContainer');
            const progressBar = document.getElementById('progressBar');
            const statusEl = document.getElementById('fetchStatus');

            if (btn.classList.contains('loading')) return;

            btn.classList.add('loading');
            progress.classList.add('show');
            progressBar.style.width = '0%';
            statusEl.textContent = '正在获取数据...';

            let progressValue = 0;
            const progressInterval = setInterval(() => {
                progressValue = Math.min(progressValue + Math.random() * 15, 90);
                progressBar.style.width = progressValue + '%';
            }, 500);

            try {
                const response = await fetch('/api/fetch', { method: 'POST' });
                const result = await response.json();

                clearInterval(progressInterval);
                progressBar.style.width = '100%';

                if (result.success) {
                    statusEl.textContent = `获取成功！共 ${result.total_news || 0} 条新闻`;
                    await this.refreshViewerData({ preserveScroll: false });
                } else {
                    statusEl.textContent = '获取失败: ' + (result.error || '未知错误');
                }
            } catch (error) {
                clearInterval(progressInterval);
                statusEl.textContent = '网络错误: ' + error.message;
            } finally {
                btn.classList.remove('loading');
                setTimeout(() => {
                    progress.classList.remove('show');
                    statusEl.textContent = '';
                }, 3000);
            }
        },

        refreshViewerData: async function(opts) {
            const preserveScroll = opts?.preserveScroll !== false;

            if (_ajaxRefreshInFlight) {
                if (!_ajaxRefreshPending) {
                    _ajaxRefreshPending = { preserveScroll };
                } else {
                    _ajaxRefreshPending.preserveScroll = _ajaxRefreshPending.preserveScroll && preserveScroll;
                }
                return;
            }

            _ajaxRefreshInFlight = true;

            try {
                const res = await fetch('/api/news');
                const data = await res.json();
                if (data && data.categories) {
                    this.renderViewerFromData(data, { preserveScroll });
                }
            } catch (e) {
                console.error('refreshViewerData error:', e);
            } finally {
                _ajaxRefreshInFlight = false;

                if (_ajaxRefreshPending) {
                    const pending = _ajaxRefreshPending;
                    _ajaxRefreshPending = null;
                    this.refreshViewerData(pending);
                }
            }
        },

        renderViewerFromData: function(data, opts) {
            const preserveScroll = opts?.preserveScroll !== false;

            const state = {
                activeTab: TR.storage.getRaw(TR.tabs.TAB_STORAGE_KEY),
                searchText: document.getElementById('searchInput')?.value || '',
                pagingOffsets: {}
            };

            document.querySelectorAll('.platform-card').forEach(card => {
                const pid = card.dataset.platform;
                if (pid) state.pagingOffsets[pid] = parseInt(card.dataset.pageOffset || '0', 10);
            });

            if (preserveScroll) {
                const scrollState = TR.tabs.getScrollState();
                state.scrollPositions = scrollState;
            }

            const contentEl = document.querySelector('.tab-content-area');
            const tabsEl = document.querySelector('.category-tabs');
            if (!tabsEl || !contentEl) return;

            const transformed = TR.settings.applyCategoryConfigToData(data.categories);

            // 渲染 Tabs
            let tabsHtml = '';
            Object.entries(transformed).forEach(([catId, cat]) => {
                const isActive = catId === state.activeTab;
                const newBadge = cat.is_new ? `<span class="new-badge new-badge-category" data-category="${catId}">NEW</span>` : '';
                tabsHtml += `
                    <div class="category-tab ${isActive ? 'active' : ''}" data-category="${catId}" onclick="switchTab('${catId}')">
                        <div class="category-tab-icon">${cat.icon}</div>
                        <div class="category-tab-name">${cat.name}${newBadge}</div>
                    </div>
                `;
            });
            tabsEl.innerHTML = tabsHtml;

            // 渲染内容
            let contentHtml = '';
            Object.entries(transformed).forEach(([catId, cat]) => {
                const isActive = catId === state.activeTab;
                let platformsHtml = '';

                Object.entries(cat.platforms || {}).forEach(([pid, platform]) => {
                    const pagingOffset = state.pagingOffsets[pid] || 0;
                    const newPlatformBadge = platform.is_new ? `<span class="new-badge new-badge-platform" data-platform="${pid}">NEW</span>` : '';

                    let newsHtml = '';
                    (platform.news || []).forEach((news, idx) => {
                        const stableId = news.stable_id || '';
                        const title = news.display_title || news.title || '';
                        const url = news.url || '';
                        const meta = news.meta || '';
                        const isCross = news.is_cross_platform;
                        const crossCount = news.cross_platform_count || 0;
                        const crossTitle = (news.cross_platforms || []).join(', ');
                        const crossBadge = isCross ? `<span class="cross-platform-badge" title="同时出现在: ${crossTitle}">🔥 ${crossCount}</span>` : '';
                        const crossClass = isCross ? 'cross-platform' : '';
                        const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
                        const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + TR.paging.PAGE_SIZE)) ? ' paged-hidden' : '';
                        const metaHtml = meta ? `<div class="news-subtitle">${meta}</div>` : '';

                        newsHtml += `
                            <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${TR.escapeHtml(title)}">
                                <div class="news-item-content">
                                    <input type="checkbox" class="news-checkbox" onchange="markAsRead(this)" title="标记已读">
                                    ${indexHtml}
                                    <div class="news-title ${crossClass}" onclick="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)" tabindex="0" role="button" data-url="${TR.escapeHtml(url)}">
                                        ${TR.escapeHtml(title)}
                                        ${crossBadge}
                                    </div>
                                </div>
                                ${metaHtml}
                            </li>
                        `;
                    });

                    platformsHtml += `
                        <div class="platform-card" data-platform="${pid}">
                            <div class="platform-header">
                                <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${pid}')">
                                    📱 ${platform.name}
                                    ${newPlatformBadge}
                                </div>
                            </div>
                            <ul class="news-list">${newsHtml}</ul>
                        </div>
                    `;
                });

                contentHtml += `
                    <div class="tab-pane ${isActive ? 'active' : ''}" id="tab-${catId}">
                        <div class="platform-grid">${platformsHtml}</div>
                    </div>
                `;
            });
            contentEl.innerHTML = contentHtml;

            // 更新时间
            const updatedAtEl = document.getElementById('updatedAt');
            if (updatedAtEl && data.updated_at) {
                updatedAtEl.textContent = this.formatUpdatedAt(data.updated_at);
            }

            // 恢复状态
            TR.badges.applyDismissedNewBadges();

            const searchEl = document.getElementById('searchInput');
            if (searchEl && typeof state?.searchText === 'string') {
                searchEl.value = state.searchText;
            }
            TR.search.searchNews();

            TR.filter.applyCategoryFilterForActiveTab();

            TR.readState.restoreReadState();

            document.querySelectorAll('.platform-card').forEach(card => {
                const pid = card.dataset.platform;
                const off = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;
                TR.paging.applyPagingToCard(card, off);
            });

            TR.counts.updateAllCounts();
            TR.readState.updateReadCount();
            TR.tabs.restoreActiveTabPlatformGridScroll(state);
            TR.tabs.attachPlatformGridScrollPersistence();
            
            // 数据渲染完成，揭开幕布显示栏目
            document.body.classList.add('categories-ready');
        }
    };

    // === 全局函数 ===
    global.fetchData = function() {
        TR.data.fetchData();
    };

    // === 初始化 ===
    TR.ready(function() {
        const updatedAtEl = document.getElementById('updatedAt');
        if (updatedAtEl && updatedAtEl.textContent) {
            updatedAtEl.textContent = TR.data.formatUpdatedAt(updatedAtEl.textContent);
        }
    });

})(window);
