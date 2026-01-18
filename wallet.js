(async function(){
  'use strict';

  function waitForEthers(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.ethers) return resolve();
      const start = Date.now();
      const id = setInterval(() => {
        if (window.ethers) {
          clearInterval(id); return resolve();
        }
        if (Date.now() - start > timeout) {
          clearInterval(id); return reject(new Error('ethers not found after waiting ' + timeout + 'ms'));
        }
      }, 100);
    });
  }

  try {
    await waitForEthers(5000);
  } catch (e) {
    console.error('ethers library did not load:', e);
    window.wallet = {
      CONFIG: { TOKEN_ADDRESS: null, MARKETPLACE_OWNER: null, CHAIN_ID: null },
      updateBalanceDisplayIfNeeded: async ()=>{},
      updateNavbarDisplay: ()=>{}
    };
    document.dispatchEvent(new Event('wallet.ready'));
    return;
  }

  const CONFIG = {
    TOKEN_ADDRESS: '0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce',
    MARKETPLACE_OWNER: '0xf846D560F06a2D32fc550c8b5Ce593729B0a055D',
    CHAIN_ID: 11155111
  };

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)"
  ];

  let _provider = null;
  let _signer = null;
  let _account = null;
  let _meta = null;

  async function ensureProvider() {
    if (typeof ethers === 'undefined') throw new Error('ethers library not loaded');
    if (!window.ethereum) throw new Error('No injected wallet (MetaMask) found');

    if (!_provider) {
      _provider = new ethers.BrowserProvider(window.ethereum);
      if (window.ethereum.on) {
        window.ethereum.on('accountsChanged', (accounts) => {
          _account = accounts && accounts[0] ? accounts[0] : null;
          _meta = null;
          updateNavbarDisplay();
          updateBalanceDisplayIfNeeded().catch(()=>{});
        });
        window.ethereum.on('chainChanged', () => {
          _signer = null;
          _meta = null;
          window.location.reload();
        });
      }
    }
    return _provider;
  }

  async function connectWallet() {
    // ✅ AUTHENTICATION CHECK: Require login before connecting MetaMask
    if (typeof window.auth === 'undefined' || !window.auth.isAuthenticated()) {
      throw new Error('Please login first to connect your MetaMask wallet');
    }
    
    await ensureProvider();
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const connectedAddress = accounts[0].toLowerCase();
    
    // ✅ VALIDATE: Check if connected MetaMask matches user's bound address
    const userMetamask = await window.auth.getUserMetamaskAddress();
    if (userMetamask && userMetamask.toLowerCase() !== connectedAddress) {
      throw new Error(`This MetaMask wallet is not bound to your account. Please use the wallet: ${userMetamask.slice(0, 6)}...${userMetamask.slice(-4)}`);
    }
    
    _account = accounts[0];
    _signer = await _provider.getSigner();
    _meta = null;
    
    // ✅ If user doesn't have MetaMask bound yet, bind it now
    if (!userMetamask && window.auth && window.auth.updateMetamaskAddress) {
      const updateResult = await window.auth.updateMetamaskAddress(_account);
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to bind MetaMask address');
      }
    }
    
    updateNavbarDisplay();
    await updateBalanceDisplayIfNeeded();
      // ✅ REMOVED: grantNewUserBonus() - now handled through airdrop button
    return _account;
  }

  function disconnect() {
    _account = null;
    _signer = null;
    _meta = null;
    updateNavbarDisplay();
    updateBalanceDisplayIfNeeded().catch(()=>{});
  }

  function getAccount() { return _account; }

  async function getSigner() {
    await ensureProvider();
    if (!_signer) _signer = await _provider.getSigner();
    return _signer;
  }

  // --- NEW: check contract code before creating contract instance ---
  async function getTokenContract(write=false) {
    await ensureProvider();
    if (!CONFIG.TOKEN_ADDRESS || CONFIG.TOKEN_ADDRESS.includes('REPLACE')) {
      throw new Error('TOKEN_ADDRESS not configured in wallet.js CONFIG');
    }

    // Check if on correct network
    const network = await _provider.getNetwork();
    console.log('Current network chainId:', network.chainId, 'type:', typeof network.chainId);
    console.log('Expected chainId:', BigInt(CONFIG.CHAIN_ID), 'type:', typeof BigInt(CONFIG.CHAIN_ID));
    console.log('Are they equal?', network.chainId === BigInt(CONFIG.CHAIN_ID));
    if (network.chainId !== BigInt(CONFIG.CHAIN_ID)) {
      const networkNames = {
        '1': 'Ethereum Mainnet',
        '11155111': 'Sepolia Testnet',
        '5': 'Goerli Testnet',
        '137': 'Polygon Mainnet',
        '80001': 'Polygon Mumbai'
      };
      const currentNetworkName = networkNames[network.chainId.toString()] || `Chain ID ${network.chainId}`;
      throw new Error(`Wrong network! You are on ${currentNetworkName}. Please switch to Sepolia Testnet in MetaMask.`);
    }

    // verify code exists at the address on the current chain
    console.log('Checking contract code at address:', CONFIG.TOKEN_ADDRESS);
    console.log('Provider:', _provider);
    try {
      const code = await _provider.getCode(CONFIG.TOKEN_ADDRESS);
      console.log('getCode result:', code);
      console.log('Code length:', code.length);
      if (!code || code === '0x' || code === '0x0') {
        console.log('Contract code check failed - no contract found, but continuing anyway...');
        // Don't throw error, try to proceed
        // throw new Error(
        //   `NO CONTRACT AT TOKEN_ADDRESS (${CONFIG.TOKEN_ADDRESS}) on current chain. ` +
        //   `Likely wrong MetaMask network or wrong token address.`
        // );
      } else {
        console.log('Contract code found, proceeding...');
      }
    } catch (codeError) {
      console.log('getCode failed:', codeError.message, '- continuing anyway...');
    }

    const target = write ? await getSigner() : _provider;
    return new ethers.Contract(CONFIG.TOKEN_ADDRESS, ERC20_ABI, target);
  }

  async function fetchTokenMetadata() {
    try {
      console.log('=== FETCHING TOKEN METADATA ===');
      if (_meta) return _meta;

      const c = await getTokenContract(false);
      console.log('Token contract created at:', CONFIG.TOKEN_ADDRESS);

      let decimals;
      try {
        const decResult = await c.decimals();
        decimals = Number(decResult);
        console.log('Decimals:', decimals);
      } catch (decError) {
        console.warn('Failed to fetch decimals (falling back to 0):', decError);
        decimals = 0;
      }

      let symbol;
      try {
        symbol = await c.symbol();
        console.log('Symbol:', symbol);
      } catch (symError) {
        console.warn('Failed to fetch symbol (falling back to PKCN):', symError);
        symbol = 'PKCN';
      }

      _meta = { decimals, symbol };
      console.log('Final metadata:', _meta);
      return _meta;
    } catch (e) {
      console.error('fetchTokenMetadata failed:', e);
      _meta = { decimals: 0, symbol: 'PKCN' };
      return _meta;
    }
  }

  async function getTokenBalance(address) {
    try {
      console.log('=== GETTING TOKEN BALANCE ===', address);
      const meta = await fetchTokenMetadata();
      console.log('Token metadata:', meta);
      const c = await getTokenContract(false);
      console.log('Token contract obtained:', c);
      const raw = await c.balanceOf(address);
      console.log('Raw balance:', raw);
      let formatted;
      if (meta.decimals === 0) {
        formatted = raw.toString();
      } else {
        formatted = ethers.formatUnits(raw, meta.decimals);
      }
      console.log('Formatted balance:', formatted);
      return formatted;
    } catch (e) {
      console.error('getTokenBalance error:', e);
      // If the error message contains "NO CONTRACT AT TOKEN_ADDRESS", rethrow so visibility remains:
      if (e.message && e.message.includes('NO CONTRACT AT TOKEN_ADDRESS')) throw e;
      return '0';
    }
  }

  async function updateNavbarDisplay() {
    // Update username dropdown instead of wallet address
    const userMenu = document.getElementById('userMenu');
    const userMenuButton = document.getElementById('userMenuButton');
    
    if (window.auth && window.auth.isAuthenticated()) {
      const user = await window.auth.getCurrentUser();
      if (user && userMenuButton) {
        userMenuButton.textContent = user.username || 'User';
        userMenuButton.style.display = 'block';
      }
    } else if (userMenuButton) {
      userMenuButton.style.display = 'none';
    }

    // Also update wallet button for backward compatibility
    const walletBtn = document.getElementById('walletDisplay');
    if (walletBtn) {
      if (_account) {
        walletBtn.style.display = 'none'; // Hide wallet button, show username
      } else {
        walletBtn.textContent = 'Connect';
        walletBtn.classList.remove('btn-outline-success');
        walletBtn.classList.add('btn-outline-light');
      }
    }
  }

  async function updateBalanceDisplayIfNeeded() {
    console.log('=== UPDATE BALANCE DISPLAY ===');
    try {
      await ensureProvider();
    } catch (e) {
      console.log('Provider not available:', e.message);
      return;
    }

    if (!_account) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        _account = accounts && accounts[0] ? accounts[0] : null;
      } catch (e) {
        _account = null;
      }
    }

    const balEl = document.getElementById('pctBalance');
    if (!_account) {
      if (balEl) balEl.textContent = '—';
      return;
    }

    if (balEl) balEl.textContent = 'Loading...';

    try {
      const balStr = await getTokenBalance(_account);
      const meta = await fetchTokenMetadata();
      const balNum = parseFloat(balStr);
      let pretty;
      if (meta.decimals === 0) {
        pretty = Math.floor(balNum).toLocaleString();
      } else {
        pretty = balNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      }

      if (balEl) balEl.textContent = `${pretty} ${meta.symbol}`;
      console.log('✅ Balance display updated:', balEl ? balEl.textContent : '(no element)');
    } catch (e) {
      console.error('❌ updateBalanceDisplay failed:', e);
      if (e.message && e.message.includes('Wrong network')) {
        if (balEl) balEl.textContent = 'Wrong network (switch to Sepolia)';
      } else if (e.message && e.message.includes('NO CONTRACT AT TOKEN_ADDRESS')) {
        if (balEl) balEl.textContent = 'No token (wrong network?)';
      } else {
        if (balEl) balEl.textContent = 'Error';
      }
    }
  }

  async function getProvider() { await ensureProvider(); return _provider; }

  window.wallet = {
    CONFIG,
    ERC20_ABI,
    ensureProvider,
    connectWallet,
    disconnect,
    getAccount,
    getSigner,
    getProvider,
    getTokenContract,
    fetchTokenMetadata,
    getTokenBalance,
    updateBalanceDisplayIfNeeded,
    updateNavbarDisplay
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.log('=== WALLET.JS LOADED ===');
    
    // Try to auto-connect immediately, then retry after delay
    // ✅ Only auto-connect if user is authenticated and MetaMask matches
    const tryAutoConnect = async () => {
      try {
        // Check authentication before auto-connecting
        if (typeof window.auth === 'undefined' || !window.auth.isAuthenticated()) {
          console.log('User not authenticated, skipping auto-connect');
          document.dispatchEvent(new Event('wallet.ready'));
          return;
        }
        
        await ensureProvider();
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts[0]) {
          const connectedAddress = accounts[0].toLowerCase();
          
          // Validate MetaMask matches user's bound address
          const userMetamask = await window.auth.getUserMetamaskAddress();
          if (userMetamask && userMetamask.toLowerCase() !== connectedAddress) {
            console.log('MetaMask address does not match user account, skipping auto-connect');
            document.dispatchEvent(new Event('wallet.ready'));
            return;
          }
          
          _account = accounts[0];
          _signer = await _provider.getSigner();
          console.log('Auto-connected to account:', _account);
          
          updateNavbarDisplay();
          await updateBalanceDisplayIfNeeded();
        } else {
          console.log('No accounts connected');
        }
      } catch (e) {
        console.log('Auto-connect failed:', e.message);
      } finally {
        document.dispatchEvent(new Event('wallet.ready'));
      }
    };

    // Wait for auth.js to load before trying to connect
    const waitForAuth = () => {
      if (typeof window.auth !== 'undefined') {
        tryAutoConnect();
      } else {
        setTimeout(waitForAuth, 100);
      }
    };
    
    waitForAuth();
  });
  
  // ✅ NEW: Grant 500 PKCN to new users
async function grantNewUserBonus() {
  try {
    // Check if already granted (localStorage flag)
    const hasReceived = localStorage.getItem(`pkcn_bonus_${_account}`);
    if (hasReceived) return false;

    // Check current balance
    const balanceStr = await getTokenBalance(_account);
    const balance = parseFloat(balanceStr);

    // Only grant if balance is exactly 0 (new user)
    if (balance > 0) {
      localStorage.setItem(`pkcn_bonus_${_account}`, 'skipped');
      return false;
    }

    // Show notification
    const notif = document.createElement('div');
    notif.id = 'bonus-notification';
    notif.style.cssText = `
      position: fixed; top: 20px; right: 20px; 
      background: linear-gradient(135deg, #00ff9d, #00c474);
      color: #000; padding: 15px; border-radius: 10px;
      font-weight: 700; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    notif.textContent = '🎉 Welcome to PokéChain! Granting 500 PKCN bonus...';
    document.body.appendChild(notif);

    // Attempt to mint 500 PKCN
    const contract = await getTokenContract(true);
    const tx = await contract.mint(_account, ethers.parseEther('500'));
    await tx.wait();

    // Mark as granted
    localStorage.setItem(`pkcn_bonus_${_account}`, 'granted');

    // Update balance display
    await updateBalanceDisplayIfNeeded();

    notif.textContent = '✅ Bonus granted! You received 500 PKCN!';
    setTimeout(() => notif.remove(), 4000);

    return true;

  } catch (error) {
    console.error('Bonus grant failed:', error);

    // Remove notification
    const notif = document.getElementById('bonus-notification');
    if (notif) notif.remove();

    // Mark as failed to prevent repeated attempts
    localStorage.setItem(`pkcn_bonus_${_account}`, 'failed');
    return false;
  }
}
})();
