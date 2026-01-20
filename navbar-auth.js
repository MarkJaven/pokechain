// =========================================
// NAVBAR AUTHENTICATION UI COMPONENT
// Handles username display with dropdown menu
// =========================================

window.navbarAuth = (function() {
    'use strict';

    // Create or update username dropdown in navbar
    async function initNavbarAuth() {
        if (!window.auth || !window.auth.isAuthenticated()) {
            return;
        }

        const navbars = document.querySelectorAll('.navbar-nav');
        
        for (const navbar of navbars) {
            // Find or create the user menu container
            let userMenuItem = navbar.querySelector('#userMenuContainer');
            
            if (!userMenuItem) {
                // Get balance element position
                const balanceItem = navbar.querySelector('#pctBalance')?.parentElement;
                const walletBtn = navbar.querySelector('#walletDisplay');
                
                // Get user data
                const user = await window.auth.getCurrentUser();
                if (!user) return;
                
                const username = user.username || 'User';
                
                // Create user menu item
                userMenuItem = document.createElement('li');
                userMenuItem.className = 'nav-item dropdown';
                userMenuItem.id = 'userMenuContainer';
                userMenuItem.style.position = 'relative';
                
                userMenuItem.innerHTML = `
                    <button class="btn btn-sm btn-outline-light dropdown-toggle" id="userMenuButton" 
                            type="button" data-bs-toggle="dropdown" aria-expanded="false"
                            style="min-width: 120px;">
                        ${username}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" id="userMenu" style="background: rgba(0,0,0,0.9); border: 1px solid rgba(0,255,157,0.3); min-width: 200px;">
                        <li><h6 class="dropdown-header text-success">Account</h6></li>
                        <li><span class="dropdown-item-text text-light" style="font-size: 0.85rem; padding: 0.5rem 1rem;">
                            <div>Username: <strong>${username}</strong></div>
                            ${user.metamask_address ? `<div class="text-success" style="font-size: 0.75rem; font-weight: 500;">Wallet: ${user.metamask_address.slice(0,6)}...${user.metamask_address.slice(-4)}</div>` : '<div class="text-warning" style="font-size: 0.75rem;">No wallet bound</div>'}
                        </span></li>
                        <li><hr class="dropdown-divider" style="border-color: rgba(0,255,157,0.2);"></li>
                        <li><button class="dropdown-item text-danger" id="logoutBtn" style="cursor: pointer;">
                            Logout
                        </button></li>
                    </ul>
                `;
                
                // Insert before wallet button or at end
                if (walletBtn && walletBtn.parentElement) {
                    walletBtn.parentElement.parentElement.insertBefore(userMenuItem, walletBtn.parentElement.nextSibling);
                } else if (balanceItem) {
                    navbar.insertBefore(userMenuItem, balanceItem.nextSibling);
                } else {
                    navbar.appendChild(userMenuItem);
                }
                
                // Hide wallet button since we're using username dropdown
                if (walletBtn) {
                    walletBtn.style.display = 'none';
                }
                
                // Add event listeners
                setupDropdownListeners();
            }
        }
    }

    function setupDropdownListeners() {
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.dataset.listenerAdded) {
            logoutBtn.dataset.listenerAdded = 'true';
            logoutBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to logout?')) {
                    if (window.wallet && window.wallet.disconnect) {
                        window.wallet.disconnect();
                    }
                    if (window.auth && window.auth.logout) {
                        await window.auth.logout();
                    }
                    window.location.href = 'login.html';
                }
            });
        }
    }

    // Update navbar display
    async function updateNavbarDisplay() {
        const userMenuButton = document.getElementById('userMenuButton');
        const userMenuContainer = document.getElementById('userMenuContainer');
        
        if (window.auth && window.auth.isAuthenticated()) {
            const user = await window.auth.getCurrentUser();
            if (user && userMenuButton) {
                userMenuButton.textContent = user.username || 'User';
            }
            if (userMenuContainer && userMenuContainer.style.display === 'none') {
                userMenuContainer.style.display = '';
            }
        } else {
            if (userMenuContainer) {
                userMenuContainer.style.display = 'none';
            }
        }
    }

    // Initialize on page load
    async function init() {
        // Wait for auth to load
        const checkAuth = setInterval(() => {
            if (typeof window.auth !== 'undefined') {
                clearInterval(checkAuth);
                initNavbarAuth();
            }
        }, 100);

        // Also try after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initNavbarAuth, 500);
            });
        } else {
            setTimeout(initNavbarAuth, 500);
        }
    }

    // Auto-initialize
    init();

    return {
        initNavbarAuth,
        updateNavbarDisplay
    };
})();
