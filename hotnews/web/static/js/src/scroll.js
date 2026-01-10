/**
 * Hotnews Scroll Module
 * 平台滚动持久化
 */

import { TR } from './core.js';
import { storage } from './storage.js';

const PLATFORM_GRID_SCROLL_STORAGE_KEY = 'hotnews_platform_grid_scroll_v1';

export const scroll = {
    getPlatformGridScrollState() {
        return storage.get(PLATFORM_GRID_SCROLL_STORAGE_KEY, {});
    },

    setPlatformGridScrollState(state) {
        storage.set(PLATFORM_GRID_SCROLL_STORAGE_KEY, state || {});
    },

    recordPlatformGridScrollForTab(tabId, grid) {
        if (!tabId || !grid) return;

        const left = grid.scrollLeft || 0;
        let anchorPlatformId = null;
        let anchorOffsetX = 0;

        let anchor = null;
        const cards = grid.querySelectorAll('.platform-card');
        for (const card of cards) {
            if ((card.offsetLeft || 0) <= left + 1) {
                anchor = card;
            } else {
                break;
            }
        }
        if (anchor?.dataset?.platform) {
            anchorPlatformId = anchor.dataset.platform;
            anchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
        }

        const state = this.getPlatformGridScrollState();
        state[tabId] = {
            left,
            anchorPlatformId,
            anchorOffsetX,
            updatedAt: Date.now(),
        };
        this.setPlatformGridScrollState(state);
    },

    attachPlatformGridScrollPersistence() {
        document.querySelectorAll('.tab-pane .platform-grid').forEach((grid) => {
            if (grid.dataset.scrollPersistBound === '1') return;
            grid.dataset.scrollPersistBound = '1';

            let ticking = false;
            grid.addEventListener('scroll', () => {
                if (grid.dataset.trRestoring !== '1') {
                    grid.dataset.trUserScrolled = '1';
                }
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    const pane = grid.closest('.tab-pane');
                    const tabId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : null;
                    this.recordPlatformGridScrollForTab(tabId, grid);
                });
            }, { passive: true });
        });
    },

    restoreActiveTabPlatformGridScroll(state) {
        const tabId = state?.activeTab;
        if (!state?.preserveScroll || !tabId) return;

        const saved = this.getPlatformGridScrollState()?.[tabId];
        const left = Number.isFinite(saved?.left) ? saved.left : (Number.isFinite(state.activeTabPlatformGridScrollLeft) ? state.activeTabPlatformGridScrollLeft : 0);
        const anchorId = (typeof saved?.anchorPlatformId === 'string' && saved.anchorPlatformId) ? saved.anchorPlatformId : state.activeTabPlatformAnchorPlatformId;
        const offsetX = Number.isFinite(saved?.anchorOffsetX) ? saved.anchorOffsetX : (Number.isFinite(state.activeTabPlatformAnchorOffsetX) ? state.activeTabPlatformAnchorOffsetX : 0);

        const applyOnce = () => {
            const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
            if (!grid) return;

            if (grid.dataset.trUserScrolled === '1') return;

            if (anchorId) {
                let anchorCard = null;
                grid.querySelectorAll('.platform-card').forEach((card) => {
                    if (!anchorCard && card.dataset.platform === anchorId) {
                        anchorCard = card;
                    }
                });
                if (anchorCard && anchorCard.offsetParent !== null) {
                    grid.dataset.trRestoring = '1';
                    grid.scrollLeft = (anchorCard.offsetLeft || 0) + offsetX;
                    requestAnimationFrame(() => {
                        try { delete grid.dataset.trRestoring; } catch (_) {}
                    });
                    return;
                }
            }

            grid.dataset.trRestoring = '1';
            grid.scrollLeft = left;
            requestAnimationFrame(() => {
                try { delete grid.dataset.trRestoring; } catch (_) {}
            });
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyOnce();
                setTimeout(applyOnce, 50);
                setTimeout(applyOnce, 200);
                setTimeout(applyOnce, 600);
            });
        });
    }
};

TR.scroll = scroll;
