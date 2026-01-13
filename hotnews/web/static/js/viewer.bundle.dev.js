(() => {
  // hotnews/web/static/js/src/core.js
  var TR = window.Hotnews = window.Hotnews || {};
  var readyHandlers = [];
  var isReady = false;
  function ready(handler) {
    if (isReady) {
      handler();
    } else {
      readyHandlers.push(handler);
    }
  }
  document.addEventListener("DOMContentLoaded", function() {
    isReady = true;
    readyHandlers.forEach((h) => {
      try {
        h();
      } catch (e) {
        console.error("Ready handler error:", e);
      }
    });
  });
  function escapeHtml(str) {
    return String(str || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function formatUpdatedAt(value) {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return raw;
    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
    if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;
    const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (m2) return raw;
    return raw;
  }
  TR.ready = ready;
  TR.escapeHtml = escapeHtml;
  TR.formatUpdatedAt = formatUpdatedAt;
  function formatNewsDate(ts) {
    if (ts == null || ts === "") return "";
    try {
      const num = Number(ts);
      if (Number.isFinite(num) && num > 0) {
        const ms = num > 1e12 ? num : num * 1e3;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          const YYYY = String(d.getFullYear());
          const MM = String(d.getMonth() + 1).padStart(2, "0");
          const DD = String(d.getDate()).padStart(2, "0");
          return `${YYYY}-${MM}-${DD}`;
        }
      }
      const s = String(ts || "").trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
    } catch (e) {
    }
    return "";
  }
  TR.formatNewsDate = formatNewsDate;
  var _toastState = {
    container: null,
    nextId: 1,
    items: /* @__PURE__ */ new Map()
  };
  function _getToastContainer() {
    if (_toastState.container) return _toastState.container;
    const el = document.createElement("div");
    el.id = "tr-toast-container";
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.gap = "10px";
    el.style.zIndex = "99999";
    try {
      document.body.appendChild(el);
    } catch (e) {
    }
    _toastState.container = el;
    return el;
  }
  function _toastStyleForVariant(variant) {
    const v = String(variant || "info");
    if (v === "loading") {
      return { bg: "#111827", fg: "#fff", border: "#111827" };
    }
    if (v === "success") {
      return { bg: "#16a34a", fg: "#fff", border: "#16a34a" };
    }
    if (v === "error") {
      return { bg: "#dc2626", fg: "#fff", border: "#dc2626" };
    }
    return { bg: "#111827", fg: "#fff", border: "#111827" };
  }
  function _renderToast(el, message, variant) {
    const styles = _toastStyleForVariant(variant);
    el.className = "tr-toast";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "10px";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = styles.bg;
    el.style.color = styles.fg;
    el.style.border = `1px solid ${styles.border}`;
    el.style.boxShadow = "0 10px 20px rgba(0,0,0,0.18)";
    el.style.fontSize = "0.9rem";
    el.style.maxWidth = "360px";
    el.style.wordBreak = "break-word";
    const v = String(variant || "info");
    const prefix = v === "loading" ? '<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,0.3);"></span>' : "";
    el.innerHTML = `${prefix}<div class="tr-toast-msg">${escapeHtml(message || "")}</div>`;
  }
  TR.toast = {
    show(message, opts = {}) {
      const id = `toast-${_toastState.nextId++}`;
      const container = _getToastContainer();
      const el = document.createElement("div");
      el.dataset.toastId = id;
      _renderToast(el, message, opts.variant);
      try {
        container.appendChild(el);
      } catch (e) {
      }
      const item = {
        id,
        el,
        hideTimer: 0
      };
      _toastState.items.set(id, item);
      const durationMs = Number(opts.durationMs || 0);
      if (durationMs > 0) {
        item.hideTimer = window.setTimeout(() => {
          TR.toast.hide(id);
        }, durationMs);
      }
      return id;
    },
    update(id, message, opts = {}) {
      const item = _toastState.items.get(String(id || ""));
      if (!item) return;
      if (item.hideTimer) {
        window.clearTimeout(item.hideTimer);
        item.hideTimer = 0;
      }
      _renderToast(item.el, message, opts.variant);
      const durationMs = Number(opts.durationMs || 0);
      if (durationMs > 0) {
        item.hideTimer = window.setTimeout(() => {
          TR.toast.hide(id);
        }, durationMs);
      }
    },
    hide(id) {
      const item = _toastState.items.get(String(id || ""));
      if (!item) return;
      if (item.hideTimer) {
        window.clearTimeout(item.hideTimer);
        item.hideTimer = 0;
      }
      try {
        item.el.remove();
      } catch (e) {
      }
      _toastState.items.delete(String(id || ""));
    }
  };

  // hotnews/web/static/js/src/storage.js
  var storage = {
    get(key, defaultValue = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error("Storage set error:", e);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
      }
    },
    getRaw(key) {
      return localStorage.getItem(key);
    },
    setRaw(key, value) {
      localStorage.setItem(key, value);
    }
  };
  TR.storage = storage;

  // hotnews/web/static/js/src/counts.js
  var counts = {
    updatePlatformCount(card) {
      if (!card) return;
      const visibleItems = card.querySelectorAll(".news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)");
      const visibleEl = card.querySelector(".platform-visible-count");
      if (visibleEl) visibleEl.textContent = visibleItems.length;
    },
    updateAllCounts() {
      document.querySelectorAll(".platform-card").forEach((card) => {
        this.updatePlatformCount(card);
      });
      const totalVisible = document.querySelectorAll(".news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)").length;
      const totalEl = document.getElementById("totalNews");
      if (totalEl) totalEl.textContent = totalVisible;
    }
  };
  TR.counts = counts;

  // hotnews/web/static/js/src/link.js
  var link = {
    openLink(el) {
      const url = el.dataset.url;
      if (url) {
        window.open(url, "_blank");
      }
    },
    isHoverDevice() {
      return window.matchMedia && window.matchMedia("(hover: hover)").matches;
    },
    closeAllPreviews(exceptItem) {
      document.querySelectorAll(".news-item.preview").forEach((it) => {
        if (exceptItem && it === exceptItem) return;
        it.classList.remove("preview");
      });
    },
    handleTitleClickV2(el, evt) {
      evt.stopPropagation();
      const item = el.closest(".news-item");
      if (!item) return;
      const checkbox = item.querySelector(".news-checkbox");
      if (checkbox) {
        if (!checkbox.checked) {
          checkbox.checked = true;
          if (typeof window.markAsRead === "function") {
            window.markAsRead(checkbox);
          } else if (TR.readState && typeof TR.readState.markAsRead === "function") {
            TR.readState.markAsRead(checkbox);
          }
        }
      } else {
        if (TR.readState && typeof TR.readState.markItemAsRead === "function") {
          TR.readState.markItemAsRead(item);
        }
      }
      if (this.isHoverDevice()) {
        return;
      }
      const isSame = item.classList.contains("preview");
      if (isSame) {
        item.classList.remove("preview");
        return;
      }
      evt.preventDefault();
      this.closeAllPreviews(item);
      item.classList.add("preview");
    },
    handleTitleKeydownV2(el, evt) {
      if (evt.key === "Enter") {
        this.handleTitleClickV2(el, evt);
      } else if (evt.key === " ") {
        evt.preventDefault();
        this.handleTitleClickV2(el, evt);
      } else if (evt.key === "Escape") {
        this.closeAllPreviews(null);
      }
    }
  };
  window.handleTitleClickV2 = (el, evt) => link.handleTitleClickV2(el, evt);
  window.handleTitleKeydownV2 = (el, evt) => link.handleTitleKeydownV2(el, evt);
  window.openLink = (el) => link.openLink(el);
  document.addEventListener("click", (e) => {
    if (e.target.closest(".news-item")) return;
    link.closeAllPreviews(null);
  });
  document.addEventListener("touchstart", (e) => {
    if (e.target.closest(".news-item")) return;
    link.closeAllPreviews(null);
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") link.closeAllPreviews(null);
  });
  TR.link = link;

  // hotnews/web/static/js/src/search.js
  var search = {
    searchNews() {
      const input = document.getElementById("searchInput");
      const q = (input?.value || "").toLowerCase();
      document.querySelectorAll(".news-item").forEach((item) => {
        const text = item.textContent.toLowerCase();
        const matchSearch = !q || text.includes(q);
        if (matchSearch) {
          item.classList.remove("search-hidden");
        } else {
          item.classList.add("search-hidden");
        }
      });
      TR.counts.updateAllCounts();
      if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === "function") {
        TR.paging.scheduleAutofillActiveTab();
      }
    }
  };
  window.searchNews = () => search.searchNews();
  TR.search = search;

  // hotnews/web/static/js/src/scroll.js
  var PLATFORM_GRID_SCROLL_STORAGE_KEY = "hotnews_platform_grid_scroll_v1";
  var scroll = {
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
      const cards = grid.querySelectorAll(".platform-card");
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
        updatedAt: Date.now()
      };
      this.setPlatformGridScrollState(state);
    },
    attachPlatformGridScrollPersistence() {
      document.querySelectorAll(".tab-pane .platform-grid").forEach((grid) => {
        if (grid.dataset.scrollPersistBound === "1") return;
        grid.dataset.scrollPersistBound = "1";
        let ticking = false;
        grid.addEventListener("scroll", () => {
          if (grid.dataset.trRestoring !== "1") {
            grid.dataset.trUserScrolled = "1";
          }
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            const pane = grid.closest(".tab-pane");
            const tabId = pane?.id?.startsWith("tab-") ? pane.id.slice(4) : null;
            this.recordPlatformGridScrollForTab(tabId, grid);
          });
        }, { passive: true });
      });
    },
    restoreActiveTabPlatformGridScroll(state) {
      const tabId = state?.activeTab;
      if (!state?.preserveScroll || !tabId) return;
      const saved = this.getPlatformGridScrollState()?.[tabId];
      const left = Number.isFinite(saved?.left) ? saved.left : Number.isFinite(state.activeTabPlatformGridScrollLeft) ? state.activeTabPlatformGridScrollLeft : 0;
      const anchorId = typeof saved?.anchorPlatformId === "string" && saved.anchorPlatformId ? saved.anchorPlatformId : state.activeTabPlatformAnchorPlatformId;
      const offsetX = Number.isFinite(saved?.anchorOffsetX) ? saved.anchorOffsetX : Number.isFinite(state.activeTabPlatformAnchorOffsetX) ? state.activeTabPlatformAnchorOffsetX : 0;
      const applyOnce = () => {
        const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
        if (!grid) return;
        if (grid.dataset.trUserScrolled === "1") return;
        if (anchorId) {
          let anchorCard = null;
          grid.querySelectorAll(".platform-card").forEach((card) => {
            if (!anchorCard && card.dataset.platform === anchorId) {
              anchorCard = card;
            }
          });
          if (anchorCard && anchorCard.offsetParent !== null) {
            grid.dataset.trRestoring = "1";
            grid.scrollLeft = (anchorCard.offsetLeft || 0) + offsetX;
            requestAnimationFrame(() => {
              try {
                delete grid.dataset.trRestoring;
              } catch (_) {
              }
            });
            return;
          }
        }
        grid.dataset.trRestoring = "1";
        grid.scrollLeft = left;
        requestAnimationFrame(() => {
          try {
            delete grid.dataset.trRestoring;
          } catch (_) {
          }
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
    },
    /**
     * Pause scroll-snap to prevent jump when returning from external link
     */
    pauseScrollSnap() {
      document.body.classList.add("tr-snap-paused");
    },
    /**
     * Resume scroll-snap after a short delay
     */
    resumeScrollSnap() {
      setTimeout(() => {
        document.body.classList.remove("tr-snap-paused");
      }, 100);
    },
    /**
     * Setup visibility change handlers to prevent scroll jump
     */
    setupVisibilityScrollFix() {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          document.body.classList.add("tr-page-hidden");
          this.pauseScrollSnap();
        } else if (document.visibilityState === "visible") {
          document.body.classList.remove("tr-page-hidden");
          this.resumeScrollSnap();
        }
      });
      window.addEventListener("beforeunload", () => {
        this.pauseScrollSnap();
      });
    }
  };
  TR.scroll = scroll;
  ready(function() {
    scroll.setupVisibilityScrollFix();
  });

  // hotnews/web/static/js/src/badges.js
  var FEATURE_BADGE_PREFIX = "hotnews_feature_badge_v1:";
  var NEW_BADGE_STORAGE_KEY = "hotnews_new_badges_dismissed_v1";
  var badges = {
    getFeatureBadgeState(featureId) {
      return storage.get(FEATURE_BADGE_PREFIX + featureId, null);
    },
    setFeatureBadgeState(featureId, state) {
      storage.set(FEATURE_BADGE_PREFIX + featureId, state);
    },
    ensureFeatureFirstSeen(featureId) {
      const st = this.getFeatureBadgeState(featureId);
      if (st && typeof st.firstSeenAt === "number") return st;
      const next3 = { firstSeenAt: Date.now(), seenAt: null };
      this.setFeatureBadgeState(featureId, next3);
      return next3;
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
      const ttlMs = (ttlDays || 7) * 24 * 60 * 60 * 1e3;
      return Date.now() - (st.firstSeenAt || 0) <= ttlMs;
    },
    updateNewBadges() {
      const elSports = document.getElementById("newBadgeSportsTab");
      if (elSports) {
        elSports.style.display = this.shouldShowFeatureBadge("sports-nba-schedule", 7) ? "" : "none";
      }
    },
    getDismissedNewBadges() {
      const obj = storage.get(NEW_BADGE_STORAGE_KEY, {});
      return {
        categories: obj?.categories || {},
        platforms: obj?.platforms || {}
      };
    },
    setDismissedNewBadges(next3) {
      storage.set(NEW_BADGE_STORAGE_KEY, next3 || { categories: {}, platforms: {} });
    },
    applyDismissedNewBadges() {
      const dismissed = this.getDismissedNewBadges();
      document.querySelectorAll(".new-badge-category").forEach((el) => {
        const cid2 = el?.dataset?.category;
        if (cid2 && dismissed.categories?.[cid2]) {
          el.style.display = "none";
        }
      });
      document.querySelectorAll(".new-badge-platform").forEach((el) => {
        const pid2 = el?.dataset?.platform;
        if (pid2 && dismissed.platforms?.[pid2]) {
          el.style.display = "none";
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
        el.style.display = "none";
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
        el.style.display = "none";
      });
    }
  };
  window.dismissNewPlatformBadge = (platformId) => badges.dismissNewPlatformBadge(platformId);
  TR.badges = badges;
  ready(function() {
    badges.applyDismissedNewBadges();
  });

  // hotnews/web/static/js/src/paging.js
  var CATEGORY_PAGE_SIZE = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var MORNING_BRIEF_PAGE_SIZE = 50;
  var AUTOFILL_STEP = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var AUTOFILL_MIN_VISIBLE = 10;
  var AUTOFILL_MAX_STEPS = 8;
  var AUTOFILL_GAP_PX = 80;
  var AUTOFILL_SCROLL_BOTTOM_PX = 160;
  var paging = {
    PAGE_SIZE: CATEGORY_PAGE_SIZE,
    getCardMaxPageSize(card) {
      try {
        if (card?.classList?.contains("tr-morning-brief-card")) return MORNING_BRIEF_PAGE_SIZE;
      } catch (e) {
      }
      return CATEGORY_PAGE_SIZE;
    },
    getCardPageSize(card) {
      const raw = card?.dataset?.pageSize;
      const n = parseInt(raw || "", 10);
      const base = Number.isFinite(n) && n > 0 ? n : CATEGORY_PAGE_SIZE;
      const max = this.getCardMaxPageSize(card);
      return Math.min(max, Math.max(1, base));
    },
    setCardPageSize(card, pageSize) {
      if (!card) return;
      const n = parseInt(String(pageSize || ""), 10);
      const safe = Number.isFinite(n) && n > 0 ? n : CATEGORY_PAGE_SIZE;
      const max = this.getCardMaxPageSize(card);
      card.dataset.pageSize = String(Math.min(max, Math.max(1, safe)));
    },
    applyPagingToCard(card, offset) {
      const items = Array.from(card.querySelectorAll(".news-item"));
      const total = items.length;
      const pageSize = this.getCardPageSize(card);
      if (total <= pageSize) {
        items.forEach((it) => it.classList.remove("paged-hidden"));
        card.dataset.pageOffset = "0";
        return;
      }
      const safeOffset = Math.max(0, Math.min(offset, total - 1));
      const end = Math.min(safeOffset + pageSize, total);
      items.forEach((it, idx) => {
        if (idx >= safeOffset && idx < end) it.classList.remove("paged-hidden");
        else it.classList.add("paged-hidden");
      });
      card.dataset.pageOffset = String(safeOffset);
    },
    initPaging() {
      document.querySelectorAll(".platform-card").forEach((card) => {
        const max = this.getCardMaxPageSize(card);
        this.setCardPageSize(card, max);
        this.applyPagingToCard(card, 0);
      });
      TR.counts.updateAllCounts();
    },
    refreshPlatform(btn) {
      const card = btn.closest(".platform-card");
      if (!card) return;
      const items = card.querySelectorAll(".news-item");
      const total = items.length;
      const pageSize = this.getCardPageSize(card);
      if (total <= pageSize) return;
      const current = parseInt(card.dataset.pageOffset || "0", 10);
      const next3 = current + pageSize >= total ? 0 : current + pageSize;
      this.applyPagingToCard(card, next3);
      TR.counts.updateAllCounts();
    },
    getVisibleNewsItems(card) {
      if (!card) return [];
      return Array.from(card.querySelectorAll(".news-item")).filter((it) => !it.classList.contains("filtered") && !it.classList.contains("search-hidden") && !it.classList.contains("paged-hidden") && !it.classList.contains("read"));
    },
    shouldAutofillCard(card, minVisible) {
      if (!card || card.classList.contains("platform-empty-hidden")) return false;
      try {
        if (card.classList.contains("tr-morning-brief-card")) return false;
      } catch (e) {
      }
      const visible = this.getVisibleNewsItems(card);
      const target = Number.isFinite(minVisible) ? minVisible : AUTOFILL_MIN_VISIBLE;
      if (visible.length < target) return true;
      const last = visible[visible.length - 1];
      if (!last) return true;
      const cardRect = card.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      if (!Number.isFinite(cardRect.bottom) || !Number.isFinite(lastRect.bottom)) return false;
      return cardRect.bottom - lastRect.bottom >= AUTOFILL_GAP_PX;
    },
    autofillCard(card, opts = {}) {
      if (!card) return false;
      try {
        if (card.classList.contains("tr-morning-brief-card")) return false;
      } catch (e) {
      }
      const minVisible = Number.isFinite(opts.minVisible) ? opts.minVisible : AUTOFILL_MIN_VISIBLE;
      const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : AUTOFILL_MAX_STEPS;
      const force = opts.force === true;
      const total = card.querySelectorAll(".news-item").length;
      if (total <= 0) return false;
      const offset = parseInt(card.dataset.pageOffset || "0", 10) || 0;
      let pageSize = this.getCardPageSize(card);
      let changed = false;
      let curOffset = Math.max(0, offset);
      for (let i = 0; i < maxSteps; i++) {
        if (!force && !this.shouldAutofillCard(card, minVisible)) break;
        if (total <= pageSize) break;
        let nextOffset = curOffset + pageSize;
        if (nextOffset + pageSize > total) nextOffset = 0;
        if (nextOffset === curOffset) break;
        curOffset = nextOffset;
        this.setCardPageSize(card, pageSize);
        this.applyPagingToCard(card, curOffset);
        changed = true;
      }
      if (changed) TR.counts.updateAllCounts();
      return changed;
    },
    autofillForCategory(categoryId, opts = {}) {
      const paneEl = document.getElementById(`tab-${categoryId}`);
      if (!paneEl) return false;
      let changed = false;
      paneEl.querySelectorAll(".platform-card").forEach((card) => {
        if (this.autofillCard(card, opts)) changed = true;
      });
      return changed;
    },
    autofillActiveTab(opts = {}) {
      const active = document.querySelector(".category-tabs .category-tab.active");
      const catId = active?.dataset?.category;
      if (!catId) return false;
      return this.autofillForCategory(catId, opts);
    },
    scheduleAutofillActiveTab(opts = {}) {
      clearTimeout(this._autofillTimer);
      this._autofillTimer = setTimeout(() => {
        this._autofillTimer = null;
        this.autofillActiveTab(opts);
      }, 120);
    },
    attachAutofillScrollListener() {
      if (this._autofillScrollBound) return;
      this._autofillScrollBound = true;
      window.addEventListener("scroll", () => {
        const doc = document.documentElement;
        const remaining = (doc.scrollHeight || 0) - (window.scrollY + window.innerHeight);
        if (remaining <= AUTOFILL_SCROLL_BOTTOM_PX) {
          this.scheduleAutofillActiveTab({ force: true });
        }
      }, { passive: true });
    }
  };
  window.refreshPlatform = (btn) => paging.refreshPlatform(btn);
  TR.paging = paging;
  ready(function() {
    paging.initPaging();
    paging.attachAutofillScrollListener();
    paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
  });

  // hotnews/web/static/js/src/read-state.js
  var READ_STORAGE_KEY = "hotnews_read_news_v2";
  var OLD_STORAGE_KEY = "hotnews_read_news";
  var SHOW_READ_MODE_KEY = "hotnews_show_read_mode";
  var EXPIRE_HOURS = 24;
  var readState = {
    getReadNews() {
      return storage.get(READ_STORAGE_KEY, {});
    },
    saveReadNews(reads) {
      storage.set(READ_STORAGE_KEY, reads);
    },
    getShowReadModePref() {
      const raw = storage.getRaw(SHOW_READ_MODE_KEY);
      if (raw === null) return true;
      return raw === "1";
    },
    applyShowReadMode(enabled) {
      if (enabled) document.body.classList.add("show-read-mode");
      else document.body.classList.remove("show-read-mode");
      const btn = document.getElementById("showReadBtn");
      if (btn) {
        if (enabled) btn.classList.add("active");
        else btn.classList.remove("active");
      }
    },
    migrateOldFormat() {
      if (storage.getRaw(OLD_STORAGE_KEY)) {
        storage.remove(OLD_STORAGE_KEY);
        console.log("\u5DF2\u6E05\u9664\u65E7\u7248\u672C\u5DF2\u8BFB\u8BB0\u5F55");
      }
    },
    cleanupExpiredReads() {
      const now = Date.now();
      const reads = this.getReadNews();
      let changed = false;
      let removedCount = 0;
      for (const [id, info] of Object.entries(reads)) {
        const ageHours = (now - info.readAt) / (1e3 * 60 * 60);
        if (ageHours >= EXPIRE_HOURS) {
          const item = document.querySelector(`[data-news-id="${id}"]`);
          if (item) {
            item.classList.remove("read");
            const checkbox = item.querySelector(".news-checkbox");
            if (checkbox) checkbox.checked = false;
          }
          delete reads[id];
          changed = true;
          removedCount++;
        }
      }
      if (changed) {
        this.saveReadNews(reads);
      }
      return removedCount;
    },
    markAsRead(checkbox) {
      const item = checkbox.closest(".news-item");
      const newsId = item.dataset.newsId;
      const newsTitle = item.dataset.newsTitle || "";
      let reads = this.getReadNews();
      if (checkbox.checked) {
        item.classList.add("read");
        if (!reads[newsId]) {
          reads[newsId] = {
            title: newsTitle.substring(0, 50),
            readAt: Date.now()
          };
          this.saveReadNews(reads);
        }
      } else {
        item.classList.remove("read");
        delete reads[newsId];
        this.saveReadNews(reads);
      }
      TR.counts.updatePlatformCount(checkbox.closest(".platform-card"));
      this.updateReadCount();
    },
    markItemAsRead(item) {
      try {
        if (!item) return;
        const newsId = item.dataset.newsId;
        const newsTitle = item.dataset.newsTitle || "";
        if (!newsId) return;
        item.classList.add("read");
        const reads = this.getReadNews();
        if (!reads[newsId]) {
          reads[newsId] = {
            title: String(newsTitle || "").substring(0, 50),
            readAt: Date.now()
          };
          this.saveReadNews(reads);
        }
        TR.counts.updatePlatformCount(item.closest(".platform-card"));
        this.updateReadCount();
      } catch (e) {
      }
    },
    updateReadCount() {
      const reads = this.getReadNews();
      const countEl = document.getElementById("readCount");
      if (countEl) countEl.textContent = Object.keys(reads).length;
    },
    restoreReadState() {
      const reads = this.getReadNews();
      Object.keys(reads).forEach((id) => {
        const item = document.querySelector(`[data-news-id="${id}"]`);
        if (item) {
          item.classList.add("read");
          const checkbox = item.querySelector(".news-checkbox");
          if (checkbox) checkbox.checked = true;
        }
      });
      TR.counts.updateAllCounts();
      this.updateReadCount();
    },
    toggleShowRead() {
      const next3 = !document.body.classList.contains("show-read-mode");
      this.applyShowReadMode(next3);
      storage.setRaw(SHOW_READ_MODE_KEY, next3 ? "1" : "0");
      TR.counts.updateAllCounts();
    },
    clearAllRead() {
      if (!confirm("\u786E\u5B9A\u8981\u6E05\u9664\u6240\u6709\u5DF2\u8BFB\u8BB0\u5F55\u5417\uFF1F\u6240\u6709\u65B0\u95FB\u5C06\u6062\u590D\u663E\u793A\u3002")) return;
      document.querySelectorAll(".news-item.read").forEach((item) => {
        item.classList.remove("read");
        const checkbox = item.querySelector(".news-checkbox");
        if (checkbox) checkbox.checked = false;
      });
      this.saveReadNews({});
      TR.counts.updateAllCounts();
      this.updateReadCount();
    }
  };
  window.markAsRead = (checkbox) => readState.markAsRead(checkbox);
  window.toggleShowRead = () => readState.toggleShowRead();
  window.clearAllRead = () => readState.clearAllRead();
  TR.readState = readState;
  ready(function() {
    readState.applyShowReadMode(readState.getShowReadModePref());
    readState.migrateOldFormat();
    const removed = readState.cleanupExpiredReads();
    if (removed > 0) {
      console.log(`\u5DF2\u6E05\u7406 ${removed} \u6761\u8FC7\u671F\u5DF2\u8BFB\u8BB0\u5F55`);
    }
    readState.restoreReadState();
    readState.updateReadCount();
  });

  // hotnews/web/static/js/src/theme.js
  var THEME_STORAGE_KEY = "hotnews_theme_mode";
  var DARK_THEME_CLASS = "eye-protection-mode";
  var theme = {
    isDarkMode() {
      try {
        return localStorage.getItem(THEME_STORAGE_KEY) === "dark";
      } catch (e) {
        return false;
      }
    },
    toggle() {
      const isDark = this.isDarkMode();
      const nextIsDark = !isDark;
      this.apply(nextIsDark);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? "dark" : "light");
      } catch (e) {
      }
    },
    apply(isDark) {
      if (isDark) {
        document.body.classList.add(DARK_THEME_CLASS);
      } else {
        document.body.classList.remove(DARK_THEME_CLASS);
      }
      this.updateButtonState(isDark);
    },
    updateButtonState(isDark) {
      const btn = document.getElementById("themeToggleBtn");
      if (btn) {
        btn.innerHTML = isDark ? "\u{1F31E}" : "\u{1F319}";
        btn.classList.toggle("active", isDark);
      }
    },
    init() {
      const isDark = this.isDarkMode();
      this.apply(isDark);
    }
  };
  TR.theme = theme;
  window.toggleTheme = function() {
    theme.toggle();
  };
  document.addEventListener("DOMContentLoaded", () => {
    theme.init();
  });

  // hotnews/web/static/js/src/settings.js
  var CATEGORY_CONFIG_KEY = "hotnews_categories_config";
  var CATEGORY_CONFIG_VERSION = 1;
  var _defaultCategories = null;
  var _allPlatforms = null;
  var _editingCategoryId = null;
  var _isAddingNew = false;
  var _settingsHideDefaultCategories = false;
  var _settingsCategoryListCollapsed = true;
  var _settingsAllCategoriesOffSnapshot = null;
  var _platformSearchQuery = "";
  var _categoryConfigChanged = false;
  function promoteCategoryOrder(order, desiredFront) {
    const base = Array.isArray(order) ? order : [];
    const seen = /* @__PURE__ */ new Set();
    const cleaned = [];
    base.forEach((x) => {
      const id = String(x || "").trim();
      if (!id) return;
      if (seen.has(id)) return;
      seen.add(id);
      cleaned.push(id);
    });
    const front = Array.isArray(desiredFront) ? desiredFront : [];
    front.forEach((id) => {
      const idx = cleaned.indexOf(id);
      if (idx >= 0) cleaned.splice(idx, 1);
    });
    for (let i = front.length - 1; i >= 0; i -= 1) {
      const id = String(front[i] || "").trim();
      if (!id) continue;
      cleaned.unshift(id);
    }
    return cleaned;
  }
  function ensureCategoryFilters(config2) {
    if (!config2.categoryFilters || typeof config2.categoryFilters !== "object") {
      config2.categoryFilters = {};
    }
  }
  function normalizeCategoryConfig(config2) {
    const base = config2 && typeof config2 === "object" ? config2 : {};
    if (!Array.isArray(base.customCategories)) base.customCategories = [];
    if (!Array.isArray(base.hiddenDefaultCategories)) base.hiddenDefaultCategories = [];
    if (!Array.isArray(base.hiddenPlatforms)) base.hiddenPlatforms = [];
    if (!Array.isArray(base.categoryOrder)) base.categoryOrder = [];
    if (!base.platformOrder || typeof base.platformOrder !== "object") base.platformOrder = {};
    ensureCategoryFilters(base);
    return base;
  }
  var settings = {
    CATEGORY_CONFIG_KEY,
    ensureCategoryFilters,
    normalizeCategoryConfig,
    getCategoryConfig() {
      try {
        const raw = storage.getRaw(CATEGORY_CONFIG_KEY);
        if (!raw) return null;
        const config2 = JSON.parse(raw);
        if (config2.version !== CATEGORY_CONFIG_VERSION) {
          return null;
        }
        return normalizeCategoryConfig(config2);
      } catch (e) {
        return null;
      }
    },
    saveCategoryConfig(config2) {
      config2.version = CATEGORY_CONFIG_VERSION;
      storage.setRaw(CATEGORY_CONFIG_KEY, JSON.stringify(config2));
      this.syncConfigToCookie(config2);
    },
    syncConfigToCookie(config2) {
      try {
        const maxAge = 365 * 24 * 60 * 60;
        const hasCustom = config2.customCategories?.length > 0 || config2.hiddenDefaultCategories?.length > 0 || config2.hiddenPlatforms?.length > 0 || config2.categoryOrder?.length > 0;
        if (hasCustom) {
          document.cookie = `hotnews_has_config=1; path=/; max-age=${maxAge}; SameSite=Lax`;
        } else {
          document.cookie = `hotnews_has_config=; path=/; max-age=0`;
        }
      } catch (e) {
        console.error("Failed to sync config to cookie:", e);
      }
    },
    getDefaultCategoryConfig() {
      if (!_defaultCategories) {
        _defaultCategories = {};
        _allPlatforms = {};
        document.querySelectorAll(".category-tab").forEach((tab) => {
          const catId = tab.dataset.category;
          const icon = tab.querySelector(".category-tab-icon")?.textContent?.trim() || "\u{1F4C1}";
          const name = tab.querySelector(".category-tab-name")?.textContent?.replace(/NEW$/, "")?.trim() || catId;
          _defaultCategories[catId] = { id: catId, name, icon, isDefault: true };
        });
        document.querySelectorAll(".platform-card:not(.tr-morning-brief-card)").forEach((card) => {
          const platformId = card.dataset.platform;
          const platformName = (card.querySelector(".platform-name")?.textContent || "").replace(/NEW\s*$/i, "").replace(/📱\s*/g, "").trim() || platformId;
          const tabPane = card.closest(".tab-pane");
          const catId = tabPane?.id?.replace("tab-", "") || "other";
          _allPlatforms[platformId] = { id: platformId, name: platformName, defaultCategory: catId };
          if (_defaultCategories[catId]) {
            if (!_defaultCategories[catId].platforms) _defaultCategories[catId].platforms = [];
            _defaultCategories[catId].platforms.push(platformId);
          }
        });
      }
      return {
        version: CATEGORY_CONFIG_VERSION,
        customCategories: [],
        hiddenDefaultCategories: [],
        hiddenPlatforms: [],
        categoryOrder: Object.keys(_defaultCategories),
        platformOrder: {},
        categoryFilters: {}
      };
    },
    getMergedCategoryConfig() {
      const defaultConfig = this.getDefaultCategoryConfig();
      const userConfig = this.getCategoryConfig();
      if (!userConfig) return defaultConfig;
      const merged = {
        ...defaultConfig,
        customCategories: userConfig.customCategories || [],
        hiddenDefaultCategories: userConfig.hiddenDefaultCategories || [],
        hiddenPlatforms: userConfig.hiddenPlatforms || [],
        categoryOrder: userConfig.categoryOrder || defaultConfig.categoryOrder,
        platformOrder: userConfig.platformOrder || {},
        categoryFilters: userConfig.categoryFilters || {}
      };
      Object.keys(_defaultCategories).forEach((catId) => {
        if (!merged.categoryOrder.includes(catId)) {
          merged.categoryOrder.push(catId);
        }
      });
      merged.customCategories.forEach((cat) => {
        if (!merged.categoryOrder.includes(cat.id)) {
          merged.categoryOrder.push(cat.id);
        }
      });
      try {
        const flagKey = "__migrated_explore_knowledge_front_v1";
        const idxExplore = Array.isArray(userConfig.categoryOrder) ? userConfig.categoryOrder.indexOf("explore") : -1;
        const idxKnowledge = Array.isArray(userConfig.categoryOrder) ? userConfig.categoryOrder.indexOf("knowledge") : -1;
        const needsPromote = idxExplore !== 0 || idxKnowledge !== 1;
        if (!userConfig[flagKey] && needsPromote) {
          const promoted = promoteCategoryOrder(merged.categoryOrder, ["explore", "knowledge"]);
          merged.categoryOrder = promoted;
          userConfig.categoryOrder = promoted;
          userConfig[flagKey] = Date.now();
          this.saveCategoryConfig(userConfig);
        }
      } catch (e) {
      }
      return merged;
    },
    getDefaultCategories() {
      return _defaultCategories;
    },
    getAllPlatforms() {
      return _allPlatforms;
    },
    addPlatformToCustomCategory(customCategoryId, platformId) {
      const catId = String(customCategoryId || "").trim();
      const pid2 = String(platformId || "").trim();
      if (!catId || !pid2) return false;
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      ensureCategoryFilters(config2);
      const idx = Array.isArray(config2.customCategories) ? config2.customCategories.findIndex((c) => String(c?.id || "").trim() === catId) : -1;
      if (idx < 0) return false;
      const cat = config2.customCategories[idx] || {};
      const platforms = Array.isArray(cat.platforms) ? [...cat.platforms] : [];
      if (!platforms.includes(pid2)) {
        platforms.push(pid2);
      }
      config2.customCategories[idx] = {
        ...cat,
        platforms
      };
      if (Array.isArray(config2.categoryOrder) && !config2.categoryOrder.includes(catId)) {
        config2.categoryOrder.unshift(catId);
      }
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      return true;
    },
    setDefaultCategories(categories) {
      _defaultCategories = categories;
    },
    setAllPlatforms(platforms) {
      _allPlatforms = platforms;
    },
    async openCategorySettings() {
      const newBadge = document.getElementById("categorySettingsNewBadge");
      if (newBadge) {
        newBadge.style.display = "none";
        localStorage.setItem("category_settings_badge_dismissed", "true");
      }
      if (!_defaultCategories || Object.keys(_defaultCategories).length === 0) {
        try {
          const response = await fetch("/api/news");
          const data2 = await response.json();
          if (data2?.categories) {
            _defaultCategories = {};
            _allPlatforms = {};
            Object.entries(data2.categories).forEach(([catId, cat]) => {
              _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
              Object.entries(cat.platforms || {}).forEach(([pid2, p]) => {
                _allPlatforms[pid2] = { id: pid2, name: p.name, defaultCategory: catId, data: p };
              });
            });
          }
        } catch (e) {
          console.error("Failed to fetch categories:", e);
        }
      }
      const modal = document.getElementById("categorySettingsModal");
      modal.classList.add("show");
      _settingsCategoryListCollapsed = true;
      _settingsAllCategoriesOffSnapshot = null;
      this.applyCategoryListCollapseState();
      this.renderCategoryList();
      this.hideEditPanel();
    },
    applyCategoryListCollapseState() {
      const wrapper = document.getElementById("categoryListWrapper");
      if (wrapper) {
        if (_settingsCategoryListCollapsed) wrapper.classList.add("collapsed");
        else wrapper.classList.remove("collapsed");
      }
      const btn = document.getElementById("categoryListToggleBtn");
      if (btn) {
        btn.textContent = _settingsCategoryListCollapsed ? "\u5C55\u5F00\u680F\u76EE\u5217\u8868" : "\u6536\u8D77\u680F\u76EE\u5217\u8868";
      }
    },
    toggleCategoryListCollapseInSettings() {
      _settingsCategoryListCollapsed = !_settingsCategoryListCollapsed;
      this.applyCategoryListCollapseState();
    },
    closeCategorySettings() {
      const modal = document.getElementById("categorySettingsModal");
      modal.classList.remove("show");
      if (_categoryConfigChanged) {
        _categoryConfigChanged = false;
        this.applyCategoryConfig();
      }
    },
    saveCategorySettings() {
      const editPanel = document.getElementById("categoryEditPanel");
      const isEditing = editPanel && editPanel.classList.contains("show");
      if (isEditing) {
        const ok = this.saveCategory();
        if (!ok) return;
      }
      this.closeCategorySettings();
    },
    cancelCategorySettings() {
      _categoryConfigChanged = false;
      const modal = document.getElementById("categorySettingsModal");
      modal.classList.remove("show");
    },
    renderCategoryList() {
      const container = document.getElementById("categoryList");
      const config2 = this.getMergedCategoryConfig();
      let html = "";
      config2.categoryOrder.forEach((catId) => {
        const isCustom = config2.customCategories.find((c) => c.id === catId);
        const isHidden = config2.hiddenDefaultCategories.includes(catId);
        let cat;
        if (isCustom) {
          cat = isCustom;
        } else if (_defaultCategories[catId]) {
          cat = _defaultCategories[catId];
        } else {
          return;
        }
        const platformCount = isCustom ? cat.platforms?.length || 0 : _defaultCategories[catId]?.platforms?.length || 0;
        html += `
                <div class="category-item ${isCustom ? "custom" : ""}" data-category-id="${catId}" draggable="true">
                    <span class="category-item-drag">\u2630</span>
                    <span class="category-item-name">${cat.name}</span>
                    <span class="category-item-platforms">${platformCount} \u4E2A\u5E73\u53F0</span>
                    <label class="category-item-toggle">
                        <input type="checkbox" ${!isHidden ? "checked" : ""} onchange="toggleCategoryVisibility('${catId}')">
                        <span class="slider"></span>
                    </label>
                    <div class="category-item-actions">
                        <button class="category-item-btn" onclick="editCategory('${catId}')">\u7F16\u8F91</button>
                        ${isCustom ? `<button class="category-item-btn delete" onclick="deleteCategory('${catId}')">\u5220\u9664</button>` : ""}
                    </div>
                </div>
            `;
      });
      container.innerHTML = html;
      const allOffEl = document.getElementById("allCategoriesOffToggle");
      if (allOffEl) {
        const hidden = config2.hiddenDefaultCategories || [];
        const allIds = config2.categoryOrder || [];
        allOffEl.checked = allIds.length > 0 && allIds.every((id) => hidden.includes(id));
      }
      if (_settingsHideDefaultCategories) {
        container.classList.add("hide-default");
      } else {
        container.classList.remove("hide-default");
      }
      this.setupCategoryDragAndDrop();
    },
    toggleDefaultCategoryListInSettings() {
      _settingsHideDefaultCategories = !_settingsHideDefaultCategories;
      this.renderCategoryList();
    },
    toggleAllCategoriesOffInSettings(input) {
      return;
    },
    setupCategoryDragAndDrop() {
      const container = document.getElementById("categoryList");
      const items = container.querySelectorAll(".category-item");
      items.forEach((item) => {
        item.addEventListener("dragstart", (e) => {
          item.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
          this.saveCategoryOrder();
        });
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          const dragging = container.querySelector(".dragging");
          if (dragging && dragging !== item) {
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
              container.insertBefore(dragging, item);
            } else {
              container.insertBefore(dragging, item.nextSibling);
            }
          }
        });
      });
    },
    saveCategoryOrder() {
      const container = document.getElementById("categoryList");
      const items = container.querySelectorAll(".category-item");
      const order = Array.from(items).map((item) => item.dataset.categoryId);
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      config2.categoryOrder = order;
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
    },
    toggleCategoryVisibility(catId) {
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      const idx = config2.hiddenDefaultCategories.indexOf(catId);
      if (idx >= 0) {
        config2.hiddenDefaultCategories.splice(idx, 1);
      } else {
        config2.hiddenDefaultCategories.push(catId);
      }
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      this.renderCategoryList();
    },
    togglePlatformHidden(platformId) {
      const pid2 = String(platformId || "").trim();
      if (!pid2) return false;
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      if (!Array.isArray(config2.hiddenPlatforms)) config2.hiddenPlatforms = [];
      const idx = config2.hiddenPlatforms.findIndex((x) => String(x || "").trim() === pid2);
      if (idx >= 0) {
        config2.hiddenPlatforms.splice(idx, 1);
      } else {
        config2.hiddenPlatforms.push(pid2);
      }
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      this.applyCategoryConfig();
      return true;
    },
    showAddCategoryPanel() {
      _isAddingNew = true;
      _editingCategoryId = null;
      _settingsCategoryListCollapsed = true;
      this.applyCategoryListCollapseState();
      _settingsHideDefaultCategories = true;
      document.getElementById("editCategoryName").value = "";
      const platformField = document.getElementById("platformSelectField");
      if (platformField) platformField.style.display = "";
      const searchEl = document.getElementById("platformSearchInput");
      if (searchEl) searchEl.value = "";
      _platformSearchQuery = "";
      this.renderPlatformSelectList([], true);
      TR.filter.setCategoryFilterEditorState("exclude", []);
      document.getElementById("categoryEditPanel").classList.add("show");
    },
    editCategory(catId) {
      _isAddingNew = false;
      _editingCategoryId = catId;
      const platformField = document.getElementById("platformSelectField");
      if (platformField) platformField.style.display = "";
      const config2 = this.getMergedCategoryConfig();
      const isCustom = config2.customCategories.find((c) => c.id === catId);
      let cat, platforms;
      if (isCustom) {
        cat = isCustom;
        platforms = cat.platforms || [];
      } else {
        cat = _defaultCategories[catId];
        platforms = config2.platformOrder[catId] || cat.platforms || [];
      }
      document.getElementById("editCategoryName").value = cat.name;
      this.renderPlatformSelectList(platforms, isCustom);
      const fc = TR.filter.getCategoryFilterConfig(catId);
      TR.filter.setCategoryFilterEditorState(fc.mode, fc.keywords);
      _settingsHideDefaultCategories = true;
      _settingsCategoryListCollapsed = true;
      this.applyCategoryListCollapseState();
      const searchEl = document.getElementById("platformSearchInput");
      if (searchEl) searchEl.value = "";
      _platformSearchQuery = "";
      document.getElementById("categoryEditPanel").classList.add("show");
    },
    hideEditPanel() {
      document.getElementById("categoryEditPanel").classList.remove("show");
      _editingCategoryId = null;
      _isAddingNew = false;
      _settingsHideDefaultCategories = false;
      this.renderCategoryList();
      const searchEl = document.getElementById("platformSearchInput");
      if (searchEl) searchEl.value = "";
      _platformSearchQuery = "";
    },
    cancelEditCategory() {
      this.hideEditPanel();
    },
    renderPlatformSelectList(selectedPlatforms, isCustomCategory = false) {
      const container = document.getElementById("platformSelectList");
      const merged = this.getMergedCategoryConfig();
      const hiddenPlatforms = (merged.hiddenPlatforms || []).map((x) => String(x || "").trim()).filter(Boolean);
      const hiddenSet = new Set(hiddenPlatforms);
      const sortedPlatforms = [];
      selectedPlatforms.forEach((pid2) => {
        if (_allPlatforms[pid2]) sortedPlatforms.push(pid2);
      });
      if (isCustomCategory) {
        const allPlatformIds = Object.keys(_allPlatforms);
        allPlatformIds.forEach((pid2) => {
          if (!sortedPlatforms.includes(pid2)) sortedPlatforms.push(pid2);
        });
      }
      const query = (_platformSearchQuery || "").trim().toLowerCase();
      const visiblePlatforms = query ? sortedPlatforms.filter((pid2) => (_allPlatforms[pid2]?.name || "").toLowerCase().includes(query)) : sortedPlatforms;
      const disableDrag = query.length > 0;
      container.innerHTML = visiblePlatforms.map((pid2) => {
        const p = _allPlatforms[pid2];
        const isSelected = selectedPlatforms.includes(pid2) && !hiddenSet.has(String(pid2 || "").trim());
        return `
                <label class="platform-select-item ${isSelected ? "selected" : ""} ${disableDrag ? "no-drag" : ""}" data-platform-id="${pid2}" draggable="${disableDrag ? "false" : "true"}">
                    <span class="drag-handle">\u2630</span>
                    <input type="checkbox" ${isSelected ? "checked" : ""} onchange="togglePlatformSelect('${pid2}')">
                    <span>${p.name}</span>
                </label>
            `;
      }).join("");
      if (!disableDrag) {
        this.setupPlatformDragAndDrop();
      }
    },
    setPlatformSearchQuery(query) {
      _platformSearchQuery = String(query || "");
      const platforms = this.getSelectedPlatforms();
      this.renderPlatformSelectList(platforms, _isAddingNew === true);
    },
    bulkSelectPlatforms(mode) {
      const container = document.getElementById("platformSelectList");
      if (!container) return;
      const items = container.querySelectorAll(".platform-select-item");
      items.forEach((item) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (mode === "all") {
          item.classList.add("selected");
          if (checkbox) checkbox.checked = true;
        } else if (mode === "none" || mode === "clear") {
          item.classList.remove("selected");
          if (checkbox) checkbox.checked = false;
        }
      });
    },
    setupPlatformDragAndDrop() {
      const container = document.getElementById("platformSelectList");
      const items = container.querySelectorAll(".platform-select-item");
      items.forEach((item) => {
        item.addEventListener("dragstart", (e) => {
          item.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
        });
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          const dragging = container.querySelector(".dragging");
          if (dragging && dragging !== item) {
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
              container.insertBefore(dragging, item);
            } else {
              container.insertBefore(dragging, item.nextSibling);
            }
          }
        });
      });
    },
    togglePlatformSelect(platformId) {
      const item = document.querySelector(`.platform-select-item[data-platform-id="${platformId}"]`);
      if (item) {
        item.classList.toggle("selected");
      }
    },
    getSelectedPlatforms() {
      const items = document.querySelectorAll(".platform-select-item");
      const selected = [];
      items.forEach((item) => {
        if (item.classList.contains("selected")) {
          selected.push(item.dataset.platformId);
        }
      });
      return selected;
    },
    getOrderedPlatforms() {
      const items = document.querySelectorAll(".platform-select-item");
      const ordered = [];
      items.forEach((item) => {
        const pid2 = String(item?.dataset?.platformId || "").trim();
        if (pid2) ordered.push(pid2);
      });
      return ordered;
    },
    saveCategory() {
      const name = document.getElementById("editCategoryName").value.trim();
      const icon = "\u{1F4F1}";
      const platforms = this.getSelectedPlatforms();
      const orderedPlatforms = this.getOrderedPlatforms();
      if (!name) {
        alert("\u8BF7\u8F93\u5165\u680F\u76EE\u540D\u79F0");
        return false;
      }
      if (platforms.length === 0) {
        alert("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u5E73\u53F0");
        return false;
      }
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      ensureCategoryFilters(config2);
      const filterState = TR.filter.getEditingFilterState();
      if (_isAddingNew) {
        const newId = "custom-" + Date.now();
        config2.customCategories.push({
          id: newId,
          name,
          icon,
          platforms,
          isCustom: true
        });
        config2.categoryOrder.unshift(newId);
        config2.categoryFilters[newId] = {
          mode: filterState.mode,
          keywords: [...filterState.keywords]
        };
      } else if (_editingCategoryId) {
        const customIdx = config2.customCategories.findIndex((c) => c.id === _editingCategoryId);
        if (customIdx >= 0) {
          config2.customCategories[customIdx] = {
            ...config2.customCategories[customIdx],
            name,
            icon,
            platforms
          };
        } else {
          config2.platformOrder[_editingCategoryId] = orderedPlatforms;
          if (!Array.isArray(config2.hiddenPlatforms)) config2.hiddenPlatforms = [];
          const hiddenSet = new Set((config2.hiddenPlatforms || []).map((x) => String(x || "").trim()).filter(Boolean));
          orderedPlatforms.forEach((pid2) => {
            if (!pid2) return;
            if (platforms.includes(pid2)) {
              hiddenSet.delete(pid2);
            } else {
              hiddenSet.add(pid2);
            }
          });
          config2.hiddenPlatforms = Array.from(hiddenSet);
        }
        config2.categoryFilters[_editingCategoryId] = {
          mode: filterState.mode,
          keywords: [...filterState.keywords]
        };
      }
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      this.hideEditPanel();
      this.renderCategoryList();
      _settingsCategoryListCollapsed = false;
      this.applyCategoryListCollapseState();
      return true;
    },
    deleteCategory(catId) {
      if (!confirm("\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u81EA\u5B9A\u4E49\u680F\u76EE\u5417\uFF1F")) return;
      const config2 = this.getCategoryConfig() || this.getDefaultCategoryConfig();
      config2.customCategories = config2.customCategories.filter((c) => c.id !== catId);
      config2.categoryOrder = config2.categoryOrder.filter((id) => id !== catId);
      delete config2.platformOrder[catId];
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      this.renderCategoryList();
    },
    resetDefaultCategoryConfig() {
      if (!confirm("\u786E\u5B9A\u8981\u521D\u59CB\u5316\u9ED8\u8BA4\u680F\u76EE\u4E0E\u5361\u7247\u5417\uFF1F\u81EA\u5B9A\u4E49\u680F\u76EE\u5C06\u4FDD\u7559\u3002")) return;
      const userConfig = this.getCategoryConfig();
      if (!userConfig) {
        this.renderCategoryList();
        this.applyCategoryConfig();
        return;
      }
      const defaultConfig = this.getDefaultCategoryConfig();
      const defaultIds = Array.isArray(defaultConfig?.categoryOrder) ? defaultConfig.categoryOrder : [];
      const defaultSet = new Set(defaultIds.map((x) => String(x || "").trim()).filter(Boolean));
      const config2 = userConfig;
      config2.hiddenDefaultCategories = (config2.hiddenDefaultCategories || []).filter((id) => !defaultSet.has(String(id || "").trim()));
      config2.hiddenPlatforms = [];
      config2.platformOrder = {};
      const customIds = Array.isArray(config2.customCategories) ? config2.customCategories.map((c) => String(c?.id || "").trim()).filter(Boolean) : [];
      const nextOrder = defaultIds.slice();
      for (const cid2 of customIds) {
        if (!nextOrder.includes(cid2)) nextOrder.push(cid2);
      }
      config2.categoryOrder = nextOrder;
      this.saveCategoryConfig(config2);
      _categoryConfigChanged = true;
      this.renderCategoryList();
      this.applyCategoryConfig();
    },
    resetCategoryConfig() {
      if (!confirm("\u786E\u5B9A\u8981\u6062\u590D\u9ED8\u8BA4\u680F\u76EE\u914D\u7F6E\u5417\uFF1F\u6240\u6709\u81EA\u5B9A\u4E49\u680F\u76EE\u5C06\u88AB\u5220\u9664\u3002")) return;
      storage.remove(CATEGORY_CONFIG_KEY);
      _defaultCategories = null;
      _allPlatforms = null;
      this.renderCategoryList();
      this.applyCategoryConfig();
    },
    applyCategoryConfig() {
      TR.data.refreshViewerData({ preserveScroll: false });
    },
    applyCategoryConfigToData(serverCategories) {
      const merged = this.getMergedCategoryConfig();
      if (!_defaultCategories) {
        _defaultCategories = {};
        _allPlatforms = {};
        Object.entries(serverCategories).forEach(([catId, cat]) => {
          _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
          Object.entries(cat.platforms || {}).forEach(([pid2, p]) => {
            _allPlatforms[pid2] = { id: pid2, name: p.name, defaultCategory: catId, data: p };
          });
        });
      } else {
        Object.entries(serverCategories).forEach(([catId, cat]) => {
          if (!_defaultCategories[catId]) {
            _defaultCategories[catId] = { id: catId, name: cat.name, icon: cat.icon, isDefault: true, platforms: Object.keys(cat.platforms || {}) };
          } else {
            if (!_defaultCategories[catId].platforms) _defaultCategories[catId].platforms = [];
            const existingPlatforms = new Set(_defaultCategories[catId].platforms || []);
            Object.keys(cat.platforms || {}).forEach((pid2) => {
              if (!existingPlatforms.has(pid2)) {
                _defaultCategories[catId].platforms.push(pid2);
              }
            });
          }
          Object.entries(cat.platforms || {}).forEach(([pid2, p]) => {
            if (!_allPlatforms[pid2]) {
              _allPlatforms[pid2] = { id: pid2, name: p.name, defaultCategory: catId, data: p };
            }
          });
        });
      }
      const allPlatformData = {};
      Object.values(serverCategories).forEach((cat) => {
        Object.entries(cat.platforms || {}).forEach(([pid2, p]) => {
          allPlatformData[pid2] = p;
        });
      });
      const result = {};
      const hiddenCategories = merged.hiddenDefaultCategories || [];
      const hiddenPlatforms = (merged.hiddenPlatforms || []).map((x) => String(x || "").trim()).filter(Boolean);
      const hiddenPlatformSet = new Set(hiddenPlatforms);
      const categoryOrder = merged.categoryOrder || Object.keys(serverCategories);
      const customCategories = merged.customCategories || [];
      const platformOrder = merged.platformOrder || {};
      categoryOrder.forEach((catId) => {
        if (hiddenCategories.includes(catId)) return;
        if (String(catId || "").startsWith("rsscol-")) return;
        const customCat = customCategories.find((c) => c.id === catId);
        if (customCat) {
          const platforms = {};
          (customCat.platforms || []).forEach((pid2) => {
            if (hiddenPlatformSet.has(String(pid2 || "").trim())) return;
            if (allPlatformData[pid2]) {
              platforms[pid2] = allPlatformData[pid2];
            }
          });
          result[catId] = {
            name: customCat.name,
            icon: "\u{1F4F1}",
            platforms
          };
        } else if (serverCategories[catId]) {
          const serverCat = serverCategories[catId];
          const userPlatformOrder = platformOrder[catId];
          if (userPlatformOrder && userPlatformOrder.length > 0) {
            const inOrder = [];
            const inOrderSet = /* @__PURE__ */ new Set();
            userPlatformOrder.forEach((pid2) => {
              if (hiddenPlatformSet.has(String(pid2 || "").trim())) return;
              if (serverCat.platforms && serverCat.platforms[pid2]) {
                inOrder.push(pid2);
                inOrderSet.add(pid2);
              }
            });
            const rssMissing = [];
            const otherMissing = [];
            Object.keys(serverCat.platforms || {}).forEach((pid2) => {
              if (inOrderSet.has(pid2)) return;
              if (hiddenPlatformSet.has(String(pid2 || "").trim())) return;
              if (String(pid2 || "").startsWith("rss-")) {
                rssMissing.push(pid2);
              } else {
                otherMissing.push(pid2);
              }
            });
            const finalOrder = rssMissing.concat(inOrder, otherMissing);
            const platforms = {};
            finalOrder.forEach((pid2) => {
              if (hiddenPlatformSet.has(String(pid2 || "").trim())) return;
              if (serverCat.platforms && serverCat.platforms[pid2]) {
                platforms[pid2] = serverCat.platforms[pid2];
              }
            });
            result[catId] = { ...serverCat, platforms };
          } else {
            const platforms = {};
            Object.entries(serverCat.platforms || {}).forEach(([pid2, p]) => {
              if (hiddenPlatformSet.has(String(pid2 || "").trim())) return;
              platforms[pid2] = p;
            });
            result[catId] = { ...serverCat, platforms };
          }
        }
      });
      Object.keys(serverCategories).forEach((catId) => {
        if (String(catId || "").startsWith("rsscol-") && String(catId) !== "rsscol-rss") return;
        if (!result[catId] && !hiddenCategories.includes(catId)) {
          result[catId] = serverCategories[catId];
        }
      });
      return result;
    }
  };
  window.openCategorySettings = () => settings.openCategorySettings();
  window.closeCategorySettings = () => settings.closeCategorySettings();
  window.saveCategorySettings = () => settings.saveCategorySettings();
  window.cancelCategorySettings = () => settings.cancelCategorySettings();
  window.showAddCategoryPanel = () => settings.showAddCategoryPanel();
  window.editCategory = (catId) => settings.editCategory(catId);
  window.cancelEditCategory = () => settings.cancelEditCategory();
  window.saveCategory = () => settings.saveCategory();
  window.deleteCategory = (catId) => settings.deleteCategory(catId);
  window.resetDefaultCategoryConfig = () => settings.resetDefaultCategoryConfig();
  window.resetCategoryConfig = () => settings.resetCategoryConfig();
  window.toggleCategoryVisibility = (catId) => settings.toggleCategoryVisibility(catId);
  window.toggleCategoryListCollapseInSettings = () => settings.toggleCategoryListCollapseInSettings();
  window.toggleAllCategoriesOffInSettings = (input) => settings.toggleAllCategoriesOffInSettings(input);
  window.togglePlatformSelect = (platformId) => settings.togglePlatformSelect(platformId);
  window.bulkSelectPlatforms = (mode) => settings.bulkSelectPlatforms(mode);
  window.setPlatformSearchQuery = (query) => settings.setPlatformSearchQuery(query);
  TR.settings = settings;
  ready(function() {
    const existingConfig = settings.getCategoryConfig();
    if (existingConfig) {
      settings.syncConfigToCookie(existingConfig);
    }
  });

  // hotnews/web/static/js/src/filter.js
  var LEGACY_FILTER_STORAGE_KEY = "hotnews_filter_keywords";
  var LEGACY_FILTER_MODE_KEY = "hotnews_filter_mode_v1";
  var _editingCategoryFilterKeywords = [];
  var _editingCategoryFilterMode = "exclude";
  function normalizeFilterMode(v) {
    return v === "include" ? "include" : "exclude";
  }
  var filter = {
    normalizeFilterMode,
    getCategoryFilterConfig(catId) {
      if (!catId) return { mode: "exclude", keywords: [] };
      const merged = TR.settings.getMergedCategoryConfig();
      const cf = merged.categoryFilters && merged.categoryFilters[catId];
      const mode = normalizeFilterMode(cf && cf.mode);
      const keywords = Array.isArray(cf && cf.keywords) ? cf.keywords : [];
      return {
        mode,
        keywords: keywords.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean)
      };
    },
    applyCategoryFilter(categoryId) {
      const paneEl = document.getElementById(`tab-${categoryId}`);
      if (!paneEl) return;
      const cfg = this.getCategoryFilterConfig(categoryId);
      const mode = cfg.mode;
      const keywords = cfg.keywords;
      const sig = `${mode}|${keywords.join(",")}`;
      const prevSig = paneEl.dataset ? paneEl.dataset.filterSig : null;
      const sigChanged = prevSig !== sig;
      if (paneEl.dataset) paneEl.dataset.filterSig = sig;
      const isBulkLoading = paneEl.dataset && paneEl.dataset.bulkLoading === "1";
      paneEl.querySelectorAll(".news-item").forEach((item) => {
        const title = (item.textContent || "").toLowerCase();
        const matched = keywords.length > 0 ? keywords.some((k) => title.includes(k)) : false;
        const shouldFilter = keywords.length === 0 ? false : mode === "include" ? !matched : matched;
        if (shouldFilter) item.classList.add("filtered");
        else item.classList.remove("filtered");
      });
      if (mode !== "include") {
        paneEl.querySelectorAll(".platform-card").forEach((card) => {
          card.classList.remove("platform-empty-hidden");
        });
      }
      if (mode === "include") {
        if (keywords.length > 0) {
          try {
            if (sigChanged && !isBulkLoading) {
              paneEl.querySelectorAll(".platform-card").forEach((card) => {
                if (card?.dataset) card.dataset.loadedDone = "0";
              });
              if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleBulkLoadCategory === "function") {
                TR.infiniteScroll.scheduleBulkLoadCategory(categoryId, { pageSize: 40 });
              } else if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleEnsureCategoryLoaded === "function") {
                const cap = paneEl.querySelectorAll(".platform-card").length;
                TR.infiniteScroll.scheduleEnsureCategoryLoaded(categoryId, { cap, maxPagesPerCard: 2 });
              }
            }
          } catch (e) {
          }
        }
        paneEl.querySelectorAll(".platform-card").forEach((card) => {
          const done = card?.dataset?.loadedDone === "1";
          const isPending = !done || card?.dataset?.loading === "1";
          if (keywords.length > 0 && isPending) {
            card.classList.add("platform-empty-hidden");
            return;
          }
          card.classList.remove("platform-empty-hidden");
          const visibleItems = card.querySelectorAll(".news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)").length;
          if (visibleItems <= 0 && done) {
            card.classList.add("platform-empty-hidden");
          }
        });
      }
      try {
        const emptyEl = paneEl.querySelector(".category-empty-state");
        if (emptyEl) {
          if (mode === "include" && keywords.length > 0) {
            const cards = Array.from(paneEl.querySelectorAll(".platform-card"));
            const allDone = cards.length > 0 && cards.every((c) => c?.dataset?.loadedDone === "1" && c?.dataset?.loading !== "1");
            const visiblePlatforms = paneEl.querySelectorAll(".platform-card:not(.platform-empty-hidden)").length;
            emptyEl.style.display = allDone && visiblePlatforms === 0 ? "block" : "none";
          } else {
            emptyEl.style.display = "none";
          }
        }
      } catch (e) {
      }
      TR.counts.updateAllCounts();
      if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === "function") {
        TR.paging.scheduleAutofillActiveTab();
      }
    },
    applyCategoryFilterForActiveTab() {
      const active = document.querySelector(".category-tabs .category-tab.active");
      const catId = active?.dataset?.category;
      if (catId) this.applyCategoryFilter(catId);
    },
    setCategoryFilterEditorState(mode, keywords) {
      _editingCategoryFilterMode = normalizeFilterMode(mode);
      _editingCategoryFilterKeywords = (Array.isArray(keywords) ? keywords : []).map((k) => String(k || "").trim().toLowerCase()).filter(Boolean);
      const toggle = document.getElementById("categoryFilterModeToggle");
      if (toggle) toggle.checked = _editingCategoryFilterMode === "include";
      const input = document.getElementById("categoryFilterInput");
      if (input) input.value = "";
      this.renderCategoryFilterTags();
    },
    handleCategoryFilterModeToggle(input) {
      _editingCategoryFilterMode = input && input.checked ? "include" : "exclude";
    },
    handleCategoryFilterKeypress(event) {
      if (event.key === "Enter") {
        this.addCategoryFilterKeyword();
      }
    },
    addCategoryFilterKeyword() {
      const input = document.getElementById("categoryFilterInput");
      const keyword = (input?.value || "").trim().toLowerCase();
      if (!keyword) return;
      if (!_editingCategoryFilterKeywords.includes(keyword)) {
        _editingCategoryFilterKeywords.push(keyword);
        this.renderCategoryFilterTags();
      }
      if (input) input.value = "";
    },
    removeCategoryFilterKeyword(keyword) {
      _editingCategoryFilterKeywords = _editingCategoryFilterKeywords.filter((k) => k !== keyword);
      this.renderCategoryFilterTags();
    },
    renderCategoryFilterTags() {
      const tagsEl = document.getElementById("categoryFilterTags");
      if (!tagsEl) return;
      tagsEl.innerHTML = _editingCategoryFilterKeywords.map(
        (k) => `<span class="filter-tag">${escapeHtml(k)}<span class="filter-remove" onclick="removeCategoryFilterKeyword('${escapeHtml(k)}')">\xD7</span></span>`
      ).join("");
    },
    getEditingFilterState() {
      return {
        mode: _editingCategoryFilterMode,
        keywords: [..._editingCategoryFilterKeywords]
      };
    },
    migrateLegacyGlobalFilter() {
      const rawKeywords = storage.getRaw(LEGACY_FILTER_STORAGE_KEY);
      const rawMode = storage.getRaw(LEGACY_FILTER_MODE_KEY);
      if (!rawKeywords && !rawMode) return;
      let keywords = [];
      try {
        keywords = rawKeywords ? JSON.parse(rawKeywords) : [];
      } catch (e) {
        keywords = [];
      }
      if (!Array.isArray(keywords)) keywords = [];
      keywords = keywords.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean);
      const mode = normalizeFilterMode(rawMode);
      const config2 = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
      TR.settings.ensureCategoryFilters(config2);
      const merged = TR.settings.getMergedCategoryConfig();
      const allIds = merged.categoryOrder || [];
      allIds.forEach((catId) => {
        if (!config2.categoryFilters[catId]) {
          config2.categoryFilters[catId] = { mode, keywords: [...keywords] };
        }
      });
      TR.settings.saveCategoryConfig(config2);
      storage.remove(LEGACY_FILTER_STORAGE_KEY);
      storage.remove(LEGACY_FILTER_MODE_KEY);
    }
  };
  window.handleCategoryFilterModeToggle = (input) => filter.handleCategoryFilterModeToggle(input);
  window.handleCategoryFilterKeypress = (event) => filter.handleCategoryFilterKeypress(event);
  window.addCategoryFilterKeyword = () => filter.addCategoryFilterKeyword();
  window.removeCategoryFilterKeyword = (keyword) => filter.removeCategoryFilterKeyword(keyword);
  TR.filter = filter;
  ready(function() {
    filter.migrateLegacyGlobalFilter();
    filter.applyCategoryFilterForActiveTab();
  });

  // hotnews/web/static/js/src/tabs.js
  var TAB_STORAGE_KEY = "hotnews_active_tab";
  var VIEWER_POS_STORAGE_KEY = "hotnews_viewer_pos_v1";
  var TAB_SWITCHED_EVENT = "tr_tab_switched";
  var EXPLORE_MODAL_OPENED_EVENT = "tr_explore_modal_opened";
  var EXPLORE_MODAL_CLOSED_EVENT = "tr_explore_modal_closed";
  var _explorePrevTabId = null;
  var _explorePrevScrollY = 0;
  function _persistViewerPos(tabId, scrollY) {
    try {
      const t = String(tabId || "").trim();
      if (!t) return;
      const payload = {
        activeTab: t,
        scrollY: Number(scrollY || 0) || 0,
        updatedAt: Date.now()
      };
      storage.setRaw(VIEWER_POS_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
    }
  }
  function _recordBeforeExploreModalOpen() {
    try {
      const prev3 = tabs.getActiveTabId();
      _explorePrevTabId = prev3 ? String(prev3) : null;
      _explorePrevScrollY = window.scrollY || 0;
      try {
        const grid = _explorePrevTabId ? document.querySelector(`#tab-${_explorePrevTabId} .platform-grid`) : null;
        if (_explorePrevTabId && grid) {
          TR.scroll.recordPlatformGridScrollForTab(_explorePrevTabId, grid);
        }
      } catch (e) {
      }
    } catch (e) {
    }
  }
  function _restoreViewerPosIfAny() {
    try {
      const raw = storage.getRaw(VIEWER_POS_STORAGE_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      const tabId = String(pos?.activeTab || "").trim();
      if (!tabId) return;
      const escaped = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(tabId)) : String(tabId);
      const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
      if (!tabEl) return;
      tabs.switchTab(tabId);
      const y = Number(pos?.scrollY || 0) || 0;
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: y, behavior: "auto" });
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  function _restoreFromExploreModal() {
    const prevTabId = _explorePrevTabId;
    const prevScrollY = _explorePrevScrollY;
    _explorePrevTabId = null;
    _explorePrevScrollY = 0;
    if (!prevTabId) return;
    try {
      const escaped = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(prevTabId)) : String(prevTabId);
      const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
      const paneEl = document.getElementById(`tab-${prevTabId}`);
      if (!tabEl || !paneEl) return;
    } catch (e) {
    }
    try {
      TR.tabs.switchTab(prevTabId);
    } catch (e) {
    }
    _persistViewerPos(prevTabId, prevScrollY);
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: prevScrollY, behavior: "auto" });
      } catch (e) {
      }
      try {
        TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: prevTabId });
      } catch (e) {
      }
    });
  }
  var tabs = {
    TAB_STORAGE_KEY,
    switchTab(categoryId) {
      TR.badges.dismissNewCategoryBadge(categoryId);
      document.body.classList.toggle("tr-rss-reading", String(categoryId) === "rsscol-rss");
      const escapedCategoryId = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(categoryId)) : String(categoryId);
      const tabEl = document.querySelector(`.category-tab[data-category="${escapedCategoryId}"]`);
      const paneEl = document.getElementById(`tab-${categoryId}`);
      if (!tabEl || !paneEl) {
        const firstTab = document.querySelector(".category-tab");
        if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
          this.switchTab(firstTab.dataset.category);
        } else {
          storage.remove(TAB_STORAGE_KEY);
        }
        return;
      }
      document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
      tabEl.classList.add("active");
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      paneEl.classList.add("active");
      storage.setRaw(TAB_STORAGE_KEY, categoryId);
      try {
        window.dispatchEvent(new CustomEvent(TAB_SWITCHED_EVENT, { detail: { categoryId } }));
      } catch (e) {
      }
      _persistViewerPos(categoryId, window.scrollY || 0);
      TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: categoryId });
      if (categoryId === "sports") {
        TR.badges.markFeatureSeen("sports-nba-schedule");
        TR.badges.updateNewBadges();
      }
      TR.filter.applyCategoryFilter(categoryId);
      if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === "function") {
        TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
      }
      try {
        const hasItems = !!paneEl.querySelector(".news-item");
        const hasPlaceholder = !!paneEl.querySelector(".news-placeholder");
        const shouldLoad = !hasItems && hasPlaceholder;
        if (shouldLoad) {
          if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleBulkLoadCategory === "function") {
            TR.infiniteScroll.scheduleBulkLoadCategory(categoryId);
          } else if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleEnsureCategoryLoaded === "function") {
            TR.infiniteScroll.scheduleEnsureCategoryLoaded(categoryId);
          }
        }
      } catch (e) {
      }
    },
    restoreActiveTab() {
      const savedTab = storage.getRaw(TAB_STORAGE_KEY);
      if (savedTab) {
        try {
          const isE2E = new URLSearchParams(window.location.search).get("e2e") === "1";
          if (isE2E && String(savedTab) === "rsscol-rss") {
            storage.remove(TAB_STORAGE_KEY);
            return;
          }
        } catch (e) {
        }
        const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
        if (tabEl) {
          this.switchTab(savedTab);
        }
      }
    },
    getActiveTabId() {
      return storage.getRaw(TAB_STORAGE_KEY) || document.querySelector(".category-tab.active")?.dataset?.category || null;
    },
    restoreActiveTabPlatformGridScroll(state) {
      TR.scroll.restoreActiveTabPlatformGridScroll(state);
    },
    attachPlatformGridScrollPersistence() {
      TR.scroll.attachPlatformGridScrollPersistence();
    }
  };
  window.switchTab = (categoryId) => tabs.switchTab(categoryId);
  TR.tabs = tabs;
  ready(function() {
    try {
      window.addEventListener(EXPLORE_MODAL_OPENED_EVENT, () => {
        _recordBeforeExploreModalOpen();
      });
      window.addEventListener(EXPLORE_MODAL_CLOSED_EVENT, () => {
        _restoreFromExploreModal();
      });
    } catch (e) {
    }
    tabs.restoreActiveTab();
    _restoreViewerPosIfAny();
    tabs.attachPlatformGridScrollPersistence();
    const tabId = tabs.getActiveTabId();
    if (tabId) {
      tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }
  });

  // hotnews/web/static/js/src/data.js
  var TAB_STORAGE_KEY2 = "hotnews_active_tab";
  var CATEGORY_PAGE_SIZE2 = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var _ajaxRefreshInFlight = false;
  var _ajaxLastRefreshAt = 0;
  var _ajaxRefreshPending = null;
  var _latestCategories = null;
  var _platformCloseHandlersAttached = false;
  var _lazyPlatformObserver = null;
  function _getCategoryIdFromCard(card) {
    const pane = card?.closest?.(".tab-pane");
    const id = pane?.id || "";
    return id.startsWith("tab-") ? id.slice(4) : null;
  }
  function _renderPlatformHeaderButtonsHtml(catId, platformId) {
    const pid2 = String(platformId || "").trim();
    const isRss = pid2.startsWith("rss-");
    const canDelete = isRss;
    const delBtn = canDelete ? '<button type="button" class="tr-platform-card-delete" data-action="delete-platform">\u2212</button>' : "";
    const hideBtn = !isRss ? '<button type="button" class="tr-platform-card-hide" data-action="hide-platform">\u{1F648}</button>' : "";
    return `${delBtn}${hideBtn}`;
  }
  function _renderSkeletonNewsItemsHtml(count) {
    const n = Math.max(0, Number(count || 0) || 0);
    let html = "";
    for (let i = 0; i < n; i++) {
      html += '<li class="tr-news-skeleton" aria-hidden="true"><div class="tr-news-skeleton-line"></div></li>';
    }
    return html;
  }
  function _createNewsLi(n, idx, platformId) {
    const li = document.createElement("li");
    li.className = "news-item";
    li.dataset.newsId = String(n?.stable_id || "");
    li.dataset.newsTitle = String(n?.display_title || n?.title || "");
    const content = document.createElement("div");
    content.className = "news-item-content";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "news-checkbox";
    cb.title = "\u6807\u8BB0\u5DF2\u8BFB";
    cb.addEventListener("change", () => {
      try {
        window.markAsRead(cb);
      } catch (e) {
      }
    });
    const indexSpan = document.createElement("span");
    indexSpan.className = "news-index";
    indexSpan.textContent = String(idx);
    const a = document.createElement("a");
    a.className = "news-title";
    if (n?.is_cross_platform) a.classList.add("cross-platform");
    a.href = String(n?.url || "#");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("onclick", "handleTitleClickV2(this, event)");
    a.setAttribute("onauxclick", "handleTitleClickV2(this, event)");
    a.setAttribute("oncontextmenu", "handleTitleClickV2(this, event)");
    a.setAttribute("onkeydown", "handleTitleKeydownV2(this, event)");
    a.textContent = String(n?.display_title || n?.title || "");
    if (n?.is_cross_platform) {
      const cps = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
      const badge = document.createElement("span");
      badge.className = "cross-platform-badge";
      badge.title = `\u540C\u65F6\u51FA\u73B0\u5728: ${cps.join(", ")}`;
      badge.textContent = `\u{1F525} ${String(n?.cross_platform_count ?? "")}`;
      a.appendChild(document.createTextNode(" "));
      a.appendChild(badge);
    }
    content.appendChild(cb);
    content.appendChild(indexSpan);
    content.appendChild(a);
    const dateStr = formatNewsDate(n?.timestamp);
    if (dateStr) {
      const dateSpan = document.createElement("span");
      dateSpan.className = "tr-news-date";
      dateSpan.style.marginLeft = "8px";
      dateSpan.style.color = "#9ca3af";
      dateSpan.style.fontSize = "12px";
      dateSpan.style.whiteSpace = "nowrap";
      dateSpan.textContent = dateStr;
      content.appendChild(dateSpan);
    }
    li.appendChild(content);
    const meta = String(n?.meta || "").trim();
    const isRssPlatform = String(platformId || "").startsWith("rss-");
    if (meta && !isRssPlatform) {
      const sub = document.createElement("div");
      sub.className = "news-subtitle";
      sub.textContent = meta;
      li.appendChild(sub);
    }
    try {
      const reads = TR.readState?.getReadNews?.() || {};
      if (li.dataset.newsId && reads[li.dataset.newsId]) {
        li.classList.add("read");
        cb.checked = true;
      }
    } catch (e) {
    }
    return li;
  }
  async function _hydrateLazyPlatformCard(card) {
    if (!card || !(card instanceof Element)) return;
    if (String(card?.dataset?.lazy || "") !== "1") return;
    if (String(card?.dataset?.loading || "") === "1") return;
    const pane = card.closest(".tab-pane");
    if (!pane || !pane.classList.contains("active")) return;
    const pid2 = String(card.dataset.platform || "").trim();
    if (!pid2) return;
    card.dataset.loading = "1";
    try {
      const url = `/api/news/page?platform_id=${encodeURIComponent(pid2)}&offset=0&page_size=${encodeURIComponent(String(CATEGORY_PAGE_SIZE2))}`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const payload = await resp.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const list = card.querySelector(".news-list");
      if (!list) return;
      list.querySelectorAll(".tr-news-skeleton").forEach((el) => el.remove());
      list.querySelectorAll(".news-placeholder").forEach((el) => el.remove());
      list.querySelectorAll(".news-item").forEach((el) => el.remove());
      const capped = items.slice(0, CATEGORY_PAGE_SIZE2);
      for (let i = 0; i < capped.length; i++) {
        list.appendChild(_createNewsLi(capped[i], i + 1, pid2));
      }
      const loadedCount = list.querySelectorAll(".news-item").length;
      card.dataset.loadedCount = String(loadedCount);
      card.dataset.hasMore = "0";
      card.dataset.loadedDone = "1";
      card.dataset.lazy = "0";
      try {
        if (TR.paging) {
          TR.paging.setCardPageSize(card, Math.min(CATEGORY_PAGE_SIZE2, Math.max(1, loadedCount || CATEGORY_PAGE_SIZE2)));
          TR.paging.applyPagingToCard(card, 0);
        }
      } catch (e) {
      }
      try {
        if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
        if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
      } catch (e) {
      }
      try {
        TR.search?.searchNews?.();
      } catch (e) {
      }
      try {
        const activeTab = TR.tabs?.getActiveTabId?.() || null;
        if (activeTab) TR.filter?.applyCategoryFilter?.(activeTab);
      } catch (e) {
      }
    } catch (e) {
    } finally {
      card.dataset.loading = "0";
    }
  }
  function _attachLazyPlatformObservers() {
    try {
      if (_lazyPlatformObserver) {
        _lazyPlatformObserver.disconnect();
        _lazyPlatformObserver = null;
      }
    } catch (e) {
    }
    _lazyPlatformObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target;
        if (!card || !(card instanceof Element)) continue;
        if (String(card?.dataset?.lazy || "") !== "1") {
          try {
            _lazyPlatformObserver?.unobserve?.(card);
          } catch (e) {
          }
          continue;
        }
        _hydrateLazyPlatformCard(card).catch(() => {
        });
      }
    }, { root: null, rootMargin: "0px 200px 0px 200px", threshold: 0.15 });
    document.querySelectorAll('.platform-card[data-lazy="1"]').forEach((card) => {
      try {
        _lazyPlatformObserver.observe(card);
      } catch (e) {
      }
    });
  }
  var _trConfirmOverlayEl = null;
  var _trConfirmResolve = null;
  function _showCenteredConfirmModal(message, okText, cancelText) {
    return new Promise((resolve) => {
      if (_trConfirmResolve) {
        try {
          _trConfirmResolve(false);
        } catch (e) {
        }
      }
      _trConfirmResolve = resolve;
      if (!_trConfirmOverlayEl) {
        const overlay = document.createElement("div");
        overlay.className = "tr-confirm-overlay";
        overlay.innerHTML = `
                <div class="tr-confirm-modal" role="dialog" aria-modal="true">
                    <div class="tr-confirm-message"></div>
                    <div class="tr-confirm-actions">
                        <button type="button" class="tr-confirm-btn tr-confirm-cancel" data-action="cancel"></button>
                        <button type="button" class="tr-confirm-btn tr-confirm-ok" data-action="ok"></button>
                    </div>
                </div>`;
        overlay.addEventListener("click", (e) => {
          const t = e?.target;
          if (!t || !(t instanceof Element)) return;
          const okBtn = t.closest('button[data-action="ok"]');
          const cancelBtn = t.closest('button[data-action="cancel"]');
          if (okBtn) {
            e.preventDefault();
            overlay.classList.remove("show");
            const r = _trConfirmResolve;
            _trConfirmResolve = null;
            r?.(true);
            return;
          }
          if (cancelBtn || t === overlay) {
            e.preventDefault();
            overlay.classList.remove("show");
            const r = _trConfirmResolve;
            _trConfirmResolve = null;
            r?.(false);
          }
        });
        document.body.appendChild(overlay);
        _trConfirmOverlayEl = overlay;
      }
      try {
        const msgEl = _trConfirmOverlayEl.querySelector(".tr-confirm-message");
        if (msgEl) msgEl.textContent = String(message || "");
        const okEl = _trConfirmOverlayEl.querySelector('button[data-action="ok"]');
        if (okEl) okEl.textContent = String(okText || "\u786E\u8BA4");
        const cancelEl = _trConfirmOverlayEl.querySelector('button[data-action="cancel"]');
        if (cancelEl) cancelEl.textContent = String(cancelText || "\u53D6\u6D88");
      } catch (e) {
      }
      _trConfirmOverlayEl.classList.add("show");
    });
  }
  async function _verifyServerRssSubscriptionRemoved(sourceId) {
    const sid = String(sourceId || "").trim();
    if (!sid) return false;
    try {
      const resp = await fetch("/api/me/rss-subscriptions", { method: "GET" });
      if (!resp.ok) return false;
      const payload = await resp.json().catch(() => ({}));
      const subs = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
      const exists = subs.some((s) => String(s?.source_id || s?.rss_source_id || "").trim() === sid);
      return !exists;
    } catch (e) {
      return false;
    }
  }
  async function _deleteRssSubscriptionByPlatformId(platformId) {
    const pid2 = String(platformId || "").trim();
    if (!pid2.startsWith("rss-")) return false;
    const sid = pid2.slice(4);
    if (!sid) return false;
    if (!TR.subscription) return false;
    try {
      TR.subscription.ensureSnapshot?.();
    } catch (e) {
    }
    let subs = [];
    try {
      subs = TR.subscription.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    } catch (e) {
      subs = [];
    }
    const next3 = (Array.isArray(subs) ? subs : []).filter((s) => String(s?.source_id || s?.rss_source_id || "").trim() !== sid);
    try {
      TR.subscription.setSubscriptions?.(next3);
    } catch (e) {
      return false;
    }
    try {
      if (TR.subscription.saveOnly) {
        await TR.subscription.saveOnly();
      } else if (TR.subscription.saveAndRefresh) {
        await TR.subscription.saveAndRefresh();
      }
    } catch (e) {
      return false;
    }
    return await _verifyServerRssSubscriptionRemoved(sid);
  }
  async function _deletePlatformCard(cardEl) {
    if (!cardEl || !(cardEl instanceof Element)) return;
    const catId = _getCategoryIdFromCard(cardEl);
    const pid2 = String(cardEl.getAttribute("data-platform") || "").trim();
    if (!catId || !pid2) return;
    if (catId === "explore") return;
    const isRss = pid2.startsWith("rss-");
    if (!isRss) return;
    try {
      let shouldConfirm = true;
      try {
        const qs = new URLSearchParams(window.location.search);
        if (qs.get("e2e") === "1") {
          shouldConfirm = false;
        }
      } catch (e2) {
      }
      try {
        if (typeof navigator !== "undefined" && navigator.webdriver === true) {
          shouldConfirm = false;
        }
      } catch (e2) {
      }
      if (shouldConfirm) {
        const ok2 = await _showCenteredConfirmModal(
          "\u786E\u5B9A\u8981\u5220\u9664\u8BE5 RSS \u5361\u7247\u5417\uFF1F\u5220\u9664\u540E\u5C06\u53D6\u6D88\u8BA2\u9605\u3002",
          "\u786E\u8BA4\u5220\u9664",
          "\u53D6\u6D88"
        );
        if (!ok2) return;
      }
    } catch (e) {
    }
    try {
      const btn = cardEl.querySelector('button[data-action="delete-platform"]');
      if (btn) btn.setAttribute("disabled", "true");
    } catch (e) {
    }
    const parent = cardEl.parentNode;
    const nextSibling = cardEl.nextSibling;
    try {
      if (parent) parent.removeChild(cardEl);
    } catch (e) {
    }
    try {
      TR.counts?.updateAllCounts?.();
    } catch (e) {
    }
    const ok = await _deleteRssSubscriptionByPlatformId(pid2);
    if (!ok) {
      try {
        if (parent) {
          if (nextSibling) parent.insertBefore(cardEl, nextSibling);
          else parent.appendChild(cardEl);
        }
      } catch (e) {
      }
      try {
        const btn2 = cardEl.querySelector('button[data-action="delete-platform"]');
        if (btn2) btn2.removeAttribute("disabled");
      } catch (e) {
      }
      try {
        TR.toast?.show?.("\u5220\u9664\u5931\u8D25\uFF1A\u8BA2\u9605\u672A\u80FD\u4ECE\u670D\u52A1\u7AEF\u79FB\u9664\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", { variant: "error", durationMs: 2500 });
      } catch (e) {
      }
      return;
    }
    try {
      TR.counts?.updateAllCounts?.();
      TR.readState?.updateReadCount?.();
    } catch (e) {
    }
  }
  var data = {
    formatUpdatedAt,
    snapshotViewerState() {
      const activeTab = storage.getRaw(TAB_STORAGE_KEY2) || document.querySelector(".category-tab.active")?.dataset?.category || null;
      const pagingOffsets = {};
      document.querySelectorAll(".platform-card").forEach((card) => {
        const pid2 = card.dataset.platform;
        if (!pid2) return;
        pagingOffsets[pid2] = parseInt(card.dataset.pageOffset || "0", 10) || 0;
      });
      const grid = activeTab ? document.querySelector(`#tab-${activeTab} .platform-grid`) : null;
      const activeTabPlatformGridScrollLeft = grid ? grid.scrollLeft || 0 : 0;
      let activeTabPlatformAnchorPlatformId = null;
      let activeTabPlatformAnchorOffsetX = 0;
      if (grid) {
        const left = grid.scrollLeft || 0;
        let anchor = null;
        const cards = grid.querySelectorAll(".platform-card");
        for (const card of cards) {
          if ((card.offsetLeft || 0) <= left + 1) {
            anchor = card;
          } else {
            break;
          }
        }
        if (anchor?.dataset?.platform) {
          activeTabPlatformAnchorPlatformId = anchor.dataset.platform;
          activeTabPlatformAnchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
        }
      }
      if (activeTab && grid) {
        TR.scroll.recordPlatformGridScrollForTab(activeTab, grid);
      }
      return {
        activeTab,
        pagingOffsets,
        activeTabPlatformGridScrollLeft,
        activeTabPlatformAnchorPlatformId,
        activeTabPlatformAnchorOffsetX,
        showReadMode: document.body.classList.contains("show-read-mode"),
        scrollY: window.scrollY || 0,
        searchText: document.getElementById("searchInput")?.value || ""
      };
    },
    renderViewerFromData(data2, state) {
      const contentEl = document.querySelector(".tab-content-area");
      const tabsEl = document.querySelector(".category-tabs");
      if (!tabsEl || !contentEl) return;
      let _knowledgeGridHtml = "";
      try {
        const existingPane = document.getElementById("tab-knowledge");
        const existingGrid = existingPane ? existingPane.querySelector(".platform-grid") : null;
        const hasMb = !!(existingGrid && existingGrid.querySelector(".tr-morning-brief-card"));
        const hasItems = !!(existingGrid && existingGrid.querySelector(".news-item"));
        if (hasMb && hasItems) {
          _knowledgeGridHtml = String(existingGrid.innerHTML || "");
        }
      } catch (e) {
        _knowledgeGridHtml = "";
      }
      const categories = TR.settings.applyCategoryConfigToData(data2?.categories || {});
      _latestCategories = categories;
      const preferredActiveTab = state && typeof state.activeTab === "string" ? state.activeTab : null;
      const isE2E = (() => {
        try {
          return new URLSearchParams(window.location.search).get("e2e") === "1";
        } catch (e) {
          return false;
        }
      })();
      const tabIds = Object.keys(categories || {});
      let firstTabId = tabIds[0] || null;
      if (firstTabId === "explore") {
        firstTabId = tabIds.find((id) => id !== "explore") || firstTabId;
      }
      if (isE2E && firstTabId === "rsscol-rss") {
        firstTabId = tabIds.find((id) => id !== "rsscol-rss") || firstTabId;
      }
      let activeTabId = preferredActiveTab || firstTabId;
      if (activeTabId === "explore") {
        activeTabId = tabIds.find((id) => id !== "explore") || activeTabId;
      }
      if (isE2E && activeTabId === "rsscol-rss") {
        activeTabId = tabIds.find((id) => id !== "rsscol-rss") || activeTabId;
      }
      const tabsHtml = Object.entries(categories).map(([catId, cat]) => {
        const icon = escapeHtml(cat?.icon || "");
        const name = escapeHtml(cat?.name || catId);
        const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${escapeHtml(catId)}">NEW</span>` : "";
        const badgeSports = catId === "sports" ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : "";
        const badge = `${badgeCategory}${badgeSports}`;
        const activeClass = String(catId) === String(activeTabId) ? " active" : "";
        return `
            <div class="category-tab${activeClass}" data-category="${escapeHtml(catId)}" draggable="false" onclick="switchTab('${escapeHtml(catId)}')">
                <span class="category-drag-handle" title="\u62D6\u62FD\u8C03\u6574\u680F\u76EE\u987A\u5E8F" draggable="true">\u2630</span>
                <div class="category-tab-icon">${icon}</div>
                <div class="category-tab-name">${name}${badge}</div>
            </div>`;
      }).join("");
      const contentHtml = Object.entries(categories).map(([catId, cat]) => {
        const isActiveCategory = !!activeTabId && String(catId) === String(activeTabId);
        const paneActiveClass = isActiveCategory ? " active" : "";
        if (String(catId) === "rsscol-rss") {
          const btnRow = `
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <div id="rssCategoryCarouselStatus" style="color:#6b7280;font-size:0.85rem;flex:1;min-width:200px;"></div>
                    </div>`;
          return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" style="display:flex;flex-direction:column;gap:10px;min-height:0;">
                        ${btnRow}
                        <div id="rssCategoryCarouselGrid" style="display:flex;flex-direction:column;gap:10px;min-height:0;"></div>
                    </div>
                    <div class="category-empty-state" style="display:none;" aria-hidden="true">\u6CA1\u6709\u5339\u914D\u5185\u5BB9\uFF0C\u8BF7\u8C03\u6574\u5173\u952E\u8BCD\u6216\u5207\u6362\u6A21\u5F0F</div>
                </div>`;
        }
        if (String(catId) === "explore") {
          return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" id="trExploreGrid"></div>
                </div>`;
        }
        if (String(catId) === "knowledge") {
          const gridInner = _knowledgeGridHtml || `
                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-1" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">\u{1F552} \u6700\u65B0 1-50</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice1">
                            <li class="news-placeholder" aria-hidden="true">\u52A0\u8F7D\u4E2D...</li>
                        </ul>
                    </div>

                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-2" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">\u2B50 \u6700\u65B0 51-100</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice2">
                            <li class="news-placeholder" aria-hidden="true">\u52A0\u8F7D\u4E2D...</li>
                        </ul>
                    </div>

                    <div class="platform-card tr-morning-brief-card" data-platform="mb-slice-3" data-page-size="50" draggable="false">
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">\u{1F9FE} \u6700\u65B0 101-150</div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list" data-mb-list="slice3">
                            <li class="news-placeholder" aria-hidden="true">\u52A0\u8F7D\u4E2D...</li>
                        </ul>
                    </div>
                `;
          return `
                <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                    <div class="platform-grid" data-mb-injected="1">${gridInner}</div>
                </div>`;
        }
        const platforms = cat?.platforms || {};
        const orderedIds = Object.keys(platforms || {});
        const platformCards = orderedIds.map((platformId, idx0) => {
          const platform = platforms?.[platformId];
          if (!platform) return "";
          const platformName = escapeHtml(platform?.name || platformId);
          const platformBadge = platform?.is_new ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(platformId)}">NEW</span>` : "";
          const news = Array.isArray(platform?.news) ? platform.news : [];
          const totalCount = news.length;
          const shouldHydrate = isActiveCategory && idx0 < 3;
          const isLazy = !shouldHydrate;
          const initialCount = shouldHydrate ? Math.min(totalCount, CATEGORY_PAGE_SIZE2) : 0;
          const pagingOffset = platformId && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[platformId]) ? state.pagingOffsets[platformId] : 0;
          const filteredNews = news.slice(0, initialCount);
          const newsItemsHtml = isLazy ? _renderSkeletonNewsItemsHtml(8) : filteredNews.map((n, idx) => {
            const stableId = escapeHtml(n?.stable_id || "");
            const title = escapeHtml(n?.display_title || n?.title || "");
            const url = escapeHtml(n?.url || "");
            const meta = escapeHtml(n?.meta || "");
            const isRssPlatform = String(platformId || "").startsWith("rss-");
            const isCross = !!n?.is_cross_platform;
            const crossPlatforms = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
            const crossTitle = escapeHtml(crossPlatforms.join(", "));
            const crossCount = escapeHtml(n?.cross_platform_count ?? "");
            const crossBadge = isCross ? `<span class="cross-platform-badge" title="\u540C\u65F6\u51FA\u73B0\u5728: ${crossTitle}">\u{1F525} ${crossCount}</span>` : "";
            const crossClass = isCross ? "cross-platform" : "";
            const checkboxHtml = '<input type="checkbox" class="news-checkbox" title="\u6807\u8BB0\u5DF2\u8BFB" onchange="markAsRead(this)" />';
            const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;
            const pagedHidden = idx < pagingOffset || idx >= pagingOffset + CATEGORY_PAGE_SIZE2 ? " paged-hidden" : "";
            const metaHtml = meta && !isRssPlatform ? `<div class="news-subtitle">${meta}</div>` : "";
            const safeHref = url || "#";
            const dateStr = formatNewsDate(n?.timestamp);
            const dateHtml = dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${escapeHtml(dateStr)}</span>` : "";
            return `
                        <li class="news-item${pagedHidden}" data-news-id="${stableId}" data-news-title="${title}">
                            <div class="news-item-content">
                                ${checkboxHtml}
                                ${indexHtml}
                                <a class="news-title ${crossClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                                    ${title}
                                    ${crossBadge}
                                </a>
                                ${dateHtml}
                            </div>
                            ${metaHtml}
                        </li>`;
          }).join("");
          const headerButtons = _renderPlatformHeaderButtonsHtml(catId, platformId);
          const dragHandle = `<span class="platform-drag-handle" title="\u62D6\u62FD\u8C03\u6574\u5E73\u53F0\u987A\u5E8F" draggable="true">\u2630</span>`;
          return `
                <div class="platform-card" data-platform="${escapeHtml(platformId)}" data-total-count="${String(totalCount)}" data-loaded-count="${String(initialCount)}" data-lazy="${isLazy ? "1" : "0"}" data-loaded-done="${isLazy ? "0" : "1"}" draggable="false">
                    <div class="platform-header">
                        ${dragHandle}
                        <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(platformId)}')">\u{1F4F1} ${platformName}${platformBadge}</div>
                        <div class="platform-header-actions">${headerButtons}</div>
                    </div>
                    <ul class="news-list">${newsItemsHtml}
                    </ul>
                    <div class="news-load-sentinel" aria-hidden="true"></div>
                </div>`;
        }).filter(Boolean).join("");
        return `
            <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                <div class="platform-grid">${platformCards}
                </div>
                <div class="category-empty-state" style="display:none;" aria-hidden="true">\u6CA1\u6709\u5339\u914D\u5185\u5BB9\uFF0C\u8BF7\u8C03\u6574\u5173\u952E\u8BCD\u6216\u5207\u6362\u6A21\u5F0F</div>
            </div>`;
      }).join("");
      tabsEl.innerHTML = tabsHtml;
      contentEl.innerHTML = contentHtml;
      try {
        const isMobile = !!window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
        const tabCount = tabsEl.querySelectorAll(".category-tab").length;
        if (isMobile) {
          tabsEl.classList.remove("compact");
        } else {
          tabsEl.classList.toggle("compact", tabCount > 8);
        }
      } catch (e) {
      }
      const updatedAtEl = document.getElementById("updatedAt");
      if (updatedAtEl && data2?.updated_at) updatedAtEl.textContent = formatUpdatedAt(data2.updated_at);
      const desiredTab = state && typeof state.activeTab === "string" ? state.activeTab : null;
      if (desiredTab) {
        const escapedDesired = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(desiredTab) : desiredTab;
        const desiredTabEl = document.querySelector(`.category-tab[data-category="${escapedDesired}"]`);
        if (desiredTabEl) {
          TR.tabs.switchTab(desiredTab);
        } else {
          const firstTab = document.querySelector(".category-tab");
          if (firstTab?.dataset?.category) {
            TR.tabs.switchTab(firstTab.dataset.category);
          } else {
            storage.remove(TAB_STORAGE_KEY2);
          }
        }
      } else {
        const firstTab = document.querySelector(".category-tab");
        if (firstTab?.dataset?.category) {
          TR.tabs.switchTab(firstTab.dataset.category);
        } else {
          storage.remove(TAB_STORAGE_KEY2);
        }
      }
      const nextShowReadMode = typeof state?.showReadMode === "boolean" ? state.showReadMode : TR.readState.getShowReadModePref();
      TR.readState.applyShowReadMode(nextShowReadMode);
      const searchEl = document.getElementById("searchInput");
      if (searchEl && typeof state?.searchText === "string") {
        searchEl.value = state.searchText;
      }
      TR.search.searchNews();
      TR.filter.applyCategoryFilterForActiveTab();
      TR.readState.restoreReadState();
      document.querySelectorAll(".platform-card").forEach((card) => {
        const pid2 = card.dataset.platform;
        const off = pid2 && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid2]) ? state.pagingOffsets[pid2] : 0;
        TR.paging.setCardPageSize(card, TR.paging.PAGE_SIZE);
        TR.paging.applyPagingToCard(card, off);
      });
      TR.counts.updateAllCounts();
      TR.readState.updateReadCount();
      TR.scroll.restoreActiveTabPlatformGridScroll(state);
      TR.scroll.attachPlatformGridScrollPersistence();
      const earlyHide = document.getElementById("early-hide");
      if (earlyHide) earlyHide.remove();
      document.body.classList.add("categories-ready");
      TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
      _attachLazyPlatformObservers();
      try {
        if (TR.infiniteScroll && typeof TR.infiniteScroll.attach === "function") {
          TR.infiniteScroll.attach();
        }
      } catch (e) {
      }
    },
    async refreshViewerData(opts = {}) {
      const preserveScroll = opts.preserveScroll !== false;
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
        const state = this.snapshotViewerState();
        state.preserveScroll = preserveScroll;
        const response = await fetch("/api/news");
        const baseData = await response.json();
        this.renderViewerFromData(baseData, state);
        if (state.preserveScroll) {
          window.scrollTo({ top: state.scrollY, behavior: "auto" });
          TR.scroll.restoreActiveTabPlatformGridScroll(state);
        }
        _ajaxLastRefreshAt = Date.now();
      } catch (e) {
        console.error("refreshViewerData error:", e);
      } finally {
        _ajaxRefreshInFlight = false;
        const pending = _ajaxRefreshPending;
        _ajaxRefreshPending = null;
        if (pending) {
          this.refreshViewerData({ preserveScroll: pending.preserveScroll });
        }
      }
    },
    async fetchData() {
      const btn = document.getElementById("fetchBtn");
      const progress = document.getElementById("progressContainer");
      const bar = document.getElementById("progressBar");
      const status = document.getElementById("fetchStatus");
      btn.classList.add("loading");
      btn.disabled = true;
      progress.classList.add("show");
      bar.classList.add("indeterminate");
      status.className = "fetch-status";
      status.textContent = "\u6B63\u5728\u83B7\u53D6\u6570\u636E...";
      try {
        const response = await fetch("/api/fetch", { method: "POST" });
        const result = await response.json();
        bar.classList.remove("indeterminate");
        if (result.success) {
          bar.style.width = "100%";
          status.className = "fetch-status success";
          status.textContent = `\u2705 ${result.platforms} \u4E2A\u5E73\u53F0\uFF0C${result.news_count} \u6761\u65B0\u95FB`;
          setTimeout(() => this.refreshViewerData({ preserveScroll: true }), 300);
        } else {
          bar.style.width = "0%";
          status.className = "fetch-status error";
          status.textContent = `\u274C ${result.error}`;
        }
      } catch (error) {
        bar.classList.remove("indeterminate");
        bar.style.width = "0%";
        status.className = "fetch-status error";
        status.textContent = `\u274C ${error.message}`;
      } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
        setTimeout(() => {
          progress.classList.remove("show");
          bar.style.width = "0%";
        }, 5e3);
      }
    },
    setupAjaxAutoRefresh() {
      const intervalMs = 3e5;
      setInterval(() => {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - _ajaxLastRefreshAt < intervalMs - 5e3) return;
        this.refreshViewerData({ preserveScroll: true });
      }, 5e3);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          const now = Date.now();
          if (now - _ajaxLastRefreshAt < intervalMs - 5e3) return;
          this.refreshViewerData({ preserveScroll: true });
        }
      });
    }
  };
  window.fetchData = () => data.fetchData();
  window.refreshViewerData = (opts) => data.refreshViewerData(opts);
  TR.data = data;
  ready(function() {
    const updatedAtEl = document.getElementById("updatedAt");
    if (updatedAtEl && updatedAtEl.textContent) {
      updatedAtEl.textContent = formatUpdatedAt(updatedAtEl.textContent);
    }
    data.setupAjaxAutoRefresh();
    if (!_platformCloseHandlersAttached) {
      _platformCloseHandlersAttached = true;
      document.addEventListener("click", (e) => {
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;
        const btn = t.closest('button[data-action="delete-platform"]');
        if (!btn) return;
        const card = btn.closest(".platform-card");
        if (!card) return;
        _deletePlatformCard(card).catch(() => {
        });
      });
      document.addEventListener("click", async (e) => {
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;
        const btn = t.closest('button[data-action="hide-platform"]');
        if (!btn) return;
        const card = btn.closest(".platform-card");
        const pid2 = String(card?.getAttribute?.("data-platform") || "").trim();
        if (!pid2 || pid2.startsWith("rss-")) return;
        const ok = await _showCenteredConfirmModal(
          "\u786E\u5B9A\u8981\u9690\u85CF\u8BE5\u5361\u7247\u5417\uFF1F\u9690\u85CF\u540E\u8BE5\u5361\u7247\u5C06\u4E0D\u518D\u663E\u793A\uFF0C\u4F60\u53EF\u4EE5\u5728\u300C\u680F\u76EE\u8BBE\u7F6E\u300D\u4E2D\u91CD\u65B0\u52FE\u9009\u5E76\u4FDD\u5B58\u6765\u6062\u590D\u663E\u793A\u3002",
          "\u786E\u8BA4\u9690\u85CF",
          "\u53D6\u6D88"
        );
        if (!ok) return;
        try {
          btn.setAttribute("disabled", "true");
        } catch (e2) {
        }
        try {
          TR.settings?.togglePlatformHidden?.(pid2);
        } catch (e2) {
        }
      });
    }
    _attachLazyPlatformObservers();
  });

  // hotnews/web/static/js/src/infinite-scroll.js
  var STEP = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var ROOT_MARGIN = "240px 0px 240px 0px";
  var MAX_ITEMS_PER_PLATFORM = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var _observer = null;
  var _armed = false;
  var _inFlight = 0;
  var MAX_IN_FLIGHT = 1;
  var _cooldownUntil = 0;
  var COOLDOWN_MS = 600;
  var _ensureTimer = null;
  var _ensureAbort = null;
  var ENSURE_DEBOUNCE_MS = 160;
  var _bulkTimer = null;
  var _bulkAbort = null;
  var BULK_DEBOUNCE_MS = 250;
  function getActiveCategoryId() {
    return document.querySelector(".category-tabs .category-tab.active")?.dataset?.category || null;
  }
  function setPlaceholderText(card, text) {
    try {
      const list = card?.querySelector?.(".news-list");
      if (!list) return;
      let el = list.querySelector(".news-placeholder");
      if (!el) {
        el = document.createElement("li");
        el.className = "news-placeholder";
        el.setAttribute("aria-hidden", "true");
        list.appendChild(el);
      }
      el.textContent = String(text || "");
    } catch (e) {
    }
  }
  function cancelEnsureCategoryLoaded() {
    clearTimeout(_ensureTimer);
    _ensureTimer = null;
    if (_ensureAbort) {
      try {
        _ensureAbort.abort();
      } catch (e) {
      }
      _ensureAbort = null;
    }
    try {
      document.querySelectorAll(".platform-card").forEach((card) => {
        const list = card?.querySelector?.(".news-list");
        if (!list) return;
        const placeholder = list.querySelector(".news-placeholder");
        if (!placeholder) return;
        const hasItems = list.querySelectorAll(".news-item").length > 0;
        if (hasItems) return;
        if ((placeholder.textContent || "").includes("\u52A0\u8F7D\u4E2D")) {
          placeholder.textContent = "\u5F85\u52A0\u8F7D...";
        }
      });
    } catch (e) {
    }
  }
  function scheduleEnsureCategoryLoaded(categoryId, opts = {}) {
    cancelEnsureCategoryLoaded();
    _ensureAbort = new AbortController();
    const signal = _ensureAbort.signal;
    _ensureTimer = setTimeout(() => {
      _ensureTimer = null;
      ensureCategoryLoaded(categoryId, { ...opts, signal }).catch(() => {
      });
    }, ENSURE_DEBOUNCE_MS);
  }
  function cancelBulkLoadCategory() {
    clearTimeout(_bulkTimer);
    _bulkTimer = null;
    if (_bulkAbort) {
      try {
        _bulkAbort.abort();
      } catch (e) {
      }
      _bulkAbort = null;
    }
  }
  function createNewsLi(n, idx, platformId) {
    const li = document.createElement("li");
    li.className = "news-item";
    li.dataset.newsId = String(n?.stable_id || "");
    li.dataset.newsTitle = String(n?.display_title || n?.title || "");
    const content = document.createElement("div");
    content.className = "news-item-content";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "news-checkbox";
    cb.title = "\u6807\u8BB0\u5DF2\u8BFB";
    cb.addEventListener("change", () => {
      try {
        window.markAsRead(cb);
      } catch (e) {
      }
    });
    const indexSpan = document.createElement("span");
    indexSpan.className = "news-index";
    indexSpan.textContent = String(idx);
    const a = document.createElement("a");
    a.className = "news-title";
    if (n?.is_cross_platform) a.classList.add("cross-platform");
    a.href = String(n?.url || "#");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("onclick", "handleTitleClickV2(this, event)");
    a.setAttribute("onauxclick", "handleTitleClickV2(this, event)");
    a.setAttribute("oncontextmenu", "handleTitleClickV2(this, event)");
    a.setAttribute("onkeydown", "handleTitleKeydownV2(this, event)");
    a.textContent = String(n?.display_title || n?.title || "");
    if (n?.is_cross_platform) {
      const cps = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
      const badge = document.createElement("span");
      badge.className = "cross-platform-badge";
      badge.title = `\u540C\u65F6\u51FA\u73B0\u5728: ${cps.join(", ")}`;
      badge.textContent = `\u{1F525} ${String(n?.cross_platform_count ?? "")}`;
      a.appendChild(document.createTextNode(" "));
      a.appendChild(badge);
    }
    content.appendChild(cb);
    content.appendChild(indexSpan);
    content.appendChild(a);
    const dateStr = formatNewsDate(n?.timestamp);
    if (dateStr) {
      const dateSpan = document.createElement("span");
      dateSpan.className = "tr-news-date";
      dateSpan.style.marginLeft = "8px";
      dateSpan.style.color = "#9ca3af";
      dateSpan.style.fontSize = "12px";
      dateSpan.style.whiteSpace = "nowrap";
      dateSpan.textContent = dateStr;
      content.appendChild(dateSpan);
    }
    li.appendChild(content);
    const meta = String(n?.meta || "").trim();
    const isRssPlatform = String(platformId || "").startsWith("rss-");
    if (meta && !isRssPlatform) {
      const sub = document.createElement("div");
      sub.className = "news-subtitle";
      sub.textContent = meta;
      li.appendChild(sub);
    }
    applyReadStateToItem(li);
    applyCategoryFilterToItem(li);
    return li;
  }
  async function bulkLoadCategory(categoryId, opts = {}) {
    const pane = document.getElementById(`tab-${categoryId}`);
    if (!pane) return;
    if (!pane.classList.contains("active")) return;
    try {
      if (pane.dataset) pane.dataset.bulkLoading = "1";
    } catch (e) {
    }
    const signal = opts.signal;
    if (signal?.aborted) {
      try {
        if (pane.dataset) delete pane.dataset.bulkLoading;
      } catch (e) {
      }
      return;
    }
    let cfg = null;
    try {
      if (TR.filter && typeof TR.filter.getCategoryFilterConfig === "function") {
        cfg = TR.filter.getCategoryFilterConfig(categoryId);
      }
    } catch (e) {
      cfg = null;
    }
    const mode = cfg?.mode || "exclude";
    const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
    const pageSize = Number.isFinite(opts.pageSize) ? opts.pageSize : MAX_ITEMS_PER_PLATFORM;
    const effectivePageSize = Math.min(Math.max(1, pageSize), MAX_ITEMS_PER_PLATFORM);
    const cards = Array.from(pane.querySelectorAll(".platform-card"));
    const platformIds = cards.map((c) => (c?.dataset?.platform || "").trim()).filter(Boolean);
    if (platformIds.length <= 0) {
      try {
        if (pane.dataset) delete pane.dataset.bulkLoading;
      } catch (e) {
      }
      return;
    }
    for (const card of cards) {
      if (!card) continue;
      card.dataset.loading = "1";
      setPlaceholderText(card, "\u52A0\u8F7D\u4E2D...");
    }
    let payload;
    try {
      const resp = await fetch(
        `/api/news/pages?page_size=${encodeURIComponent(String(effectivePageSize))}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform_ids: platformIds }),
          signal
        }
      );
      if (!resp.ok) return;
      payload = await resp.json();
    } catch (e) {
      return;
    } finally {
      try {
        if (pane.dataset) delete pane.dataset.bulkLoading;
      } catch (e) {
      }
    }
    const byPid = payload && payload.platforms || {};
    for (const card of cards) {
      if (signal?.aborted) return;
      const pid2 = (card?.dataset?.platform || "").trim();
      if (!pid2) continue;
      const list = card.querySelector(".news-list");
      if (!list) continue;
      list.querySelectorAll(".news-placeholder").forEach((el) => el.remove());
      list.querySelectorAll(".news-item").forEach((el) => el.remove());
      const p = byPid[pid2] || {};
      const items = Array.isArray(p.items) ? p.items : [];
      for (let i = 0; i < items.length; i++) {
        list.appendChild(createNewsLi(items[i], i + 1, pid2));
      }
      const loadedCount = list.querySelectorAll(".news-item").length;
      card.dataset.loadedCount = String(loadedCount);
      card.dataset.hasMore = p.has_more && loadedCount < MAX_ITEMS_PER_PLATFORM ? "1" : "0";
      card.dataset.loading = "0";
      card.dataset.loadedDone = "1";
      try {
        if (TR.paging) {
          const pageSz = Math.min(MAX_ITEMS_PER_PLATFORM, loadedCount);
          TR.paging.setCardPageSize(card, pageSz);
          TR.paging.applyPagingToCard(card, 0);
        }
      } catch (e) {
      }
      if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
    }
    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
    try {
      if (TR.filter && typeof TR.filter.applyCategoryFilter === "function") {
        TR.filter.applyCategoryFilter(categoryId);
      }
    } catch (e) {
    }
  }
  function scheduleBulkLoadCategory(categoryId, opts = {}) {
    cancelBulkLoadCategory();
    _bulkAbort = new AbortController();
    const signal = _bulkAbort.signal;
    _bulkTimer = setTimeout(() => {
      _bulkTimer = null;
      bulkLoadCategory(categoryId, { ...opts, signal }).catch(() => {
      });
    }, BULK_DEBOUNCE_MS);
  }
  async function ensureCategoryLoaded(categoryId, opts = {}) {
    const pane = document.getElementById(`tab-${categoryId}`);
    if (!pane) return;
    if (!pane.classList.contains("active")) return;
    const signal = opts.signal;
    if (signal?.aborted) return;
    let cfg = null;
    try {
      if (TR.filter && typeof TR.filter.getCategoryFilterConfig === "function") {
        cfg = TR.filter.getCategoryFilterConfig(categoryId);
      }
    } catch (e) {
      cfg = null;
    }
    const mode = cfg?.mode || "exclude";
    const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
    const wantFindMatch = mode === "include" && keywords.length > 0;
    const maxPagesPerCard = Number.isFinite(opts.maxPagesPerCard) ? opts.maxPagesPerCard : wantFindMatch ? 2 : 1;
    const cap = Number.isFinite(opts.cap) ? opts.cap : wantFindMatch ? 10 : 4;
    const cards = Array.from(pane.querySelectorAll(".platform-card")).slice(0, Math.max(0, cap));
    for (const card of cards) {
      if (signal?.aborted) return;
      if (!card) continue;
      const list = card.querySelector(".news-list");
      if (!list) continue;
      const existingItems = list.querySelectorAll(".news-item").length;
      if (wantFindMatch && existingItems > 0) {
        card.dataset.loadedDone = "1";
        continue;
      }
      if (!wantFindMatch && existingItems > 0) {
        card.dataset.loadedDone = "1";
        continue;
      }
      let desiredTotal = STEP;
      for (let page = 0; page < maxPagesPerCard; page++) {
        if (signal?.aborted) return;
        setPlaceholderText(card, "\u52A0\u8F7D\u4E2D...");
        await fetchNextPage(card, Math.min(desiredTotal, MAX_ITEMS_PER_PLATFORM), { signal });
        try {
          if (TR.paging) {
            TR.paging.setCardPageSize(card, Math.min(desiredTotal, MAX_ITEMS_PER_PLATFORM));
            TR.paging.applyPagingToCard(card, 0);
          }
        } catch (e) {
        }
        const visibleItems = card.querySelectorAll(
          ".news-item:not(.filtered):not(.search-hidden):not(.paged-hidden)"
        ).length;
        if (!wantFindMatch) break;
        if (visibleItems > 0) break;
        const hasMore = card.dataset.hasMore !== "0";
        if (!hasMore) break;
        desiredTotal += STEP;
      }
      card.dataset.loadedDone = "1";
    }
    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
    try {
      if (TR.filter && typeof TR.filter.applyCategoryFilter === "function") {
        TR.filter.applyCategoryFilter(categoryId);
      }
    } catch (e) {
    }
  }
  function applyCategoryFilterToItem(li) {
    try {
      const catId = getActiveCategoryId();
      if (!catId || !TR.filter?.getCategoryFilterConfig) return;
      const cfg = TR.filter.getCategoryFilterConfig(catId);
      const mode = cfg?.mode || "exclude";
      const keywords = Array.isArray(cfg?.keywords) ? cfg.keywords : [];
      const title = (li?.textContent || "").toLowerCase();
      const matched = keywords.length > 0 ? keywords.some((k) => title.includes(k)) : false;
      const shouldFilter = keywords.length === 0 ? false : mode === "include" ? !matched : matched;
      if (shouldFilter) li.classList.add("filtered");
      else li.classList.remove("filtered");
    } catch (e) {
    }
  }
  function applyReadStateToItem(li) {
    try {
      const id = li?.dataset?.newsId;
      if (!id || !TR.readState?.getReadNews) return;
      const reads = TR.readState.getReadNews() || {};
      if (!reads[id]) return;
      li.classList.add("read");
    } catch (e) {
    }
  }
  async function fetchNextPage(card, neededTotal, opts = {}) {
    const pid2 = (card?.dataset?.platform || "").trim();
    if (!pid2) return { ok: false, hasMore: false };
    const signal = opts.signal;
    if (signal?.aborted) return { ok: false, hasMore: true };
    if (card.dataset.loading === "1") return { ok: false, hasMore: true };
    if (card.dataset.hasMore === "0") return { ok: false, hasMore: false };
    const list = card.querySelector(".news-list");
    if (!list) return { ok: false, hasMore: false };
    list.querySelectorAll(".news-placeholder").forEach((el) => el.remove());
    neededTotal = Math.min(Math.max(0, neededTotal || 0), MAX_ITEMS_PER_PLATFORM);
    const currentTotal = list.querySelectorAll(".news-item").length;
    if (currentTotal >= MAX_ITEMS_PER_PLATFORM) {
      card.dataset.hasMore = "0";
      return { ok: false, hasMore: false };
    }
    if (currentTotal >= neededTotal) return { ok: true, hasMore: true };
    card.dataset.loading = "1";
    try {
      if (_inFlight >= MAX_IN_FLIGHT) return { ok: false, hasMore: true };
      _inFlight += 1;
      const requestSize = Math.min(STEP, Math.max(0, MAX_ITEMS_PER_PLATFORM - currentTotal));
      if (requestSize <= 0) {
        card.dataset.hasMore = "0";
        return { ok: false, hasMore: false };
      }
      const url = `/api/news/page?platform_id=${encodeURIComponent(pid2)}&offset=${encodeURIComponent(String(currentTotal))}&page_size=${encodeURIComponent(String(requestSize))}`;
      let resp;
      try {
        resp = await fetch(url, { signal });
      } catch (e) {
        if (signal?.aborted || e && e.name === "AbortError") {
          if (card.querySelectorAll(".news-item").length <= 0) {
            setPlaceholderText(card, "\u5F85\u52A0\u8F7D...");
          }
          return { ok: false, hasMore: true };
        }
        throw e;
      }
      if (!resp.ok) return { ok: false, hasMore: true };
      const data2 = await resp.json();
      const items = Array.isArray(data2?.items) ? data2.items : [];
      const hasMore = !!data2?.has_more;
      if (!hasMore || currentTotal + items.length >= MAX_ITEMS_PER_PLATFORM) card.dataset.hasMore = "0";
      for (let i = 0; i < items.length; i++) {
        const n = items[i] || {};
        const idx = currentTotal + i + 1;
        const li = document.createElement("li");
        li.className = "news-item";
        li.dataset.newsId = String(n.stable_id || "");
        li.dataset.newsTitle = String(n.display_title || n.title || "");
        const content = document.createElement("div");
        content.className = "news-item-content";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "news-checkbox";
        cb.title = "\u6807\u8BB0\u5DF2\u8BFB";
        cb.addEventListener("change", () => {
          try {
            window.markAsRead(cb);
          } catch (e) {
          }
        });
        const indexSpan = document.createElement("span");
        indexSpan.className = "news-index";
        indexSpan.textContent = String(idx);
        const a = document.createElement("a");
        a.className = "news-title";
        if (n.is_cross_platform) a.classList.add("cross-platform");
        a.href = String(n.url || "#");
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("onclick", "handleTitleClickV2(this, event)");
        a.setAttribute("onauxclick", "handleTitleClickV2(this, event)");
        a.setAttribute("oncontextmenu", "handleTitleClickV2(this, event)");
        a.setAttribute("onkeydown", "handleTitleKeydownV2(this, event)");
        a.textContent = String(n.display_title || n.title || "");
        if (n.is_cross_platform) {
          const cps = Array.isArray(n.cross_platforms) ? n.cross_platforms : [];
          const badge = document.createElement("span");
          badge.className = "cross-platform-badge";
          badge.title = `\u540C\u65F6\u51FA\u73B0\u5728: ${cps.join(", ")}`;
          badge.textContent = `\u{1F525} ${String(n.cross_platform_count ?? "")}`;
          a.appendChild(document.createTextNode(" "));
          a.appendChild(badge);
        }
        content.appendChild(cb);
        content.appendChild(indexSpan);
        content.appendChild(a);
        const dateStr = formatNewsDate(n.timestamp);
        if (dateStr) {
          const dateSpan = document.createElement("span");
          dateSpan.className = "tr-news-date";
          dateSpan.style.marginLeft = "8px";
          dateSpan.style.color = "#9ca3af";
          dateSpan.style.fontSize = "12px";
          dateSpan.style.whiteSpace = "nowrap";
          dateSpan.textContent = dateStr;
          content.appendChild(dateSpan);
        }
        li.appendChild(content);
        const meta = String(n.meta || "").trim();
        if (meta) {
          const sub = document.createElement("div");
          sub.className = "news-subtitle";
          sub.textContent = meta;
          li.appendChild(sub);
        }
        list.appendChild(li);
        applyReadStateToItem(li);
        applyCategoryFilterToItem(li);
      }
      card.dataset.loadedCount = String(list.querySelectorAll(".news-item").length);
      if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
      return { ok: true, hasMore };
    } finally {
      _inFlight = Math.max(0, _inFlight - 1);
      card.dataset.loading = "0";
    }
  }
  async function expandIfNeeded(card) {
    if (!card || !TR.paging) return;
    const pane = card.closest(".tab-pane");
    if (pane && !pane.classList.contains("active")) return;
    const now = Date.now();
    if (now < _cooldownUntil) return;
    _cooldownUntil = now + COOLDOWN_MS;
    const offset = parseInt(card.dataset.pageOffset || "0", 10) || 0;
    const curPageSize = TR.paging.getCardPageSize(card);
    const maxAllowed = Math.max(0, MAX_ITEMS_PER_PLATFORM - offset);
    if (curPageSize >= maxAllowed) {
      card.dataset.hasMore = "0";
      return;
    }
    const desiredPageSize = Math.min(curPageSize + STEP, maxAllowed);
    const neededTotal = offset + desiredPageSize;
    await fetchNextPage(card, neededTotal);
    const total = card.querySelectorAll(".news-item").length;
    const nextPageSize0 = Math.min(Math.max(curPageSize, desiredPageSize), Math.max(total - offset, curPageSize));
    const nextPageSize = Math.min(nextPageSize0, maxAllowed);
    TR.paging.setCardPageSize(card, nextPageSize);
    TR.paging.applyPagingToCard(card, offset);
    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
  }
  function attach() {
    if (_observer) {
      try {
        _observer.disconnect();
      } catch (e) {
      }
      _observer = null;
    }
    _observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!_armed) continue;
        if (_inFlight > 0) continue;
        const sentinel = entry.target;
        const card = sentinel?.closest?.(".platform-card");
        if (!card) continue;
        expandIfNeeded(card).catch(() => {
        });
      }
    }, { root: null, rootMargin: ROOT_MARGIN, threshold: 0.01 });
    document.querySelectorAll(".news-load-sentinel").forEach((el) => _observer.observe(el));
  }
  TR.infiniteScroll = { attach, ensureCategoryLoaded, scheduleEnsureCategoryLoaded, cancelEnsureCategoryLoaded, bulkLoadCategory, scheduleBulkLoadCategory, cancelBulkLoadCategory };
  ready(function() {
    try {
      window.addEventListener("scroll", () => {
        _armed = true;
      }, { passive: true, once: true });
    } catch (e) {
    }
    setTimeout(() => {
      _armed = true;
    }, 1200);
    attach();
  });

  // hotnews/web/static/js/src/platform-reorder.js
  function getCategoryIdFromGrid(grid) {
    const pane = grid?.closest?.(".tab-pane");
    const id = pane?.id || "";
    return id.startsWith("tab-") ? id.slice(4) : null;
  }
  function persistPlatformOrder(categoryId, orderedPlatformIds) {
    if (!categoryId || !Array.isArray(orderedPlatformIds)) return;
    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config2 = TR.settings.normalizeCategoryConfig(base);
    const merged = TR.settings.getMergedCategoryConfig();
    const mergedCustom = (merged.customCategories || []).find((c) => c.id === categoryId);
    if (mergedCustom) {
      const idx = (config2.customCategories || []).findIndex((c) => c.id === categoryId);
      if (idx >= 0) {
        config2.customCategories[idx] = {
          ...config2.customCategories[idx],
          platforms: orderedPlatformIds
        };
      }
    } else {
      if (!config2.platformOrder || typeof config2.platformOrder !== "object") config2.platformOrder = {};
      config2.platformOrder[categoryId] = orderedPlatformIds;
    }
    TR.settings.saveCategoryConfig(config2);
  }
  var platformReorder = {
    _draggingCard: null,
    _draggingPlatformId: null,
    _originGrid: null,
    _originCategoryId: null,
    _autoScrollRaf: null,
    _autoScrollGrid: null,
    _autoScrollDir: 0,
    _autoScrollSpeed: 0,
    attach() {
      if (this._attached) return;
      this._attached = true;
      const AUTO_SCROLL_EDGE_PX = 40;
      const AUTO_SCROLL_MAX_SPEED = 18;
      const stopAutoScroll = () => {
        if (this._autoScrollRaf) {
          cancelAnimationFrame(this._autoScrollRaf);
        }
        this._autoScrollRaf = null;
        this._autoScrollGrid = null;
        this._autoScrollDir = 0;
        this._autoScrollSpeed = 0;
      };
      const ensureAutoScrollLoop = () => {
        if (this._autoScrollRaf) return;
        const tick = () => {
          if (!this._autoScrollGrid || !this._autoScrollDir || !this._autoScrollSpeed) {
            stopAutoScroll();
            return;
          }
          const g = this._autoScrollGrid;
          const maxScrollLeft = Math.max(0, (g.scrollWidth || 0) - (g.clientWidth || 0));
          if (maxScrollLeft <= 0) {
            stopAutoScroll();
            return;
          }
          const next3 = Math.max(0, Math.min(maxScrollLeft, (g.scrollLeft || 0) + this._autoScrollDir * this._autoScrollSpeed));
          g.scrollLeft = next3;
          this._autoScrollRaf = requestAnimationFrame(tick);
        };
        this._autoScrollRaf = requestAnimationFrame(tick);
      };
      const updateAutoScrollFromEvent = (e, grid) => {
        if (!this._draggingCard || !grid) {
          stopAutoScroll();
          return;
        }
        const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
        if (maxScrollLeft <= 0) {
          stopAutoScroll();
          return;
        }
        const rect = grid.getBoundingClientRect();
        const x = e.clientX;
        const distLeft = x - rect.left;
        const distRight = rect.right - x;
        let dir = 0;
        let dist = 0;
        if (distLeft >= 0 && distLeft <= AUTO_SCROLL_EDGE_PX) {
          dir = -1;
          dist = distLeft;
        } else if (distRight >= 0 && distRight <= AUTO_SCROLL_EDGE_PX) {
          dir = 1;
          dist = distRight;
        } else {
          stopAutoScroll();
          return;
        }
        const intensity = Math.max(0, Math.min(1, (AUTO_SCROLL_EDGE_PX - dist) / AUTO_SCROLL_EDGE_PX));
        const speed = Math.max(1, Math.round(intensity * intensity * AUTO_SCROLL_MAX_SPEED));
        this._autoScrollGrid = grid;
        this._autoScrollDir = dir;
        this._autoScrollSpeed = speed;
        ensureAutoScrollLoop();
      };
      document.addEventListener("dragstart", (e) => {
        const handle = e.target?.closest?.(".platform-drag-handle");
        if (!handle) return;
        const card = handle.closest(".platform-card");
        const grid = handle.closest(".platform-grid");
        const categoryId = getCategoryIdFromGrid(grid);
        const platformId = card?.dataset?.platform || null;
        if (!card || !grid || !categoryId || !platformId) return;
        this._draggingCard = card;
        this._draggingPlatformId = platformId;
        this._originGrid = grid;
        this._originCategoryId = categoryId;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", platformId);
        } catch (_) {
        }
      }, true);
      document.addEventListener("dragend", (e) => {
        const handle = e.target?.closest?.(".platform-drag-handle");
        if (!handle) return;
        const card = handle.closest(".platform-card");
        const grid = handle.closest(".platform-grid");
        const categoryId = getCategoryIdFromGrid(grid);
        if (!card || !grid || !categoryId) {
          if (this._draggingCard) this._draggingCard.classList.remove("dragging");
          this._draggingCard = null;
          this._draggingPlatformId = null;
          this._originGrid = null;
          this._originCategoryId = null;
          stopAutoScroll();
          return;
        }
        const ordered = Array.from(grid.querySelectorAll(".platform-card")).map((c) => c.dataset.platform).filter(Boolean);
        persistPlatformOrder(categoryId, ordered);
        card.classList.remove("dragging");
        this._draggingCard = null;
        this._draggingPlatformId = null;
        this._originGrid = null;
        this._originCategoryId = null;
        stopAutoScroll();
      }, true);
      document.addEventListener("dragover", (e) => {
        const grid = e.target?.closest?.(".platform-grid");
        if (!grid || !this._draggingCard) return;
        if (this._originGrid && grid !== this._originGrid) return;
        const categoryId = getCategoryIdFromGrid(grid);
        if (!categoryId || this._originCategoryId && categoryId !== this._originCategoryId) return;
        e.preventDefault();
        updateAutoScrollFromEvent(e, grid);
        const overCard = e.target?.closest?.(".platform-card");
        if (!overCard || overCard === this._draggingCard) return;
        const cards = Array.from(grid.querySelectorAll(".platform-card"));
        const draggingIndex = cards.indexOf(this._draggingCard);
        const overIndex = cards.indexOf(overCard);
        if (draggingIndex < 0 || overIndex < 0 || draggingIndex === overIndex) return;
        if (draggingIndex < overIndex) {
          grid.insertBefore(this._draggingCard, overCard.nextSibling);
        } else {
          grid.insertBefore(this._draggingCard, overCard);
        }
      }, true);
      document.addEventListener("drop", (e) => {
        const grid = e.target?.closest?.(".platform-grid");
        if (!grid || !this._draggingCard) return;
        if (this._originGrid && grid !== this._originGrid) return;
        e.preventDefault();
        stopAutoScroll();
      }, true);
    }
  };
  TR.platformReorder = platformReorder;
  ready(() => {
    platformReorder.attach();
  });

  // hotnews/web/static/js/src/category-tab-reorder.js
  function _getOrderedCategoryIdsFromDom(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(".category-tab")).map((el) => String(el?.dataset?.category || "").trim()).filter(Boolean);
  }
  function _persistCategoryOrder(orderedCategoryIds) {
    if (!Array.isArray(orderedCategoryIds) || orderedCategoryIds.length === 0) return;
    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config2 = TR.settings.normalizeCategoryConfig(base);
    const merged = TR.settings.getMergedCategoryConfig();
    const existingOrder = Array.isArray(merged?.categoryOrder) && merged.categoryOrder.length > 0 ? merged.categoryOrder.slice() : orderedCategoryIds.slice();
    const visibleSet = new Set(orderedCategoryIds);
    let idx = 0;
    const nextOrder = existingOrder.map((catId) => {
      const id = String(catId || "").trim();
      if (!id) return id;
      if (!visibleSet.has(id)) return id;
      const next3 = orderedCategoryIds[idx];
      idx += 1;
      return next3;
    });
    config2.categoryOrder = nextOrder;
    config2.__migrated_explore_ai_front_v1 = Date.now();
    config2.__migrated_explore_knowledge_front_v1 = Date.now();
    TR.settings.saveCategoryConfig(config2);
  }
  function _reorderTabPanes(orderedCategoryIds) {
    const contentEl = document.querySelector(".tab-content-area");
    if (!contentEl) return;
    const panes = /* @__PURE__ */ new Map();
    contentEl.querySelectorAll(".tab-pane").forEach((p) => {
      const id = String(p?.id || "");
      if (id.startsWith("tab-")) {
        panes.set(id.slice(4), p);
      }
    });
    const frag = document.createDocumentFragment();
    for (const catId of orderedCategoryIds) {
      const pane = panes.get(catId);
      if (pane) frag.appendChild(pane);
    }
    for (const [catId, pane] of panes.entries()) {
      if (!orderedCategoryIds.includes(catId)) {
        frag.appendChild(pane);
      }
    }
    contentEl.appendChild(frag);
  }
  function _ensureTabHandles() {
    const tabsEl = document.querySelector(".category-tabs");
    if (!tabsEl) return;
    tabsEl.querySelectorAll(".category-tab").forEach((tab) => {
      try {
        tab.setAttribute("draggable", "false");
        let handle = tab.querySelector(":scope > .category-drag-handle");
        if (!handle) {
          handle = document.createElement("span");
          handle.className = "category-drag-handle";
          handle.setAttribute("title", "\u62D6\u62FD\u8C03\u6574\u680F\u76EE\u987A\u5E8F");
          handle.setAttribute("draggable", "true");
          handle.textContent = "\u2630";
          tab.insertBefore(handle, tab.firstChild);
        } else {
          handle.setAttribute("draggable", "true");
        }
      } catch (e) {
      }
    });
  }
  function _observeTabRerenders() {
    const tabsEl = document.querySelector(".category-tabs");
    if (!tabsEl) return;
    try {
      const obs = new MutationObserver(() => {
        _ensureTabHandles();
      });
      obs.observe(tabsEl, { childList: true, subtree: true });
    } catch (e) {
    }
  }
  function _enableLongPressHint() {
    const root = document.body;
    if (!root) return;
    let timer = 0;
    let hideTimer = 0;
    let active = false;
    const clearTimers = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
      }
    };
    const hide = () => {
      active = false;
      root.classList.remove("category-tabs-drag-mode");
    };
    document.addEventListener(
      "pointerdown",
      (e) => {
        const tabs2 = e.target?.closest?.(".category-tabs");
        if (!tabs2) return;
        const tab = e.target?.closest?.(".category-tab");
        if (!tab) return;
        const handle = e.target?.closest?.(".category-drag-handle");
        if (handle) return;
        clearTimers();
        timer = window.setTimeout(() => {
          active = true;
          root.classList.add("category-tabs-drag-mode");
          hideTimer = window.setTimeout(() => {
            hide();
          }, 2500);
        }, 380);
      },
      true
    );
    const cancel = () => {
      clearTimers();
      if (active) hide();
    };
    document.addEventListener("pointerup", cancel, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("scroll", cancel, true);
  }
  var categoryTabReorder = {
    _attached: false,
    _draggingTab: null,
    _originTabsEl: null,
    attach() {
      if (this._attached) return;
      this._attached = true;
      _ensureTabHandles();
      _observeTabRerenders();
      _enableLongPressHint();
      document.addEventListener(
        "click",
        (e) => {
          const handle = e.target?.closest?.(".category-drag-handle");
          if (!handle) return;
          e.preventDefault();
          e.stopPropagation();
        },
        true
      );
      document.addEventListener(
        "dragstart",
        (e) => {
          const handle = e.target?.closest?.(".category-drag-handle");
          if (!handle) return;
          const tab = handle.closest(".category-tab");
          const tabsEl = handle.closest(".category-tabs");
          const catId = tab?.dataset?.category;
          if (!tab || !tabsEl || !catId) return;
          this._draggingTab = tab;
          this._originTabsEl = tabsEl;
          tab.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", String(catId));
          } catch (_) {
          }
        },
        true
      );
      document.addEventListener(
        "dragover",
        (e) => {
          const tabsEl = e.target?.closest?.(".category-tabs");
          if (!tabsEl || !this._draggingTab) return;
          if (this._originTabsEl && tabsEl !== this._originTabsEl) return;
          const overTab = e.target?.closest?.(".category-tab");
          if (!overTab || overTab === this._draggingTab) return;
          e.preventDefault();
          const tabs2 = Array.from(tabsEl.querySelectorAll(".category-tab"));
          const draggingIndex = tabs2.indexOf(this._draggingTab);
          const overIndex = tabs2.indexOf(overTab);
          if (draggingIndex < 0 || overIndex < 0 || draggingIndex === overIndex) return;
          if (draggingIndex < overIndex) {
            tabsEl.insertBefore(this._draggingTab, overTab.nextSibling);
          } else {
            tabsEl.insertBefore(this._draggingTab, overTab);
          }
        },
        true
      );
      document.addEventListener(
        "drop",
        (e) => {
          const tabsEl = e.target?.closest?.(".category-tabs");
          if (!tabsEl || !this._draggingTab) return;
          if (this._originTabsEl && tabsEl !== this._originTabsEl) return;
          e.preventDefault();
        },
        true
      );
      document.addEventListener(
        "dragend",
        (e) => {
          const handle = e.target?.closest?.(".category-drag-handle");
          if (!handle) return;
          const tabsEl = handle.closest(".category-tabs");
          if (!tabsEl || !this._draggingTab) {
            if (this._draggingTab) this._draggingTab.classList.remove("dragging");
            this._draggingTab = null;
            this._originTabsEl = null;
            return;
          }
          const ordered = _getOrderedCategoryIdsFromDom(tabsEl);
          _persistCategoryOrder(ordered);
          _reorderTabPanes(ordered);
          this._draggingTab.classList.remove("dragging");
          this._draggingTab = null;
          this._originTabsEl = null;
        },
        true
      );
    }
  };
  TR.categoryTabReorder = categoryTabReorder;
  ready(() => {
    categoryTabReorder.attach();
  });

  // hotnews/web/static/js/src/subscription.js
  var STORAGE_KEY = "rss_subscriptions";
  var _selectedSource = null;
  var _subsSnapshot = null;
  var _serverEnabled = false;
  var _serverChecked = false;
  var _serverSyncInFlight = false;
  var _rssFeedTitleUserEdited = false;
  var _rssFeedTitleAutoFilled = false;
  var _previewStatusBySourceId = /* @__PURE__ */ new Map();
  var _pendingSyncBySourceId = /* @__PURE__ */ new Set();
  var _pickerOpen = false;
  var _pickerCategory = "";
  var _pickerQuery = "";
  var _pickerLimit = 80;
  var _pickerOffset = 0;
  var _pickerTotal = 0;
  var _pickerLoading = false;
  var _pickerItems = [];
  var _pickerRenderRaf = 0;
  var _pickerDebounceTimer = 0;
  var _ROW_H = 44;
  var _OVERSCAN = 10;
  var _prefetchWarmupTimer = 0;
  var _prefetchWarmupLastAt = 0;
  var _prefetchWarmupDedup = /* @__PURE__ */ new Map();
  function _sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms || 0)));
  }
  function _cssEscape(s) {
    try {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s || ""));
    } catch (e) {
    }
    return String(s || "").replace(/"/g, '\\"');
  }
  function _hasRssPlatformNews(sourceIds) {
    const ids = Array.isArray(sourceIds) ? sourceIds : [];
    for (const sidRaw of ids) {
      const sid = String(sidRaw || "").trim();
      if (!sid) continue;
      const pid2 = `rss-${sid}`;
      const selector = `.platform-card[data-platform="${_cssEscape(pid2)}"]`;
      const card = document.querySelector(selector);
      if (!card) continue;
      const items = card.querySelectorAll(".news-item");
      if (items && items.length > 0) return true;
    }
    return false;
  }
  function _setPendingSync(sourceIds, pending) {
    const ids = Array.isArray(sourceIds) ? sourceIds : [];
    for (const sidRaw of ids) {
      const sid = String(sidRaw || "").trim();
      if (!sid) continue;
      if (pending) _pendingSyncBySourceId.add(sid);
      else _pendingSyncBySourceId.delete(sid);
    }
  }
  function _getModalEl() {
    return document.getElementById("rssSubscriptionModal");
  }
  function _getPickerModalEl() {
    return document.getElementById("rssSourcePickerModal");
  }
  function _normalizeSubsForServer(subs) {
    const arr = Array.isArray(subs) ? subs : [];
    return arr.filter((s) => s && typeof s === "object").map((s) => {
      return {
        source_id: String(s.source_id || s.rss_source_id || "").trim(),
        url: String(s.url || "").trim(),
        feed_title: String(s.feed_title || s.display_name || "").trim(),
        column: String(s.column || "RSS").trim() || "RSS",
        platform_id: String(s.platform_id || "").trim()
      };
    }).filter((s) => !!s.source_id);
  }
  async function _syncSubscriptionsFromServer({ showHintOn403 } = {}) {
    if (_serverSyncInFlight) return;
    _serverSyncInFlight = true;
    try {
      const resp = await fetch("/api/me/rss-subscriptions");
      if (resp.status === 403) {
        _serverEnabled = false;
        _serverChecked = true;
        try {
          _syncServerEnabledFlag();
        } catch (e) {
        }
        if (showHintOn403) {
          _setSaveStatus("\u672A\u5F00\u542F\u670D\u52A1\u7AEF\u540C\u6B65\uFF08Not allowlisted\uFF09\uFF0C\u5F53\u524D\u4F7F\u7528\u672C\u5730\u8BA2\u9605", { variant: "info" });
        }
        return;
      }
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        _serverChecked = true;
        _serverEnabled = false;
        return;
      }
      const subs = _normalizeSubsForServer(payload?.subscriptions);
      _serverChecked = true;
      _serverEnabled = true;
      try {
        _syncServerEnabledFlag();
      } catch (e) {
      }
      try {
        subscription.setSubscriptions(subs);
      } catch (e) {
      }
      try {
        _subsSnapshot = subscription.getSubscriptions();
      } catch (e) {
        _subsSnapshot = null;
      }
      _renderList();
      _updateRssGatingUI();
    } finally {
      _serverSyncInFlight = false;
    }
  }
  function _getSaveBtnEl() {
    try {
      return document.querySelector("#rssSubscriptionModal .settings-btn-primary");
    } catch (e) {
      return null;
    }
  }
  function _getPreviewBtnEl() {
    try {
      return document.querySelector('#rssSubscriptionModal button[onclick="previewRssSubscription()"]');
    } catch (e) {
      return null;
    }
  }
  function _subsKey(items) {
    const arr = Array.isArray(items) ? items : [];
    const normalized = arr.filter((s) => s && typeof s === "object").map((s) => {
      return {
        source_id: String(s.source_id || s.rss_source_id || "").trim(),
        url: String(s.url || "").trim(),
        feed_title: String(s.feed_title || "").trim(),
        column: String(s.column || "RSS").trim() || "RSS"
      };
    }).filter((s) => !!s.source_id || !!s.url).sort((a, b) => (a.source_id || "").localeCompare(b.source_id || ""));
    return JSON.stringify(normalized);
  }
  function _diffNewSourceIds(prev3, next3) {
    const prevArr = Array.isArray(prev3) ? prev3 : [];
    const nextArr = Array.isArray(next3) ? next3 : [];
    const prevSet = new Set(prevArr.map((s) => String(s?.source_id || s?.rss_source_id || "").trim()).filter(Boolean));
    const out = [];
    for (const s of nextArr) {
      const sid = String(s?.source_id || s?.rss_source_id || "").trim();
      if (!sid) continue;
      if (prevSet.has(sid)) continue;
      out.push(sid);
    }
    return out;
  }
  function _setBtnEnabled(btn, enabled) {
    if (!btn) return;
    try {
      if (enabled) btn.removeAttribute("disabled");
      else btn.setAttribute("disabled", "true");
    } catch (e) {
    }
  }
  function _setBtnAriaDisabled(btn, disabled) {
    if (!btn) return;
    const isDisabled = !!disabled;
    try {
      if (isDisabled) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
    } catch (e) {
    }
    try {
      if (isDisabled) {
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
      } else {
        btn.style.opacity = "";
        btn.style.cursor = "";
      }
    } catch (e) {
    }
  }
  function _updateRssGatingUI() {
    const previewBtn = _getPreviewBtnEl();
    const saveBtn = _getSaveBtnEl();
    const selectedId = _getSelectedSourceId();
    try {
      if (previewBtn) previewBtn.removeAttribute("disabled");
    } catch (e) {
    }
    _setBtnAriaDisabled(previewBtn, !selectedId);
    try {
      if (previewBtn) {
        if (!selectedId) {
          previewBtn.setAttribute("title", "\u8BF7\u5148\u9009\u62E9 RSS \u6E90\u518D\u9884\u89C8");
        } else {
          previewBtn.removeAttribute("title");
        }
      }
    } catch (e) {
    }
    if (selectedId) {
      const st = _previewStatusBySourceId.get(String(selectedId || "").trim());
      if (st && st.ok === true && Number(st.entries_count || 0) === 0) {
        _setSaveStatus("\u9884\u89C8\u6210\u529F\u4F46\u6682\u65E0\u6761\u76EE\uFF08entries=0\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", { variant: "info" });
      }
    }
    const prev3 = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
    const next3 = subscription.getSubscriptions();
    const changed = _subsKey(prev3) !== _subsKey(next3);
    const newIds = _diffNewSourceIds(prev3, next3);
    const allNewOk = newIds.every((sid) => {
      const st = _previewStatusBySourceId.get(sid);
      return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
    });
    const canSave = changed && allNewOk;
    _setBtnEnabled(saveBtn, canSave);
    if (!changed) {
      if (!(selectedId && (() => {
        const st = _previewStatusBySourceId.get(String(selectedId || "").trim());
        return st && st.ok === true && Number(st.entries_count || 0) === 0;
      })())) {
        _setSaveStatus("\u8BF7\u5148\u901A\u8FC7\u9884\u89C8\u52A0\u5165\u81F3\u5C11\u4E00\u4E2A\u8BA2\u9605\uFF0C\u518D\u4FDD\u5B58\u5E76\u5237\u65B0", { variant: "info" });
      }
      return;
    }
    if (!allNewOk) {
      if (!(selectedId && (() => {
        const st = _previewStatusBySourceId.get(String(selectedId || "").trim());
        return st && st.ok === true && Number(st.entries_count || 0) === 0;
      })())) {
        _setSaveStatus("\u65B0\u589E\u8BA2\u9605\u9700\u8981\u5148\u9884\u89C8\u4E14\u5FC5\u987B\u6709\u6761\u76EE\uFF08entries>0\uFF09", { variant: "info" });
      }
      return;
    }
    _setSaveStatus("", { variant: "info" });
  }
  async function _previewSource(sourceId) {
    const previewEl = _getPreviewEl();
    if (previewEl) previewEl.innerHTML = '<div style="color:#6b7280;">\u9884\u89C8\u4E2D...</div>';
    const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sourceId)}`);
    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error(payload?.detail || "Preview failed");
    }
    const parsed = payload?.data || {};
    const feedTitle = parsed?.feed?.title || "";
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const entriesCount = entries.length;
    const lines = entries.slice(0, 5).map((e) => {
      const t = escapeHtml(e?.title || "");
      const l = escapeHtml(e?.link || "");
      if (l) {
        return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><a href="${l}" target="_blank" rel="noopener noreferrer">${t || l}</a></div>`;
      }
      return `<div style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t}</div>`;
    }).join("");
    if (!_rssFeedTitleUserEdited && feedTitle) {
      _setInputValue("rssFeedTitle", feedTitle);
      _rssFeedTitleAutoFilled = true;
    }
    _previewStatusBySourceId.set(String(sourceId || "").trim(), {
      ok: true,
      entries_count: entriesCount,
      ts: Date.now()
    });
    if (entriesCount > 0) {
      try {
        const urlFromSelected = _selectedSource ? String(_selectedSource.url || "").trim() : "";
        const urlFinal = urlFromSelected || String(payload?.final_url || payload?.url || "").trim();
        let column = _getInputValue("rssColumn") || "";
        if (!column || String(column).trim().toUpperCase() === "RSS") {
          try {
            const activeTab = TR.tabs && typeof TR.tabs.getActiveTabId === "function" ? TR.tabs.getActiveTabId() : "";
            if (activeTab) column = String(activeTab);
          } catch (e) {
          }
        }
        if (!column) column = "general";
        const feedTitleFinal = _getInputValue("rssFeedTitle") || String(_selectedSource?.name || _selectedSource?.host || "").trim();
        const subs = subscription.getSubscriptions();
        const idx = subs.findIndex((s) => s.source_id && s.source_id === String(sourceId || "").trim());
        const item = {
          source_id: String(sourceId || "").trim(),
          url: urlFinal,
          feed_title: feedTitleFinal,
          column,
          platform_id: ""
        };
        if (idx >= 0) subs[idx] = item;
        else subs.unshift(item);
        subscription.setSubscriptions(subs);
        _renderList();
      } catch (e) {
      }
    } else {
      _setSaveStatus("\u9884\u89C8\u6210\u529F\u4F46\u6682\u65E0\u6761\u76EE\uFF08entries=0\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", { variant: "info" });
    }
    _updateRssGatingUI();
    if (previewEl) {
      previewEl.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="font-weight:800;">${escapeHtml(feedTitle || "Feed")}</div>
                <div style="font-size:0.78rem;color:#6b7280;">\u6761\u76EE\u6570\uFF1A${entries.length}</div>
                <div style="display:flex;flex-direction:column;gap:4px;">${lines}</div>
            </div>`;
    }
  }
  function _getListEl() {
    return document.getElementById("rssSubscriptionList");
  }
  function _getPreviewEl() {
    return document.getElementById("rssSubscriptionPreview");
  }
  function _getSaveStatusEl() {
    return document.getElementById("rssSubscriptionSaveStatus");
  }
  function _setSaveStatus(msg, opts = {}) {
    const el = _getSaveStatusEl();
    if (!el) return;
    const variant = String(opts.variant || "").toLowerCase();
    const color = variant === "error" ? "#dc2626" : variant === "success" ? "#16a34a" : variant === "info" ? "#6b7280" : "#6b7280";
    el.style.color = color;
    el.textContent = msg == null ? "" : String(msg);
  }
  function _getSelectedSourceIdInputEl() {
    return document.getElementById("rssSelectedSourceId");
  }
  function _getSelectedSourceLabelEl() {
    return document.getElementById("rssSelectedSourceLabel");
  }
  function _getRequestSectionEl() {
    return document.getElementById("rssRequestSection");
  }
  function _getCategoryListEl() {
    return document.getElementById("rssSourceCategoryList");
  }
  function _getSearchInputEl() {
    return document.getElementById("rssSourceSearchInput");
  }
  function _getResultsEl() {
    return document.getElementById("rssSourceResults");
  }
  function _getPickerStatusEl() {
    return document.getElementById("rssSourcePickerStatus");
  }
  function _getInputValue(id) {
    const el = document.getElementById(id);
    return el && typeof el.value === "string" ? el.value.trim() : "";
  }
  function _setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? "" : String(value);
  }
  function _getSelectedSourceId() {
    const el = _getSelectedSourceIdInputEl();
    return el && typeof el.value === "string" ? el.value.trim() : "";
  }
  function _setSelectedSource(source) {
    _selectedSource = source && typeof source === "object" ? source : null;
    const idEl = _getSelectedSourceIdInputEl();
    const labelEl = _getSelectedSourceLabelEl();
    const sid = _selectedSource ? String(_selectedSource.id || "").trim() : "";
    const name = _selectedSource ? String(_selectedSource.name || _selectedSource.host || sid) : "";
    const url = _selectedSource ? String(_selectedSource.url || "").trim() : "";
    if (idEl) idEl.value = sid;
    if (labelEl) {
      labelEl.textContent = sid ? `${name}${url ? ` (${url})` : ""}` : "\u672A\u9009\u62E9";
    }
    if (sid && !_rssFeedTitleUserEdited) {
      const cur = _getInputValue("rssFeedTitle");
      if (!cur || _rssFeedTitleAutoFilled) {
        _setInputValue("rssFeedTitle", name);
        _rssFeedTitleAutoFilled = true;
      }
    }
    if (sid) {
      _schedulePrefetchWarmup(sid);
    }
    _updateRssGatingUI();
  }
  function _schedulePrefetchWarmup(sourceId) {
    const sid = String(sourceId || "").trim();
    if (!sid) return;
    const now = Date.now();
    const dedupMs = 15e3;
    const last = _prefetchWarmupDedup.get(sid) || 0;
    if (now - last < dedupMs) return;
    _prefetchWarmupDedup.set(sid, now);
    if (_prefetchWarmupTimer) {
      window.clearTimeout(_prefetchWarmupTimer);
      _prefetchWarmupTimer = 0;
    }
    _prefetchWarmupTimer = window.setTimeout(async () => {
      _prefetchWarmupTimer = 0;
      const sinceLast = Date.now() - (_prefetchWarmupLastAt || 0);
      if (sinceLast < 400) {
        _prefetchWarmupTimer = window.setTimeout(() => {
          _prefetchWarmupTimer = 0;
          _schedulePrefetchWarmup(sid);
        }, 400 - sinceLast);
        return;
      }
      _prefetchWarmupLastAt = Date.now();
      try {
        await fetch("/api/rss-sources/warmup?wait_ms=0", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_ids: [sid], priority: "high" })
        });
      } catch (e) {
      }
    }, 300);
  }
  function _setPickerStatus(msg) {
    const el = _getPickerStatusEl();
    if (!el) return;
    el.textContent = msg == null ? "" : String(msg);
  }
  async function _loadCategories() {
    const resp = await fetch("/api/rss-source-categories");
    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error(payload?.detail || "Failed to load categories");
    }
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const listEl = _getCategoryListEl();
    if (!listEl) return categories;
    const html = categories.map((c) => {
      const id = String(c?.id || "");
      const name = String(c?.name || id || "");
      const count = Number(c?.count || 0);
      const active = id === _pickerCategory;
      return `
          <button type="button" class="platform-select-action-btn" data-cat="${escapeHtml(id)}" style="justify-content:flex-start;${active ? "background:#111827;color:#fff;border-color:#111827;" : ""}">
            ${escapeHtml(name)} <span style="opacity:0.7;">(${count})</span>
          </button>`;
    }).join("");
    listEl.innerHTML = html;
    listEl.querySelectorAll("button[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        _pickerCategory = String(btn.getAttribute("data-cat") || "");
        _loadCategories().catch(() => {
        });
        _startSearch({ reset: true });
      });
    });
    return categories;
  }
  async function _searchSourcesPage(opts = {}) {
    const reset = opts.reset === true;
    if (_pickerLoading) return;
    _pickerLoading = true;
    try {
      if (reset) {
        _pickerItems = [];
        _pickerOffset = 0;
        _pickerTotal = 0;
      }
      _setPickerStatus("\u52A0\u8F7D\u4E2D...");
      const qs = new URLSearchParams();
      if (_pickerQuery) qs.set("q", _pickerQuery);
      if (_pickerCategory) qs.set("category", _pickerCategory);
      qs.set("limit", String(_pickerLimit));
      qs.set("offset", String(_pickerOffset));
      const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.detail || "Search failed");
      const items = Array.isArray(payload?.sources) ? payload.sources : [];
      const total = Number(payload?.total || 0);
      _pickerTotal = total;
      if (reset) {
        _pickerItems = items;
      } else {
        _pickerItems = _pickerItems.concat(items);
      }
      _pickerOffset = Number(payload?.next_offset ?? _pickerOffset + items.length) || _pickerOffset + items.length;
      _schedulePickerRender();
      const more = _pickerItems.length < _pickerTotal;
      _setPickerStatus(`\u5DF2\u52A0\u8F7D ${_pickerItems.length}/${_pickerTotal}${more ? "\uFF08\u7EE7\u7EED\u6EDA\u52A8\u52A0\u8F7D\uFF09" : ""}`);
    } finally {
      _pickerLoading = false;
    }
  }
  function _schedulePickerRender() {
    if (_pickerRenderRaf) return;
    _pickerRenderRaf = window.requestAnimationFrame(() => {
      _pickerRenderRaf = 0;
      _renderPickerVirtual();
    });
  }
  function _renderPickerVirtual() {
    const root = _getResultsEl();
    if (!root) return;
    const scrollTop = root.scrollTop || 0;
    const viewH = root.clientHeight || 360;
    const totalItems = _pickerItems.length;
    const totalH = totalItems * _ROW_H;
    const start = Math.max(0, Math.floor(scrollTop / _ROW_H) - _OVERSCAN);
    const end = Math.min(totalItems, Math.ceil((scrollTop + viewH) / _ROW_H) + _OVERSCAN);
    let inner = root.querySelector(":scope > .rss-src-inner");
    if (!inner) {
      root.innerHTML = '<div class="rss-src-inner" style="position:relative;width:100%;"></div>';
      inner = root.querySelector(":scope > .rss-src-inner");
    }
    inner.style.height = `${totalH}px`;
    const parts = [];
    for (let i = start; i < end; i++) {
      const s = _pickerItems[i] || {};
      const sid = String(s.id || "").trim();
      const name = String(s.name || s.host || sid);
      const url = String(s.url || "");
      parts.push(
        `<div class="rss-source-item" data-source-id="${escapeHtml(sid)}" style="position:absolute;left:0;right:0;top:${i * _ROW_H}px;height:${_ROW_H}px;padding:8px 10px;border-bottom:1px solid #f3f4f6;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <div style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                <span style="font-weight:700;font-size:0.9rem;color:#111827;">${escapeHtml(name)}</span>
                <span style="font-weight:400;font-size:0.75rem;color:#9ca3af;"> \u2014 </span>
                <span style="font-weight:400;font-size:0.72rem;color:#6b7280;">${escapeHtml(url)}</span>
              </div>
            </div>`
      );
    }
    inner.innerHTML = parts.join("");
    inner.querySelectorAll(".rss-source-item[data-source-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const sid = String(el.getAttribute("data-source-id") || "").trim();
        const source = _pickerItems.find((x) => x && String(x.id || "").trim() === sid) || null;
        _setSelectedSource(source);
        closePicker();
      });
    });
    const nearBottom = scrollTop + viewH >= totalH - _ROW_H * 6;
    if (nearBottom && _pickerItems.length < _pickerTotal) {
      _searchSourcesPage({ reset: false }).catch((e) => {
        _setPickerStatus(e?.message || String(e));
      });
    }
  }
  function _startSearch(opts = {}) {
    const reset = opts.reset !== false;
    _searchSourcesPage({ reset }).catch((e) => {
      _setPickerStatus(e?.message || String(e));
    });
  }
  function openPicker() {
    const modal = _getPickerModalEl();
    if (!modal) return;
    _pickerOpen = true;
    modal.classList.add("show");
    const input = _getSearchInputEl();
    if (input) {
      input.value = _pickerQuery;
      input.focus();
    }
    _loadCategories().catch(() => {
    });
    _startSearch({ reset: true });
  }
  function closePicker() {
    const modal = _getPickerModalEl();
    if (!modal) return;
    _pickerOpen = false;
    modal.classList.remove("show");
  }
  function _renderList() {
    const listEl = _getListEl();
    if (!listEl) return;
    const subs = subscription.getSubscriptions();
    if (!subs.length) {
      listEl.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;">\u6682\u65E0\u8BA2\u9605</div>';
      return;
    }
    const html = subs.map((s, idx) => {
      const sid = String(s?.source_id || s?.rss_source_id || "").trim();
      const url = escapeHtml(s.url || "");
      const title = escapeHtml(s.feed_title || "");
      const column = escapeHtml(s.column || "RSS");
      const name = title ? `${title}` : url;
      const pending = sid && _pendingSyncBySourceId.has(sid);
      return `
            <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;gap:8px;align-items:baseline;">
                        <div style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            <span style="font-weight:700;font-size:0.9rem;color:#111827;">${name}</span>
                            ${pending ? '<span style="margin-left:8px;font-weight:400;font-size:0.75rem;color:#9ca3af;">\u540C\u6B65\u4E2D...</span>' : ""}
                            <span style="font-weight:400;font-size:0.75rem;color:#9ca3af;"> \u2014 </span>
                            <span style="font-weight:400;font-size:0.72rem;color:#6b7280;">${url}</span>
                        </div>
                        <div style="flex:0 0 auto;font-size:0.72rem;color:#6b7280;white-space:nowrap;">\u680F\u76EE\uFF1A${column}</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex:0 0 auto;">
                    <button type="button" class="platform-select-action-btn" onclick="removeRssSubscription(${idx})">\u5220\u9664</button>
                </div>
            </div>`;
    }).join("");
    listEl.innerHTML = html;
    _updateRssGatingUI();
  }
  var subscription = {
    getSubscriptionsRaw() {
      const raw = storage.get(STORAGE_KEY, []);
      return Array.isArray(raw) ? raw : [];
    },
    setSubscriptionsRaw(subs) {
      if (!Array.isArray(subs)) {
        storage.set(STORAGE_KEY, []);
        return;
      }
      storage.set(STORAGE_KEY, subs);
    },
    getSubscriptions() {
      const raw = this.getSubscriptionsRaw();
      return raw.filter((s) => s && typeof s === "object").map((s) => {
        return {
          source_id: String(s.source_id || s.rss_source_id || "").trim(),
          url: String(s.url || "").trim(),
          feed_title: String(s.feed_title || "").trim(),
          column: String(s.column || "RSS").trim() || "RSS",
          platform_id: String(s.platform_id || "").trim()
        };
      }).filter((s) => !!s.source_id || !!s.url);
    },
    setSubscriptions(subs) {
      this.setSubscriptionsRaw(subs);
    },
    ensureSnapshot() {
      if (Array.isArray(_subsSnapshot)) return;
      try {
        _subsSnapshot = this.getSubscriptions();
      } catch (e) {
        _subsSnapshot = null;
      }
    },
    stageFromCatalogPreview(opts = {}) {
      const sid = String(opts?.source_id || opts?.rss_source_id || "").trim();
      if (!sid) return;
      const url = String(opts?.url || "").trim();
      const feedTitle = String(opts?.feed_title || opts?.name || "").trim();
      const column = String(opts?.column || "RSS").trim() || "RSS";
      this.ensureSnapshot();
      const subs = this.getSubscriptions();
      const idx = subs.findIndex((s) => s?.source_id && s.source_id === sid);
      const item = {
        source_id: sid,
        url,
        feed_title: feedTitle,
        column,
        platform_id: ""
      };
      if (idx >= 0) subs[idx] = item;
      else subs.unshift(item);
      this.setSubscriptions(subs);
      const entriesCount = Number(opts?.entries_count ?? 0) || 0;
      _previewStatusBySourceId.set(sid, {
        ok: true,
        entries_count: entriesCount,
        ts: Date.now()
      });
      try {
        _renderList();
      } catch (e) {
      }
      _updateRssGatingUI();
    },
    open() {
      const modal = _getModalEl();
      if (!modal) return;
      try {
        _subsSnapshot = this.getSubscriptions();
      } catch (e) {
        _subsSnapshot = null;
      }
      _setInputValue("rssFeedTitle", "");
      _rssFeedTitleAutoFilled = false;
      _rssFeedTitleUserEdited = false;
      _previewStatusBySourceId.clear();
      _pendingSyncBySourceId.clear();
      _renderList();
      const previewEl = _getPreviewEl();
      if (previewEl) previewEl.innerHTML = "";
      _setSaveStatus("");
      modal.classList.add("show");
      _updateRssGatingUI();
      _syncSubscriptionsFromServer({ showHintOn403: false }).catch(() => {
      });
    },
    close() {
      const modal = _getModalEl();
      if (!modal) return;
      modal.classList.remove("show");
    },
    async previewCurrent() {
      const sid = _getSelectedSourceId();
      if (!sid) {
        alert("\u8BF7\u9009\u62E9 RSS \u6E90");
        return;
      }
      try {
        await _previewSource(sid);
      } catch (e) {
        _previewStatusBySourceId.set(String(sid || "").trim(), {
          ok: false,
          entries_count: 0,
          ts: Date.now(),
          error: String(e?.message || e)
        });
        _updateRssGatingUI();
        const previewEl = _getPreviewEl();
        if (previewEl) previewEl.innerHTML = `<div style="color:#dc2626;">${escapeHtml(e?.message || String(e))}</div>`;
      }
    },
    removeAt(index) {
      const subs = this.getSubscriptions();
      if (index < 0 || index >= subs.length) return;
      try {
        const sid = String(subs[index]?.source_id || subs[index]?.rss_source_id || "").trim();
        if (sid) _pendingSyncBySourceId.delete(sid);
      } catch (e) {
      }
      subs.splice(index, 1);
      this.setSubscriptions(subs);
      _renderList();
    },
    async saveOnly() {
      try {
        const prev3 = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
        const next3 = this.getSubscriptions();
        const changed = _subsKey(prev3) !== _subsKey(next3);
        const newIdsForGate = _diffNewSourceIds(prev3, next3);
        const allNewOk = newIdsForGate.every((sid) => {
          const st = _previewStatusBySourceId.get(sid);
          return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
        });
        if (!changed) {
          _setSaveStatus("\u8BF7\u5148\u901A\u8FC7\u9884\u89C8\u52A0\u5165\u81F3\u5C11\u4E00\u4E2A\u8BA2\u9605\uFF0C\u518D\u4FDD\u5B58", { variant: "info" });
          _updateRssGatingUI();
          return;
        }
        if (!allNewOk) {
          _setSaveStatus("\u65B0\u589E\u8BA2\u9605\u9700\u8981\u5148\u9884\u89C8\u4E14\u5FC5\u987B\u6709\u6761\u76EE\uFF08entries>0\uFF09", { variant: "info" });
          _updateRssGatingUI();
          return;
        }
        let savedNext = next3;
        try {
          const resp = await fetch("/api/me/rss-subscriptions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriptions: _normalizeSubsForServer(next3) })
          });
          if (resp.status === 403) {
            _serverChecked = true;
            _serverEnabled = false;
            try {
              _syncServerEnabledFlag();
            } catch (e) {
            }
            _setSaveStatus("\u672A\u5F00\u542F\u670D\u52A1\u7AEF\u540C\u6B65\uFF08Not allowlisted\uFF09\uFF0C\u5DF2\u4FDD\u5B58\u5230\u672C\u5730\u8BA2\u9605", { variant: "info" });
          } else {
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(payload?.detail || "Save failed");
            savedNext = _normalizeSubsForServer(payload?.subscriptions);
            _serverChecked = true;
            _serverEnabled = true;
            try {
              _syncServerEnabledFlag();
            } catch (e) {
            }
            this.setSubscriptions(savedNext);
          }
        } catch (e) {
          _setSaveStatus(`\u670D\u52A1\u7AEF\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u4F7F\u7528\u672C\u5730\u8BA2\u9605\uFF1A${String(e?.message || e)}`, { variant: "info" });
        }
        const prevSet = new Set(prev3.map((s) => String(s?.source_id || s?.rss_source_id || "").trim()).filter(Boolean));
        const newIds = savedNext.map((s) => String(s?.source_id || s?.rss_source_id || "").trim()).filter((sid) => !!sid && !prevSet.has(sid));
        if (newIds.length > 0) {
          _setPendingSync(newIds, true);
          _renderList();
        }
        if (newIds.length > 0) {
          try {
            await fetch("/api/rss-sources/warmup?wait_ms=0", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source_ids: newIds, priority: "high" })
            });
          } catch (e) {
          }
        }
        try {
          _subsSnapshot = this.getSubscriptions();
        } catch (e) {
          _subsSnapshot = null;
        }
        _renderList();
        _updateRssGatingUI();
      } catch (e) {
        console.error("rss save error:", e);
        try {
          _setSaveStatus(String(e?.message || e), { variant: "error" });
        } catch (_) {
        }
      }
    },
    async saveAndRefresh() {
      try {
        const prev3 = Array.isArray(_subsSnapshot) ? _subsSnapshot : [];
        const next3 = this.getSubscriptions();
        const changed = _subsKey(prev3) !== _subsKey(next3);
        const newIdsForGate = _diffNewSourceIds(prev3, next3);
        const allNewOk = newIdsForGate.every((sid) => {
          const st = _previewStatusBySourceId.get(sid);
          return !!st && st.ok === true && Number(st.entries_count || 0) > 0;
        });
        if (!changed) {
          _setSaveStatus("\u8BF7\u5148\u901A\u8FC7\u9884\u89C8\u52A0\u5165\u81F3\u5C11\u4E00\u4E2A\u8BA2\u9605\uFF0C\u518D\u4FDD\u5B58\u5E76\u5237\u65B0", { variant: "info" });
          _updateRssGatingUI();
          return;
        }
        if (!allNewOk) {
          _setSaveStatus("\u65B0\u589E\u8BA2\u9605\u9700\u8981\u5148\u9884\u89C8\u4E14\u5FC5\u987B\u6709\u6761\u76EE\uFF08entries>0\uFF09", { variant: "info" });
          _updateRssGatingUI();
          return;
        }
        let savedNext = next3;
        try {
          const resp = await fetch("/api/me/rss-subscriptions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriptions: _normalizeSubsForServer(next3) })
          });
          if (resp.status === 403) {
            _serverChecked = true;
            _serverEnabled = false;
            try {
              _syncServerEnabledFlag();
            } catch (e) {
            }
            _setSaveStatus("\u672A\u5F00\u542F\u670D\u52A1\u7AEF\u540C\u6B65\uFF08Not allowlisted\uFF09\uFF0C\u5DF2\u4FDD\u5B58\u5230\u672C\u5730\u8BA2\u9605", { variant: "info" });
          } else {
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(payload?.detail || "Save failed");
            savedNext = _normalizeSubsForServer(payload?.subscriptions);
            _serverChecked = true;
            _serverEnabled = true;
            try {
              _syncServerEnabledFlag();
            } catch (e) {
            }
            this.setSubscriptions(savedNext);
          }
        } catch (e) {
          _setSaveStatus(`\u670D\u52A1\u7AEF\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u4F7F\u7528\u672C\u5730\u8BA2\u9605\uFF1A${String(e?.message || e)}`, { variant: "info" });
        }
        const prevSet = new Set(prev3.map((s) => String(s?.source_id || s?.rss_source_id || "").trim()).filter(Boolean));
        const newIds = savedNext.map((s) => String(s?.source_id || s?.rss_source_id || "").trim()).filter((sid) => !!sid && !prevSet.has(sid));
        if (newIds.length > 0) {
          _setPendingSync(newIds, true);
          _renderList();
        }
        if (newIds.length > 0) {
          try {
            await fetch("/api/rss-sources/warmup?wait_ms=0", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source_ids: newIds, priority: "high" })
            });
          } catch (e) {
          }
        }
        _setSaveStatus("\u6B63\u5728\u4ECE\u6E90\u83B7\u53D6\u6700\u65B0\u5185\u5BB9...", { variant: "info" });
        try {
          const btn = document.querySelector("#rssSubscriptionModal .settings-btn-primary");
          if (btn) btn.setAttribute("disabled", "true");
        } catch (e) {
        }
        const startedAt = Date.now();
        const deadlineMs = 5e3;
        const delays = [0, 300, 700, 1500, 2500];
        let found = false;
        for (const d of delays) {
          const elapsed = Date.now() - startedAt;
          const remaining = deadlineMs - elapsed;
          if (remaining <= 0) break;
          if (d > 0) {
            await _sleep(Math.min(d, remaining));
          }
          await TR.data.refreshViewerData({ preserveScroll: true });
          if (newIds.length > 0) {
            const stillPending = [];
            for (const sid of newIds) {
              if (_pendingSyncBySourceId.has(sid) && _hasRssPlatformNews([sid])) {
                _pendingSyncBySourceId.delete(sid);
              }
              if (_pendingSyncBySourceId.has(sid)) {
                stillPending.push(sid);
              }
            }
            if (stillPending.length === 0) {
              found = true;
              _renderList();
              break;
            }
            _renderList();
          }
          if (newIds.length === 0) {
            found = true;
            break;
          }
        }
        if (found) {
          _setSaveStatus("\u5DF2\u83B7\u53D6\u5230\u5185\u5BB9\uFF0C\u5373\u5C06\u8FD4\u56DE\u2026", { variant: "success" });
        } else {
          if (newIds.length > 0) {
            _setPendingSync(newIds, false);
            _renderList();
          }
          _setSaveStatus("\u5DF2\u8BA2\u9605\uFF0C\u5185\u5BB9\u7A0D\u540E\u66F4\u65B0", { variant: "info" });
        }
        try {
          const btn = document.querySelector("#rssSubscriptionModal .settings-btn-primary");
          if (btn) btn.removeAttribute("disabled");
        } catch (e) {
        }
        await _sleep(found ? 200 : 800);
        this.close();
      } catch (e) {
        console.error("rss refresh error:", e);
        try {
          _setSaveStatus(String(e?.message || e), { variant: "error" });
        } catch (_) {
        }
        try {
          const btn = document.querySelector("#rssSubscriptionModal .settings-btn-primary");
          if (btn) btn.removeAttribute("disabled");
        } catch (_) {
        }
      }
    }
  };
  async function submitSourceRequest() {
    const url = _getInputValue("rssRequestUrl");
    const title = _getInputValue("rssRequestTitle");
    const note = _getInputValue("rssRequestNote");
    if (!url) {
      alert("\u8BF7\u8F93\u5165 URL");
      return;
    }
    if (!title) {
      alert("\u8BF7\u8F93\u5165 \u6807\u9898");
      return;
    }
    if (!note) {
      alert("\u8BF7\u8F93\u5165 \u5907\u6CE8");
      return;
    }
    const previewEl = _getPreviewEl();
    if (previewEl) previewEl.innerHTML = '<div style="color:#6b7280;">\u63D0\u4EA4\u7533\u8BF7\u4E2D...</div>';
    try {
      const resp = await fetch("/api/rss-source-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, note })
      });
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.detail || "Submit failed");
      if (previewEl) previewEl.innerHTML = `<div style="color:#16a34a;">\u5DF2\u63D0\u4EA4\u7533\u8BF7\uFF0C\u72B6\u6001\uFF1A${escapeHtml(payload?.status || "pending")}</div>`;
      _setInputValue("rssRequestUrl", "");
      _setInputValue("rssRequestTitle", "");
      _setInputValue("rssRequestNote", "");
    } catch (e) {
      if (previewEl) previewEl.innerHTML = `<div style="color:#dc2626;">${escapeHtml(e?.message || String(e))}</div>`;
    }
  }
  function toggleRequestSection() {
    const sec = _getRequestSectionEl();
    if (!sec) return;
    const visible = sec.style.display !== "none";
    sec.style.display = visible ? "none" : "block";
  }
  window.openRssSubscriptionModal = () => {
    try {
      const badge = document.getElementById("rssSubscriptionNewBadge");
      if (badge) {
        badge.style.display = "none";
        localStorage.setItem("rss_subscription_badge_dismissed", "true");
      }
    } catch (e) {
    }
    subscription.open();
  };
  window.closeRssSubscriptionModal = () => subscription.close();
  window.previewRssSubscription = () => subscription.previewCurrent();
  window.saveRssSubscriptions = () => subscription.saveAndRefresh();
  window.removeRssSubscription = (idx) => subscription.removeAt(parseInt(idx, 10));
  window.submitRssSourceRequest = () => submitSourceRequest();
  window.toggleRssRequestSection = () => toggleRequestSection();
  window.openRssSourcePicker = () => openPicker();
  window.closeRssSourcePicker = () => closePicker();
  TR.subscription = subscription;
  TR.subscription._serverEnabled = _serverEnabled;
  function _syncServerEnabledFlag() {
    try {
      TR.subscription._serverEnabled = !!_serverEnabled;
    } catch (e) {
    }
  }
  ready(function() {
    const modal = _getModalEl();
    if (modal) {
      const feedTitleInput = document.getElementById("rssFeedTitle");
      if (feedTitleInput) {
        feedTitleInput.addEventListener("input", () => {
          const v = String(feedTitleInput.value || "").trim();
          _rssFeedTitleUserEdited = v !== "";
          _rssFeedTitleAutoFilled = false;
        });
      }
      modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          subscription.close();
        }
      });
    }
    const picker = _getPickerModalEl();
    if (picker) {
      picker.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closePicker();
        }
      });
    }
    const results = _getResultsEl();
    if (results) {
      results.addEventListener("scroll", () => {
        _schedulePickerRender();
      });
    }
    const input = _getSearchInputEl();
    if (input) {
      input.addEventListener("input", () => {
        const next3 = String(input.value || "").trim();
        _pickerQuery = next3;
        if (_pickerDebounceTimer) {
          window.clearTimeout(_pickerDebounceTimer);
          _pickerDebounceTimer = 0;
        }
        _pickerDebounceTimer = window.setTimeout(() => {
          _pickerDebounceTimer = 0;
          _startSearch({ reset: true });
        }, 250);
      });
    }
    _syncServerEnabledFlag();
    _syncSubscriptionsFromServer({ showHintOn403: false }).catch(() => {
    });
  });

  // hotnews/web/static/js/src/rss-catalog-preview-parity.js
  var ENTRIES_PER_SOURCE = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var PREFETCH_AHEAD = 3;
  var EXPLORE_SEEN_STORAGE_KEY = "hotnews_explore_seen_sources_v1";
  var EXPLORE_LAST_STORAGE_KEY = "hotnews_explore_last_source_v1";
  var _open = false;
  var _loading = false;
  var _sources = [];
  var _total = 0;
  var _offset = 0;
  var _sourcesExhausted = false;
  var _cursor = -1;
  var _currentCard = null;
  var _previewCache = /* @__PURE__ */ new Map();
  var _pendingTargetIndex = null;
  var _inFlightIndex = null;
  var _entryPage = 0;
  var _persistedSeenSourceIds = /* @__PURE__ */ new Set();
  var _sessionSeenSourceIds = /* @__PURE__ */ new Set();
  function _loadSeenSet() {
    try {
      const raw = storage.getRaw(EXPLORE_SEEN_STORAGE_KEY);
      if (!raw) return /* @__PURE__ */ new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return /* @__PURE__ */ new Set();
      const out = /* @__PURE__ */ new Set();
      for (const x of arr) {
        const sid = String(x || "").trim();
        if (sid) out.add(sid);
      }
      return out;
    } catch (e) {
      return /* @__PURE__ */ new Set();
    }
  }
  function _persistSeenSet(set) {
    try {
      const arr = Array.from(set || []).map((x) => String(x || "").trim()).filter(Boolean);
      const capped = arr.slice(-2e3);
      storage.setRaw(EXPLORE_SEEN_STORAGE_KEY, JSON.stringify(capped));
    } catch (e) {
    }
  }
  function _mergeAndPersistSessionSeen() {
    try {
      const merged = new Set(Array.from(_persistedSeenSourceIds || []));
      for (const x of Array.from(_sessionSeenSourceIds || [])) merged.add(x);
      _persistedSeenSourceIds = merged;
      _persistSeenSet(_persistedSeenSourceIds);
    } catch (e) {
    }
  }
  function _getLastSourceId() {
    try {
      const raw = storage.getRaw(EXPLORE_LAST_STORAGE_KEY);
      const sid = String(raw || "").trim();
      return sid || null;
    } catch (e) {
      return null;
    }
  }
  function _setLastSourceId(sourceId) {
    try {
      const sid = String(sourceId || "").trim();
      if (!sid) return;
      storage.setRaw(EXPLORE_LAST_STORAGE_KEY, sid);
    } catch (e) {
    }
  }
  var _touchActive = false;
  var _touchStartX = 0;
  var _touchStartY = 0;
  var _touchMode = null;
  function _isMobile() {
    try {
      return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    } catch (e) {
      return false;
    }
  }
  function _onTouchStart(e) {
    if (!_open) return;
    if (!_isMobile()) return;
    if (document.getElementById("rssCategoryPickerModal")?.classList.contains("show")) return;
    const t = e?.target;
    if (!t || !(t instanceof Element)) return;
    if (t.closest("a,button,input,textarea,select")) return;
    if (!t.closest(".rss-carousel-frame")) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    _touchActive = true;
    _touchMode = null;
    _touchStartX = Number(touches[0]?.clientX || 0);
    _touchStartY = Number(touches[0]?.clientY || 0);
  }
  function _onTouchMove(e) {
    if (!_touchActive) return;
    if (!_open) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX;
    const dy = y - _touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (!_touchMode) {
      if (adx < 10 && ady < 10) return;
      _touchMode = adx >= ady ? "x" : "y";
    }
    try {
      e.preventDefault();
    } catch (e2) {
    }
  }
  function _onTouchEnd(e) {
    if (!_touchActive) return;
    _touchActive = false;
    if (!_open) return;
    if (!_isMobile()) return;
    const touches = e?.changedTouches;
    if (!touches || touches.length < 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX;
    const dy = y - _touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const THRESH = 44;
    if ((_touchMode === "x" || _touchMode == null) && adx >= THRESH && adx > ady) {
      if (dx < 0) next();
      else prev();
      return;
    }
    if ((_touchMode === "y" || _touchMode == null) && ady >= THRESH && ady > adx) {
      if (dy < 0) _pageEntries(-1);
      else _pageEntries(1);
    }
  }
  function _getModalEl2() {
    return document.getElementById("rssCatalogPreviewModal");
  }
  function _getGridEl() {
    return document.getElementById("rssCatalogPreviewGrid");
  }
  function _getStatusEl() {
    return document.getElementById("rssCatalogPreviewStatus");
  }
  function _setStatus(msg, opts = {}) {
    const el = _getStatusEl();
    if (!el) return;
    const variant = String(opts.variant || "").toLowerCase();
    const color = variant === "error" ? "#dc2626" : variant === "success" ? "#16a34a" : "#6b7280";
    el.style.color = color;
    el.textContent = msg == null ? "" : String(msg);
  }
  function _formatTs(ts) {
    const n = Number(ts || 0) || 0;
    if (!n) return "";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x) => String(x).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }
  function _pickEntryTs(e) {
    const cand = [
      e?.published,
      e?.published_at,
      e?.pubDate,
      e?.updated,
      e?.updated_at,
      e?.date,
      e?.datetime,
      e?.date_published,
      e?.date_modified
    ];
    const now = Date.now();
    const maxFuture = now + 365 * 24 * 60 * 60 * 1e3;
    const normalizeEpoch = (n) => {
      const num = Number(n);
      if (!Number.isFinite(num) || num <= 0) return 0;
      if (num < 1e11) return Math.floor(num * 1e3);
      return Math.floor(num);
    };
    for (const v of cand) {
      if (v == null) continue;
      if (typeof v === "number") {
        const t0 = normalizeEpoch(v);
        if (t0 > 0 && t0 <= maxFuture) return t0;
        continue;
      }
      const s = String(v).trim();
      if (!s) continue;
      if (/^\d{10,13}$/.test(s)) {
        const t0 = normalizeEpoch(s);
        if (t0 > 0 && t0 <= maxFuture) return t0;
        continue;
      }
      const t = Date.parse(s);
      if (!Number.isNaN(t) && t > 0 && t <= maxFuture) return t;
    }
    return 0;
  }
  async function _warmupSourceIds(sourceIds, priority = "normal") {
    const ids = Array.isArray(sourceIds) ? sourceIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
    if (!ids.length) return;
    try {
      await fetch("/api/rss-sources/warmup?wait_ms=0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_ids: ids, priority })
      });
    } catch (e) {
    }
  }
  async function _fetchSourcesPage(limit, offset) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || "Failed to load RSS sources");
    const items = Array.isArray(payload?.sources) ? payload.sources : [];
    const total = Number(payload?.total || 0) || 0;
    const nextOffset = Number(payload?.next_offset ?? offset + items.length) || offset + items.length;
    return { items, total, nextOffset };
  }
  async function _ensureSourcesAt(index) {
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (_sourcesExhausted) return;
    let safety = 0;
    while (_sources.length <= idx && !_sourcesExhausted && safety < 50) {
      safety += 1;
      const page = await _fetchSourcesPage(50, _offset);
      _total = page.total;
      _offset = page.nextOffset;
      for (const src of page.items) {
        const sid = String(src?.id || "").trim();
        if (!sid) continue;
        _sources.push(src);
      }
      if (!page.items.length || _offset >= _total) {
        _sourcesExhausted = true;
      }
    }
  }
  async function _ensureAllSourcesLoaded() {
    if (_sourcesExhausted) return;
    let safety = 0;
    while (!_sourcesExhausted && safety < 200) {
      safety += 1;
      await _ensureSourcesAt(_sources.length);
      if (_sourcesExhausted) break;
    }
  }
  function _safeNameFromSource(src) {
    const name = String(src?.name || src?.host || src?.id || "").trim();
    return name || "RSS";
  }
  function _extractEntries(payload) {
    const data2 = payload?.data || {};
    const feedTitle = String(data2?.feed?.title || "").trim();
    const entries = Array.isArray(data2?.entries) ? data2.entries : [];
    const normalized = entries.map((e) => {
      const title = String(e?.title || "").trim();
      const link2 = String(e?.link || "").trim();
      const ts = _pickEntryTs(e);
      return { title: title || link2, link: link2, ts };
    }).filter((x) => !!x.link);
    return { feedTitle, entries: normalized };
  }
  function _computeAlreadyAddedSet() {
    const subs = TR.subscription?.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    const set = /* @__PURE__ */ new Set();
    for (const s of Array.isArray(subs) ? subs : []) {
      const sid = String(s?.source_id || s?.rss_source_id || "").trim();
      if (sid) set.add(sid);
    }
    return set;
  }
  function _shouldSkipSourceId(sourceId) {
    const sid = String(sourceId || "").trim();
    if (!sid) return true;
    try {
      const added = _computeAlreadyAddedSet();
      if (added.has(sid)) return true;
    } catch (e) {
    }
    try {
      if (_persistedSeenSourceIds && _persistedSeenSourceIds.has(sid)) return true;
    } catch (e) {
    }
    return false;
  }
  async function _buildCardForSource(src) {
    const sid = String(src?.id || "").trim();
    if (!sid) return null;
    if (_previewCache.has(sid)) return _previewCache.get(sid);
    const url = String(src?.url || "").trim();
    const name = _safeNameFromSource(src);
    const alreadyAdded = _computeAlreadyAddedSet();
    let entries = [];
    let feedTitle = "";
    let payload = null;
    try {
      const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sid)}`);
      payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.detail || "Preview failed");
      const parsed = _extractEntries(payload);
      feedTitle = parsed.feedTitle;
      entries = parsed.entries;
    } catch (e) {
      const bad = { source_id: sid, error: String(e?.message || e) };
      _previewCache.set(sid, bad);
      return bad;
    }
    if (!Array.isArray(entries) || entries.length <= 0) {
      const bad = { source_id: sid, error: "No entries" };
      _previewCache.set(sid, bad);
      return bad;
    }
    const platformName = feedTitle || name;
    const card = {
      source_id: sid,
      url,
      feed_title: feedTitle || name,
      platform_name: platformName,
      entries,
      entries_count: entries.length,
      error: "",
      already_added: alreadyAdded.has(sid)
    };
    _previewCache.set(sid, card);
    return card;
  }
  async function _findIndexBySourceId(sourceId) {
    const wanted = String(sourceId || "").trim();
    if (!wanted) return -1;
    let safety = 0;
    while (safety < 400) {
      safety += 1;
      const hit = _sources.findIndex((s) => String(s?.id || "").trim() === wanted);
      if (hit >= 0) return hit;
      if (_sourcesExhausted) return -1;
      await _ensureSourcesAt(_sources.length);
      if (_sourcesExhausted) return -1;
    }
    return -1;
  }
  function _prefetchAround(index) {
    if (!_open) return;
    const runner = async () => {
      if (_loading) return;
      if (_pendingTargetIndex != null) return;
      const targets = [];
      for (let i = 1; i <= PREFETCH_AHEAD; i += 1) {
        targets.push(index + i);
      }
      const maxWanted = Math.max(...targets);
      if (Number.isFinite(maxWanted) && maxWanted >= 0) {
        await _ensureSourcesAt(maxWanted);
      }
      for (const t of targets) {
        try {
          if (t < 0) continue;
          await _ensureSourcesAt(t);
          const src = _sources[t];
          if (!src) continue;
          await _buildCardForSource(src);
        } catch (e) {
        }
      }
    };
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner().catch(() => {
        }), { timeout: 1200 });
        return;
      }
    } catch (e) {
    }
    setTimeout(() => runner().catch(() => {
    }), 0);
  }
  function _collectCategoryOptions() {
    const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
    const defaults = TR.settings?.getDefaultCategories ? TR.settings.getDefaultCategories() : null;
    const order = Array.isArray(merged?.categoryOrder) ? merged.categoryOrder : [];
    const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];
    const options = [];
    const seen = /* @__PURE__ */ new Set();
    for (const catId of order) {
      const id = String(catId || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const customCat = custom.find((c) => String(c?.id || "") === id);
      if (customCat) {
        const name2 = String(customCat?.name || id).trim() || id;
        options.push({ id, name: name2, icon: "\u{1F4F1}", isCustom: true });
        continue;
      }
      const def = defaults && defaults[id] ? defaults[id] : null;
      if (!def) continue;
      const name = String(def?.name || id).trim() || id;
      const icon = String(def?.icon || "\u{1F4C1}");
      options.push({ id, name, icon, isCustom: false });
    }
    for (const c of custom) {
      const id = String(c?.id || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const name = String(c?.name || id).trim() || id;
      options.push({ id, name, icon: "\u{1F4F1}", isCustom: true });
    }
    return options;
  }
  async function _addCurrentToCategory(pickedCategory) {
    if (!_currentCard || !_currentCard.source_id) return;
    const pickedId = String(pickedCategory?.id || "").trim();
    const pickedName = String(pickedCategory?.name || pickedId).trim() || pickedId || "RSS";
    const isCustom = !!pickedCategory?.isCustom;
    const sid = String(_currentCard.source_id || "").trim();
    const platformId = sid ? `rss-${sid}` : "";
    let col = "RSS";
    if (pickedId && pickedId !== "rsscol-rss" && !isCustom) {
      col = pickedId;
    }
    try {
      TR.subscription?.ensureSnapshot?.();
    } catch (e) {
    }
    try {
      TR.subscription?.stageFromCatalogPreview?.({
        source_id: _currentCard.source_id,
        url: _currentCard.url,
        feed_title: _currentCard.feed_title || _currentCard.platform_name,
        column: col,
        entries_count: _currentCard.entries_count || 0
      });
    } catch (e) {
      _setStatus(String(e?.message || e), { variant: "error" });
      return;
    }
    if (isCustom && pickedId && platformId) {
      try {
        TR.settings?.addPlatformToCustomCategory?.(pickedId, platformId);
      } catch (e) {
      }
    }
    _currentCard.already_added = true;
    try {
      _renderCard(_currentCard);
    } catch (e) {
    }
    try {
      _setStatus(`\u4FDD\u5B58\u4E2D\uFF1A${pickedName}`, { variant: "info" });
      if (TR.subscription?.saveOnly) {
        await TR.subscription.saveOnly();
      } else if (TR.subscription?.saveAndRefresh) {
        await TR.subscription.saveAndRefresh();
      } else {
        await window.saveRssSubscriptions?.();
      }
      _setStatus(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "success" });
    } catch (e) {
      _setStatus(String(e?.message || e), { variant: "error" });
      try {
        TR.toast?.show?.(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(e?.message || e)}`, { variant: "error", durationMs: 2500 });
      } catch (_) {
      }
      return;
    }
    try {
      TR.toast?.show?.(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "success", durationMs: 1500 });
    } catch (e) {
    }
    try {
      setTimeout(() => {
        if (_open) next();
      }, 60);
    } catch (e) {
    }
    try {
      _warmupSourceIds([_currentCard.source_id], "high").catch(() => {
      });
    } catch (e) {
    }
  }
  function _renderCard(card) {
    const grid = _getGridEl();
    if (!grid) return;
    const c = card;
    const sid = String(c?.source_id || "").trim();
    const platformName = escapeHtml(c?.platform_name || "RSS");
    const btnDisabled = c?.already_added ? "disabled" : "";
    const options = _collectCategoryOptions();
    const dropdownOptionsHtml = options.map((o) => {
      const kind = o?.isCustom ? "custom" : "default";
      const val = `${kind}:${String(o?.id || "").trim()}`;
      return `<option value="${escapeHtml(val)}">${escapeHtml(String(o?.icon || "\u{1F4C1}"))} ${escapeHtml(String(o?.name || o?.id || ""))}</option>`;
    }).join("");
    const items = Array.isArray(c?.entries) ? c.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE) - 1);
    if (_entryPage > maxPage) _entryPage = maxPage;
    if (_entryPage < 0) _entryPage = 0;
    const start = _entryPage * ENTRIES_PER_SOURCE;
    const pageItems = items.slice(start, start + ENTRIES_PER_SOURCE);
    const listHtml = pageItems.map((e, idx) => {
      const title = escapeHtml(e?.title || "");
      const link2 = escapeHtml(e?.link || "#");
      const itemDate = escapeHtml(_formatTs(e?.ts || 0));
      return `
            <li class="news-item" data-news-id="" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(start + idx + 1)}</span>
                    <a class="news-title tr-news-title-lg tr-title-hover-accent tr-hover-glass tr-title-hover-wave" href="${link2}" target="_blank" rel="noopener noreferrer">${title}</a>
                    <span class="rss-entry-date" style="flex:0 0 auto;margin-left:8px;color:#6b7280;font-size:0.75rem;white-space:nowrap;${itemDate ? "" : "display:none;"}">${itemDate}</span>
                </div>
            </li>`;
    }).join("");
    const placeholderCount = Math.max(0, ENTRIES_PER_SOURCE - pageItems.length);
    const placeholderHtml = placeholderCount ? Array.from({ length: placeholderCount }).map((_, i) => {
      const n = start + pageItems.length + i + 1;
      return `
            <li class="news-item rss-entry-placeholder" data-news-id="">
                <div class="news-item-content">
                    <span class="news-index">${String(n)}</span>
                    <span class="news-title tr-news-title-lg tr-hover-glass">&nbsp;</span>
                    <span class="rss-entry-date" style="display:none;">&nbsp;</span>
                </div>
            </li>`;
    }).join("") : "";
    grid.innerHTML = `
        <div class="rss-carousel-frame" style="margin:0 auto;max-width:980px;width:min(980px,100%);box-sizing:border-box;position:relative;padding:52px 56px;">
            <div class="rss-carousel-nav-hints" style="position:absolute;inset:0;pointer-events:none;">
                <div class="rss-nav-hint rss-nav-left" aria-hidden="true" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u2039</div>
                <div class="rss-nav-hint rss-nav-right" aria-hidden="true" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u203A</div>
                <div class="rss-nav-hint rss-nav-up" aria-hidden="true" style="position:absolute;left:50%;top:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u02C4</div>
                <div class="rss-nav-hint rss-nav-down" aria-hidden="true" style="position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u02C5</div>
            </div>
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}" style="margin:0 auto;max-width:980px;width:100%;box-sizing:border-box;">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;flex:1;min-width:0;white-space:nowrap;overflow:hidden;">
                        <div class="rss-preview-title-row" style="display:flex;align-items:baseline;gap:12px;min-width:0;">
                            <span class="rss-preview-title-text tr-title-compact tr-title-ellipsis tr-title-hover-accent" style="flex:1;min-width:0;">\u{1F4F1} ${platformName}</span>
                        </div>
                    </div>
                    <div class="platform-header-actions">
                        <select class="platform-select-action-btn" data-action="add-category" ${btnDisabled} style="padding:6px 10px;">
                            <option value="" selected>\u52A0\u5165\u680F\u76EE</option>
                            ${dropdownOptionsHtml}
                        </select>
                    </div>
                </div>
                <ul class="news-list">${listHtml}${placeholderHtml}</ul>
            </div>
        </div>`;
    try {
      window.requestAnimationFrame(() => {
        const titles = grid.querySelectorAll(".news-title");
        titles.forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (el.closest(".rss-entry-placeholder")) return;
          el.classList.remove("tr-title-overflow-shrink");
          if (el.scrollWidth > el.clientWidth + 1) {
            el.classList.add("tr-title-overflow-shrink");
          }
        });
      });
    } catch (e) {
    }
    const selectEl = grid.querySelector('select[data-action="add-category"]');
    if (selectEl) {
      selectEl.addEventListener("change", async () => {
        if (!_currentCard) return;
        if (_currentCard.already_added) return;
        if (!(selectEl instanceof HTMLSelectElement)) return;
        const raw = String(selectEl.value || "").trim();
        if (!raw) return;
        const parts = raw.split(":");
        const pickedId = String(parts[1] || "").trim();
        const options2 = _collectCategoryOptions();
        const hit = options2.find((x) => String(x?.id || "").trim() === pickedId);
        const picked = hit ? hit : { id: pickedId, name: pickedId, icon: "\u{1F4C1}", isCustom: raw.startsWith("custom:") };
        try {
          selectEl.setAttribute("disabled", "true");
        } catch (e) {
        }
        await _addCurrentToCategory(picked);
      });
    }
  }
  async function _showAt(index, dir = 1) {
    if (_loading) return;
    _loading = true;
    _inFlightIndex = Number(index);
    try {
      await _ensureSourcesAt(index);
      if (_sources.length <= 0) {
        const grid2 = _getGridEl();
        if (grid2) grid2.innerHTML = '<div style="color:#6b7280;">\u6682\u65E0\u53EF\u9884\u89C8\u6E90</div>';
        _setStatus("", { variant: "info" });
        return;
      }
      let idx = index;
      const step = dir >= 0 ? 1 : -1;
      let safety = 0;
      while (safety < 200) {
        safety += 1;
        if (idx < 0) {
          await _ensureAllSourcesLoaded();
          idx = _sources.length - 1;
        }
        await _ensureSourcesAt(idx);
        if (idx >= _sources.length) {
          idx = 0;
        }
        const src = _sources[idx];
        if (!src) {
          idx += step;
          continue;
        }
        const sid = String(src?.id || "").trim();
        if (_shouldSkipSourceId(sid)) {
          idx += step;
          continue;
        }
        const card = await _buildCardForSource(src);
        if (!card || card.error) {
          idx += step;
          continue;
        }
        if (card.already_added) {
          idx += step;
          continue;
        }
        if (_shouldSkipSourceId(card.source_id)) {
          idx += step;
          continue;
        }
        _cursor = idx;
        _currentCard = card;
        _entryPage = 0;
        _renderCard(card);
        _setStatus("", { variant: "info" });
        try {
          const sid2 = String(card?.source_id || "").trim();
          if (sid2) {
            _setLastSourceId(sid2);
            _sessionSeenSourceIds.add(sid2);
          }
        } catch (e) {
        }
        try {
          _warmupSourceIds([card.source_id], "normal").catch(() => {
          });
        } catch (e) {
        }
        try {
          _prefetchAround(idx);
        } catch (e) {
        }
        return;
      }
      const grid = _getGridEl();
      if (grid) grid.innerHTML = '<div style="color:#6b7280;">\u6682\u65E0\u53EF\u9884\u89C8\u6E90</div>';
      _setStatus("", { variant: "info" });
    } catch (e) {
      _setStatus(String(e?.message || e), { variant: "error" });
    } finally {
      _loading = false;
      _inFlightIndex = null;
      if (_open && _pendingTargetIndex != null) {
        const target = Number(_pendingTargetIndex);
        _pendingTargetIndex = null;
        const base = Number.isFinite(_cursor) ? _cursor : 0;
        const dir2 = target >= base ? 1 : -1;
        _showAt(target, dir2).catch((e) => _setStatus(String(e?.message || e), { variant: "error" }));
      }
    }
  }
  function next() {
    if (!_open) return;
    if (_loading) {
      const base = _pendingTargetIndex != null ? Number(_pendingTargetIndex) : _inFlightIndex != null ? Number(_inFlightIndex) : _cursor;
      _pendingTargetIndex = base + 1;
      return;
    }
    const nextIdx = _cursor + 1;
    _showAt(nextIdx, 1).catch((e) => _setStatus(String(e?.message || e), { variant: "error" }));
  }
  function prev() {
    if (!_open) return;
    if (_loading) {
      const base = _pendingTargetIndex != null ? Number(_pendingTargetIndex) : _inFlightIndex != null ? Number(_inFlightIndex) : _cursor;
      _pendingTargetIndex = base - 1;
      return;
    }
    const prevIdx = _cursor - 1;
    _showAt(prevIdx, -1).catch((e) => _setStatus(String(e?.message || e), { variant: "error" }));
  }
  function _pageEntries(delta) {
    if (!_open) return;
    if (!_currentCard) return;
    const items = Array.isArray(_currentCard?.entries) ? _currentCard.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, _entryPage + delta));
    if (nextPage === _entryPage) return;
    _entryPage = nextPage;
    _renderCard(_currentCard);
  }
  function open() {
    const modal = _getModalEl2();
    if (!modal) return;
    _open = true;
    modal.classList.add("show");
    try {
      window.dispatchEvent(new CustomEvent("tr_explore_modal_opened"));
    } catch (e) {
    }
    try {
      const modalContent = modal.querySelector(".settings-modal");
      if (modalContent) {
        modalContent.setAttribute("tabindex", "0");
        modalContent.focus();
      }
    } catch (e) {
    }
    try {
      TR.subscription?.ensureSnapshot?.();
    } catch (e) {
    }
    _loading = false;
    _pendingTargetIndex = null;
    _inFlightIndex = null;
    _sources = [];
    _total = 0;
    _offset = 0;
    _sourcesExhausted = false;
    _cursor = -1;
    _currentCard = null;
    _previewCache = /* @__PURE__ */ new Map();
    _entryPage = 0;
    _persistedSeenSourceIds = _loadSeenSet();
    _sessionSeenSourceIds = /* @__PURE__ */ new Set();
    const lastSid = _getLastSourceId();
    if (lastSid) {
      (async () => {
        const idx = await _findIndexBySourceId(lastSid);
        if (idx >= 0) {
          await _showAt(idx, 1);
        } else {
          next();
        }
      })().catch(() => next());
      return;
    }
    next();
  }
  function close() {
    const modal = _getModalEl2();
    if (!modal) return;
    _open = false;
    modal.classList.remove("show");
    _mergeAndPersistSessionSeen();
    try {
      window.dispatchEvent(new CustomEvent("tr_explore_modal_closed"));
    } catch (e) {
    }
  }
  function closeOnOverlay(e) {
    const modal = _getModalEl2();
    if (!modal) return;
    if (e && e.target === modal) {
      close();
    }
  }
  async function saveAndRefresh() {
    try {
      await (TR.subscription?.saveAndRefresh ? TR.subscription.saveAndRefresh() : window.saveRssSubscriptions?.());
    } catch (e) {
      _setStatus(String(e?.message || e), { variant: "error" });
      return;
    }
    close();
  }
  window.openRssCatalogPreviewModal = () => open();
  window.closeRssCatalogPreviewModal = () => close();
  window.closeRssCatalogPreviewModalOnOverlay = (e) => closeOnOverlay(e);
  window.rssCatalogPreviewNext = () => next();
  window.rssCatalogPreviewPrev = () => prev();
  window.rssCatalogPreviewSaveAndRefresh = () => saveAndRefresh();
  TR.rssCatalogPreview = {
    open,
    close,
    next,
    prev,
    saveAndRefresh
  };
  ready(function() {
    const modal = _getModalEl2();
    if (!modal) return;
    const modalContent = modal.querySelector(".settings-modal");
    if (modalContent) {
      modalContent.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          close();
          return;
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (_open) close();
        return;
      }
      if (!_open) return;
      if (document.getElementById("rssCategoryPickerModal")?.classList.contains("show")) return;
      const t = e?.target;
      if (t && t instanceof Element) {
        if (t.closest("input,textarea,select")) return;
      }
      if (e.key === " " || e.key === "Spacebar" || e.code === "Space") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        _pageEntries(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        _pageEntries(1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
    });
    const body = modal.querySelector(".settings-modal-body");
    if (body) {
      body.addEventListener("click", (e) => {
        if (!_open) return;
        if (document.getElementById("rssCategoryPickerModal")?.classList.contains("show")) return;
        const t = e?.target;
        if (!t || !(t instanceof Element)) return;
        if (t.closest("a,button,input,textarea,select")) return;
        const x = Number(e?.clientX || 0);
        const y = Number(e?.clientY || 0);
        const card = modal.querySelector("#rssCatalogPreviewGrid .platform-card");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const HIT_PAD = 140;
        const hitLeft = rect.left - HIT_PAD;
        const hitRight = rect.right + HIT_PAD;
        const hitTop = rect.top - HIT_PAD;
        const hitBottom = rect.bottom + HIT_PAD;
        if (x < hitLeft || x > hitRight || y < hitTop || y > hitBottom) return;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return;
        if (y < rect.top) {
          _pageEntries(-1);
          return;
        }
        if (y > rect.bottom) {
          _pageEntries(1);
          return;
        }
        if (x < rect.left) {
          prev();
          return;
        }
        if (x > rect.right) {
          next();
          return;
        }
      });
      body.addEventListener("touchstart", _onTouchStart, { passive: true });
      body.addEventListener("touchmove", _onTouchMove, { passive: false });
      body.addEventListener("touchend", _onTouchEnd, { passive: true });
      body.addEventListener("touchcancel", _onTouchEnd, { passive: true });
    }
  });

  // hotnews/web/static/js/src/explore-embedded-rss.js
  var ENABLE_OLD_EXPLORE = false;
  var EXPLORE_TAB_ID = "explore";
  var ENTRIES_PER_SOURCE2 = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;
  var BATCH_SIZE = 6;
  var LOAD_MORE_SIZE = 4;
  var PREVIEW_CONCURRENCY = 6;
  var PREVIEW_CACHE_TTL_MS = 3 * 60 * 1e3;
  var PREVIEW_TIMEOUT_MS = 2e3;
  var EXPLORE_CARDS_ENDPOINT = "/api/rss-sources/explore-cards";
  var EXPLORE_TAB_SEEN_STORAGE_KEY = "hotnews_explore_tab_seen_sources_v1";
  var EXPLORE_TAB_CURSOR_STORAGE_KEY = "hotnews_explore_tab_cursor_v1";
  var _loading2 = false;
  var _currentBatch = [];
  var _delegatedHandlersAttached = false;
  var _cursor2 = null;
  var _seenCache = null;
  var _totalCache = 0;
  var _previewCache2 = /* @__PURE__ */ new Map();
  var _previewInFlight = /* @__PURE__ */ new Map();
  var _pendingNonExploreRefresh = false;
  function _renderGridMessage(message, opts = {}) {
    const grid = _getGridEl2();
    if (!grid) return;
    const msg = message == null ? "" : String(message);
    const retry = opts.retry === true;
    const btn = retry ? '<div style="margin-top:8px;"><button type="button" class="platform-select-action-btn" data-action="retry">\u91CD\u8BD5</button></div>' : "";
    grid.innerHTML = `<div class="category-empty-state">${escapeHtml(msg)}${btn}</div>`;
  }
  function _buildExploreExcludeSourceIds() {
    const exclude = /* @__PURE__ */ new Set();
    try {
      const seen = _seenCache || _loadSeenSet2();
      _seenCache = seen;
      for (const sid of seen) {
        if (sid) exclude.add(String(sid));
      }
    } catch (e) {
    }
    try {
      const alreadyAdded = _computeAlreadyAddedSet2();
      for (const sid of alreadyAdded) {
        if (sid) exclude.add(String(sid));
      }
    } catch (e) {
    }
    try {
      for (const card of Array.isArray(_currentBatch) ? _currentBatch : []) {
        const sid = String(card?.source_id || "").trim();
        if (sid) exclude.add(sid);
      }
    } catch (e) {
    }
    return Array.from(exclude);
  }
  async function _tryFetchExploreCards(want) {
    const n = Math.max(0, Number(want || 0) || 0);
    if (n <= 0) return [];
    const pane = _getPaneEl();
    if (!pane || !pane.classList.contains("active")) return [];
    try {
      const exclude = _buildExploreExcludeSourceIds();
      const params = new URLSearchParams();
      params.set("cards", String(n));
      params.set("entries_per_card", String(ENTRIES_PER_SOURCE2));
      if (exclude.length) {
        params.set("exclude_source_ids", exclude.join(","));
      }
      const reqUrl = `${EXPLORE_CARDS_ENDPOINT}?${params.toString()}`;
      const resp = await fetch(reqUrl, { method: "GET" });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) return [];
      const cards = Array.isArray(payload?.cards) ? payload.cards : [];
      return cards.map((c) => {
        const sid = String(c?.source_id || "").trim();
        const url2 = String(c?.url || "").trim();
        const platformName = String(c?.platform_name || c?.feed_title || "RSS").trim() || "RSS";
        const entries = Array.isArray(c?.entries) ? c.entries : [];
        return {
          source_id: sid,
          url: url2,
          feed_title: String(c?.feed_title || platformName).trim() || platformName,
          platform_name: platformName,
          entries: entries.slice(0, ENTRIES_PER_SOURCE2).map((e) => ({
            title: String(e?.title || "").trim(),
            link: String(e?.link || "").trim(),
            published: e?.published || e?.ts || ""
          })),
          entries_count: entries.length,
          already_added: false
        };
      }).filter((x) => x.source_id && Array.isArray(x.entries) && x.entries.length > 0);
    } catch (e) {
      return [];
    }
  }
  function _waitAnimationEnd(el, fallbackMs) {
    return new Promise((resolve) => {
      if (!el) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          el.removeEventListener("animationend", onEnd);
        } catch (e) {
        }
        resolve();
      };
      const onEnd = () => finish();
      try {
        el.addEventListener("animationend", onEnd, { once: true });
      } catch (e) {
      }
      setTimeout(finish, Math.max(0, Number(fallbackMs || 0) || 0));
    });
  }
  function _getPaneEl() {
    return document.getElementById("tab-explore");
  }
  async function _loadNextValidCard() {
    const alreadyAdded = _computeAlreadyAddedSet2();
    const seen = _seenCache || _loadSeenSet2();
    _seenCache = seen;
    if (_cursor2 == null) {
      _cursor2 = _loadCursor();
    }
    const existingInBatch = new Set((Array.isArray(_currentBatch) ? _currentBatch : []).map((x) => String(x?.source_id || "").trim()).filter(Boolean));
    let safety = 0;
    while (safety < 200) {
      safety += 1;
      const pageOffset = _cursor2;
      const page = await _fetchSourcesPage2(50, pageOffset);
      _totalCache = page.total;
      if (!page.items.length) return null;
      const candidates = [];
      for (const src of page.items) {
        _cursor2 += 1;
        const sid = String(src?.id || "").trim();
        if (!sid) continue;
        if (seen.has(sid)) continue;
        if (alreadyAdded.has(sid)) continue;
        if (existingInBatch.has(sid)) continue;
        const url = String(src?.url || "").trim();
        const name = _safeNameFromSource2(src);
        candidates.push({ sid, url, name });
      }
      const card = await _pickFirstValidCardFromCandidates(candidates);
      if (card) return card;
      if (_cursor2 >= _totalCache) return null;
      if (_cursor2 === pageOffset) {
        _cursor2 += page.items.length;
      }
    }
    return null;
  }
  function _getCachedPreview(sid) {
    const hit = _previewCache2.get(sid);
    if (!hit) return null;
    const age = Date.now() - Number(hit.ts || 0);
    if (age > PREVIEW_CACHE_TTL_MS) {
      _previewCache2.delete(sid);
      return null;
    }
    return hit;
  }
  async function _fetchPreviewCached(sid) {
    const key = String(sid || "").trim();
    if (!key) return null;
    const cached = _getCachedPreview(key);
    if (cached) return cached;
    const inFlight = _previewInFlight.get(key);
    if (inFlight) return inFlight;
    const p = (async () => {
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? window.setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS) : 0;
        const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(key)}`, controller ? { signal: controller.signal } : void 0);
        try {
          if (timer) window.clearTimeout(timer);
        } catch (e) {
        }
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const out2 = { ts: Date.now(), ok: false, feedTitle: "", entries: [], error: payload?.detail || "Preview failed" };
          _previewCache2.set(key, out2);
          return out2;
        }
        const parsed = _extractEntries2(payload);
        const out = { ts: Date.now(), ok: true, feedTitle: parsed.feedTitle, entries: parsed.entries, error: "" };
        _previewCache2.set(key, out);
        return out;
      } catch (e) {
        const out = { ts: Date.now(), ok: false, feedTitle: "", entries: [], error: String(e?.message || e) };
        _previewCache2.set(key, out);
        return out;
      } finally {
        _previewInFlight.delete(key);
      }
    })();
    _previewInFlight.set(key, p);
    return p;
  }
  async function _pickFirstValidCardFromCandidates(candidates) {
    const queue = Array.isArray(candidates) ? [...candidates] : [];
    if (queue.length === 0) return null;
    let found = null;
    let doneResolve = null;
    const done = new Promise((resolve) => {
      doneResolve = resolve;
    });
    const worker = async () => {
      while (queue.length > 0 && !found) {
        const item = queue.shift();
        if (!item || !item.sid) continue;
        const preview = await _fetchPreviewCached(item.sid);
        if (!preview || preview.ok !== true) continue;
        const entries = Array.isArray(preview.entries) ? preview.entries : [];
        if (entries.length <= 0) continue;
        found = {
          source_id: item.sid,
          url: item.url,
          feed_title: preview.feedTitle || item.name,
          platform_name: preview.feedTitle || item.name,
          entries,
          entries_count: entries.length,
          already_added: false
        };
        try {
          if (doneResolve) doneResolve();
          doneResolve = null;
        } catch (e) {
        }
        return;
      }
    };
    const k = Math.max(1, Math.min(PREVIEW_CONCURRENCY, queue.length));
    const workers = Array.from({ length: k }).map(() => worker().catch(() => {
    }));
    await Promise.race([Promise.all(workers), done]);
    return found;
  }
  async function _loadNextValidCards(maxCount) {
    const want = Math.max(0, Number(maxCount || 0) || 0);
    if (want <= 0) return [];
    const alreadyAdded = _computeAlreadyAddedSet2();
    const seen = _seenCache || _loadSeenSet2();
    _seenCache = seen;
    if (_cursor2 == null) {
      _cursor2 = _loadCursor();
    }
    const existing = new Set((Array.isArray(_currentBatch) ? _currentBatch : []).map((x) => String(x?.source_id || "").trim()).filter(Boolean));
    const picked = [];
    let doneResolve = null;
    const done = new Promise((resolve) => {
      doneResolve = resolve;
    });
    let safety = 0;
    while (safety < 200 && picked.length < want) {
      safety += 1;
      const pageOffset = _cursor2;
      const page = await _fetchSourcesPage2(50, pageOffset);
      _totalCache = page.total;
      if (!page.items.length) break;
      const candidates = [];
      for (const src of page.items) {
        _cursor2 += 1;
        const sid = String(src?.id || "").trim();
        if (!sid) continue;
        if (seen.has(sid)) continue;
        if (alreadyAdded.has(sid)) continue;
        if (existing.has(sid)) continue;
        if (picked.some((x) => String(x?.source_id || "").trim() === sid)) continue;
        const url = String(src?.url || "").trim();
        const name = _safeNameFromSource2(src);
        candidates.push({ sid, url, name });
      }
      const queue = [...candidates];
      const worker = async () => {
        while (queue.length > 0 && picked.length < want) {
          const item = queue.shift();
          if (!item || !item.sid) continue;
          const preview = await _fetchPreviewCached(item.sid);
          if (!preview || preview.ok !== true) continue;
          const entries = Array.isArray(preview.entries) ? preview.entries : [];
          if (entries.length <= 0) continue;
          if (picked.length >= want) return;
          picked.push({
            source_id: item.sid,
            url: item.url,
            feed_title: preview.feedTitle || item.name,
            platform_name: preview.feedTitle || item.name,
            entries,
            entries_count: entries.length,
            already_added: false
          });
          if (picked.length >= want) {
            try {
              if (doneResolve) doneResolve();
              doneResolve = null;
            } catch (e) {
            }
            return;
          }
        }
      };
      const k = Math.max(1, Math.min(PREVIEW_CONCURRENCY, queue.length));
      const workers = Array.from({ length: k }).map(() => worker().catch(() => {
      }));
      await Promise.race([Promise.all(workers), done]);
      if (picked.length >= want) break;
      if (_cursor2 >= _totalCache) break;
      if (_cursor2 === pageOffset) {
        _cursor2 += page.items.length;
      }
    }
    return picked.slice(0, want);
  }
  async function _fillToBatchSize() {
    if (_loading2) return;
    const pane = _getPaneEl();
    const grid = _getGridEl2();
    if (!pane || !grid) return;
    if (!pane.classList.contains("active")) return;
    _loading2 = true;
    _setLoadingUI(true);
    try {
      if (_currentBatch.length < BATCH_SIZE) {
        const remaining = BATCH_SIZE - _currentBatch.length;
        const cached = await _tryFetchExploreCards(remaining);
        if (cached.length) {
          _currentBatch = [..._currentBatch, ...cached];
          _renderBatch(_currentBatch);
        }
      }
      while (_currentBatch.length < BATCH_SIZE) {
        const remaining = BATCH_SIZE - _currentBatch.length;
        const cards = await _loadNextValidCards(remaining);
        if (!cards.length) break;
        _currentBatch = [..._currentBatch, ...cards];
        _renderBatch(_currentBatch);
      }
      if (_cursor2 != null) {
        _persistCursor(_cursor2);
      }
      if (_currentBatch.length <= 0) {
        if (_cursor2 != null && _totalCache > 0 && _cursor2 >= _totalCache) {
          _cursor2 = 0;
          _persistCursor(_cursor2);
        }
      }
    } catch (e) {
      if (_currentBatch.length <= 0) {
        _renderGridMessage("\u52A0\u8F7D\u5931\u8D25", { retry: true });
      }
    } finally {
      _loading2 = false;
      _setLoadingUI(false);
      _renderBatch(_currentBatch);
    }
  }
  function _getGridEl2() {
    return document.getElementById("trExploreGrid");
  }
  function _getStatusEl2() {
    return document.getElementById("trExploreStatus");
  }
  function _setStatus2(msg, opts = {}) {
    const el = _getStatusEl2();
    if (!el) return;
    const variant = String(opts.variant || "").toLowerCase();
    const color = variant === "error" ? "#dc2626" : variant === "success" ? "#16a34a" : "#6b7280";
    el.style.color = color;
    el.textContent = msg == null ? "" : String(msg);
  }
  function _setLoadingUI(isLoading) {
    if (!isLoading) return;
    if (_currentBatch.length > 0) return;
    _renderGridMessage("\u52A0\u8F7D\u4E2D...");
  }
  function _isGridEmpty() {
    const grid = _getGridEl2();
    if (!grid) return true;
    try {
      return grid.querySelectorAll(".platform-card").length === 0;
    } catch (e) {
      return true;
    }
  }
  function _collectCategoryOptions2() {
    const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
    const defaults = TR.settings?.getDefaultCategories ? TR.settings.getDefaultCategories() : null;
    const order = Array.isArray(merged?.categoryOrder) ? merged.categoryOrder : [];
    const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];
    const options = [];
    const seen = /* @__PURE__ */ new Set();
    for (const catId of order) {
      const id = String(catId || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const customCat = custom.find((c) => String(c?.id || "") === id);
      if (customCat) {
        const name2 = String(customCat?.name || id).trim() || id;
        options.push({ id, name: name2, icon: "\u{1F4F1}", isCustom: true });
        continue;
      }
      const def = defaults && defaults[id] ? defaults[id] : null;
      if (!def) continue;
      const name = String(def?.name || id).trim() || id;
      const icon = String(def?.icon || "\u{1F4C1}");
      options.push({ id, name, icon, isCustom: false });
    }
    for (const c of custom) {
      const id = String(c?.id || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const name = String(c?.name || id).trim() || id;
      options.push({ id, name, icon: "\u{1F4F1}", isCustom: true });
    }
    return options;
  }
  async function _addMetaToCategory(meta, pickedCategory) {
    if (!meta || !meta.source_id) return;
    const pickedId = String(pickedCategory?.id || "").trim();
    const pickedName = String(pickedCategory?.name || pickedId).trim() || pickedId || "RSS";
    const isCustom = !!pickedCategory?.isCustom;
    const sid = String(meta.source_id || "").trim();
    const platformId = sid ? `rss-${sid}` : "";
    let col = "RSS";
    if (pickedId && pickedId !== "rsscol-rss" && !isCustom) {
      col = pickedId;
    }
    try {
      TR.subscription?.ensureSnapshot?.();
    } catch (e) {
    }
    try {
      TR.subscription?.stageFromCatalogPreview?.({
        source_id: meta.source_id,
        url: meta.url,
        feed_title: meta.feed_title || meta.platform_name,
        column: col,
        entries_count: meta.entries_count || 0
      });
    } catch (e) {
      _setStatus2(String(e?.message || e), { variant: "error" });
      return;
    }
    if (isCustom && pickedId && platformId) {
      try {
        TR.settings?.addPlatformToCustomCategory?.(pickedId, platformId);
      } catch (e) {
      }
    }
    try {
      _setStatus2(`\u4FDD\u5B58\u4E2D\uFF1A${pickedName}`, { variant: "info" });
      if (TR.subscription?.saveOnly) {
        await TR.subscription.saveOnly();
      } else if (TR.subscription?.saveAndRefresh) {
        await TR.subscription.saveAndRefresh();
      } else {
        await window.saveRssSubscriptions?.();
      }
      _setStatus2(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "success" });
    } catch (e) {
      _setStatus2(String(e?.message || e), { variant: "error" });
      try {
        TR.toast?.show?.(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(e?.message || e)}`, { variant: "error", durationMs: 2500 });
      } catch (_) {
      }
      return;
    }
    try {
      TR.toast?.show?.(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "success", durationMs: 1500 });
    } catch (e) {
    }
    try {
      _pendingNonExploreRefresh = true;
    } catch (e) {
    }
    try {
      _warmupSourceIds2([meta.source_id], "high").catch(() => {
      });
    } catch (e) {
    }
  }
  function _loadSeenSet2() {
    try {
      const raw = storage.getRaw(EXPLORE_TAB_SEEN_STORAGE_KEY);
      if (!raw) return /* @__PURE__ */ new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return /* @__PURE__ */ new Set();
      const out = /* @__PURE__ */ new Set();
      for (const x of arr) {
        const sid = String(x || "").trim();
        if (sid) out.add(sid);
      }
      return out;
    } catch (e) {
      return /* @__PURE__ */ new Set();
    }
  }
  function _persistSeenSet2(set) {
    try {
      const arr = Array.from(set || []).map((x) => String(x || "").trim()).filter(Boolean);
      const capped = arr.slice(-2e3);
      storage.setRaw(EXPLORE_TAB_SEEN_STORAGE_KEY, JSON.stringify(capped));
    } catch (e) {
    }
  }
  function _loadCursor() {
    try {
      const raw = storage.getRaw(EXPLORE_TAB_CURSOR_STORAGE_KEY);
      const n = Number(raw || 0) || 0;
      return n < 0 ? 0 : n;
    } catch (e) {
      return 0;
    }
  }
  function _persistCursor(offset) {
    try {
      const n = Number(offset || 0) || 0;
      storage.setRaw(EXPLORE_TAB_CURSOR_STORAGE_KEY, String(n < 0 ? 0 : n));
    } catch (e) {
    }
  }
  function _computeAlreadyAddedSet2() {
    const subs = TR.subscription?.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    const set = /* @__PURE__ */ new Set();
    for (const s of Array.isArray(subs) ? subs : []) {
      const sid = String(s?.source_id || s?.rss_source_id || "").trim();
      if (sid) set.add(sid);
    }
    return set;
  }
  async function _warmupSourceIds2(sourceIds, priority = "normal") {
    const ids = Array.isArray(sourceIds) ? sourceIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
    if (!ids.length) return;
    try {
      await fetch("/api/rss-sources/warmup?wait_ms=0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_ids: ids, priority })
      });
    } catch (e) {
    }
  }
  async function _fetchSourcesPage2(limit, offset) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || "Failed to load RSS sources");
    const items = Array.isArray(payload?.sources) ? payload.sources : [];
    const total = Number(payload?.total || 0) || 0;
    const nextOffset = Number(payload?.next_offset ?? offset + items.length) || offset + items.length;
    return { items, total, nextOffset };
  }
  function _extractEntries2(payload) {
    const data2 = payload?.data || {};
    const feedTitle = String(data2?.feed?.title || "").trim();
    const entries = Array.isArray(data2?.entries) ? data2.entries : [];
    const normalized = entries.map((e) => {
      const title = String(e?.title || "").trim();
      const link2 = String(e?.link || "").trim();
      return { title: title || link2, link: link2 };
    }).filter((x) => !!x.link);
    return { feedTitle, entries: normalized };
  }
  function _safeNameFromSource2(src) {
    const name = String(src?.name || src?.host || src?.id || "").trim();
    return name || "RSS";
  }
  function _renderAddCategoryDropdownHtml(card) {
    const c = card || {};
    const disabled = c?.already_added ? "disabled" : "";
    const placeholder = c?.already_added ? "\u2713" : "+";
    const options = _collectCategoryOptions2();
    const dropdownOptionsHtml = options.map((o) => {
      const kind = o?.isCustom ? "custom" : "default";
      const val = `${kind}:${String(o?.id || "").trim()}`;
      return `<option value="${escapeHtml(val)}" style="font-size:0.8rem;">${escapeHtml(String(o?.icon || "\u{1F4C1}"))} ${escapeHtml(String(o?.name || o?.id || ""))}</option>`;
    }).join("");
    return `
        <select class="tr-explore-add-btn" data-action="add-category" ${disabled} 
            style="width:28px;height:28px;padding:0;font-size:1rem;font-weight:normal;border-radius:50%;
            border:1px solid #e5e7eb;background:#f9fafb;color:#9ca3af;
            cursor:pointer;text-align:center;text-align-last:center;appearance:none;-webkit-appearance:none;" 
            title="${c?.already_added ? "\u5DF2\u52A0\u5165" : "\u52A0\u5165\u680F\u76EE"}">
            <option value="" selected hidden>${escapeHtml(placeholder)}</option>
            ${dropdownOptionsHtml}
        </select>`;
  }
  function _applyReadStateToExploreRoot(root) {
    try {
      if (!root) return;
      if (!TR.readState || typeof TR.readState.getReadNews !== "function") return;
      const reads = TR.readState.getReadNews() || {};
      const items = root.querySelectorAll(".news-item[data-news-id]");
      items.forEach((el) => {
        try {
          const id = String(el?.dataset?.newsId || "").trim();
          if (!id) return;
          if (!reads[id]) return;
          el.classList.add("read");
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  function _renderBatch(cards) {
    const grid = _getGridEl2();
    if (!grid) return;
    const html = (cards || []).map((c) => {
      const sid = String(c?.source_id || "").trim();
      const platformName = escapeHtml(c?.platform_name || "RSS");
      const addDropdownHtml = _renderAddCategoryDropdownHtml(c);
      const items = Array.isArray(c?.entries) ? c.entries : [];
      const listHtml = items.slice(0, ENTRIES_PER_SOURCE2).map((e, idx) => {
        const title = escapeHtml(e?.title || "");
        const link2 = escapeHtml(e?.link || "#");
        const newsId = escapeHtml(`rssx:${sid}:${e?.link || ""}`);
        const dateStr = formatNewsDate(e?.published || e?.ts || 0);
        const dateHtml = dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${escapeHtml(dateStr)}</span>` : "";
        return `
                <li class="news-item" data-news-id="${newsId}" data-news-title="${title}">
                    <div class="news-item-content">
                        <span class="news-index">${String(idx + 1)}</span>
                        <a class="news-title" href="${link2}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">${title}</a>
                        ${dateHtml}
                    </div>
                </li>`;
      }).join("");
      return `
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}">
                <div class="platform-header">
                    <div class="platform-name">${platformName}</div>
                    <div class="platform-header-actions">
                        ${addDropdownHtml}
                    </div>
                </div>
                <ul class="news-list">${listHtml}</ul>
            </div>`;
    }).join("");
    if (html) {
      grid.innerHTML = html;
      _applyReadStateToExploreRoot(grid);
      requestAnimationFrame(() => _attachScrollListener());
      return;
    }
    _renderGridMessage("\u6682\u65E0\u53EF\u9884\u89C8\u6E90", { retry: true });
  }
  function _renderCardElement(card, opts = {}) {
    const sid = String(card?.source_id || "").trim();
    const platformName = escapeHtml(card?.platform_name || "RSS");
    const addDropdownHtml = _renderAddCategoryDropdownHtml(card);
    const items = Array.isArray(card?.entries) ? card.entries : [];
    const listHtml = items.slice(0, ENTRIES_PER_SOURCE2).map((e, idx) => {
      const title = escapeHtml(e?.title || "");
      const link2 = escapeHtml(e?.link || "#");
      const newsId = escapeHtml(`rssx:${sid}:${e?.link || ""}`);
      const dateStr = formatNewsDate(e?.published || e?.ts || 0);
      const dateHtml = dateStr ? `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">${escapeHtml(dateStr)}</span>` : "";
      return `
            <li class="news-item" data-news-id="${newsId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${link2}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">${title}</a>
                    ${dateHtml}
                </div>
            </li>`;
    }).join("");
    const extraClass = opts.animateIn ? " tr-explore-flip-in" : "";
    const html = `
        <div class="platform-card${extraClass}" data-rss-source-id="${escapeHtml(sid)}">
            <div class="platform-header">
                <div class="platform-name">${platformName}</div>
                <div class="platform-header-actions">
                    ${addDropdownHtml}
                </div>
            </div>
            <ul class="news-list">${listHtml}</ul>
        </div>`;
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }
  async function _replaceCardInPlace(oldSid, cardEl) {
    if (_loading2) return;
    const idx = (Array.isArray(_currentBatch) ? _currentBatch : []).findIndex((x) => String(x?.source_id || "").trim() === String(oldSid || "").trim());
    if (idx < 0) return;
    const seen = _seenCache || _loadSeenSet2();
    _seenCache = seen;
    seen.add(String(oldSid || "").trim());
    _persistSeenSet2(seen);
    _loading2 = true;
    const nextPromise = _loadNextValidCard().catch(() => null);
    const nextCachedPromise = _tryFetchExploreCards(1).then((xs) => xs && xs[0] ? xs[0] : null).catch(() => null);
    try {
      try {
        const closeBtn = cardEl?.querySelector?.('button[data-action="close"]');
        if (closeBtn) closeBtn.setAttribute("disabled", "true");
      } catch (e) {
      }
      try {
        cardEl?.classList?.add("tr-explore-flip-out");
      } catch (e) {
      }
      await _waitAnimationEnd(cardEl, 260);
      let nextCard = await nextCachedPromise;
      if (!nextCard) {
        nextCard = await nextPromise;
      }
      if (!nextCard) {
        _currentBatch = (Array.isArray(_currentBatch) ? _currentBatch : []).filter((x) => String(x?.source_id || "").trim() !== String(oldSid || "").trim());
        _renderBatch(_currentBatch);
        await _fillToBatchSize();
        return;
      }
      if (Array.isArray(_currentBatch) && _currentBatch[idx] && String(_currentBatch[idx]?.source_id || "").trim() === String(oldSid || "").trim()) {
        _currentBatch[idx] = nextCard;
      }
      const newEl = _renderCardElement(nextCard, { animateIn: true });
      try {
        if (cardEl && cardEl.parentNode) {
          cardEl.parentNode.replaceChild(newEl, cardEl);
          _applyReadStateToExploreRoot(newEl);
        } else {
          _renderBatch(_currentBatch);
        }
      } catch (e) {
        _renderBatch(_currentBatch);
      }
    } finally {
      _loading2 = false;
      try {
        if (_cursor2 != null) {
          _persistCursor(_cursor2);
        }
      } catch (e) {
      }
    }
  }
  function _ensureInitialLoaded() {
    const pane = _getPaneEl();
    if (!pane || !pane.classList.contains("active")) return;
    if (_currentBatch.length > 0) {
      if (_isGridEmpty()) {
        _renderBatch(_currentBatch);
      }
      return;
    }
    _fillToBatchSize().catch((e) => {
      _setStatus2(String(e?.message || e), { variant: "error" });
    });
  }
  function _markReadFromTitleClickTarget(t) {
    try {
      if (!t || !(t instanceof Element)) return false;
      const titleEl = t.closest("a.news-title");
      if (!titleEl) return false;
      const item = titleEl.closest(".news-item");
      if (!item) return true;
      if (TR.readState && typeof TR.readState.markItemAsRead === "function") {
        TR.readState.markItemAsRead(item);
      } else {
        item.classList.add("read");
      }
      return true;
    } catch (e) {
      try {
        const item = t?.closest?.(".news-item");
        if (item) item.classList.add("read");
      } catch (_) {
      }
      return true;
    }
  }
  function _attachHandlers() {
    if (_delegatedHandlersAttached) return;
    _delegatedHandlersAttached = true;
    document.addEventListener("click", (e) => {
      const t = e?.target;
      if (!t || !(t instanceof Element)) return;
      const pane = _getPaneEl();
      if (!pane || !pane.classList.contains("active")) return;
      _markReadFromTitleClickTarget(t);
    }, true);
    document.addEventListener("click", (e) => {
      const t = e?.target;
      if (!t || !(t instanceof Element)) return;
      const pane = _getPaneEl();
      if (!pane || !pane.classList.contains("active")) return;
      const closeBtn = t.closest('button[data-action="close"]');
      if (closeBtn) {
        const cardEl = closeBtn.closest(".platform-card");
        const sid = String(cardEl?.getAttribute("data-rss-source-id") || "").trim();
        if (!sid) return;
        _replaceCardInPlace(sid, cardEl).catch((e2) => {
          _setStatus2(String(e2?.message || e2), { variant: "error" });
        });
        return;
      }
      const retryBtn = t.closest('button[data-action="retry"]');
      if (retryBtn) {
        if (_loading2) return;
        if (_cursor2 != null && _totalCache > 0 && _cursor2 >= _totalCache) {
          _cursor2 = 0;
          try {
            _persistCursor(_cursor2);
          } catch (e2) {
          }
        }
        _fillToBatchSize().catch((e2) => {
          _renderGridMessage(String(e2?.message || e2 || "\u52A0\u8F7D\u5931\u8D25"), { retry: true });
        });
        return;
      }
    });
    document.addEventListener("change", (e) => {
      const t = e?.target;
      if (!t || !(t instanceof Element)) return;
      const pane = _getPaneEl();
      if (!pane || !pane.classList.contains("active")) return;
      const selectEl = t.closest('select[data-action="add-category"]');
      if (!selectEl) return;
      if (!(selectEl instanceof HTMLSelectElement)) return;
      const cardEl = selectEl.closest(".platform-card");
      const sid = String(cardEl?.getAttribute("data-rss-source-id") || "").trim();
      if (!sid) return;
      const meta = (Array.isArray(_currentBatch) ? _currentBatch : []).find((x) => String(x?.source_id || "").trim() === sid);
      if (!meta) return;
      if (meta.already_added) return;
      const raw = String(selectEl.value || "").trim();
      if (!raw) return;
      const parts = raw.split(":");
      const kind = String(parts[0] || "").trim();
      const pickedId = String(parts[1] || "").trim();
      if (!pickedId) return;
      const options2 = _collectCategoryOptions2();
      const hit = options2.find((x) => String(x?.id || "").trim() === pickedId);
      const picked = hit ? hit : { id: pickedId, name: pickedId, icon: "\u{1F4C1}", isCustom: kind === "custom" };
      try {
        selectEl.setAttribute("disabled", "true");
      } catch (e2) {
      }
      _addMetaToCategory(meta, picked).then(() => {
        meta.already_added = true;
        try {
          const firstOpt = selectEl.querySelector('option[value=""]');
          if (firstOpt) firstOpt.textContent = "\u5DF2\u52A0\u5165";
          selectEl.value = "";
          selectEl.setAttribute("disabled", "true");
        } catch (_) {
        }
      }).catch(() => {
        try {
          selectEl.value = "";
        } catch (_) {
        }
      });
    });
  }
  function _wrapTabsSwitchIfAny() {
    try {
      if (!TR.tabs || typeof TR.tabs.switchTab !== "function") return;
      if (TR.tabs.__trExploreEmbeddedWrapped) return;
      const orig = TR.tabs.switchTab;
      TR.tabs.switchTab = function(categoryId) {
        const ret = orig.call(TR.tabs, categoryId);
        try {
          if (String(categoryId) === EXPLORE_TAB_ID) {
            window.requestAnimationFrame(() => {
              _ensureInitialLoaded();
            });
          }
        } catch (e) {
        }
        try {
          if (_pendingNonExploreRefresh && String(categoryId) !== EXPLORE_TAB_ID) {
            _pendingNonExploreRefresh = false;
            window.requestAnimationFrame(() => {
              TR.data?.refreshViewerData?.({ preserveScroll: true });
            });
          }
        } catch (e) {
        }
        return ret;
      };
      TR.tabs.__trExploreEmbeddedWrapped = true;
    } catch (e) {
    }
  }
  var _loadingMore = false;
  async function _loadMoreCards() {
    if (_loadingMore || _loading2) return;
    const pane = _getPaneEl();
    const grid = _getGridEl2();
    if (!pane || !grid) return;
    if (!pane.classList.contains("active")) return;
    _loadingMore = true;
    try {
      const loadingIndicator = document.createElement("div");
      loadingIndicator.className = "tr-explore-loading";
      loadingIndicator.style.cssText = "padding:20px;text-align:center;color:#6b7280;font-size:0.9rem;";
      loadingIndicator.textContent = "\u52A0\u8F7D\u4E2D...";
      grid.appendChild(loadingIndicator);
      const cached = await _tryFetchExploreCards(LOAD_MORE_SIZE);
      if (cached.length) {
        _currentBatch = [..._currentBatch, ...cached];
        _renderBatch(_currentBatch);
        loadingIndicator.remove();
        return;
      }
      const newCards = await _loadNextValidCards(LOAD_MORE_SIZE);
      if (newCards.length) {
        _currentBatch = [..._currentBatch, ...newCards];
        _renderBatch(_currentBatch);
      }
      loadingIndicator.remove();
      if (_cursor2 != null) {
        _persistCursor(_cursor2);
      }
    } catch (e) {
      console.error("Load more failed:", e);
    } finally {
      _loadingMore = false;
    }
  }
  function _attachScrollListener() {
    const grid = _getGridEl2();
    if (!grid) return;
    if (grid.dataset.trScrollAttached === "1") return;
    grid.dataset.trScrollAttached = "1";
    let scrollTimeout = null;
    const onScroll = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        const scrollLeft = grid.scrollLeft || 0;
        const scrollWidth = grid.scrollWidth || 0;
        const clientWidth = grid.clientWidth || 0;
        const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
        const scrollPercent = maxScrollLeft > 0 ? scrollLeft / maxScrollLeft : 0;
        console.log("[Explore] Scroll:", scrollPercent.toFixed(2), "maxScrollLeft:", maxScrollLeft);
        if (scrollPercent >= 0.7 && !_loadingMore && !_loading2) {
          console.log("[Explore] Triggering load more...");
          _loadMoreCards().catch(() => {
          });
        }
      }, 150);
    };
    grid.addEventListener("scroll", onScroll, { passive: true });
    console.log("[Explore] Scroll listener attached");
  }
  ready(function() {
    if (!ENABLE_OLD_EXPLORE) {
      return;
    }
    _attachHandlers();
    _wrapTabsSwitchIfAny();
    _attachScrollListener();
    try {
      if (TR.tabs?.getActiveTabId && String(TR.tabs.getActiveTabId()) === EXPLORE_TAB_ID) {
        _ensureInitialLoaded();
      }
    } catch (e) {
    }
  });

  // hotnews/web/static/js/src/explore-timeline.js
  var EXPLORE_TAB_ID2 = "explore";
  var TAB_SWITCHED_EVENT2 = "tr_tab_switched";
  var INITIAL_CARDS = 1;
  function getItemsPerCard() {
    return window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.items_per_card || 50;
  }
  var _exploreInFlight = false;
  var _exploreOffset = 0;
  var _exploreObserver = null;
  var _exploreFinished = false;
  function _getActiveTabId() {
    try {
      return document.querySelector(".category-tabs .category-tab.active")?.dataset?.category || null;
    } catch (e) {
      return null;
    }
  }
  function _fmtTime(tsSec) {
    const ts = Number(tsSec || 0) || 0;
    if (!ts) return "";
    try {
      const d = new Date(ts * 1e3);
      const YYYY = String(d.getFullYear());
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const DD = String(d.getDate()).padStart(2, "0");
      return `${YYYY}-${MM}-${DD}`;
    } catch (e) {
      return "";
    }
  }
  function _buildNewsItemsHtml(items, opts = {}) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      const emptyText = escapeHtml(opts.emptyText || "\u6682\u65E0\u5185\u5BB9");
      return `<li class="tr-explore-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
      const stableId = escapeHtml(n?.stable_id || "");
      const title = escapeHtml(n?.display_title || n?.title || "");
      const url = escapeHtml(n?.url || "#");
      const t = _fmtTime(n?.published_at || n?.created_at);
      const timeHtml = t ? `<span class="tr-explore-time" style="margin-left:8px;color:#9ca3af;font-size:12px;">${escapeHtml(t)}</span>` : "";
      return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${timeHtml}
                </div>
            </li>`;
    }).join("");
  }
  function _getPane() {
    return document.getElementById(`tab-${EXPLORE_TAB_ID2}`);
  }
  function _getGrid() {
    const pane = _getPane();
    return pane ? pane.querySelector(".platform-grid") : null;
  }
  function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;
    let grid = pane.querySelector(".platform-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "platform-grid";
      grid.style.display = "flex";
      grid.style.flexDirection = "row";
      grid.style.overflowX = "auto";
      grid.style.overflowY = "hidden";
      grid.style.alignItems = "flex-start";
      grid.style.overscrollBehavior = "contain";
      pane.appendChild(grid);
    } else {
      grid.style.overscrollBehavior = "contain";
    }
    try {
      if (grid.dataset) grid.dataset.exploreInjected = "1";
    } catch (e) {
    }
    return true;
  }
  async function _fetchJson(url) {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  }
  async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/explore/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
  }
  function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;
    const card = document.createElement("div");
    card.className = "platform-card tr-explore-card";
    card.style.minWidth = "360px";
    card.dataset.platform = `explore-slice-${cardIndex}`;
    card.draggable = false;
    const limit = getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;
    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                \u{1F4F0} \u6700\u65B0 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-explore-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml(items, { emptyText: "\u6682\u65E0\u5185\u5BB9" })}
        </ul>
    `;
    const indices = card.querySelectorAll(".news-index");
    indices.forEach((el, i) => {
      el.textContent = String(displayStart + i);
    });
    const sentinel = container.querySelector("#explore-load-sentinel");
    if (sentinel) {
      container.insertBefore(card, sentinel);
    } else {
      container.appendChild(card);
    }
  }
  function _createSentinel(container) {
    const existing = container.querySelector("#explore-load-sentinel");
    if (existing) existing.remove();
    const sentinel = document.createElement("div");
    sentinel.id = "explore-load-sentinel";
    sentinel.style.minWidth = "20px";
    sentinel.style.height = "100%";
    sentinel.style.flexShrink = "0";
    sentinel.innerHTML = '<div style="width:20px;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">\u23F3</div>';
    container.appendChild(sentinel);
    return sentinel;
  }
  function _attachObserver() {
    if (_exploreObserver) {
      _exploreObserver.disconnect();
      _exploreObserver = null;
    }
    const pane = _getPane();
    if (!pane) return;
    _exploreObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          _loadNextBatch().catch(() => {
          });
        }
      }
    }, {
      root: pane.querySelector(".platform-grid"),
      rootMargin: "200px",
      threshold: 0.01
    });
    const sentinel = pane.querySelector("#explore-load-sentinel");
    if (sentinel) {
      _exploreObserver.observe(sentinel);
    }
  }
  async function _loadNextBatch() {
    if (_exploreInFlight || _exploreFinished) return;
    _exploreInFlight = true;
    try {
      const limit = getItemsPerCard();
      const items = await _fetchTimelineBatch(limit, _exploreOffset);
      if (!items.length) {
        _exploreFinished = true;
        const s = document.getElementById("explore-load-sentinel");
        if (s) {
          s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">\u5DF2\u663E\u793A\u5168\u90E8\u5185\u5BB9</div>';
          s.style.width = "40px";
        }
        return;
      }
      const grid = _getGrid();
      if (grid) {
        const cardIndex = Math.floor(_exploreOffset / getItemsPerCard());
        _appendCard(items, cardIndex, grid);
      }
      _exploreOffset += items.length;
      if (items.length < limit) {
        _exploreFinished = true;
        const s = document.getElementById("explore-load-sentinel");
        if (s) s.remove();
      }
    } catch (e) {
      console.error("Explore load error:", e);
    } finally {
      _exploreInFlight = false;
    }
  }
  async function _loadTimeline() {
    const grid = _getGrid();
    if (!grid) return;
    _exploreOffset = 0;
    _exploreFinished = false;
    grid.innerHTML = "";
    _createSentinel(grid);
    const limit = getItemsPerCard();
    const initialLimit = limit * INITIAL_CARDS;
    const items = await _fetchTimelineBatch(initialLimit, 0);
    if (!items.length) {
      grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">\u6682\u65E0\u5185\u5BB9</div>';
      return;
    }
    for (let i = 0; i < items.length; i += limit) {
      const chunk = items.slice(i, i + limit);
      const cardIndex = Math.floor(i / limit);
      _appendCard(chunk, cardIndex, grid);
    }
    _exploreOffset = items.length;
    if (items.length < initialLimit) {
      _exploreFinished = true;
      const s = document.getElementById("explore-load-sentinel");
      if (s) s.remove();
    } else {
      _attachObserver();
    }
  }
  async function _refreshTimelineIfNeeded() {
    if (_getActiveTabId() !== EXPLORE_TAB_ID2) return false;
    if (!_ensureLayout()) return false;
    _exploreInFlight = true;
    try {
      await _loadTimeline();
      return true;
    } catch (e) {
      console.error("Explore refresh error:", e);
      return false;
    } finally {
      _exploreInFlight = false;
    }
  }
  async function _initialLoad() {
    if (!_ensureLayout()) return;
    await _refreshTimelineIfNeeded();
  }
  function _ensurePolling() {
    try {
      window.addEventListener(TAB_SWITCHED_EVENT2, (ev) => {
        const cid2 = String(ev?.detail?.categoryId || "").trim();
        if (cid2 !== EXPLORE_TAB_ID2) return;
        if (!_exploreFinished) _attachObserver();
        _refreshTimelineIfNeeded().catch(() => {
        });
      });
    } catch (e) {
    }
  }
  function _patchRenderHook() {
    if (TR.exploreTimeline && TR.exploreTimeline._patched === true) return;
    const orig = TR.data?.renderViewerFromData;
    if (typeof orig !== "function") return;
    TR.data.renderViewerFromData = function patchedRenderViewerFromData(data2, state) {
      orig.call(TR.data, data2, state);
      try {
        _initialLoad().catch(() => {
        });
      } catch (e) {
      }
    };
    TR.exploreTimeline = {
      ...TR.exploreTimeline || {},
      _patched: true
    };
  }
  ready(function() {
    _patchRenderHook();
    _initialLoad().catch(() => {
    });
    _ensurePolling();
  });

  // hotnews/web/static/js/src/rss-category-carousel.js
  var ENTRIES_PER_SOURCE3 = 15;
  var CATEGORY_ID = "rsscol-rss";
  var PREFETCH_AHEAD2 = 3;
  var CURSOR_STORAGE_KEY = "hotnews_rss_carousel_cursor_v1";
  var _open2 = false;
  var _loading3 = false;
  var _sources2 = [];
  var _total2 = 0;
  var _offset2 = 0;
  var _sourcesExhausted2 = false;
  var _cursor3 = -1;
  var _currentCard2 = null;
  var _previewCache3 = /* @__PURE__ */ new Map();
  var _pendingTargetIndex2 = null;
  var _inFlightIndex2 = null;
  var _entryPage2 = 0;
  var _pickerOpen2 = false;
  var _touchActive2 = false;
  var _touchStartX2 = 0;
  var _touchStartY2 = 0;
  var _touchMode2 = null;
  function _getSessionStorage() {
    try {
      return window.sessionStorage;
    } catch (e) {
      return null;
    }
  }
  function _loadSavedCursor() {
    try {
      const ss = _getSessionStorage();
      if (!ss) return null;
      const raw = ss.getItem(CURSOR_STORAGE_KEY);
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    } catch (e) {
      return null;
    }
  }
  function _persistCursor2(idx) {
    try {
      const ss = _getSessionStorage();
      if (!ss) return;
      const n = Number(idx);
      if (!Number.isFinite(n) || n < 0) {
        ss.removeItem(CURSOR_STORAGE_KEY);
        return;
      }
      ss.setItem(CURSOR_STORAGE_KEY, String(Math.floor(n)));
    } catch (e) {
    }
  }
  function _isMobile2() {
    try {
      return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    } catch (e) {
      return false;
    }
  }
  function _onTouchStart2(e) {
    if (!_isCarouselActive()) return;
    if (!_isMobile2()) return;
    if (document.querySelector(".settings-modal-overlay.show")) return;
    if (_pickerOpen2) return;
    const t = e?.target;
    if (!t || !(t instanceof Element)) return;
    if (t.closest("a,button,input,textarea,select")) return;
    if (!t.closest(".rss-carousel-frame")) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    _touchActive2 = true;
    _touchMode2 = null;
    _touchStartX2 = Number(touches[0]?.clientX || 0);
    _touchStartY2 = Number(touches[0]?.clientY || 0);
  }
  function _onTouchMove2(e) {
    if (!_touchActive2) return;
    if (!_isCarouselActive()) return;
    const touches = e?.touches;
    if (!touches || touches.length !== 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX2;
    const dy = y - _touchStartY2;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (!_touchMode2) {
      if (adx < 10 && ady < 10) return;
      _touchMode2 = adx >= ady ? "x" : "y";
    }
    try {
      e.preventDefault();
    } catch (e2) {
    }
  }
  function _onTouchEnd2(e) {
    if (!_touchActive2) return;
    _touchActive2 = false;
    if (!_isCarouselActive()) return;
    if (!_isMobile2()) return;
    const touches = e?.changedTouches;
    if (!touches || touches.length < 1) return;
    const x = Number(touches[0]?.clientX || 0);
    const y = Number(touches[0]?.clientY || 0);
    const dx = x - _touchStartX2;
    const dy = y - _touchStartY2;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const THRESH = 44;
    if ((_touchMode2 === "x" || _touchMode2 == null) && adx >= THRESH && adx > ady) {
      if (dx < 0) next2();
      else prev2();
      return;
    }
    if ((_touchMode2 === "y" || _touchMode2 == null) && ady >= THRESH && ady > adx) {
      if (dy < 0) _pageEntries2(-1);
      else _pageEntries2(1);
    }
  }
  function _getActiveTabId2() {
    try {
      return TR.tabs?.getActiveTabId ? TR.tabs.getActiveTabId() : null;
    } catch (e) {
      return null;
    }
  }
  function _prefetchAround2(index) {
    if (!_isCarouselActive()) return;
    const runner = async () => {
      if (_loading3) return;
      if (_pendingTargetIndex2 != null) return;
      const targets = [];
      for (let i = 1; i <= PREFETCH_AHEAD2; i += 1) {
        targets.push(index + i);
      }
      const maxWanted = Math.max(...targets);
      if (Number.isFinite(maxWanted) && maxWanted >= 0) {
        await _ensureSourcesAt2(maxWanted);
      }
      for (const t of targets) {
        try {
          if (t < 0) continue;
          await _ensureSourcesAt2(t);
          const src = _sources2[t];
          if (!src) continue;
          await _buildCardForSource2(src);
        } catch (e) {
        }
      }
    };
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner().catch(() => {
        }), { timeout: 1200 });
        return;
      }
    } catch (e) {
    }
    setTimeout(() => runner().catch(() => {
    }), 0);
  }
  function _getPickerEl() {
    return document.getElementById("rssCategoryPickerModal");
  }
  function _ensurePickerModal() {
    if (_getPickerEl()) return;
    const overlay = document.createElement("div");
    overlay.id = "rssCategoryPickerModal";
    overlay.className = "settings-modal-overlay";
    overlay.style.zIndex = "9999";
    overlay.addEventListener("click", (e) => {
      if (e && e.target === overlay) {
        _closePicker();
      }
    });
    overlay.innerHTML = `
        <div class="settings-modal" onclick="event.stopPropagation()" style="max-width:520px;">
            <div class="settings-modal-header">
                <span class="settings-modal-title">\u52A0\u5165\u680F\u76EE</span>
                <button class="settings-modal-close" type="button" data-action="close">&times;</button>
            </div>
            <div class="settings-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                <div style="color:#6b7280;font-size:0.9rem;">\u9009\u62E9\u8981\u52A0\u5165\u7684\u680F\u76EE</div>
                <div id="rssCategoryPickerList" style="display:flex;flex-direction:column;gap:8px;"></div>
            </div>
        </div>`;
    const closeBtn = overlay.querySelector('button[data-action="close"]');
    if (closeBtn) closeBtn.addEventListener("click", () => _closePicker());
    try {
      document.body.appendChild(overlay);
    } catch (e) {
    }
  }
  function _closePicker() {
    const el = _getPickerEl();
    if (!el) return;
    _pickerOpen2 = false;
    el.classList.remove("show");
  }
  function _collectCategoryOptions3() {
    const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
    const defaults = TR.settings?.getDefaultCategories ? TR.settings.getDefaultCategories() : null;
    const order = Array.isArray(merged?.categoryOrder) ? merged.categoryOrder : [];
    const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];
    const options = [];
    const seen = /* @__PURE__ */ new Set();
    for (const catId of order) {
      const id = String(catId || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const customCat = custom.find((c) => String(c?.id || "") === id);
      if (customCat) {
        const name2 = String(customCat?.name || id).trim() || id;
        options.push({ id, name: name2, icon: "\u{1F4F1}", isCustom: true });
        continue;
      }
      const def = defaults && defaults[id] ? defaults[id] : null;
      if (!def) continue;
      const name = String(def?.name || id).trim() || id;
      const icon = String(def?.icon || "\u{1F4C1}");
      options.push({ id, name, icon, isCustom: false });
    }
    for (const c of custom) {
      const id = String(c?.id || "").trim();
      if (!id || seen.has(id)) continue;
      if (id === "explore") continue;
      if (id.startsWith("rsscol-")) continue;
      seen.add(id);
      const name = String(c?.name || id).trim() || id;
      options.push({ id, name, icon: "\u{1F4F1}", isCustom: true });
    }
    return options;
  }
  function _openPicker() {
    _ensurePickerModal();
    const el = _getPickerEl();
    if (!el) return;
    const listEl = el.querySelector("#rssCategoryPickerList");
    if (listEl) {
      const options = _collectCategoryOptions3();
      listEl.innerHTML = options.map((o) => {
        return `
                <button type="button" class="platform-select-action-btn" data-cat-id="${escapeHtml(o.id)}" style="text-align:left;">
                    ${escapeHtml(o.icon)} ${escapeHtml(o.name)}
                </button>`;
      }).join("");
      listEl.querySelectorAll("button[data-cat-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const catId = String(btn.getAttribute("data-cat-id") || "").trim();
          const options2 = _collectCategoryOptions3();
          const hit = options2.find((x) => x.id === catId);
          const picked = hit ? hit : { id: catId, name: catId, icon: "\u{1F4C1}", isCustom: false };
          _closePicker();
          await _addCurrentToCategory2(picked);
        });
      });
    }
    _pickerOpen2 = true;
    el.classList.add("show");
    try {
      const modal = el.querySelector(".settings-modal");
      if (modal) {
        modal.setAttribute("tabindex", "0");
        modal.focus();
      }
    } catch (e) {
    }
  }
  async function _addCurrentToCategory2(pickedCategory) {
    if (!_currentCard2 || !_currentCard2.source_id) return;
    const pickedId = String(pickedCategory?.id || "").trim();
    const pickedName = String(pickedCategory?.name || pickedId).trim() || pickedId || "RSS";
    const isCustom = !!pickedCategory?.isCustom;
    const sid = String(_currentCard2.source_id || "").trim();
    const platformId = sid ? `rss-${sid}` : "";
    let col = "RSS";
    if (pickedId && pickedId !== "rsscol-rss" && !isCustom) {
      col = pickedId;
    }
    try {
      TR.subscription?.ensureSnapshot?.();
    } catch (e) {
    }
    try {
      TR.subscription?.stageFromCatalogPreview?.({
        source_id: _currentCard2.source_id,
        url: _currentCard2.url,
        feed_title: _currentCard2.feed_title || _currentCard2.platform_name,
        column: col,
        entries_count: _currentCard2.entries_count || 0
      });
    } catch (e) {
      _setStatus3(String(e?.message || e), { variant: "error" });
      return;
    }
    if (isCustom && pickedId && platformId) {
      try {
        TR.settings?.addPlatformToCustomCategory?.(pickedId, platformId);
      } catch (e) {
      }
    }
    _currentCard2.already_added = true;
    try {
      _renderCard2(_currentCard2);
    } catch (e) {
    }
    try {
      TR.toast?.show?.(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "loading", durationMs: 1200 });
    } catch (e) {
    }
    try {
      if (TR.subscription?.saveOnly) {
        await TR.subscription.saveOnly();
      } else if (TR.subscription?.saveAndRefresh) {
        await TR.subscription.saveAndRefresh();
      } else {
        await window.saveRssSubscriptions?.();
      }
    } catch (e) {
      _setStatus3(String(e?.message || e), { variant: "error" });
      try {
        TR.toast?.show?.(`\u52A0\u5165\u5931\u8D25\uFF1A${String(e?.message || e)}`, { variant: "error", durationMs: 2500 });
      } catch (_) {
      }
      return;
    }
    try {
      _warmupSourceIds3([_currentCard2.source_id], "high").catch(() => {
      });
    } catch (e) {
    }
    try {
      TR.toast?.show?.(`\u5DF2\u52A0\u5165\u680F\u76EE\uFF1A${pickedName}`, { variant: "success", durationMs: 1500 });
    } catch (e) {
    }
  }
  function _isCarouselActive() {
    return _open2 && _getActiveTabId2() === CATEGORY_ID;
  }
  function _getGridEl3() {
    return document.getElementById("rssCategoryCarouselGrid");
  }
  function _getStatusEl3() {
    return document.getElementById("rssCategoryCarouselStatus");
  }
  function _setStatus3(msg, opts = {}) {
    const el = _getStatusEl3();
    if (!el) return;
    const variant = String(opts.variant || "").toLowerCase();
    const color = variant === "error" ? "#dc2626" : variant === "success" ? "#16a34a" : "#6b7280";
    el.style.color = color;
    el.textContent = msg == null ? "" : String(msg);
  }
  function _formatTs2(ts) {
    const n = Number(ts || 0) || 0;
    if (!n) return "";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x) => String(x).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }
  function _pickEntryTs2(e) {
    const cand = [
      e?.published,
      e?.published_at,
      e?.pubDate,
      e?.updated,
      e?.updated_at,
      e?.date,
      e?.datetime,
      e?.date_published,
      e?.date_modified
    ];
    const now = Date.now();
    const maxFuture = now + 365 * 24 * 60 * 60 * 1e3;
    const normalizeEpoch = (n) => {
      const num = Number(n);
      if (!Number.isFinite(num) || num <= 0) return 0;
      if (num < 1e11) return Math.floor(num * 1e3);
      return Math.floor(num);
    };
    for (const v of cand) {
      if (v == null) continue;
      if (typeof v === "number") {
        const t0 = normalizeEpoch(v);
        if (t0 > 0 && t0 <= maxFuture) return t0;
        continue;
      }
      const s = String(v).trim();
      if (!s) continue;
      if (/^\d{10,13}$/.test(s)) {
        const t0 = normalizeEpoch(s);
        if (t0 > 0 && t0 <= maxFuture) return t0;
        continue;
      }
      const t = Date.parse(s);
      if (!Number.isNaN(t) && t > 0) return t;
    }
    return 0;
  }
  async function _warmupSourceIds3(sourceIds, priority = "normal") {
    const ids = Array.isArray(sourceIds) ? sourceIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
    if (!ids.length) return;
    try {
      await fetch("/api/rss-sources/warmup?wait_ms=0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_ids: ids, priority })
      });
    } catch (e) {
    }
  }
  async function _fetchSourcesPage3(limit, offset) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    const resp = await fetch(`/api/rss-sources/search?${qs.toString()}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || "Failed to load RSS sources");
    const items = Array.isArray(payload?.sources) ? payload.sources : [];
    const total = Number(payload?.total || 0) || 0;
    const nextOffset = Number(payload?.next_offset ?? offset + items.length) || offset + items.length;
    return { items, total, nextOffset };
  }
  async function _ensureSourcesAt2(index) {
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (_sourcesExhausted2) return;
    let safety = 0;
    while (_sources2.length <= idx && !_sourcesExhausted2 && safety < 50) {
      safety += 1;
      const page = await _fetchSourcesPage3(50, _offset2);
      _total2 = page.total;
      _offset2 = page.nextOffset;
      for (const src of page.items) {
        const sid = String(src?.id || "").trim();
        if (!sid) continue;
        _sources2.push(src);
      }
      if (!page.items.length || _offset2 >= _total2) {
        _sourcesExhausted2 = true;
      }
    }
  }
  async function _ensureAllSourcesLoaded2() {
    if (_sourcesExhausted2) return;
    let safety = 0;
    while (!_sourcesExhausted2 && safety < 200) {
      safety += 1;
      await _ensureSourcesAt2(_sources2.length);
      if (_sourcesExhausted2) break;
    }
  }
  function _safeNameFromSource3(src) {
    const name = String(src?.name || src?.host || src?.id || "").trim();
    return name || "RSS";
  }
  function _extractEntries3(payload) {
    const data2 = payload?.data || {};
    const feedTitle = String(data2?.feed?.title || "").trim();
    const entries = Array.isArray(data2?.entries) ? data2.entries : [];
    const normalized = entries.map((e) => {
      const title = String(e?.title || "").trim();
      const link2 = String(e?.link || "").trim();
      const ts = _pickEntryTs2(e);
      return { title: title || link2, link: link2, ts };
    }).filter((x) => !!x.link);
    return { feedTitle, entries: normalized };
  }
  function _computeAlreadyAddedSet3() {
    const subs = TR.subscription?.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    const set = /* @__PURE__ */ new Set();
    for (const s of Array.isArray(subs) ? subs : []) {
      const sid = String(s?.source_id || s?.rss_source_id || "").trim();
      if (sid) set.add(sid);
    }
    return set;
  }
  async function _buildCardForSource2(src) {
    const sid = String(src?.id || "").trim();
    if (!sid) return null;
    if (_previewCache3.has(sid)) return _previewCache3.get(sid);
    const url = String(src?.url || "").trim();
    const name = _safeNameFromSource3(src);
    const alreadyAdded = _computeAlreadyAddedSet3();
    let entries = [];
    let feedTitle = "";
    let payload = null;
    try {
      const resp = await fetch(`/api/rss-sources/preview?source_id=${encodeURIComponent(sid)}`);
      payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.detail || "Preview failed");
      const parsed = _extractEntries3(payload);
      feedTitle = parsed.feedTitle;
      entries = parsed.entries;
    } catch (e) {
      const bad = { source_id: sid, error: String(e?.message || e) };
      _previewCache3.set(sid, bad);
      return bad;
    }
    if (!Array.isArray(entries) || entries.length <= 0) {
      const bad = { source_id: sid, error: "No entries" };
      _previewCache3.set(sid, bad);
      return bad;
    }
    let ts = 0;
    for (const e of entries) {
      const t = Number(e?.ts || 0) || 0;
      if (t > ts) ts = t;
    }
    if (!ts && payload) {
      const fb = _pickEntryTs2({
        published: payload?.last_modified || payload?.data?.feed?.updated || payload?.data?.feed?.published || payload?.data?.feed?.lastBuildDate
      });
      if (fb > ts) ts = fb;
    }
    const dateStr = _formatTs2(ts);
    const platformName = feedTitle || name;
    const card = {
      source_id: sid,
      url,
      feed_title: feedTitle || name,
      platform_name: platformName,
      entries,
      entries_count: entries.length,
      date_str: dateStr,
      error: "",
      already_added: alreadyAdded.has(sid)
    };
    _previewCache3.set(sid, card);
    return card;
  }
  function _renderCard2(card) {
    const grid = _getGridEl3();
    if (!grid) return;
    const c = card;
    const sid = String(c?.source_id || "").trim();
    const platformName = escapeHtml(c?.platform_name || "RSS");
    const btnLabel = c?.already_added ? "\u5DF2\u52A0\u5165" : "\u52A0\u5165\u680F\u76EE";
    const btnDisabled = c?.already_added ? "disabled" : "";
    const items = Array.isArray(c?.entries) ? c.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE3) - 1);
    if (_entryPage2 > maxPage) _entryPage2 = maxPage;
    if (_entryPage2 < 0) _entryPage2 = 0;
    const start = _entryPage2 * ENTRIES_PER_SOURCE3;
    const pageItems = items.slice(start, start + ENTRIES_PER_SOURCE3);
    const listHtml = pageItems.map((e, idx) => {
      const title = escapeHtml(e?.title || "");
      const link2 = escapeHtml(e?.link || "#");
      const itemDate = escapeHtml(_formatTs2(e?.ts || 0));
      return `
            <li class="news-item" data-news-id="" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(start + idx + 1)}</span>
                    <a class="news-title tr-news-title-lg tr-title-hover-accent tr-hover-glass tr-title-hover-wave" href="${link2}" target="_blank" rel="noopener noreferrer">${title}</a>
                    <span class="rss-entry-date" style="flex:0 0 auto;margin-left:8px;color:#6b7280;font-size:0.75rem;white-space:nowrap;${itemDate ? "" : "display:none;"}">${itemDate}</span>
                </div>
            </li>`;
    }).join("");
    const placeholderCount = Math.max(0, ENTRIES_PER_SOURCE3 - pageItems.length);
    const placeholderHtml = placeholderCount ? Array.from({ length: placeholderCount }).map((_, i) => {
      const n = start + pageItems.length + i + 1;
      return `
            <li class="news-item rss-entry-placeholder" data-news-id="">
                <div class="news-item-content">
                    <span class="news-index">${String(n)}</span>
                    <span class="news-title tr-news-title-lg tr-hover-glass">&nbsp;</span>
                    <span class="rss-entry-date" style="display:none;">&nbsp;</span>
                </div>
            </li>`;
    }).join("") : "";
    grid.innerHTML = `
        <div class="rss-carousel-frame" style="margin:0 auto;max-width:980px;width:min(980px,100%);box-sizing:border-box;position:relative;padding:52px 56px;">
            <div class="rss-carousel-nav-hints" style="position:absolute;inset:0;pointer-events:none;">
                <div class="rss-nav-hint rss-nav-left" aria-hidden="true" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u2039</div>
                <div class="rss-nav-hint rss-nav-right" aria-hidden="true" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u203A</div>
                <div class="rss-nav-hint rss-nav-up" aria-hidden="true" style="position:absolute;left:50%;top:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u02C4</div>
                <div class="rss-nav-hint rss-nav-down" aria-hidden="true" style="position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:40px;height:40px;border-radius:999px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.65);backdrop-filter:blur(6px);color:#374151;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,0.08);opacity:0.45;display:flex;align-items:center;justify-content:center;">\u02C5</div>
            </div>
            <div class="platform-card" data-rss-source-id="${escapeHtml(sid)}" style="margin:0 auto;max-width:980px;width:100%;box-sizing:border-box;">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;flex:1;min-width:0;white-space:nowrap;overflow:hidden;">
                        <div class="rss-preview-title-row" style="display:flex;align-items:baseline;gap:12px;min-width:0;">
                            <span class="rss-preview-title-text tr-title-compact tr-title-ellipsis tr-title-hover-accent" style="flex:1;min-width:0;">\u{1F4F1} ${platformName}</span>
                        </div>
                    </div>
                    <div class="platform-header-actions">
                        <button type="button" class="platform-select-action-btn" data-action="add" ${btnDisabled}>${btnLabel}</button>
                    </div>
                </div>
                <ul class="news-list">${listHtml}${placeholderHtml}</ul>
            </div>
        </div>`;
    try {
      window.requestAnimationFrame(() => {
        const titles = grid.querySelectorAll(".news-title");
        titles.forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (el.closest(".rss-entry-placeholder")) return;
          el.classList.remove("tr-title-overflow-shrink");
          if (el.scrollWidth > el.clientWidth + 1) {
            el.classList.add("tr-title-overflow-shrink");
          }
        });
      });
    } catch (e) {
    }
    const btn = grid.querySelector('button[data-action="add"]');
    if (btn) {
      btn.addEventListener("click", () => {
        if (!_currentCard2) return;
        if (_pickerOpen2) return;
        if (_currentCard2.already_added) return;
        _setStatus3("", { variant: "info" });
        _openPicker();
      });
    }
  }
  async function _showAt2(index, dir = 1) {
    if (_loading3) return;
    _loading3 = true;
    _inFlightIndex2 = Number(index);
    try {
      await _ensureSourcesAt2(index);
      if (_sources2.length <= 0) {
        const grid2 = _getGridEl3();
        if (grid2) grid2.innerHTML = '<div style="color:#6b7280;">\u6682\u65E0\u53EF\u9884\u89C8\u6E90</div>';
        _setStatus3("", { variant: "info" });
        return;
      }
      let idx = index;
      const step = dir >= 0 ? 1 : -1;
      let safety = 0;
      while (safety < 200) {
        safety += 1;
        if (idx < 0) {
          await _ensureAllSourcesLoaded2();
          idx = _sources2.length - 1;
        }
        await _ensureSourcesAt2(idx);
        if (idx >= _sources2.length) {
          idx = 0;
        }
        const src = _sources2[idx];
        if (!src) {
          idx += step;
          continue;
        }
        const card = await _buildCardForSource2(src);
        if (!card || card.error) {
          idx += step;
          continue;
        }
        _cursor3 = idx;
        _persistCursor2(_cursor3);
        _currentCard2 = card;
        _entryPage2 = 0;
        _renderCard2(card);
        _setStatus3("", { variant: "info" });
        try {
          _warmupSourceIds3([card.source_id], "normal").catch(() => {
          });
        } catch (e) {
        }
        try {
          _prefetchAround2(idx);
        } catch (e) {
        }
        return;
      }
      const grid = _getGridEl3();
      if (grid) grid.innerHTML = '<div style="color:#6b7280;">\u6682\u65E0\u53EF\u9884\u89C8\u6E90</div>';
      _setStatus3("", { variant: "info" });
    } catch (e) {
      _setStatus3(String(e?.message || e), { variant: "error" });
    } finally {
      _loading3 = false;
      _inFlightIndex2 = null;
      if (_isCarouselActive() && _pendingTargetIndex2 != null) {
        const target = Number(_pendingTargetIndex2);
        _pendingTargetIndex2 = null;
        const base = Number.isFinite(_cursor3) ? _cursor3 : 0;
        const dir2 = target >= base ? 1 : -1;
        _showAt2(target, dir2).catch((e) => _setStatus3(String(e?.message || e), { variant: "error" }));
      }
    }
  }
  function next2() {
    if (!_isCarouselActive()) return;
    if (_loading3) {
      const base = _pendingTargetIndex2 != null ? Number(_pendingTargetIndex2) : _inFlightIndex2 != null ? Number(_inFlightIndex2) : _cursor3;
      _pendingTargetIndex2 = base + 1;
      return;
    }
    const nextIdx = _cursor3 + 1;
    _showAt2(nextIdx, 1).catch((e) => _setStatus3(String(e?.message || e), { variant: "error" }));
  }
  function prev2() {
    if (!_isCarouselActive()) return;
    if (_loading3) {
      const base = _pendingTargetIndex2 != null ? Number(_pendingTargetIndex2) : _inFlightIndex2 != null ? Number(_inFlightIndex2) : _cursor3;
      _pendingTargetIndex2 = base - 1;
      return;
    }
    const prevIdx = _cursor3 - 1;
    _showAt2(prevIdx, -1).catch((e) => _setStatus3(String(e?.message || e), { variant: "error" }));
  }
  function _resetState() {
    _loading3 = false;
    _pendingTargetIndex2 = null;
    _inFlightIndex2 = null;
    _sources2 = [];
    _total2 = 0;
    _offset2 = 0;
    _sourcesExhausted2 = false;
    _cursor3 = -1;
    _currentCard2 = null;
    _previewCache3 = /* @__PURE__ */ new Map();
    _entryPage2 = 0;
  }
  function _pageEntries2(delta) {
    if (!_isCarouselActive()) return;
    if (!_currentCard2) return;
    const items = Array.isArray(_currentCard2?.entries) ? _currentCard2.entries : [];
    const maxPage = Math.max(0, Math.ceil(items.length / ENTRIES_PER_SOURCE3) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, _entryPage2 + delta));
    if (nextPage === _entryPage2) return;
    _entryPage2 = nextPage;
    _renderCard2(_currentCard2);
  }
  function open2() {
    _open2 = true;
    try {
      TR.subscription?.ensureSnapshot?.();
    } catch (e) {
    }
    _resetState();
    const saved = _loadSavedCursor();
    const startIdx = saved != null ? saved : 0;
    _showAt2(startIdx, 1).catch((e) => _setStatus3(String(e?.message || e), { variant: "error" }));
  }
  function close2() {
    _open2 = false;
  }
  window.rssCategoryCarouselNext = () => next2();
  window.rssCategoryCarouselPrev = () => prev2();
  window.rssCategoryCarouselAddToCategory = () => {
    if (!_isCarouselActive()) return;
    if (!_currentCard2) return;
    if (_currentCard2.already_added) return;
    _openPicker();
  };
  TR.rssCategoryCarousel = {
    open: open2,
    close: close2,
    next: next2,
    prev: prev2
  };
  ready(function() {
    try {
      const orig = TR.tabs?.switchTab;
      if (typeof orig === "function") {
        TR.tabs.switchTab = function(categoryId) {
          orig.call(TR.tabs, categoryId);
          try {
            if (String(categoryId) === CATEGORY_ID) {
              open2();
            } else {
              close2();
            }
          } catch (e) {
          }
        };
      }
    } catch (e) {
    }
    document.addEventListener("keydown", (e) => {
      if (!_isCarouselActive()) return;
      if (document.querySelector(".settings-modal-overlay.show")) return;
      const t = e?.target;
      if (t && t instanceof Element) {
        if (t.closest("input,textarea,select")) return;
      }
      if (e.key === " " || e.key === "Spacebar" || e.code === "Space") {
        e.preventDefault();
        next2();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        _pageEntries2(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        _pageEntries2(1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next2();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev2();
        return;
      }
    });
    document.addEventListener("click", (e) => {
      if (!_isCarouselActive()) return;
      if (document.querySelector(".settings-modal-overlay.show")) return;
      const t = e?.target;
      if (!t || !(t instanceof Element)) return;
      if (t.closest("a,button,input,textarea,select")) return;
      const pane = document.getElementById(`tab-${CATEGORY_ID}`);
      if (!pane) return;
      const x = Number(e?.clientX || 0);
      const y = Number(e?.clientY || 0);
      const card = pane.querySelector("#rssCategoryCarouselGrid .platform-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const HIT_PAD = 140;
      const hitLeft = rect.left - HIT_PAD;
      const hitRight = rect.right + HIT_PAD;
      const hitTop = rect.top - HIT_PAD;
      const hitBottom = rect.bottom + HIT_PAD;
      if (x < hitLeft || x > hitRight || y < hitTop || y > hitBottom) return;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return;
      if (y < rect.top) {
        _pageEntries2(-1);
        return;
      }
      if (y > rect.bottom) {
        _pageEntries2(1);
        return;
      }
      if (x < rect.left) {
        prev2();
        return;
      }
      if (x > rect.right) {
        next2();
        return;
      }
    });
    document.addEventListener("touchstart", _onTouchStart2, { passive: true });
    document.addEventListener("touchmove", _onTouchMove2, { passive: false });
    document.addEventListener("touchend", _onTouchEnd2, { passive: true });
    document.addEventListener("touchcancel", _onTouchEnd2, { passive: true });
    try {
      if (_getActiveTabId2() === CATEGORY_ID) {
        open2();
      }
    } catch (e) {
    }
  });

  // hotnews/web/static/js/src/title-drag-scroll.js
  function normalizeTarget(t) {
    const node = t;
    if (!node) return null;
    if (node.nodeType === 3) return node.parentElement || null;
    return node;
  }
  function isScrollableX(el) {
    if (!el) return false;
    const sw = el.scrollWidth || 0;
    const cw = el.clientWidth || 0;
    return sw > cw + 1;
  }
  function findPlatformGridFromTarget(t) {
    const el = normalizeTarget(t);
    const card = el?.closest?.(".platform-card");
    const grid = card?.closest?.(".platform-grid");
    return grid || null;
  }
  function isInTitleArea(t) {
    const el = normalizeTarget(t);
    if (!el?.closest) return false;
    if (el.closest(".platform-drag-handle")) return false;
    return !!el.closest(".platform-header") || !!el.closest(".platform-name");
  }
  ready(() => {
    const DRAG_THRESHOLD_PX = 4;
    let activePointerId = null;
    let activeIsMouse = false;
    let activeGrid = null;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressClickUntil = 0;
    let momentumAnimationFrame = null;
    let momentumVelocity = 0;
    let lastMoveTime = 0;
    let lastMoveX = 0;
    const FRICTION = 0.92;
    const MIN_VELOCITY = 0.5;
    function stopMomentum() {
      if (momentumAnimationFrame) {
        cancelAnimationFrame(momentumAnimationFrame);
        momentumAnimationFrame = null;
      }
      momentumVelocity = 0;
    }
    function findNearestCardPosition(grid) {
      if (!grid) return null;
      const cards = Array.from(grid.querySelectorAll(".platform-card"));
      if (cards.length === 0) return null;
      const gridRect = grid.getBoundingClientRect();
      const gridLeft = gridRect.left;
      const scrollLeft = grid.scrollLeft || 0;
      let nearestCard = null;
      let minDistance = Infinity;
      for (const card of cards) {
        const cardRect = card.getBoundingClientRect();
        const cardLeft = cardRect.left;
        const distance = Math.abs(cardLeft - gridLeft);
        if (distance < minDistance) {
          minDistance = distance;
          nearestCard = card;
        }
      }
      if (!nearestCard) return null;
      const cardOffsetLeft = nearestCard.offsetLeft || 0;
      return cardOffsetLeft;
    }
    function snapToNearestCard(grid) {
      if (!grid) return;
      const targetPosition = findNearestCardPosition(grid);
      if (targetPosition === null) return;
      const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
      const clampedPosition = Math.max(0, Math.min(maxScrollLeft, targetPosition));
      grid.scrollTo({
        left: clampedPosition,
        behavior: "smooth"
      });
    }
    function applyMomentumScroll(grid, velocity) {
      if (!grid || !isScrollableX(grid)) return;
      stopMomentum();
      momentumVelocity = velocity;
      function animate() {
        if (Math.abs(momentumVelocity) < MIN_VELOCITY) {
          stopMomentum();
          setTimeout(() => snapToNearestCard(grid), 100);
          return;
        }
        momentumVelocity *= FRICTION;
        const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
        const current = grid.scrollLeft || 0;
        const next3 = Math.max(0, Math.min(maxScrollLeft, current + momentumVelocity));
        grid.scrollLeft = next3;
        if (next3 <= 0 || next3 >= maxScrollLeft) {
          stopMomentum();
          setTimeout(() => snapToNearestCard(grid), 100);
          return;
        }
        momentumAnimationFrame = requestAnimationFrame(animate);
      }
      momentumAnimationFrame = requestAnimationFrame(animate);
    }
    let wheelRAFPending = false;
    let wheelTargetGrid = null;
    let wheelAccumulatedDelta = 0;
    let wheelStopTimer = null;
    function processWheelScroll() {
      wheelRAFPending = false;
      if (!wheelTargetGrid || !isScrollableX(wheelTargetGrid)) {
        wheelAccumulatedDelta = 0;
        return;
      }
      const delta = wheelAccumulatedDelta;
      wheelAccumulatedDelta = 0;
      if (!delta) return;
      const maxScrollLeft = Math.max(0, (wheelTargetGrid.scrollWidth || 0) - (wheelTargetGrid.clientWidth || 0));
      const current = wheelTargetGrid.scrollLeft || 0;
      const next3 = Math.max(0, Math.min(maxScrollLeft, current + delta));
      wheelTargetGrid.scrollLeft = next3;
      if (wheelStopTimer) {
        clearTimeout(wheelStopTimer);
      }
      wheelStopTimer = setTimeout(() => {
        wheelStopTimer = null;
        snapToNearestCard(wheelTargetGrid);
      }, 150);
    }
    const clear = () => {
      const now = performance.now();
      const dt = now - lastMoveTime;
      let velocity = 0;
      if (didDrag && activeGrid && dt > 0 && dt < 100) {
        const recentDx = lastMoveX - startX;
        velocity = -recentDx / (dt / 16);
        velocity = Math.max(-50, Math.min(50, velocity));
      }
      const grid = activeGrid;
      activePointerId = null;
      activeIsMouse = false;
      activeGrid = null;
      startX = 0;
      startScrollLeft = 0;
      didDrag = false;
      lastMoveTime = 0;
      lastMoveX = 0;
      try {
        document.body.classList.remove("tr-platform-title-dragging");
      } catch (_) {
      }
      if (grid && Math.abs(velocity) > 2) {
        applyMomentumScroll(grid, velocity);
      }
    };
    const beginDrag = (target, clientX, fromMiddleButton = false) => {
      if (fromMiddleButton) {
        const card = normalizeTarget(target)?.closest?.(".platform-card");
        if (!card) return false;
        const grid2 = card.closest(".platform-grid");
        if (!grid2 || !isScrollableX(grid2)) return false;
        stopMomentum();
        activeGrid = grid2;
        startX = clientX;
        startScrollLeft = grid2.scrollLeft || 0;
        didDrag = false;
        lastMoveTime = performance.now();
        lastMoveX = clientX;
        try {
          document.body.classList.add("tr-platform-title-dragging");
        } catch (_) {
        }
        return true;
      }
      if (!isInTitleArea(target)) return false;
      if (document.querySelector(".platform-card.dragging")) return false;
      const grid = findPlatformGridFromTarget(target);
      if (!grid || !isScrollableX(grid)) return false;
      stopMomentum();
      activeGrid = grid;
      startX = clientX;
      startScrollLeft = grid.scrollLeft || 0;
      didDrag = false;
      lastMoveTime = performance.now();
      lastMoveX = clientX;
      try {
        document.body.classList.add("tr-platform-title-dragging");
      } catch (_) {
      }
      return true;
    };
    document.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = normalizeTarget(e.target);
      const isMiddle = e.button === 1;
      if (!beginDrag(target, e.clientX, isMiddle)) return;
      activePointerId = e.pointerId;
      if (isMiddle) {
        try {
          e.preventDefault();
        } catch (_) {
        }
      }
    }, { passive: false });
    document.addEventListener("mousedown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (activePointerId !== null) return;
      const target = normalizeTarget(e.target);
      const isMiddle = e.button === 1;
      if (!beginDrag(target, e.clientX, isMiddle)) return;
      activeIsMouse = true;
      if (isMiddle) {
        try {
          e.preventDefault();
        } catch (_) {
        }
      }
    }, { passive: false });
    document.addEventListener("pointermove", (e) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      if (!activeGrid) return;
      if (document.querySelector(".platform-card.dragging")) {
        clear();
        return;
      }
      const dx = e.clientX - startX;
      if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      didDrag = true;
      try {
        e.preventDefault();
      } catch (_) {
      }
      lastMoveTime = performance.now();
      lastMoveX = e.clientX;
      const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
      const next3 = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));
      activeGrid.scrollLeft = next3;
    }, { passive: false });
    document.addEventListener("mousemove", (e) => {
      if (!activeIsMouse) return;
      if (!activeGrid) return;
      if (document.querySelector(".platform-card.dragging")) {
        clear();
        return;
      }
      const dx = e.clientX - startX;
      if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      didDrag = true;
      try {
        e.preventDefault();
      } catch (_) {
      }
      lastMoveTime = performance.now();
      lastMoveX = e.clientX;
      const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
      const next3 = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));
      activeGrid.scrollLeft = next3;
    }, { passive: false });
    const onPointerEnd = () => {
      if (activePointerId === null) return;
      if (didDrag) suppressClickUntil = Date.now() + 600;
      clear();
    };
    document.addEventListener("pointerup", onPointerEnd, { passive: true });
    document.addEventListener("pointercancel", onPointerEnd, { passive: true });
    document.addEventListener("mouseup", () => {
      if (!activeIsMouse) return;
      if (didDrag) suppressClickUntil = Date.now() + 600;
      clear();
    }, { passive: true });
    document.addEventListener("click", (e) => {
      const now = Date.now();
      if (now > suppressClickUntil) return;
      const target = normalizeTarget(e.target);
      if (!isInTitleArea(target)) return;
      try {
        e.preventDefault();
      } catch (_) {
      }
      try {
        e.stopPropagation();
      } catch (_) {
      }
      try {
        e.stopImmediatePropagation();
      } catch (_) {
      }
    }, true);
    document.addEventListener("wheel", (e) => {
      const pointEl = typeof document.elementFromPoint === "function" ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const target = normalizeTarget(pointEl || e.target);
      if (!e.shiftKey) return;
      if (!isInTitleArea(target)) return;
      if (document.querySelector(".platform-card.dragging")) return;
      const grid = findPlatformGridFromTarget(target);
      if (!grid || !isScrollableX(grid)) return;
      stopMomentum();
      let delta = typeof e.deltaX === "number" && e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 20;
      } else if (e.deltaMode === 2) {
        delta *= grid.clientWidth || 100;
      }
      if (!delta) return;
      try {
        e.preventDefault();
      } catch (_) {
      }
      wheelTargetGrid = grid;
      wheelAccumulatedDelta += delta;
      if (!wheelRAFPending) {
        wheelRAFPending = true;
        requestAnimationFrame(processWheelScroll);
      }
    }, { passive: false });
    function navigateToCard(grid, direction) {
      if (!grid) return;
      const cards = Array.from(grid.querySelectorAll(".platform-card"));
      if (cards.length === 0) return;
      const gridRect = grid.getBoundingClientRect();
      const gridLeft = gridRect.left;
      const scrollLeft = grid.scrollLeft || 0;
      let currentIndex = 0;
      let minDistance = Infinity;
      cards.forEach((card, idx) => {
        const cardRect = card.getBoundingClientRect();
        const distance = Math.abs(cardRect.left - gridLeft);
        if (distance < minDistance) {
          minDistance = distance;
          currentIndex = idx;
        }
      });
      const targetIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
      if (targetIndex === currentIndex && minDistance < 10) {
        const nextIdx = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
        if (nextIdx !== currentIndex) {
          const targetCard2 = cards[nextIdx];
          if (targetCard2) {
            stopMomentum();
            grid.scrollTo({
              left: targetCard2.offsetLeft || 0,
              behavior: "smooth"
            });
          }
        }
        return;
      }
      const targetCard = cards[targetIndex];
      if (!targetCard) return;
      stopMomentum();
      grid.scrollTo({
        left: targetCard.offsetLeft || 0,
        behavior: "smooth"
      });
    }
    function getActiveGrid() {
      const activePane = document.querySelector(".tab-pane.active");
      if (!activePane) return null;
      const paneId = activePane.id || "";
      if (paneId === "tab-rsscol-rss") return null;
      const grid = activePane.querySelector(".platform-grid");
      if (!grid || !isScrollableX(grid)) return null;
      return grid;
    }
    document.addEventListener("keydown", (e) => {
      const target = e.target;
      if (target && target instanceof Element) {
        if (target.closest("input,textarea,select")) return;
      }
      if (document.querySelector(".settings-modal-overlay.show")) return;
      if (document.getElementById("rssCatalogPreviewModal")?.classList.contains("show")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const grid = getActiveGrid();
      if (!grid) return;
      e.preventDefault();
      navigateToCard(grid, e.key === "ArrowRight" ? 1 : -1);
    });
  });

  // hotnews/web/static/js/src/morning-brief.js
  var MORNING_BRIEF_CATEGORY_ID = "knowledge";
  var LATEST_BASELINE_WINDOW_SEC = 2 * 3600;
  var TAB_SWITCHED_EVENT3 = "tr_tab_switched";
  var AUTO_REFRESH_INTERVAL_MS = 3e5;
  var INITIAL_CARDS2 = 1;
  function getItemsPerCard2() {
    return window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.morning_brief_items || 50;
  }
  var _mbInFlight = false;
  var _mbLastRefreshAt = 0;
  var _tabSwitchDebounceTimer = null;
  var _mbOffset = 0;
  var _mbObserver = null;
  var _mbFinished = false;
  function _getActiveTabId3() {
    try {
      return document.querySelector(".category-tabs .category-tab.active")?.dataset?.category || null;
    } catch (e) {
      return null;
    }
  }
  function _applyPagingToCard(card) {
    try {
      TR.paging?.setCardPageSize?.(card, 50);
      TR.paging?.applyPagingToCard?.(card, 0);
    } catch (e) {
    }
  }
  function _fmtTime2(tsSec) {
    const ts = Number(tsSec || 0) || 0;
    if (!ts) return "";
    try {
      const d = new Date(ts * 1e3);
      const YYYY = String(d.getFullYear());
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const DD = String(d.getDate()).padStart(2, "0");
      return `${YYYY}-${MM}-${DD}`;
    } catch (e) {
      return "";
    }
  }
  function _buildNewsItemsHtml2(items, opts = {}) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      const emptyText = escapeHtml(opts.emptyText || "\u6682\u65E0\u5185\u5BB9");
      return `<li class="tr-mb-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
      const stableId = escapeHtml(n?.stable_id || "");
      const title = escapeHtml(n?.display_title || n?.title || "");
      const url = escapeHtml(n?.url || "#");
      const t = _fmtTime2(n?.published_at || n?.created_at);
      const timeHtml = t ? `<span class="tr-mb-time" style="margin-left:8px;color:#9ca3af;font-size:12px;">${escapeHtml(t)}</span>` : "";
      return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${timeHtml}
                </div>
            </li>`;
    }).join("");
  }
  function _getPane2() {
    return document.getElementById(`tab-${MORNING_BRIEF_CATEGORY_ID}`);
  }
  function _getGrid2() {
    const pane = _getPane2();
    return pane ? pane.querySelector(".platform-grid") : null;
  }
  function _ensureLayout2() {
    const pane = _getPane2();
    if (!pane) return false;
    let grid = pane.querySelector(".platform-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "platform-grid";
      grid.style.display = "flex";
      grid.style.flexDirection = "row";
      grid.style.overflowX = "auto";
      grid.style.overflowY = "hidden";
      grid.style.alignItems = "flex-start";
      grid.style.overscrollBehavior = "contain";
      pane.appendChild(grid);
    } else {
      grid.style.overscrollBehavior = "contain";
    }
    try {
      if (grid.dataset) grid.dataset.mbInjected = "1";
    } catch (e) {
    }
    return true;
  }
  async function _fetchJson2(url) {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  }
  async function _fetchTimelineBatch2(limit, offset) {
    const url = `/api/rss/brief/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}&drop_published_at_zero=0`;
    const payload = await _fetchJson2(url);
    return Array.isArray(payload?.items) ? payload.items : [];
  }
  function _appendCard2(items, cardIndex, container) {
    if (!items || !items.length) return;
    const card = document.createElement("div");
    card.className = "platform-card tr-morning-brief-card";
    card.style.minWidth = "360px";
    card.dataset.platform = `mb-slice-${cardIndex}`;
    card.draggable = false;
    const limit = getItemsPerCard2();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;
    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                \u{1F552} \u6700\u65B0 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-mb-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml2(items, { emptyText: "\u6682\u65E0\u5185\u5BB9" })}
        </ul>
    `;
    const indices = card.querySelectorAll(".news-index");
    indices.forEach((el, i) => {
      el.textContent = String(displayStart + i);
    });
    const sentinel = container.querySelector("#mb-load-sentinel");
    if (sentinel) {
      container.insertBefore(card, sentinel);
    } else {
      container.appendChild(card);
    }
    _applyPagingToCard(card);
  }
  function _createSentinel2(container) {
    const existing = container.querySelector("#mb-load-sentinel");
    if (existing) existing.remove();
    const sentinel = document.createElement("div");
    sentinel.id = "mb-load-sentinel";
    sentinel.style.minWidth = "20px";
    sentinel.style.height = "100%";
    sentinel.style.flexShrink = "0";
    sentinel.innerHTML = '<div style="width:20px;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">\u23F3</div>';
    container.appendChild(sentinel);
    return sentinel;
  }
  function _attachObserver2() {
    if (_mbObserver) {
      _mbObserver.disconnect();
      _mbObserver = null;
    }
    const pane = _getPane2();
    if (!pane) return;
    _mbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          _loadNextBatch2().catch(() => {
          });
        }
      }
    }, {
      root: pane.querySelector(".platform-grid"),
      // The scrolling container
      rootMargin: "200px",
      // Preload when close
      threshold: 0.01
    });
    const sentinel = pane.querySelector("#mb-load-sentinel");
    if (sentinel) {
      _mbObserver.observe(sentinel);
    }
  }
  async function _loadNextBatch2() {
    if (_mbInFlight || _mbFinished) return;
    _mbInFlight = true;
    try {
      const limit = getItemsPerCard2();
      const items = await _fetchTimelineBatch2(limit, _mbOffset);
      if (!items.length) {
        _mbFinished = true;
        const s = document.getElementById("mb-load-sentinel");
        if (s) {
          s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">\u5DF2\u663E\u793A\u5168\u90E8\u5185\u5BB9</div>';
          s.style.width = "40px";
        }
        return;
      }
      const grid = _getGrid2();
      if (grid) {
        const cardIndex = Math.floor(_mbOffset / getItemsPerCard2());
        _appendCard2(items, cardIndex, grid);
      }
      _mbOffset += items.length;
      if (items.length < limit) {
        _mbFinished = true;
        const s = document.getElementById("mb-load-sentinel");
        if (s) s.remove();
      }
    } catch (e) {
    } finally {
      _mbInFlight = false;
    }
  }
  async function _loadTimeline2() {
    const grid = _getGrid2();
    if (!grid) return;
    _mbOffset = 0;
    _mbFinished = false;
    grid.innerHTML = "";
    _createSentinel2(grid);
    const limit = getItemsPerCard2();
    const initialLimit = limit * INITIAL_CARDS2;
    const items = await _fetchTimelineBatch2(initialLimit, 0);
    if (!items.length) {
      grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">\u6682\u65E0\u5185\u5BB9</div>';
      return;
    }
    for (let i = 0; i < items.length; i += limit) {
      const chunk = items.slice(i, i + limit);
      const cardIndex = Math.floor(i / limit);
      _appendCard2(chunk, cardIndex, grid);
    }
    _mbOffset = items.length;
    if (items.length < initialLimit) {
      _mbFinished = true;
      const s = document.getElementById("mb-load-sentinel");
      if (s) s.remove();
    } else {
      _attachObserver2();
    }
  }
  async function _refreshTimelineIfNeeded2(opts = {}) {
    const force = opts.force === true;
    if (_getActiveTabId3() !== MORNING_BRIEF_CATEGORY_ID) return false;
    const now = Date.now();
    if (!force && _mbLastRefreshAt > 0 && now - _mbLastRefreshAt < AUTO_REFRESH_INTERVAL_MS - 5e3) {
      return false;
    }
    if (!_ensureLayout2()) return false;
    _mbInFlight = true;
    try {
      await _loadTimeline2();
      _mbLastRefreshAt = Date.now();
      return true;
    } catch (e) {
      return false;
    } finally {
      _mbInFlight = false;
    }
  }
  function _attachHandlersOnce() {
    const pane = _getPane2();
    if (!pane) return;
    if (pane.dataset && pane.dataset.mbBound === "1") return;
    pane.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !(t instanceof Element)) return;
      const refresh = t.closest('[data-action="mb-refresh"]');
      if (refresh) {
        e.preventDefault();
        _refreshTimelineIfNeeded2({ force: true }).catch(() => {
          try {
            TR.toast?.show("\u5237\u65B0\u5931\u8D25", { variant: "error", durationMs: 2e3 });
          } catch (_) {
          }
        });
      }
    });
    try {
      if (pane.dataset) pane.dataset.mbBound = "1";
    } catch (e) {
    }
  }
  async function _initialLoad2() {
    if (!_ensureLayout2()) return;
    _attachHandlersOnce();
    await _refreshTimelineIfNeeded2({ force: false });
  }
  function _ensurePolling2() {
    try {
      window.addEventListener(TAB_SWITCHED_EVENT3, (ev) => {
        const cid2 = String(ev?.detail?.categoryId || "").trim();
        if (cid2 !== MORNING_BRIEF_CATEGORY_ID) return;
        if (!_mbFinished) _attachObserver2();
        clearTimeout(_tabSwitchDebounceTimer);
        _tabSwitchDebounceTimer = setTimeout(() => {
          _refreshTimelineIfNeeded2({ force: false }).catch(() => {
          });
        }, 120);
      });
    } catch (e) {
    }
  }
  function _patchRenderHook2() {
    if (TR.morningBrief && TR.morningBrief._patched === true) return;
    const orig = TR.data?.renderViewerFromData;
    if (typeof orig !== "function") return;
    TR.data.renderViewerFromData = function patchedRenderViewerFromData(data2, state) {
      orig.call(TR.data, data2, state);
      try {
        _initialLoad2().catch(() => {
        });
      } catch (e) {
      }
    };
    TR.morningBrief = {
      ...TR.morningBrief || {},
      _patched: true
    };
  }
  ready(function() {
    _patchRenderHook2();
    _initialLoad2().catch(() => {
    });
    _ensurePolling2();
  });

  // hotnews/web/static/js/src/init.js
  var MOBILE_TOP_COLLAPSE_STORAGE_KEY = "hotnews_mobile_top_collapsed_v1";
  var MOBILE_TOP_COLLAPSE_CLASS = "tr-mobile-top-collapsed";
  function _setMobileTopCollapsed(collapsed) {
    const next3 = !!collapsed;
    try {
      document.body.classList.toggle(MOBILE_TOP_COLLAPSE_CLASS, next3);
    } catch (e) {
    }
    try {
      localStorage.setItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY, next3 ? "1" : "0");
    } catch (e) {
    }
    try {
      const link2 = document.getElementById("trFooterTopToggle");
      if (link2) {
        link2.textContent = next3 ? "\u663E\u793A\u9876\u90E8" : "\u9690\u85CF\u9876\u90E8";
      }
    } catch (e) {
    }
  }
  function _setupMobileTopToggle() {
    let collapsed = true;
    try {
      const raw = localStorage.getItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY);
      if (raw === "0") collapsed = false;
      if (raw === "1") collapsed = true;
    } catch (e) {
    }
    try {
      const isE2E = new URLSearchParams(window.location.search).get("e2e") === "1";
      if (isE2E) {
        collapsed = false;
      }
    } catch (e) {
    }
    _setMobileTopCollapsed(collapsed);
    try {
      const link2 = document.getElementById("trFooterTopToggle");
      if (!link2) return;
      if (link2.dataset.bound === "1") return;
      link2.dataset.bound = "1";
      link2.setAttribute("role", "button");
      link2.setAttribute("aria-label", "\u663E\u793A\u6216\u9690\u85CF\u9876\u90E8\u680F");
      link2.addEventListener("click", () => {
        const next3 = !document.body.classList.contains(MOBILE_TOP_COLLAPSE_CLASS);
        _setMobileTopCollapsed(next3);
        if (!next3) {
          try {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } catch (e) {
          }
        }
      });
    } catch (e) {
    }
  }
  ready(function() {
    try {
      const isE2E = new URLSearchParams(window.location.search).get("e2e") === "1";
      if (isE2E) {
        try {
          const early = document.getElementById("early-hide");
          if (early) early.remove();
        } catch (e) {
        }
        try {
          const tabs2 = document.querySelector(".category-tabs");
          if (tabs2 && tabs2 instanceof HTMLElement) {
            tabs2.style.display = "flex";
          }
        } catch (e) {
        }
        try {
          const content = document.querySelector(".tab-content-area");
          if (content && content instanceof HTMLElement) {
            content.style.display = "block";
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    _setupMobileTopToggle();
    if (localStorage.getItem("category_settings_badge_dismissed") === "true") {
      const badge = document.getElementById("categorySettingsNewBadge");
      if (badge) badge.style.display = "none";
    }
    if (localStorage.getItem("rss_subscription_badge_dismissed") === "true") {
      const badge = document.getElementById("rssSubscriptionNewBadge");
      if (badge) badge.style.display = "none";
    }
    const config2 = TR.settings.getCategoryConfig();
    const hasCustomConfig = config2 && (config2.customCategories && config2.customCategories.length > 0 || config2.hiddenDefaultCategories && config2.hiddenDefaultCategories.length > 0 || config2.categoryOrder && config2.categoryOrder.length > 0 || config2.platformOrder && typeof config2.platformOrder === "object" && Object.keys(config2.platformOrder).length > 0);
    if (hasCustomConfig) {
      TR.data.refreshViewerData({ preserveScroll: false });
      try {
        window.setTimeout(() => {
          try {
            if (document.body.classList.contains("categories-ready")) return;
          } catch (e) {
          }
          try {
            const early = document.getElementById("early-hide");
            if (early) early.remove();
          } catch (e) {
          }
          try {
            const tabs2 = document.querySelector(".category-tabs");
            if (tabs2 && tabs2 instanceof HTMLElement) {
              tabs2.style.display = "flex";
            }
          } catch (e) {
          }
          try {
            const content = document.querySelector(".tab-content-area");
            if (content && content instanceof HTMLElement) {
              content.style.display = "block";
            }
          } catch (e) {
          }
          try {
            document.body.classList.add("categories-ready");
          } catch (e) {
          }
        }, 2500);
      } catch (e) {
      }
    } else {
      document.body.classList.add("categories-ready");
    }
  });
})();
