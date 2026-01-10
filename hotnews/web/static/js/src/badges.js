/**
 * Hotnews Badges Module
 * NEW 徽章管理
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const FEATURE_BADGE_PREFIX = 'hotnews_feature_badge_v1:';
const NEW_BADGE_STORAGE_KEY = 'hotnews_new_badges_dismissed_v1';

export const badges = {
    getFeatureBadgeState(featureId) {
        return storage.get(FEATURE_BADGE_PREFIX + featureId, null);
    },

    setFeatureBadgeState(featureId, state) {
        storage.set(FEATURE_BADGE_PREFIX + featureId, state);
    },

    ensureFeatureFirstSeen(featureId) {
        const st = this.getFeatureBadgeState(featureId);
        if (st && typeof st.firstSeenAt === 'number') return st;
        const next = { firstSeenAt: Date.now(), seenAt: null };
        this.setFeatureBadgeState(featureId, next);
        return next;
    },

    markFeatureSeen(featureId) {
        const st = this.ensureFeatureFirstSeen(featureId);
        if (!st.seenAt) {
            st.seenAt = Date.now();
            this.setFeatureBadgeState(featureId, st);
        }
    },

    shouldShowFeatureBadge(featureId, ttlDays) {
        const st = this.ensureFeatureFirstSeen(featureId);
        if (st.seenAt) return false;
        const ttlMs = (ttlDays || 7) * 24 * 60 * 60 * 1000;
        return (Date.now() - (st.firstSeenAt || 0)) <= ttlMs;
    },

    updateNewBadges() {
        const elSports = document.getElementById('newBadgeSportsTab');
        if (elSports) {
            elSports.style.display = this.shouldShowFeatureBadge('sports-nba-schedule', 7) ? '' : 'none';
        }
    },

    getDismissedNewBadges() {
        const obj = storage.get(NEW_BADGE_STORAGE_KEY, {});
        return {
            categories: obj?.categories || {},
            platforms: obj?.platforms || {},
        };
    },

    setDismissedNewBadges(next) {
        storage.set(NEW_BADGE_STORAGE_KEY, next || { categories: {}, platforms: {} });
    },

    applyDismissedNewBadges() {
        const dismissed = this.getDismissedNewBadges();
        document.querySelectorAll('.new-badge-category').forEach((el) => {
            const cid = el?.dataset?.category;
            if (cid && dismissed.categories?.[cid]) {
                el.style.display = 'none';
            }
        });
        document.querySelectorAll('.new-badge-platform').forEach((el) => {
            const pid = el?.dataset?.platform;
            if (pid && dismissed.platforms?.[pid]) {
                el.style.display = 'none';
            }
        });
    },

    dismissNewCategoryBadge(categoryId) {
        if (!categoryId) return;
        const dismissed = this.getDismissedNewBadges();
        if (!dismissed.categories?.[categoryId]) {
            dismissed.categories[categoryId] = true;
            this.setDismissedNewBadges(dismissed);
        }
        document.querySelectorAll(`.new-badge-category[data-category="${CSS.escape(categoryId)}"]`).forEach((el) => {
            el.style.display = 'none';
        });
    },

    dismissNewPlatformBadge(platformId) {
        if (!platformId) return;
        const dismissed = this.getDismissedNewBadges();
        if (!dismissed.platforms?.[platformId]) {
            dismissed.platforms[platformId] = true;
            this.setDismissedNewBadges(dismissed);
        }
        document.querySelectorAll(`.new-badge-platform[data-platform="${CSS.escape(platformId)}"]`).forEach((el) => {
            el.style.display = 'none';
        });
    }
};

// 全局函数
window.dismissNewPlatformBadge = (platformId) => badges.dismissNewPlatformBadge(platformId);

TR.badges = badges;

// 初始化
ready(function() {
    badges.applyDismissedNewBadges();
});
