/**
 * Hotnews Storage Module
 * localStorage 封装
 */

import { TR } from './core.js';

export const storage = {
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
            console.error('Storage set error:', e);
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            // ignore
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
