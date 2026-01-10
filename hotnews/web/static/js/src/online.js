/**
 * Hotnews Online Module
 * 在线人数
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const ONLINE_SESSION_KEY = 'hotnews_online_session_id';

export const online = {
    getSessionId() {
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

    async ping() {
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

    async refreshStats() {
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

TR.online = online;

// 初始化
ready(function() {
    online.ping();
    online.refreshStats();
    setInterval(() => online.ping(), 15000);
    setInterval(() => online.refreshStats(), 10000);
});
