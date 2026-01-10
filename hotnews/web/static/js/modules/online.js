/**
 * Hotnews Online Module
 * 在线人数心跳和统计
 */
(function(global) {
    'use strict';

    const TR = global.Hotnews = global.Hotnews || {};
    const storage = TR.storage;

    const ONLINE_SESSION_KEY = 'hotnews_online_session_id';

    TR.online = {
        getSessionId: function() {
            let id = storage.getRaw(ONLINE_SESSION_KEY);
            if (id) return id;
            if (window.crypto && crypto.randomUUID) {
                id = crypto.randomUUID();
            } else {
                id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            }
            storage.setRaw(ONLINE_SESSION_KEY, id);
            return id;
        },

        ping: async function() {
            try {
                await fetch('/api/online/ping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: this.getSessionId() })
                });
            } catch (e) {
                // ignore
            }
        },

        refreshStats: async function() {
            try {
                const res = await fetch('/api/online');
                const data = await res.json();
                const el5 = document.getElementById('online5m');
                if (el5) el5.textContent = data.online_5m ?? '-';
            } catch (e) {
                // ignore
            }
        }
    };

    // === 初始化 ===
    TR.ready(function() {
        TR.online.ping();
        TR.online.refreshStats();
        setInterval(() => TR.online.ping(), 15000);
        setInterval(() => TR.online.refreshStats(), 10000);
    });

})(window);
