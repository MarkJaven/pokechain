// =========================================
// AUTHENTICATION MODULE FOR POKECHAIN
// Handles user login, signup, and session management with cookies
// =========================================

window.auth = (function() {
    'use strict';

    const SESSION_COOKIE_NAME = 'pokechain_session_token';
    const USER_COOKIE_NAME = 'pokechain_user_data';

    // Initialize Supabase client
    let supabaseClient = null;
    
    function initSupabase() {
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase library not loaded');
            return null;
        }
        
        if (!supabaseClient) {
            supabaseClient = window.supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
        }
        return supabaseClient;
    }

    // Cookie helper functions
    function setCookie(name, value, days = 7) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    function deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
    }

    // Hash password
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // Generate session token
    function generateSessionToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Save session to cookies
    function saveSession(userId, sessionToken, userData) {
        setCookie(SESSION_COOKIE_NAME, sessionToken, 7);
        setCookie(USER_COOKIE_NAME, JSON.stringify(userData), 7);
        
        // Also save to localStorage for backward compatibility
        localStorage.setItem('pokechain_session', JSON.stringify({
            userId: userId,
            token: sessionToken,
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
        }));
        localStorage.setItem('pokechain_user', JSON.stringify(userData));
    }

    // Get current session
    function getSession() {
        const token = getCookie(SESSION_COOKIE_NAME);
        if (!token) {
            // Try localStorage for backward compatibility
            const sessionStr = localStorage.getItem('pokechain_session');
            if (sessionStr) {
                try {
                    const session = JSON.parse(sessionStr);
                    if (session.expiresAt < Date.now()) {
                        clearSession();
                        return null;
                    }
                    return session;
                } catch (e) {
                    clearSession();
                    return null;
                }
            }
            return null;
        }
        return { token };
    }

    // Clear session
    function clearSession() {
        deleteCookie(SESSION_COOKIE_NAME);
        deleteCookie(USER_COOKIE_NAME);
        localStorage.removeItem('pokechain_session');
        localStorage.removeItem('pokechain_user');
    }

    // Check if user is authenticated
    function isAuthenticated() {
        const session = getSession();
        return session !== null;
    }

    // Get current user
    async function getCurrentUser() {
        const userStr = getCookie(USER_COOKIE_NAME);
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        
        // Try localStorage for backward compatibility
        const userStrLocal = localStorage.getItem('pokechain_user');
        if (userStrLocal) {
            try {
                return JSON.parse(userStrLocal);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    // Check if MetaMask address is already bound to another user
    async function isMetamaskBound(metamaskAddress) {
        try {
            const client = initSupabase();
            if (!client) return false;

            const { data, error } = await client
                .from('users')
                .select('id, username')
                .eq('metamask_address', metamaskAddress.toLowerCase())
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw error;
            }

            return data !== null ? data : null;
        } catch (error) {
            console.error('Error checking MetaMask binding:', error);
            return null;
        }
    }

    // Sign up new user with MetaMask binding
    async function signup(username, password, email = null, metamaskAddress) {
        try {
            if (!metamaskAddress) {
                throw new Error('MetaMask address is required for signup');
            }

            const client = initSupabase();
            if (!client) {
                throw new Error('Supabase client not initialized');
            }

            // Check if MetaMask is already bound
            const existingUser = await isMetamaskBound(metamaskAddress);
            if (existingUser) {
                throw new Error('This MetaMask wallet is already bound to another account. Please use a different wallet or login with that account.');
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Insert user into database
            const { data, error } = await client
                .from('users')
                .insert([
                    {
                        username: username,
                        email: email,
                        password_hash: passwordHash,
                        metamask_address: metamaskAddress.toLowerCase(),
                        is_active: true
                    }
                ])
                .select()
                .single();

            if (error) {
                throw error;
            }

            // Create session
            const sessionToken = generateSessionToken();
            const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

            // Save session to database
            const { error: sessionError } = await client
                .from('user_sessions')
                .insert([
                    {
                        user_id: data.id,
                        session_token: sessionToken,
                        expires_at: expiresAt.toISOString()
                    }
                ]);

            if (sessionError) {
                console.warn('Session creation failed:', sessionError);
            }

            const userData = {
                id: data.id,
                username: data.username,
                email: data.email,
                metamask_address: data.metamask_address
            };

            // Clear old user data before saving new session
            await clearOldUserDataOnLogin();
            
            // Save to cookies and localStorage
            saveSession(data.id, sessionToken, userData);

            return { success: true, user: userData };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }

    // Login user and validate MetaMask
    async function login(username, password, metamaskAddress = null) {
        try {
            const client = initSupabase();
            if (!client) {
                throw new Error('Supabase client not initialized');
            }

            // Hash password to compare
            const passwordHash = await hashPassword(password);

            // Find user by username
            const { data: users, error } = await client
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('is_active', true)
                .limit(1);

            if (error) {
                throw error;
            }

            if (!users || users.length === 0) {
                throw new Error('Invalid username or password');
            }

            const user = users[0];

            // Compare password hashes
            if (user.password_hash !== passwordHash) {
                throw new Error('Invalid username or password');
            }

            // If MetaMask address provided, validate it matches the user's bound address
            if (metamaskAddress) {
                const userMetamask = user.metamask_address?.toLowerCase();
                const providedMetamask = metamaskAddress.toLowerCase();
                
                if (!userMetamask) {
                    // User doesn't have MetaMask bound yet - bind it now
                    const { error: updateError } = await client
                        .from('users')
                        .update({ metamask_address: providedMetamask })
                        .eq('id', user.id);

                    if (updateError) {
                        throw new Error('Failed to bind MetaMask address');
                    }
                    user.metamask_address = providedMetamask;
                } else if (userMetamask !== providedMetamask) {
                    throw new Error('This MetaMask wallet is not bound to this account. Please use the correct wallet or contact support.');
                }
            } else if (user.metamask_address) {
                throw new Error('Please connect the MetaMask wallet bound to this account to login.');
            }

            // Update last login
            await client
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', user.id);

            // Create session
            const sessionToken = generateSessionToken();
            const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

            // Save session to database
            const { error: sessionError } = await client
                .from('user_sessions')
                .insert([
                    {
                        user_id: user.id,
                        session_token: sessionToken,
                        expires_at: expiresAt.toISOString()
                    }
                ]);

            if (sessionError) {
                console.warn('Session creation failed:', sessionError);
            }

            const userData = {
                id: user.id,
                username: user.username,
                email: user.email,
                metamask_address: user.metamask_address
            };

            // Clear old user data before saving new session
            await clearOldUserDataOnLogin();
            
            // Save to cookies and localStorage
            saveSession(user.id, sessionToken, userData);

            return { success: true, user: userData };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear all user-specific localStorage data
    function clearUserLocalStorage() {
        try {
            // Get current user ID before clearing session
            const user = getCurrentUserSync();
            const userId = user ? user.id : null;
            
            // Clear all user-specific data
            const keysToRemove = [
                'pokechain_tx_history_v2',
                'pokechain_tx_history', // old key
                'tournamentHistory',
                'battleHistory',
                'unclaimedRewardsLocal'
            ];
            
            // If we have userId, also clear user-specific keys
            if (userId) {
                keysToRemove.push(`pokechain_tx_history_v2_user_${userId}`);
                keysToRemove.push(`tournamentHistory_user_${userId}`);
                keysToRemove.push(`battleHistory_user_${userId}`);
                keysToRemove.push(`unclaimedRewardsLocal_user_${userId}`);
            }
            
            // Remove all keys (both global and user-specific)
            keysToRemove.forEach(key => {
                try {
                    localStorage.removeItem(key);
                } catch (e) {
                    // Ignore errors for individual key removal
                }
            });
            
            // Also remove any localStorage keys that match our patterns
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (key.includes('tx_history') || 
                    key.includes('tournamentHistory') || 
                    key.includes('battleHistory') ||
                    key.includes('unclaimedRewardsLocal')) {
                    try {
                        localStorage.removeItem(key);
                    } catch (e) {
                        // Ignore errors
                    }
                }
            });
            
            console.log('Cleared user-specific localStorage data');
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }
    
    // Get current user synchronously (for use before async operations)
    function getCurrentUserSync() {
        const userStr = getCookie(USER_COOKIE_NAME) || localStorage.getItem('pokechain_user');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    // Logout user
    async function logout() {
        try {
            // Clear user-specific localStorage BEFORE clearing session
            clearUserLocalStorage();
            
            const session = getSession();
            if (session) {
                const client = initSupabase();
                if (client && session.token) {
                    // Delete session from database
                    await client
                        .from('user_sessions')
                        .delete()
                        .eq('session_token', session.token);
                }
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            clearSession();
        }
    }
    
    // Clear old user data on login (when switching users)
    async function clearOldUserDataOnLogin() {
        try {
            // Clear all potential user-specific keys (to prevent data leakage)
            const keysToCheck = Object.keys(localStorage);
            const userDataKeys = keysToCheck.filter(key => 
                key.includes('tx_history') || 
                key.includes('tournamentHistory') || 
                key.includes('battleHistory') ||
                key.includes('unclaimedRewardsLocal')
            );
            
            userDataKeys.forEach(key => {
                // Only clear if it's not user-specific (doesn't contain _user_)
                if (!key.includes('_user_')) {
                    localStorage.removeItem(key);
                }
            });
            
            console.log('Cleared old user data on login');
        } catch (error) {
            console.error('Error clearing old user data:', error);
        }
    }

    // Update MetaMask address (only if not already bound to another user)
    async function updateMetamaskAddress(address) {
        try {
            const session = getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            const user = await getCurrentUser();
            if (!user) {
                throw new Error('User data not found');
            }

            const client = initSupabase();
            if (!client) {
                throw new Error('Supabase client not initialized');
            }

            // Check if this address is bound to another user
            const existingUser = await isMetamaskBound(address);
            if (existingUser && existingUser.id !== user.id) {
                throw new Error('This MetaMask wallet is already bound to another account.');
            }

            // Update in database
            const { error } = await client
                .from('users')
                .update({ metamask_address: address.toLowerCase() })
                .eq('id', user.id);

            if (error) {
                throw error;
            }

            // Update user data in cookies
            user.metamask_address = address.toLowerCase();
            const userStr = getCookie(USER_COOKIE_NAME);
            if (userStr) {
                setCookie(USER_COOKIE_NAME, JSON.stringify(user), 7);
                localStorage.setItem('pokechain_user', JSON.stringify(user));
            }

            return { success: true };
        } catch (error) {
            console.error('Update MetaMask address error:', error);
            return { success: false, error: error.message };
        }
    }

    // Verify session with server
    async function verifySession() {
        try {
            const session = getSession();
            if (!session) {
                return false;
            }

            const client = initSupabase();
            if (!client) {
                return false;
            }

            // Check if session exists in database
            const { data, error } = await client
                .from('user_sessions')
                .select('*, users(*)')
                .eq('session_token', session.token)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (error || !data) {
                clearSession();
                return false;
            }

            // Update user in cookies
            if (data.users) {
                const userData = {
                    id: data.users.id,
                    username: data.users.username,
                    email: data.users.email,
                    metamask_address: data.users.metamask_address
                };
                setCookie(USER_COOKIE_NAME, JSON.stringify(userData), 7);
                localStorage.setItem('pokechain_user', JSON.stringify(userData));
            }

            return true;
        } catch (error) {
            console.error('Session verification error:', error);
            clearSession();
            return false;
        }
    }

    // Require authentication - redirects to login if not authenticated
    async function requireAuth() {
        const authenticated = await verifySession();
        if (!authenticated) {
            const currentPath = window.location.pathname;
            
            // Only redirect if not already on login/signup page
            if (!currentPath.includes('login.html') && !currentPath.includes('signup.html')) {
                // Use relative path instead of absolute path for better compatibility
                window.location.href = 'login.html?redirect=' + encodeURIComponent(currentPath);
            }
            return false;
        }
        return true;
    }

    // Get MetaMask address for current user
    async function getUserMetamaskAddress() {
        const user = await getCurrentUser();
        return user ? user.metamask_address : null;
    }

    // Initialize auth on page load
    async function init() {
        initSupabase();
        // Verify session on load
        await verifySession();
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        signup,
        login,
        logout,
        isAuthenticated,
        getCurrentUser,
        updateMetamaskAddress,
        requireAuth,
        verifySession,
        getSession,
        getUserMetamaskAddress,
        isMetamaskBound,
        getCurrentUserSync
    };
})();

// Helper function to get user-specific localStorage key
window.getUserStorageKey = function(baseKey) {
    if (window.auth && window.auth.getCurrentUserSync) {
        const user = window.auth.getCurrentUserSync();
        if (user && user.id) {
            return `${baseKey}_user_${user.id}`;
        }
    }
    return baseKey;
};
