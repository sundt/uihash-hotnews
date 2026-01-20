/**
 * Auth State Manager
 * Centralized authentication state management with reactive updates.
 * 
 * Features:
 * - Single source of truth for auth state
 * - Subscription-based UI updates
 * - Multi-tab synchronization via BroadcastChannel
 * - Automatic cache clearing on logout
 */

// Singleton state manager
class AuthStateManager {
    constructor() {
        this.currentUser = null;
        this.listeners = [];
        this.initialized = false;
        this.loading = false;

        // Set up multi-tab synchronization
        this._setupBroadcastChannel();
    }

    /**
     * Initialize the auth state by fetching current user
     */
    async init() {
        if (this.initialized) return this.currentUser;

        try {
            await this.fetchUser();
            this.initialized = true;
        } catch (e) {
            console.error('[AuthState] Init failed:', e);
            this.currentUser = null;
            this.initialized = true;
        }

        return this.currentUser;
    }

    /**
     * Fetch current user from API
     */
    async fetchUser() {
        if (this.loading) return this.currentUser;

        this.loading = true;
        try {
            console.log('[AuthState] Fetching user...');
            const res = await fetch('/api/auth/me');

            if (res.status === 404 || res.status === 500) {
                this.currentUser = null;
            } else {
                const data = await res.json();
                this.currentUser = data.ok && data.user ? data.user : null;
            }

            console.log('[AuthState] User fetched:', this.currentUser ? 'logged in' : 'not logged in');
            this._notifyListeners();
            return this.currentUser;
        } catch (e) {
            console.error('[AuthState] Fetch user failed:', e);
            this.currentUser = null;
            return null;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Check if user is currently logged in
     */
    isLoggedIn() {
        return !!this.currentUser;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Subscribe to auth state changes
     * @param {Function} callback - Called with (user) when state changes
     * @returns {Function} - Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.push(callback);
        // Immediately call with current state
        callback(this.currentUser);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Logout the current user
     */
    async logout() {
        console.log('[AuthState] Logging out...');

        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`Logout failed: ${response.status}`);
            }

            console.log('[AuthState] Logout successful');

            // Clear user state
            this.currentUser = null;
            this._notifyListeners();

            // Clear caches
            this._clearUserCaches();

            // Broadcast to other tabs
            this._broadcast({ type: 'logout' });

            return true;
        } catch (e) {
            console.error('[AuthState] Logout failed:', e);
            throw e;
        }
    }

    /**
     * Called after login (e.g., from OAuth callback)
     */
    async onLogin() {
        console.log('[AuthState] Login detected, refreshing user...');
        await this.fetchUser();
        this._broadcast({ type: 'login' });
    }

    /**
     * Clear all user-related caches from localStorage
     */
    _clearUserCaches() {
        console.log('[AuthState] Clearing user caches...');
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('hotnews_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log('[AuthState] Cleared', keysToRemove.length, 'cache entries');
    }

    /**
     * Notify all listeners of state change
     */
    _notifyListeners() {
        this.listeners.forEach(cb => {
            try {
                cb(this.currentUser);
            } catch (e) {
                console.error('[AuthState] Listener error:', e);
            }
        });
    }

    /**
     * Set up BroadcastChannel for multi-tab sync
     */
    _setupBroadcastChannel() {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[AuthState] BroadcastChannel not supported');
            return;
        }

        try {
            this.channel = new BroadcastChannel('hotnews_auth');
            this.channel.onmessage = (event) => {
                console.log('[AuthState] Received broadcast:', event.data);
                if (event.data.type === 'logout') {
                    this.currentUser = null;
                    this._notifyListeners();
                } else if (event.data.type === 'login') {
                    this.fetchUser();
                }
            };
        } catch (e) {
            console.warn('[AuthState] BroadcastChannel setup failed:', e);
        }
    }

    /**
     * Broadcast message to other tabs
     */
    _broadcast(message) {
        if (this.channel) {
            try {
                this.channel.postMessage(message);
            } catch (e) {
                console.warn('[AuthState] Broadcast failed:', e);
            }
        }
    }

    /**
     * Verify logout was successful by checking API
     * Returns true if properly logged out
     */
    async verifyLogout() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            return !(data.ok && data.user);
        } catch (e) {
            return true; // Assume logged out on error
        }
    }
}

// Singleton instance
export const authState = new AuthStateManager();

// Expose to window for debugging
window.authState = authState;
