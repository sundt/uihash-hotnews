/**
 * Hotnews Core Module
 * 核心工具函数和全局命名空间
 */
(function(global) {
    'use strict';

    // 创建全局命名空间
    const TR = global.Hotnews = global.Hotnews || {};

    // === 工具函数 ===
    TR.escapeHtml = function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    TR.cssEscape = function(str) {
        return (window.CSS && typeof window.CSS.escape === 'function') 
            ? window.CSS.escape(String(str)) 
            : String(str);
    };

    // === 存储工具 ===
    TR.storage = {
        get: function(key, defaultValue) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        },
        set: function(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn('localStorage set failed:', key, e);
            }
        },
        remove: function(key) {
            localStorage.removeItem(key);
        },
        getRaw: function(key) {
            return localStorage.getItem(key);
        },
        setRaw: function(key, value) {
            localStorage.setItem(key, value);
        }
    };

    // === 事件总线（模块间通信） ===
    const eventHandlers = {};
    TR.events = {
        on: function(event, handler) {
            if (!eventHandlers[event]) eventHandlers[event] = [];
            eventHandlers[event].push(handler);
        },
        off: function(event, handler) {
            if (!eventHandlers[event]) return;
            eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
        },
        emit: function(event, data) {
            if (!eventHandlers[event]) return;
            eventHandlers[event].forEach(h => {
                try { h(data); } catch (e) { console.error('Event handler error:', e); }
            });
        }
    };

    // === DOM Ready ===
    const readyHandlers = [];
    let isReady = false;

    TR.ready = function(handler) {
        if (isReady) {
            handler();
        } else {
            readyHandlers.push(handler);
        }
    };

    document.addEventListener('DOMContentLoaded', function() {
        isReady = true;
        readyHandlers.forEach(h => {
            try { h(); } catch (e) { console.error('Ready handler error:', e); }
        });
    });

})(window);
