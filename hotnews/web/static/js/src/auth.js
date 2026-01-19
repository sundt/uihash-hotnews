
/**
 * Auth Module
 * Handles user login status, menu rendering, and logout.
 */
import { TR } from './core.js';

export async function renderUserMenu() {
    console.log('[Auth] renderUserMenu called');
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) {
        console.error('[Auth] .header-right not found');
        return;
    }
    console.log('[Auth] .header-right found:', headerRight);

    // Check if menu already exists
    if (document.getElementById('userMenu')) {
        console.log('[Auth] userMenu already exists, skipping');
        return;
    }

    try {
        console.log('[Auth] Fetching /api/auth/me...');
        const res = await fetch('/api/auth/me');
        
        // If API returns 404, auth module is not available
        if (res.status === 404) {
            console.log('[Auth] Auth API not available (404), skipping user menu');
            return;
        }
        
        // If API returns 500, there's a server error
        if (res.status === 500) {
            console.error('[Auth] Server error (500), skipping user menu');
            return;
        }
        
        let data;
        try {
            data = await res.json();
        } catch (e) {
            console.error('[Auth] Failed to parse JSON response:', e);
            return;
        }
        
        console.log('[Auth] API response:', data);

        const div = document.createElement('div');
        div.id = 'userMenu';
        div.className = 'user-menu';

        if (data.ok && data.user) {
            // Logged in
            const name = data.user.nickname || data.user.email || 'Me';
            const initial = name[0].toUpperCase();

            div.innerHTML = `
                <div class="user-avatar" onclick="toggleUserDropdown()" title="${name}">
                    ${initial}
                </div>
                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-item user-info-item">${name}</div>
                    <div class="dropdown-divider"></div>
                    <a href="/api/user/preferences/page" class="dropdown-item">⚙️ 我的设置</a>
                    <div class="dropdown-item" onclick="logoutUser()">🚪 退出登录</div>
                </div>
            `;

            // Add styles if not present
            if (!document.getElementById('user-menu-styles')) {
                const style = document.createElement('style');
                style.id = 'user-menu-styles';
                style.textContent = `
                    .user-menu { position: relative; margin-left: 10px; }
                    .user-avatar {
                        width: 32px; height: 32px; border-radius: 50%;
                        background: #3B82F6; color: white;
                        display: flex; align-items: center; justify-content: center;
                        font-weight: bold; cursor: pointer; user-select: none;
                        font-size: 14px;
                    }
                    .user-dropdown {
                        display: none; position: absolute; right: 0; top: 40px;
                        background: #1E293B; border: 1px solid #334155;
                        border-radius: 8px; width: 160px; z-index: 1000;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
                    }
                    .user-dropdown.show { display: block; }
                    .dropdown-item {
                        padding: 10px 16px; cursor: pointer; color: #F1F5F9;
                        text-decoration: none; display: block; font-size: 14px;
                    }
                    .dropdown-item:hover { background: #334155; }
                    .user-info-item { color: #94A3B8; font-size: 12px; cursor: default; }
                    .user-info-item:hover { background: transparent; }
                    .dropdown-divider { height: 1px; background: #334155; margin: 4px 0; }
                `;
                document.head.appendChild(style);
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.user-menu')) {
                    document.getElementById('userDropdown')?.classList.remove('show');
                }
            });

        } else {
            // Not logged in
            div.innerHTML = `
                <a href="/api/auth/page" class="login-btn">登录 / 注册</a>
            `;
            if (!document.getElementById('user-login-styles')) {
                const style = document.createElement('style');
                style.id = 'user-login-styles';
                style.textContent = `
                    .login-btn {
                        background: #3B82F6; color: white; padding: 6px 12px;
                        border-radius: 6px; text-decoration: none; font-size: 14px;
                        margin-left: 10px; transition: background 0.2s;
                    }
                    .login-btn:hover { background: #2563EB; }
                `;
                document.head.appendChild(style);
            }
        }

        // Insert as the last item (rightmost)
        headerRight.appendChild(div);
        console.log('[Auth] User menu rendered successfully, logged in:', data.ok && data.user);

    } catch (e) {
        console.error('Failed to render user menu:', e);
    }
}

export function toggleUserDropdown() {
    const d = document.getElementById('userDropdown');
    if (d) d.classList.toggle('show');
}

export async function logoutUser() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
    } catch (e) {
        alert('退出失败');
    }
}

// Expose to window for inline event handlers
window.toggleUserDropdown = toggleUserDropdown;
window.logoutUser = logoutUser;
window.renderUserMenu = renderUserMenu; // Optional, useful for debugging

TR.auth = {
    renderUserMenu,
    toggleUserDropdown,
    logoutUser
};
