/**
 * Auth UI Components
 * Reactive UI components that automatically update based on auth state.
 */

import { authState } from './auth-state.js';

/**
 * Toast notification component
 */
class Toast {
    static container = null;

    static _ensureContainer() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(this.container);
        }
        return this.container;
    }

    static show(message, type = 'info') {
        const container = this._ensureContainer();
        const toast = document.createElement('div');

        const colors = {
            success: { bg: '#059669', border: '#10b981' },
            error: { bg: '#dc2626', border: '#ef4444' },
            info: { bg: '#2563eb', border: '#3b82f6' }
        };
        const color = colors[type] || colors.info;

        toast.style.cssText = `
            background: ${color.bg};
            border: 1px solid ${color.border};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease;
            max-width: 300px;
        `;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Add animation styles
if (!document.getElementById('toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Loading overlay component
 */
class LoadingOverlay {
    static overlay = null;

    static show(message = '加载中...') {
        if (this.overlay) this.hide();

        this.overlay = document.createElement('div');
        this.overlay.id = 'loading-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #1e293b;
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            text-align: center;
            min-width: 150px;
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 24px;
            height: 24px;
            border: 3px solid #334155;
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 12px;
        `;

        const text = document.createElement('div');
        text.textContent = message;
        text.style.fontSize = '14px';

        box.appendChild(spinner);
        box.appendChild(text);
        this.overlay.appendChild(box);
        document.body.appendChild(this.overlay);
    }

    static hide() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}

// Add spinner animation
if (!document.getElementById('spinner-animation')) {
    const style = document.createElement('style');
    style.id = 'spinner-animation';
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Auth Button Component
 * Automatically updates based on auth state
 */
export class AuthButton {
    constructor(container) {
        this.container = container;
        this.unsubscribe = null;
        this.init();
    }

    init() {
        // Subscribe to auth state changes
        this.unsubscribe = authState.subscribe(user => this.render(user));
    }

    render(user) {
        if (!this.container) return;

        if (user) {
            this._renderLoggedIn(user);
        } else {
            this._renderLoggedOut();
        }
    }

    _renderLoggedIn(user) {
        const name = user.nickname || user.email || 'Me';
        const initial = name[0].toUpperCase();

        this.container.innerHTML = `
            <div class="auth-user-menu">
                <div class="auth-avatar" title="${name}">
                    ${initial}
                </div>
                <div class="auth-dropdown" id="authDropdown">
                    <div class="auth-dropdown-item auth-user-info">${name}</div>
                    <div class="auth-dropdown-divider"></div>
                    <a href="/api/user/preferences/page" class="auth-dropdown-item">⚙️ 我的设置</a>
                    <div class="auth-dropdown-item auth-logout-btn">🚪 退出登录</div>
                </div>
            </div>
        `;

        // Add event listeners
        const avatar = this.container.querySelector('.auth-avatar');
        const dropdown = this.container.querySelector('.auth-dropdown');
        const logoutBtn = this.container.querySelector('.auth-logout-btn');

        if (avatar && dropdown) {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleLogout());
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.auth-user-menu')) {
                dropdown?.classList.remove('show');
            }
        });

        this._ensureStyles();
    }

    _renderLoggedOut() {
        // Use icon button style matching search/theme/settings buttons
        this.container.innerHTML = `
            <a href="/api/auth/page" class="icon-btn auth-icon-btn" title="登录 / 注册">
                👤
            </a>
        `;
        this._ensureStyles();
    }

    async _handleLogout() {
        LoadingOverlay.show('正在退出...');

        try {
            await authState.logout();

            // Wait a bit for cookie to clear
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify logout
            const loggedOut = await authState.verifyLogout();

            LoadingOverlay.hide();

            if (loggedOut) {
                Toast.show('已退出登录', 'success');

                // If on a protected page, redirect to home
                if (window.location.pathname.includes('/preferences')) {
                    window.location.href = '/?logout=' + Date.now();
                }
            } else {
                // Fallback: force reload
                console.warn('[AuthButton] Logout verification failed, forcing reload');
                window.location.href = '/?logout=' + Date.now();
            }

        } catch (e) {
            LoadingOverlay.hide();
            Toast.show('退出失败，请重试', 'error');
            console.error('[AuthButton] Logout error:', e);
        }
    }

    _ensureStyles() {
        if (document.getElementById('auth-button-styles')) return;

        const style = document.createElement('style');
        style.id = 'auth-button-styles';
        style.textContent = `
            .auth-user-menu {
                position: relative;
            }
            .auth-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                cursor: pointer;
                user-select: none;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .auth-avatar:hover {
                transform: scale(1.05);
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
            }
            .auth-dropdown {
                display: none;
                position: absolute;
                right: 0;
                top: 40px;
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 8px;
                min-width: 160px;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }
            .auth-dropdown.show {
                display: block;
            }
            .auth-dropdown-item {
                padding: 10px 16px;
                cursor: pointer;
                color: #f1f5f9;
                text-decoration: none;
                display: block;
                font-size: 14px;
                transition: background 0.2s;
            }
            .auth-dropdown-item:hover {
                background: #334155;
            }
            .auth-user-info {
                color: #94a3b8;
                font-size: 12px;
                cursor: default;
            }
            .auth-user-info:hover {
                background: transparent;
            }
            .auth-dropdown-divider {
                height: 1px;
                background: #334155;
                margin: 4px 0;
            }
            .auth-login-btn {
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                color: white;
                padding: 8px 16px;
                border-radius: 8px;
                text-decoration: none;
                font-size: 14px;
                font-weight: 500;
                transition: transform 0.2s, box-shadow 0.2s;
                display: inline-block;
            }
            .auth-login-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

// Export utilities
export { Toast, LoadingOverlay };

// Expose to window
window.AuthButton = AuthButton;
window.Toast = Toast;
window.LoadingOverlay = LoadingOverlay;
