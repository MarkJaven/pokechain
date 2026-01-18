document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  let TOKEN_DECIMALS = 18;

  // Add at top of marketplace.js after TOKEN_DECIMALS declaration
async function parsePriceWithCorrectDecimals(price) {
  // Wait for decimals to load if not yet initialized
  if (TOKEN_DECIMALS === null) {
    await loadTokenDecimals();
  }
  return ethers.parseUnits(String(price), TOKEN_DECIMALS);
}

async function formatPriceWithCorrectDecimals(priceRaw) {
  if (TOKEN_DECIMALS === null) {
    await loadTokenDecimals();
  }
  return ethers.formatUnits(priceRaw, TOKEN_DECIMALS) + ' PKCN';
}

  // ===== State Management =====
  let pendingPurchases = new Set();
  let pendingTransactionHashes = new Set();
  let activeListings = new Map();
  let recentlyPurchasedListings = new Set();
  let playerListingsLoaded = false;

  // ===== PAGINATION STATE =====
  let officialCurrentPage = 1;
  let officialItemsPerPage = 12;
  let officialTotalPages = 1;
  
  let playerCurrentPage = 1;
  let playerItemsPerPage = 12;
  let playerTotalPages = 1;

  // ===== Enhanced Transaction History =====
  class TransactionHistory {
    constructor() {
      this.baseKey = 'pokechain_tx_history_v2';
      this.key = window.getUserStorageKey ? window.getUserStorageKey(this.baseKey) : this.baseKey;
      this.notifications = this.load();
      this.maxItems = 100;
    }

    load() {
      try {
        // Use user-specific key
        const userKey = window.getUserStorageKey ? window.getUserStorageKey(this.baseKey) : this.baseKey;
        let saved = localStorage.getItem(userKey);
        
        // If no user-specific data, try old key and migrate
        if (!saved) {
          const old = localStorage.getItem(this.baseKey);
          if (old) {
            const oldData = JSON.parse(old);
            // Migrate to user-specific key
            localStorage.setItem(userKey, JSON.stringify(oldData.map(tx => ({
              ...tx,
              tokenAmount: tx.tokenAmount || null,
              gasFee: tx.gasFee || null,
              nftId: tx.nftId || null,
              fromAddress: tx.fromAddress || null,
              toAddress: tx.toAddress || null,
              read: true
            }))));
            localStorage.removeItem(this.baseKey);
            saved = localStorage.getItem(userKey);
          }
          
          // Also check very old key
          const veryOld = localStorage.getItem('pokechain_tx_history');
          if (veryOld && !saved) {
            const oldData = JSON.parse(veryOld);
            localStorage.setItem(userKey, JSON.stringify(oldData.map(tx => ({
              ...tx,
              tokenAmount: null,
              gasFee: null,
              nftId: null,
              fromAddress: null,
              toAddress: null,
              read: true
            }))));
            localStorage.removeItem('pokechain_tx_history');
            saved = localStorage.getItem(userKey);
          }
        }
        
        const loaded = saved ? JSON.parse(saved) : [];
        console.log(`💾 Loaded ${loaded.length} transactions from history (user-specific)`);
        return loaded;
      } catch {
        console.warn('⚠️ Failed to load transaction history');
        return [];
      }
    }

    save() {
      try {
        const userKey = window.getUserStorageKey ? window.getUserStorageKey(this.baseKey) : this.baseKey;
        const trimmed = this.notifications.slice(-this.maxItems);
        localStorage.setItem(userKey, JSON.stringify(trimmed));
        console.log(`💾 Saved ${trimmed.length} transactions to history (user-specific)`);
      } catch (e) {
        console.error('❌ Failed to save transaction history:', e);
      }
    }

    add(tx) {
      const isDuplicate = this.notifications.some(existing =>
        existing.type === tx.type &&
        existing.nftId === tx.nftId &&
        Math.abs(existing.timestamp - Date.now()) < 60000
      );

      if (isDuplicate) {
        console.warn(`⚠️ Duplicate transaction prevented for ${tx.type} NFT #${tx.nftId}`);
        return null;
      }

      const notification = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        hash: tx.hash || null,
        type: tx.type || 'transaction',
        title: tx.title || 'Transaction',
        message: tx.message || '',
        details: tx.details || {},
        status: tx.status || 'pending',
        tokenAmount: tx.tokenAmount || null,
        gasFee: tx.gasFee || null,
        nftId: tx.nftId || null,
        fromAddress: tx.fromAddress || null,
        toAddress: tx.toAddress || null,
        timestamp: tx.timestamp || Date.now(),
        timestampISO: tx.timestampISO || new Date().toISOString(),
        read: false
      };

      this.notifications.push(notification);
      this.save();
      this.updateUI();
      console.log(`➕ Transaction ADDED: ${notification.type} - ${notification.title}, nftId: ${notification.nftId}`);
      return notification.id;
    }

    update(id, updates) {
      const index = this.notifications.findIndex(n => n.id === id);
      if (index !== -1) {
        const original = this.notifications[index];
        this.notifications[index] = { ...original, ...updates };
        if (original.nftId && !updates.hasOwnProperty('nftId')) {
          this.notifications[index].nftId = original.nftId;
        }
        this.save();
        this.updateUI();
        console.log(`🔄 Transaction UPDATED: ${id}, status: ${updates.status}, nftId: ${this.notifications[index].nftId}`);
      } else {
        console.warn(`⚠️ Transaction not found for update: ${id}`);
      }
    }

    getAll() {
      const all = [...this.notifications].reverse();
      console.log(`📊 TransactionHistory.getAll() called, returning ${all.length} items`);
      return all;
    }

    getFiltered(type = 'all') {
      let filtered = this.getAll();
      console.log(`🔍 Filtering transactions by type: ${type}, total before filter: ${filtered.length}`);

      if (type !== 'all') {
        filtered = filtered.filter(tx => {
          if (type === 'buy') {
            return ['purchase', 'marketplace_purchase'].includes(tx.type);
          } else if (type === 'sell') {
            return tx.type === 'marketplace_purchase';
          } else if (type === 'delist') {
            return tx.type === 'delist';
          } else if (type === 'list') {
            return tx.type === 'list';
          } else {
            return tx.status === type;
          }
        });
      }

      console.log(`🔍 After filter: ${filtered.length} items`);
      return filtered;
    }

    getUnreadCount() {
      return this.notifications.filter(n => !n.read).length;
    }

    markAsRead(id) {
      this.update(id, { read: true });
    }

    markAllAsRead() {
      this.notifications.forEach(n => n.read = true);
      this.save();
      this.updateUI();
    }

    updateUI() {
      this.updateBadge();
    }

    updateBadge() {
      const badge = document.getElementById('notificationBadge');
      const count = this.getUnreadCount();
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    }

    static formatGas(gasUsed, gasPrice) {
      try {
        const gas = BigInt(gasUsed) * BigInt(gasPrice);
        return ethers.formatEther(gas.toString());
      } catch {
        return '0';
      }
    }
  }

  if (!window.txHistory) {
    window.txHistory = new TransactionHistory();
  }

  // ===== Utility Functions =====
  function ipfsToHttp(uri) {
    if (!uri) return '';
    return uri.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + uri.slice(7) : uri;
  }

  function shortAddress(addr) {
    try { return addr.slice(0, 6) + '...' + addr.slice(-4); } catch { return addr; }
  }

  function formatPrice(priceRaw) {
    try {
      const bn = BigInt(priceRaw);
      return ethers.formatUnits(bn, TOKEN_DECIMALS) + ' PKCN';
    } catch {
      return String(priceRaw) + ' PKCN';
    }
  }

  async function parseTokenURI(uri) {
    try {
      if (!uri) return null;
      if (uri.startsWith('data:application/json;base64,')) {
        const b64 = uri.split(',')[1];
        const txt = atob(b64);
        return JSON.parse(txt);
      }
      const res = await fetch(uri);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('parseTokenURI failed', e);
      return null;
    }
  }

  async function cleanupLegacyListings() {
    try {
      const saved = localStorage.getItem('recentlyPurchasedListings');
      const legacy = saved ? JSON.parse(saved) : [];
      legacy.forEach(id => recentlyPurchasedListings.add(id));
      console.log(`🧹 Cleaned up ${legacy.length} legacy listings`);
    } catch (e) {
      console.warn('Legacy cleanup failed:', e);
    }
  }

  async function callWithManualGas(contract, method, args = [], options = {}) {
    try {
      return await contract[method](...args);
    } catch (e) {
      if (e.code === 'UNPREDICTABLE_GAS_LIMIT' || e.code === 'CALL_EXCEPTION') {
        console.warn(`Gas estimation failed for ${method}, using manual limit`);
        return await contract[method](...args, { gasLimit: options.gasLimit || 100000 });
      }
      throw e;
    }
  }

  // ===== DOM Elements & State =====
  const marketGrid = document.getElementById('officialMarketGrid');
  const playerListingsGrid = document.getElementById('playerListingsGrid');
  const loader = document.getElementById('loader');
  const playerListingsLoader = document.getElementById('playerListingsLoader');
  const fetchMoreBtn = document.getElementById('fetchMoreBtn');
  
  // Unified filter elements (shared between marketplaces)
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const rarityFilter = document.getElementById('rarityFilter');
  const sortSelect = document.getElementById('sortSelect');
  const applyFiltersBtn = document.getElementById('applyFilters');

  // Pagination elements
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfoEl = document.getElementById('pageInfo');
  
  const playerPrevPageBtn = document.getElementById('playerPrevPage');
  const playerNextPageBtn = document.getElementById('playerNextPage');
  const playerPageInfoEl = document.getElementById('playerPageInfo');

  const pokeCache = new Map();

  // ===== Pricing & Rarity Helpers =====
  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
  }

  function rarityClassLabel(r) {
    return r ? String(r).toLowerCase().trim() : 'common';
  }

  function computeMockPrice(p) {
    const rarity = computeRarity(p.base_experience || 0);
    const idFactor = (p.id % 50);
    switch (rarity) {
      case 'Common': return Math.max(100, 100 + Math.round((p.base_experience || 10) * 1.2) + idFactor);
      case 'Uncommon': return Math.max(300, 300 + Math.round((p.base_experience || 30) * 1.5) + idFactor);
      case 'Rare': return Math.max(700, 700 + Math.round((p.base_experience || 60) * 2.0) + idFactor);
      case 'Epic': return Math.max(1200, 1200 + Math.round((p.base_experience || 100) * 2.3) + idFactor);
      case 'Legendary': return Math.max(1500, 1500 + Math.round((p.base_experience || 200) * 3.0) + idFactor);
      default: return 200;
    }
  }

  async function loadTypes() {
    if (!typeFilter) return;
    try {
      const res = await fetch('https://pokeapi.co/api/v2/type');
      const json = await res.json();
      json.results.filter(t => !['unknown', 'shadow'].includes(t.name)).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name; // Already lowercase from API
        opt.textContent = t.name;
        typeFilter.appendChild(opt);
      });
    } catch (err) {
      console.error('loadTypes error', err);
    }
  }

  async function loadTokenDecimals() {
  try {
    const provider = await window.wallet.getProvider();
    const token = new ethers.Contract(window.CONTRACTS.PKCN, window.ABIS.PKCN, provider);
    const decimalsBN = await token.decimals();
    TOKEN_DECIMALS = Number(decimalsBN.toString());
    console.log(`✅ Token decimals loaded: ${TOKEN_DECIMALS}`);
    
    // Save to localStorage for emergency fallback
    localStorage.setItem('pkcn_decimals', TOKEN_DECIMALS.toString());
  } catch (e) {
    // Try loading from localStorage first
    const saved = localStorage.getItem('pkcn_decimals');
    if (saved) {
      TOKEN_DECIMALS = parseInt(saved);
      console.log(`✅ Token decimals loaded from cache: ${TOKEN_DECIMALS}`);
    } else {
      console.warn('Failed to fetch token decimals, defaulting to 0');
      TOKEN_DECIMALS = 0; // ✅ Default to 0 for your token
    }
  }
}

  async function loadGen1And2Pokemon() {
    if (loader) loader.style.display = 'flex';
    try {
      const fetchPromises = [];
      for (let i = 1; i <= 251; i++) {
        fetchPromises.push(
          fetch(`https://pokeapi.co/api/v2/pokemon/${i}`)
            .then(res => res.json())
            .catch(() => null)
        );
      }

      const results = await Promise.all(fetchPromises);
      const validResults = results.filter(p => p !== null);

      validResults.forEach(p => pokeCache.set(p.id, p));
      renderOfficialGrid();
    } catch (e) {
      console.error('loadGen1And2Pokemon error', e);
      window.txModal?.error('Load Failed', 'Failed to load Pokémon. Please try again.');
    } finally {
      if (loader) loader.style.display = 'none';
      if (fetchMoreBtn) fetchMoreBtn.style.display = 'none';
    }
  }

  async function fetchRemainingSupplyForRarity(rarity) {
    try {
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT, window.ABIS.POKEMON_NFT, provider);
      const remain = await nft.remainingSupply(rarity);
      return Number(remain.toString());
    } catch (e) {
      console.warn('fetchRemainingSupplyForRarity failed', e);
      return '—';
    }
  }

  // ===== UPDATED: Official Marketplace with Pagination & Rarity Filter =====
// ===== FIX: Official Marketplace Grid - Use Player Marketplace Logic =====
function renderOfficialGrid() {
  if (!marketGrid) return;

  const q = (searchInput?.value || '').trim().toLowerCase();
  const type = (typeFilter?.value || '').toLowerCase(); // ✅ Normalize to lowercase
  const rarity = (rarityFilter?.value || '');
  const sortBy = (sortSelect?.value || 'id');

  console.log(`🔍 Official marketplace filters - search: "${q}", type: "${type}", rarity: "${rarity}", sort: "${sortBy}"`);

  let items = Array.from(pokeCache.values());
  
  // Apply search filter
  if (q) {
    items = items.filter(p => (p.name && p.name.toLowerCase().includes(q)) || String(p.id) === q);
  }
  
  // ✅ FIX: Type filter with enhanced debugging (copied from player logic)
  if (type) {
    items = items.filter(p => {
      const types = p.types || [];
      
      // Debug logging
      console.log(`Pokemon #${p.id} ${p.name} types:`, types.map(t => t.type.name), 'Looking for:', type);
      
      // Ensure types is an array
      if (!Array.isArray(types)) {
        console.warn(`Invalid types data for Pokemon #${p.id}:`, types);
        return false;
      }
      
      // Check if any type matches (case-insensitive)
      const hasMatch = types.some(t => {
        if (!t || !t.type || typeof t.type.name !== 'string') return false;
        return t.type.name.toLowerCase() === type;
      });
      
      console.log(`Pokemon #${p.id} matches type ${type}:`, hasMatch);
      return hasMatch;
    });
  }
  
  // Apply rarity filter
  if (rarity) {
    items = items.filter(p => computeRarity(p.base_experience || 0) === rarity);
  }

  // Transform items with computed values
  items = items.map(p => ({
    ...p,
    price: computeMockPrice(p),
    rarity: computeRarity(p.base_experience || 0)
  }));

  // Apply sorting
  items.sort((a, b) => {
    if (sortBy === 'id') return a.id - b.id;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'price') return a.price - b.price;
    return 0;
  });

  // Calculate pagination
  officialTotalPages = Math.ceil(items.length / officialItemsPerPage) || 1;
  const startIndex = (officialCurrentPage - 1) * officialItemsPerPage;
  const endIndex = startIndex + officialItemsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  console.log(`📊 Rendering ${paginatedItems.length} items (page ${officialCurrentPage} of ${officialTotalPages})`);

  // Render grid
  marketGrid.innerHTML = '';
  paginatedItems.forEach(p => marketGrid.appendChild(makeOfficialCard(p)));
  
  updatePaginationControls('official', items.length);
}

// ===== Player Marketplace Grid (unchanged, working version) =====
async function renderPlayerMarketplaceGrid() {
  if (!playerListingsGrid) return;

  const q = (searchInput?.value || '').trim().toLowerCase();
  const type = (typeFilter?.value || '').toLowerCase();
  const rarity = (rarityFilter?.value || '');
  const sortBy = (sortSelect?.value || 'id');

  console.log(`🔍 Player marketplace filters - search: "${q}", type: "${type}", rarity: "${rarity}", sort: "${sortBy}"`);

  let items = Array.from(activeListings.values());
  
  // Apply search filter
  if (q) {
    items = items.filter(listing => {
      const meta = listing.metadata || {};
      const name = meta.name?.toLowerCase() || '';
      const tokenId = listing.tokenId?.toString() || '';
      const pokemonId = meta.pokemonId?.toString() || '';
      return name.includes(q) || tokenId.includes(q) || pokemonId.includes(q);
    });
  }
  
  // Apply type filter
  if (type) {
    items = items.filter(listing => {
      const meta = listing.metadata || {};
      const types = meta.types || [];
      
      // Debug logging
      console.log(`Listing #${listing.tokenId} types:`, types, 'Looking for:', type);
      
      // Ensure types is an array
      if (!Array.isArray(types)) {
        console.warn(`Invalid types data for listing #${listing.tokenId}:`, types);
        return false;
      }
      
      // Check if any type matches (case-insensitive)
      const hasMatch = types.some(t => {
        if (!t || typeof t !== 'string') return false;
        return t.toLowerCase() === type;
      });
      
      console.log(`Listing #${listing.tokenId} matches type ${type}:`, hasMatch);
      return hasMatch;
    });
  }
  
  // Apply rarity filter
  if (rarity) {
    items = items.filter(listing => {
      const meta = listing.metadata || {};
      return (meta.rarity || 'Common') === rarity;
    });
  }

  // Apply sorting
  items.sort((a, b) => {
    const metaA = a.metadata || {};
    const metaB = b.metadata || {};
    
    if (sortBy === 'id') return Number(a.tokenId) - Number(b.tokenId);
    if (sortBy === 'name') {
      const nameA = metaA.name || `Token #${a.tokenId}`;
      const nameB = metaB.name || `Token #${b.tokenId}`;
      return nameA.localeCompare(nameB);
    }
    if (sortBy === 'price') {
      return Number(a.price) - Number(b.price);
    }
    return 0;
  });

  // Calculate pagination
  playerTotalPages = Math.ceil(items.length / playerItemsPerPage) || 1;
  const startIndex = (playerCurrentPage - 1) * playerItemsPerPage;
  const endIndex = startIndex + playerItemsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  console.log(`📊 Rendering ${paginatedItems.length} items (page ${playerCurrentPage} of ${playerTotalPages})`);

  // Render cards
  playerListingsGrid.innerHTML = '';
  const cardPromises = paginatedItems.map(listing => makeListingCard(listing));
  const cards = await Promise.all(cardPromises);
  cards.forEach(card => playerListingsGrid.appendChild(card));
  
  updatePaginationControls('player', items.length);
}
  // ===== NEW: Update Pagination Controls =====
  function updatePaginationControls(marketplaceType, totalItems) {
    if (marketplaceType === 'official') {
      const totalPages = Math.ceil(totalItems / officialItemsPerPage) || 1;
      
      if (prevPageBtn) {
        prevPageBtn.disabled = officialCurrentPage <= 1;
        prevPageBtn.onclick = () => changePage('official', officialCurrentPage - 1);
      }
      
      if (nextPageBtn) {
        nextPageBtn.disabled = officialCurrentPage >= totalPages;
        nextPageBtn.onclick = () => changePage('official', officialCurrentPage + 1);
      }
      
      if (pageInfoEl) {
        pageInfoEl.textContent = `Page ${officialCurrentPage} of ${totalPages}`;
      }
      
      const paginationContainer = document.getElementById('paginationControls');
      if (paginationContainer) {
        paginationContainer.style.display = totalItems > officialItemsPerPage ? 'flex' : 'none';
      }
    } else if (marketplaceType === 'player') {
      const totalPages = Math.ceil(totalItems / playerItemsPerPage) || 1;
      
      if (playerPrevPageBtn) {
        playerPrevPageBtn.disabled = playerCurrentPage <= 1;
        playerPrevPageBtn.onclick = () => changePage('player', playerCurrentPage - 1);
      }
      
      if (playerNextPageBtn) {
        playerNextPageBtn.disabled = playerCurrentPage >= totalPages;
        playerNextPageBtn.onclick = () => changePage('player', playerCurrentPage + 1);
      }
      
      if (playerPageInfoEl) {
        playerPageInfoEl.textContent = `Page ${playerCurrentPage} of ${totalPages}`;
      }
      
      const paginationContainer = document.getElementById('playerPaginationControls');
      if (paginationContainer) {
        paginationContainer.style.display = totalItems > playerItemsPerPage ? 'flex' : 'none';
      }
    }
  }

  // ===== NEW: Change Page =====
  function changePage(marketplaceType, newPage) {
    if (marketplaceType === 'official') {
      const totalPages = Math.ceil(Array.from(pokeCache.values()).length / officialItemsPerPage) || 1;
      if (newPage < 1 || newPage > totalPages) return;
      officialCurrentPage = newPage;
      renderOfficialGrid();
    } else if (marketplaceType === 'player') {
      const totalPages = Math.ceil(Array.from(activeListings.values()).length / playerItemsPerPage) || 1;
      if (newPage < 1 || newPage > totalPages) return;
      playerCurrentPage = newPage;
      renderPlayerMarketplaceGrid();
    }
  }

  async function fetchPokemonDescription(pokemonName) {
    const cacheKey = pokemonName.toLowerCase() + '_desc';
    if (pokeCache.has(cacheKey)) {
      return pokeCache.get(cacheKey);
    }

    try {
      const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonName.toLowerCase()}`);
      if (!speciesRes.ok) return "A mysterious Pokémon with unknown abilities.";

      const speciesData = await speciesRes.json();

      const flavorText = speciesData.flavor_text_entries?.find(
        entry => entry.language.name === 'en'
      );
      console.log(`Fetched description for ${pokemonName}:`, flavorText ? flavorText.flavor_text : 'No description found');

      const description = flavorText
        ? flavorText.flavor_text.replace(/\n|\f/g, ' ')
        : "A mysterious Pokémon with unknown abilities.";

      pokeCache.set(cacheKey, description);
      return description;
    } catch (e) {
      console.warn(`Failed to fetch description for ${pokemonName}:`, e);
      return "A mysterious Pokémon with unknown abilities.";
    }
  }

  async function showBuyModal(pokemon) {
    const confirmed = await window.txModal.confirm({
      title: 'Buy Pokémon',
      message: `Confirm purchase of this Pokémon?`,
      details: [
        { label: 'Pokémon', value: `#${pokemon.id} ${pokemon.name}` },
        { label: 'Rarity', value: pokemon.rarity },
        { label: 'Price', value: `${pokemon.price} PKCN`, highlight: true }
      ],
      confirmText: 'Buy Now',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      await buyPokemonOnChain(pokemon);
    }
  }

  function makeOfficialCard(p) {
    const card = document.createElement('div');
    const rarityClass = rarityClassLabel(p.rarity);
    card.className = `market-card ${rarityClass}`;

    card.dataset.pokemon = JSON.stringify({
      id: p.id,
      name: p.name,
      base_experience: p.base_experience || 0,
      rarity: p.rarity,
      price: p.price,
      sprites: p.sprites
    });

    card.addEventListener('click', () => {
      const pokemonData = JSON.parse(card.dataset.pokemon);
      showBuyModal(pokemonData);
    });

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const supplyBadge = document.createElement('div');
    supplyBadge.className = 'supply-badge';
    supplyBadge.textContent = '...';

    fetchRemainingSupplyForRarity(p.rarity)
      .then(n => {
        supplyBadge.textContent = (typeof n === 'number') ? `${n} LEFT` : '—';
      })
      .catch(() => {
        supplyBadge.textContent = '—';
      });

    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || '';
    img.alt = p.name || '';
    art.appendChild(img);

    const nameEl = document.createElement('h4');
    nameEl.className = 'name';
    nameEl.textContent = `#${p.id} ${p.name}`;

    const typesWrap = document.createElement('div');
    typesWrap.className = 'types';
    (p.types || []).forEach(t => {
      const tb = document.createElement('span');
      tb.className = 'type-badge';
      tb.textContent = t.type.name.toUpperCase();
      typesWrap.appendChild(tb);
    });

    const abil = document.createElement('div');
    abil.className = 'abilities';
    const abilityNames = (p.abilities?.map(a => a.ability?.name || a.name).slice(0, 3) || []);
    abil.textContent = abilityNames.length > 0 ? `Abilities: ${abilityNames.join(', ')}` : 'Abilities: Unknown';

    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = 'Loading description...';

    fetchPokemonDescription(p.name)
      .then(desc => {
        descriptionDiv.textContent = desc;
      })
      .catch(() => {
        descriptionDiv.textContent = 'A mysterious Pokémon with unknown abilities.';
      });

    const priceDiv = document.createElement('div');
    priceDiv.className = 'price-display';
    const pricePill = document.createElement('div');
    pricePill.className = 'price-pill';
    pricePill.textContent = `${p.price} PKCN`;
    priceDiv.appendChild(pricePill);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abil);
    inner.appendChild(descriptionDiv);
    inner.appendChild(priceDiv);

    card.appendChild(supplyBadge);
    card.appendChild(inner);

    return card;
  }

  function assertConfig() {
    if (!window.CONTRACTS || !window.ABIS) throw new Error('Missing config.js (CONTRACTS/ABIS)');
    if (!window.wallet) throw new Error('Missing wallet.js helper');
  }

  async function ensureTokenApproval(tokenAddress, spender, humanAmountOrRaw) {
    const signer = await window.wallet.getSigner();
    const token = new ethers.Contract(tokenAddress, window.ABIS.PKCN, signer);
    const owner = await window.wallet.getAccount();

    let rawAmount;
    if (typeof humanAmountOrRaw === 'bigint' || (typeof humanAmountOrRaw === 'string' && /^[0-9]+$/.test(humanAmountOrRaw))) {
      rawAmount = BigInt(humanAmountOrRaw.toString());
    } else {
      const human = humanAmountOrRaw;
      rawAmount = BigInt(ethers.parseUnits(String(human), TOKEN_DECIMALS).toString());
    }

    const allowance = BigInt((await token.allowance(owner, spender)).toString());
    if (allowance >= rawAmount) {
      console.log('✅ Sufficient allowance, skipping approval');
      return true;
    }

    const tx = await token.approve(spender, rawAmount);
    await tx.wait();
    return true;
  }

  async function buyPokemonOnChain(pokemon) {
    const txKey = `buy-${pokemon.id}-${Date.now()}`;
    if (pendingTransactionHashes.has(txKey)) {
      console.warn('⚠️ Duplicate transaction prevented');
      return;
    }
    pendingTransactionHashes.add(txKey);

    let txId = null;
    const nftAddr = window.CONTRACTS.POKEMON_NFT;

    try {
      assertConfig();
      const pkcnAddr = window.CONTRACTS.PKCN;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE;

      if (!window.wallet.getAccount()) {
        const shouldConnect = await window.txModal.confirm({
          title: 'Connect Wallet',
          message: 'You must connect your wallet to buy Pokemon.',
          confirmText: 'Connect Wallet'
        });
        if (!shouldConnect) {
          pendingTransactionHashes.delete(txKey);
          return;
        }
        await window.wallet.connectWallet();
      }

      const rawPrice = ethers.parseUnits(String(pokemon.price), TOKEN_DECIMALS);
      const buyerAddress = await window.wallet.getAccount();

      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, provider);
      const balanceBefore = await nft.balanceOf(buyerAddress).catch(() => 0);

      txId = window.txHistory.add({
        type: 'purchase',
        title: 'Buy Pokémon',
        message: `Purchasing ${pokemon.name} from Official Store`,
        status: 'pending',
        tokenAmount: `${pokemon.price} PKCN`,
        fromAddress: buyerAddress,
        toAddress: null,
        details: {
          pokemonId: pokemon.id,
          pokemonName: pokemon.name,
          rarity: pokemon.rarity
        }
      });

      window.txModal.transaction({
        title: 'Purchasing Pokemon',
        message: 'Please confirm the transaction in your wallet...'
      });

      await ensureTokenApproval(pkcnAddr, marketplaceAddr, rawPrice);

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);

      const tx = await callWithManualGas(marketplace, 'buyPokemon', [
        pokemon.name,
        pokemon.rarity,
        pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '',
        rawPrice
      ]);

      pendingTransactionHashes.delete(txKey);
      window.txHistory.update(txId, {
        hash: tx.hash,
        message: 'Transaction submitted, waiting for confirmation...'
      });

      const receipt = await tx.wait();

      let mintedTokenId = null;
      let gasFee = '0';

      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );

        const pokemonMintedTopic = ethers.id("PokemonMinted(uint256,address,string,string)");
        const transferTopic = ethers.id("Transfer(address,address,uint256)");

        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== nftAddr.toLowerCase()) {
            continue;
          }

          if (log.topics[0] === pokemonMintedTopic) {
            mintedTokenId = BigInt(log.topics[1]).toString();
            break;
          }

          if (log.topics[0] === transferTopic && !mintedTokenId) {
            mintedTokenId = BigInt(log.topics[3]).toString();
          }
        }

        if (!mintedTokenId) {
          const nftWithSigner = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, signer);
          const balanceAfter = await nftWithSigner.balanceOf(buyerAddress);

          if (balanceAfter > balanceBefore) {
            const newIndex = balanceAfter - 1n;
            mintedTokenId = await nftWithSigner.tokenOfOwnerByIndex(buyerAddress, newIndex);
            mintedTokenId = mintedTokenId.toString();
          } else {
            console.error('❌ Balance did not increase after mint');
          }
        }

        window.txHistory.update(txId, {
          status: 'success',
          message: `Successfully purchased ${pokemon.name}!`,
          hash: tx.hash,
          gasFee: `${gasFee} ETH`,
          nftId: mintedTokenId || null
        });

        window.txModal.success(
          'Purchase Successful!',
          mintedTokenId
            ? `You have successfully purchased ${pokemon.name}! NFT ID: #${mintedTokenId}`
            : `You have successfully purchased ${pokemon.name}! Please check your Collection for the NFT ID.`,
          () => {
            window.wallet.updateBalanceDisplayIfNeeded();
            renderOfficialGrid();
          }
        );

      } catch (parseErr) {
        console.error('❌ Receipt processing error:', parseErr);

        window.txHistory.update(txId, {
          status: 'success',
          message: `Successfully purchased ${pokemon.name}!`,
          hash: tx.hash,
          gasFee: `${gasFee} ETH`,
          nftId: null
        });

        window.txModal.success(
          'Purchase Successful!',
          `You have successfully purchased ${pokemon.name}! Please check your Collection for the NFT ID.`,
          () => {
            window.wallet.updateBalanceDisplayIfNeeded();
            renderOfficialGrid();
          }
        );
      }

    } catch (err) {
      console.error('❌ Buy transaction failed:', err);
      let message = 'Transaction failed';
      if (err?.reason) message = err.reason;
      else if (err?.message) {
        if (err.code === 4001 || err?.code === 'ACTION_REJECTED') {
          message = 'Transaction was rejected';
        } else {
          message = err.message;
        }
      }

      if (txId) {
        window.txHistory.update(txId, {
          status: 'failed',
          message: message
        });
      }

      window.txModal.error('Purchase Failed', message);
    } finally {
      pendingTransactionHashes.delete(txKey);
      if (txId) {
        setTimeout(() => window.txHistory.markAsRead(txId), 3000);
      }
    }
  }

  // ===== Player Listings Functions =====
  window.fetchActiveListingsFromChain = async function () {
    try {
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE;

      if (!marketplaceAddr) {
        console.error("❌ MARKETPLACE_ADDRESS not configured");
        return [];
      }

      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - 500000);

      console.log(`🔍 Fetching marketplace events from blocks ${fromBlock} → ${latest}`);

      const mpIface = new ethers.Interface(window.ABIS.MARKETPLACE);

      const logs = await provider.getLogs({
        address: marketplaceAddr,
        fromBlock: fromBlock,
        toBlock: 'latest'
      });

      console.log(`📝 Found ${logs.length} marketplace logs`);

      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

      const listingsMap = new Map();
      const processedSet = new Set();

      for (const log of logs) {
        try {
          const parsed = mpIface.parseLog(log);
          if (!parsed) {
            console.log(`⏭️ Skipping unparsable log`);
            continue;
          }

          const eventName = parsed.name;
          const args = parsed.args;
          const eventKey = `${log.blockNumber}-${log.logIndex}`;

          if (processedSet.has(eventKey)) {
            console.log(`⏭️ Skipping duplicate event: ${eventKey}`);
            continue;
          }
          processedSet.add(eventKey);

          console.log(`📜 Processing event: ${eventName} at block ${log.blockNumber}`);

          if (eventName === 'PokeListed') {
            const listingId = args.listingId?.toString() || args[0]?.toString();

            if (recentlyPurchasedListings.has(listingId)) {
              console.log(`⚠️ Skipping listing #${listingId} (in recently purchased)`);
              continue;
            }

            listingsMap.set(listingId, {
              listingId,
              tokenId: args.tokenId?.toString() || args[1]?.toString(),
              seller: args.seller || args[2],
              price: args.price || args[3],
              active: true,
              blockNumber: log.blockNumber
            });
            console.log(`✅ ADDED: Listing #${listingId} (PokeListed)`);
          }

          else if (eventName === 'PokeDelisted' || eventName === 'ListingBought') {
            const listingId = args.listingId?.toString() || args[0]?.toString();
            if (listingsMap.has(listingId)) {
              listingsMap.delete(listingId);
              recentlyPurchasedListings.add(listingId);
              console.log(`❌ REMOVED: Listing #${listingId} (${eventName})`);
            } else {
              console.log(`⚠️ Could not find listing #${listingId} to remove`);
            }
          }

        } catch (parseError) {
          console.warn(`⚠️ Failed to parse log:`, parseError);
          continue;
        }
      }

      const finalListings = [];
      const marketplaceAddrLower = marketplaceAddr.toLowerCase();

      for (const listing of listingsMap.values()) {
        try {
          const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT, window.ABIS.POKEMON_NFT, provider);
          const currentOwner = await nft.ownerOf(listing.tokenId).catch(() => null);

          if (currentOwner && (
            currentOwner.toLowerCase() === listing.seller.toLowerCase() ||
            currentOwner.toLowerCase() === marketplaceAddrLower
          )) {
            finalListings.push(listing);
            const status = currentOwner.toLowerCase() === marketplaceAddrLower ? 'escrow' : 'approval';
            console.log(`✅ VERIFIED: Listing #${listing.listingId} for token #${listing.tokenId} (${status})`);
          } else {
            console.log(`❌ SKIPPING: Token #${listing.tokenId} owned by ${currentOwner}, expected seller (${listing.seller}) or marketplace`);
          }
        } catch (e) {
          console.warn(`⚠️ Couldn't verify ownership for token #${listing.tokenId}:`, e);
        }
      }

      const filteredListings = finalListings.filter(
        listing => !recentlyPurchasedListings.has(listing.listingId)
      );

      console.log(`✅ FINAL: ${filteredListings.length} verified active listings`);

      activeListings.clear();
      filteredListings.forEach(listing => activeListings.set(listing.listingId, listing));

      saveRecentlyPurchased();

      return filteredListings;

    } catch (e) {
      console.error("❌ fetchActiveListingsFromChain failed:", e);
      return [];
    }
  };

  // ===== UPDATED: Enhanced render function with metadata caching =====
  async function renderPlayerListings() {
    try {
      if (!playerListingsGrid) return;

      if (playerListingsLoader) playerListingsLoader.style.display = 'flex';

      playerListingsGrid.innerHTML = '';

      const listings = await window.fetchActiveListingsFromChain();

      // Fetch metadata for all listings in parallel
      const metadataPromises = listings.map(async (listing) => {
        try {
          const provider = await window.wallet.getProvider();
          const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT, window.ABIS.POKEMON_NFT, provider);
          const uri = await nft.tokenURI(listing.tokenId);
          const meta = await parseTokenURI(uri);
          
          if (meta) {
            let pokemonData = null;
            try {
              const name = meta.name?.toLowerCase().trim();
              if (name) {
                const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
                if (res.ok) pokemonData = await res.json();
              }
            } catch (e) {
              console.warn(`Couldn't fetch PokeAPI data for ${meta.name}`);
            }

            let description = 'A mysterious Pokémon with unknown abilities.';
            try {
              const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${meta.name.toLowerCase()}`);
              if (speciesRes.ok) {
                const speciesData = await speciesRes.json();
                const flavorText = speciesData.flavor_text_entries?.find(e => e.language.name === 'en');
                if (flavorText) {
                  description = flavorText.flavor_text.replace(/\n|\f/g, ' ');
                }
              }
            } catch (e) {
              console.warn(`Failed to fetch description for ${meta.name}`);
            }

            // ✅ Ensure types are stored as lowercase strings
            const types = pokemonData?.types?.map(t => t.type.name.toLowerCase()) || [];
            
            listing.metadata = {
              name: meta.name || `Token #${listing.tokenId}`,
              image: meta.image ? ipfsToHttp(meta.image) : 'images/pokeball.png',
              rarity: meta.attributes?.find(a => 
                a.trait_type?.toLowerCase() === 'rarity'
              )?.value || 'Common',
              pokemonId: pokemonData?.id || listing.tokenId,
              types: types, // Store normalized types
              abilities: pokemonData?.abilities?.slice(0, 3).map(a => a.ability.name) || [],
              description: description
            };
            
            console.log(`📦 Loaded metadata for token #${listing.tokenId}:`, {
              name: listing.metadata.name,
              types: listing.metadata.types,
              rarity: listing.metadata.rarity
            });
          }
        } catch (e) {
          console.warn(`Failed to load metadata for token #${listing.tokenId}:`, e);
          listing.metadata = {
            name: `Token #${listing.tokenId}`,
            image: 'images/pokeball.png',
            rarity: 'Common',
            pokemonId: listing.tokenId,
            types: [], // Empty types array
            abilities: [],
            description: 'A mysterious Pokémon with unknown abilities.'
          };
        }
        return listing;
      });

      const listingsWithMetadata = await Promise.all(metadataPromises);

      activeListings.clear();
      listingsWithMetadata.forEach(listing => {
        activeListings.set(listing.listingId, listing);
      });

      playerCurrentPage = 1;
      renderPlayerMarketplaceGrid();

      if (playerListingsLoader) playerListingsLoader.style.display = 'none';

    } catch (e) {
      console.error('renderPlayerListings failed:', e);
      if (playerListingsLoader) playerListingsLoader.style.display = 'none';
    }
  }

  // ===== UPDATED: Make listing card with metadata support =====
  async function makeListingCard(listing) {
    const meta = listing.metadata || {};
    const nameText = meta.name || `Token #${listing.tokenId}`;
    const rarity = meta.rarity || 'Common';
    const pokemonId = meta.pokemonId || listing.tokenId;
    const imageUrl = meta.image || 'images/pokeball.png';
    const types = meta.types || [];
    const abilities = meta.abilities || [];
    const description = meta.description || 'A mysterious Pokémon with unknown abilities.';

    const rarityClass = rarityClassLabel(rarity);
    const card = document.createElement('div');
    card.className = `market-card listed ${rarityClass}`;
    card.dataset.listingId = listing.listingId;

    card.addEventListener('click', () => {
      const currentUser = window.wallet?.getAccount?.()?.toLowerCase();
      const isOwner = currentUser === listing.seller.toLowerCase();
      console.log(`🖱️ Clicked listing #${listing.listingId}. Owner check: ${currentUser} === ${listing.seller.toLowerCase()} = ${isOwner}`);
      showPlayerListingModal(listing, nameText, pokemonId, rarity, isOwner, listing.tokenId);
    });

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const nftIdBadge = document.createElement('div');
    nftIdBadge.className = 'nft-id-badge';
    nftIdBadge.textContent = `#${listing.tokenId}`;

    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = nameText;
    art.appendChild(img);

    const nameEl = document.createElement('h4');
    nameEl.className = 'name';
    nameEl.textContent = `#${pokemonId} ${nameText}`;

    const typesWrap = document.createElement('div');
    typesWrap.className = 'types';

    if (types.length > 0) {
      types.forEach(type => {
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = type.toUpperCase();
        typesWrap.appendChild(badge);
      });
    } else {
      const badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = rarity.toUpperCase();
      typesWrap.appendChild(badge);
    }

    const abilitiesDiv = document.createElement('div');
    abilitiesDiv.className = 'abilities';
    abilitiesDiv.textContent = abilities.length > 0 ? `Abilities: ${abilities.join(', ')}` : `NFT Token #${listing.tokenId}`;

    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description;

    const priceDiv = document.createElement('div');
    priceDiv.className = 'price-display';
    const pricePill = document.createElement('div');
    pricePill.className = 'price-pill';
    pricePill.textContent = formatPrice(listing.price);
    priceDiv.appendChild(pricePill);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abilitiesDiv);
    inner.appendChild(descriptionDiv);
    inner.appendChild(priceDiv);

    card.appendChild(nftIdBadge);
    card.appendChild(inner);

    const currentUser = window.wallet?.getAccount?.()?.toLowerCase();
    if (currentUser === listing.seller.toLowerCase()) {
      card.style.border = '2px solid #4CAF50';
      card.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
      card.title = 'Click to manage your listing';
    }

    return card;
  }

  async function showPlayerListingModal(listing, pokemonName, pokemonId, rarity, isOwner, tokenId) {
    if (isOwner) {
      const confirmed = await window.txModal.confirm({
        title: 'Cancel Listing',
        message: `Remove your ${pokemonName} from the marketplace?`,
        details: [
          { label: 'NFT ID', value: `#${listing.tokenId}` },
          { label: 'Pokémon', value: `#${pokemonId} ${pokemonName}` },
          { label: 'Rarity', value: rarity },
          { label: 'Price', value: formatPrice(listing.price) }
        ],
        confirmText: 'Cancel Listing',
        cancelText: 'Keep Listed'
      });

      if (confirmed) {
        await delistPokemon(listing.listingId, pokemonName, pokemonId, tokenId);
      }

    } else {
      const priceBig = BigInt(listing.price.toString());
      const humanPrice = ethers.formatUnits(priceBig, TOKEN_DECIMALS);

      const confirmed = await window.txModal.confirm({
        title: 'Buy Listed Pokémon',
        message: `Purchase this Pokémon from another player?`,
        details: [
          { label: 'Pokémon', value: `#${pokemonId} ${pokemonName}` },
          { label: 'Rarity', value: rarity },
          { label: 'NFT ID', value: `#${listing.tokenId}` },
          { label: 'Seller', value: shortAddress(listing.seller) },
          { label: 'Price', value: `${humanPrice} PKCN`, highlight: true }
        ],
        confirmText: 'Buy Now',
        cancelText: 'Cancel'
      });

      if (confirmed) {
        await buyListedOnChain(listing.listingId, listing.price, pokemonName, pokemonId, listing.seller, listing.tokenId);
      }
    }
  }

  async function buyListedOnChain(listingId, priceRaw, pokemonName, pokemonId, seller, tokenId) {
    const txKey = `buyListed-${listingId}-${Date.now()}`;
    if (pendingTransactionHashes.has(txKey)) {
      console.warn('⚠️ Duplicate marketplace purchase prevented');
      return;
    }
    pendingTransactionHashes.add(txKey);

    if (pendingPurchases.has(listingId)) {
      console.warn(`⚠️ Purchase already in progress for listing #${listingId}`);
      pendingTransactionHashes.delete(txKey);
      return;
    }

    let txId = null;
    pendingPurchases.add(listingId);
    removeListingFromUI(listingId);
    recentlyPurchasedListings.add(listingId);

    try {
      assertConfig();
      const pkcnAddr = window.CONTRACTS.PKCN;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE;

      if (!window.wallet.getAccount()) {
        const shouldConnect = await window.txModal.confirm({
          title: 'Connect Wallet',
          message: 'You must connect your wallet to buy listed Pokemon.',
          confirmText: 'Connect Wallet'
        });
        if (!shouldConnect) {
          pendingPurchases.delete(listingId);
          pendingTransactionHashes.delete(txKey);
          return;
        }
        await window.wallet.connectWallet();
      }

      const priceBig = BigInt(priceRaw.toString());
      const humanPrice = ethers.formatUnits(priceBig, TOKEN_DECIMALS);

      txId = window.txHistory.add({
        type: 'marketplace_purchase',
        title: 'Buy Listed Pokémon',
        message: `Purchasing ${pokemonName} from ${shortAddress(seller)}`,
        status: 'pending',
        tokenAmount: `${humanPrice} PKCN`,
        fromAddress: await window.wallet.getAccount(),
        toAddress: seller,
        nftId: tokenId,
        details: {
          pokemonId: pokemonId,
          pokemonName: pokemonName,
          listingId: listingId
        }
      });

      window.txModal.transaction({
        title: 'Buying Listed Pokemon',
        message: 'Please confirm the transaction in your wallet...',
        subtitle: 'This may include an approval step if needed.'
      });

      await ensureTokenApproval(pkcnAddr, marketplaceAddr, priceBig);

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.buyListedPokemon(BigInt(listingId));

      pendingTransactionHashes.delete(txKey);
      window.txHistory.update(txId, {
        hash: tx.hash,
        message: 'Transaction submitted, waiting for confirmation...'
      });

      const receipt = await tx.wait();

      let gasFee = '0';
      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );
      } catch (e) {
        console.warn('Gas calculation failed:', e);
      }

      window.txHistory.update(txId, {
        status: 'success',
        message: `Successfully purchased ${pokemonName}!`,
        hash: tx.hash,
        gasFee: `${gasFee} ETH`,
        nftId: tokenId
      });

      window.txModal.success(
        'Purchase Successful!',
        `You have successfully purchased ${pokemonName} from ${shortAddress(seller)}! NFT ID: #${tokenId}`,
        () => {
          window.wallet.updateBalanceDisplayIfNeeded();
          pendingPurchases.delete(listingId);
          setTimeout(() => renderPlayerListings(), 1000);
        }
      );
    } catch (e) {
      console.error('buyListedOnChain failed', e);
      let message = 'Failed to purchase listing';
      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      else if (e?.reason) message = e.reason;
      else if (e?.message) message = e.message;

      if (txId) {
        window.txHistory.update(txId, {
          status: 'failed',
          message: message
        });
      }

      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') {
        pendingPurchases.delete(listingId);
        recentlyPurchasedListings.delete(listingId);
        restoreListingToUI(listingId);
      }

      window.txModal.error('Purchase Failed', message);
    } finally {
      pendingTransactionHashes.delete(txKey);
      if (txId) {
        setTimeout(() => window.txHistory.markAsRead(txId), 3000);
      }
    }
  }

  function removeListingFromUI(listingId) {
    const card = document.querySelector(`[data-listing-id="${listingId}"]`);
    if (card) {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';

      const overlay = document.createElement('div');
      overlay.className = 'purchase-overlay';
      overlay.textContent = 'Purchasing...';
      overlay.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          z-index: 10;
          border-radius: 8px;
        `;
      card.style.position = 'relative';
      card.appendChild(overlay);
    }
  }

  function restoreListingToUI(listingId) {
    const card = document.querySelector(`[data-listing-id="${listingId}"]`);
    if (card) {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';

      const overlay = card.querySelector('.purchase-overlay');
      if (overlay) {
        overlay.remove();
      }
    }
  }

  async function delistPokemon(listingId, pokemonName, pokemonId, tokenId) {
    const txKey = `delist-${listingId}-${Date.now()}`;
    if (pendingTransactionHashes.has(txKey)) {
      console.warn('⚠️ Duplicate delist prevented');
      return;
    }
    pendingTransactionHashes.add(txKey);

    let txId = null;
    try {
      assertConfig();
      await window.wallet.ensureProvider();

      const marketplaceAddr = window.CONTRACTS.MARKETPLACE;
      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);

      txId = window.txHistory.add({
        type: 'delist',
        title: 'Cancel Listing',
        message: `Removing ${pokemonName} from marketplace`,
        status: 'pending',
        fromAddress: await window.wallet.getAccount(),
        nftId: tokenId,
        details: {
          pokemonId: pokemonId,
          pokemonName: pokemonName,
          listingId: listingId,
          tokenId: tokenId
        }
      });

      window.txModal.transaction({
        title: 'Canceling Listing',
        message: 'Please confirm the transaction in your wallet...'
      });

      let tx;
      try {
        tx = await marketplace.cancelListing(BigInt(listingId));
      } catch (gasError) {
        console.warn('Gas estimation failed, trying with manual limit:', gasError);
        tx = await marketplace.cancelListing(BigInt(listingId), { gasLimit: 50000 });
      }

      pendingTransactionHashes.delete(txKey);
      window.txHistory.update(txId, {
        hash: tx.hash,
        message: 'Waiting for confirmation...'
      });

      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error('Transaction reverted on blockchain');
      }

      let gasFee = '0';
      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );
      } catch (e) {
        console.warn('Gas calculation failed:', e);
      }

      window.txHistory.update(txId, {
        status: 'success',
        message: `Successfully canceled listing for ${pokemonName}`,
        hash: tx.hash,
        gasFee: `${gasFee} ETH`,
        nftId: tokenId
      });

      activeListings.delete(listingId);
      recentlyPurchasedListings.add(listingId);
      saveRecentlyPurchased();

      window.txModal.success(
        'Listing Canceled',
        `Your ${pokemonName} has been removed from the marketplace.`,
        () => {
          renderPlayerListings();
          if (typeof renderCollection === 'function') {
            renderCollection();
          }
        }
      );
    } catch (e) {
      console.error('delistPokemon failed:', e);

      let message = 'Failed to cancel listing';
      if (e?.code === 4001) {
        message = 'Transaction was rejected';
      } else if (e?.reason) {
        message = e.reason;
      } else if (e?.message) {
        if (e.message.includes('user rejected')) {
          message = 'Transaction was rejected';
        } else if (e.message.includes('revert')) {
          message = 'Cannot cancel: you are not the seller or listing is already inactive';
        } else {
          message = e.message;
        }
      }

      if (txId) {
        window.txHistory.update(txId, {
          status: 'failed',
          message: message,
          nftId: tokenId
        });
      }

      window.txModal.error('Delist Failed', message);
      setTimeout(() => renderPlayerListings(), 1500);
    } finally {
      pendingTransactionHashes.delete(txKey);
      if (txId) {
        setTimeout(() => window.txHistory.markAsRead(txId), 3000);
      }
    }
  }

  // ===== FIX: Comprehensive transaction sync =====
  async function syncAllPastTransactions() {
    try {
      if (!window.wallet.getAccount()) return;

      const syncKey = `pokechain_tx_sync_all_${window.wallet.getAccount().toLowerCase()}`;
      const hasSynced = localStorage.getItem(syncKey);
      if (hasSynced) {
        console.log('✅ All past transactions already synced, skipping...');
        return;
      }

      console.log('🔄 First-time sync of all past transactions from blockchain...');
      const provider = await window.wallet.getProvider();
      const marketplace = new ethers.Contract(
        window.CONTRACTS.MARKETPLACE,
        window.ABIS.MARKETPLACE,
        provider
      );
      const nft = new ethers.Contract(
        window.CONTRACTS.POKEMON_NFT,
        window.ABIS.POKEMON_NFT,
        provider
      );

      const currentUser = window.wallet.getAccount().toLowerCase();
      const fromBlock = -10000;

      const [userListLogs, allDelistLogs, allBuyLogs, userMintLogs] = await Promise.all([
        marketplace.queryFilter(marketplace.filters.PokeListed(null, null, currentUser), fromBlock, 'latest'),
        marketplace.queryFilter(marketplace.filters.PokeDelisted(null), fromBlock, 'latest'),
        marketplace.queryFilter(marketplace.filters.ListingBought(null, null), fromBlock, 'latest'),
        nft.queryFilter(nft.filters.PokemonMinted(null, currentUser), fromBlock, 'latest')
      ]);

      console.log(`📜 Found ${userListLogs.length} list, ${allDelistLogs.length} delist, ${allBuyLogs.length} buy, ${userMintLogs.length} mint events`);

      const allListingsMap = new Map();
      const allListLogs = await marketplace.queryFilter(marketplace.filters.PokeListed(), fromBlock, 'latest');
      for (const log of allListLogs) {
        const { listingId, tokenId, seller, price } = log.args;
        allListingsMap.set(listingId.toString(), {
          tokenId: tokenId.toString(),
          seller: seller.toLowerCase(),
          price: BigInt(price.toString()),
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber
        });
      }

      let addedCount = 0;
      const txExists = (hash) => window.txHistory.notifications.some(tx => tx.hash === hash);

      for (const log of userListLogs) {
        if (txExists(log.transactionHash)) continue;
        try {
          const { listingId, tokenId, seller, price } = log.args;
          const meta = await getPokemonMetadata(tokenId.toString(), provider);
          
          window.txHistory.add({
            type: 'list',
            title: 'List Pokémon',
            message: `Listed ${meta?.name || `NFT #${tokenId}`} for sale`,
            status: 'success',
            tokenAmount: `${ethers.formatUnits(price, TOKEN_DECIMALS)} PKCN`,
            fromAddress: seller,
            toAddress: null,
            nftId: tokenId.toString(),
            hash: log.transactionHash,
            timestamp: (await provider.getBlock(log.blockNumber)).timestamp * 1000,
            details: {
              pokemonName: meta?.name || `NFT #${tokenId}`,
              pokemonId: meta?.pokemonId || tokenId.toString(),
              tokenId: tokenId.toString(),
              listingId: listingId.toString(),
              rarity: meta?.rarity || 'Common',
              price: ethers.formatUnits(price, TOKEN_DECIMALS),
              isSynced: true
            }
          });
          addedCount++;
        } catch (err) {
          console.warn(`⚠️ Failed to process list event:`, err);
        }
      }

      for (const log of allDelistLogs) {
        if (txExists(log.transactionHash)) continue;
        try {
          const { listingId } = log.args;
          const listing = allListingsMap.get(listingId.toString());
          
          if (listing && listing.seller === currentUser) {
            const meta = await getPokemonMetadata(listing.tokenId, provider);
            
            window.txHistory.add({
              type: 'delist',
              title: 'Cancel Listing',
              message: `Removed ${meta?.name || `NFT #${listing.tokenId}`} from marketplace`,
              status: 'success',
              tokenAmount: null,
              fromAddress: listing.seller,
              toAddress: null,
              nftId: listing.tokenId,
              hash: log.transactionHash,
              timestamp: (await provider.getBlock(log.blockNumber)).timestamp * 1000,
              details: {
                pokemonName: meta?.name || `NFT #${listing.tokenId}`,
                pokemonId: meta?.pokemonId || listing.tokenId,
                tokenId: listing.tokenId,
                listingId: listingId.toString(),
                isSynced: true
              }
            });
            addedCount++;
          }
        } catch (err) {
          console.warn(`⚠️ Failed to process delist event:`, err);
        }
      }

      for (const log of allBuyLogs) {
        if (txExists(log.transactionHash)) continue;
        try {
          const { listingId, buyer } = log.args;
          
          if (buyer.toLowerCase() === currentUser) {
            const listing = allListingsMap.get(listingId.toString());
            if (listing) {
              const meta = await getPokemonMetadata(listing.tokenId, provider);
              
              window.txHistory.add({
                type: 'marketplace_purchase',
                title: 'Buy Listed Pokémon',
                message: `Purchased ${meta?.name || `NFT #${listing.tokenId}`} from ${shortAddress(listing.seller)}`,
                status: 'success',
                tokenAmount: `${ethers.formatUnits(listing.price, TOKEN_DECIMALS)} PKCN`,
                fromAddress: listing.seller,
                toAddress: buyer,
                nftId: listing.tokenId,
                hash: log.transactionHash,
                timestamp: (await provider.getBlock(log.blockNumber)).timestamp * 1000,
                details: {
                  pokemonName: meta?.name || `NFT #${listing.tokenId}`,
                  pokemonId: meta?.pokemonId || listing.tokenId,
                  tokenId: listing.tokenId,
                  listingId: listingId.toString(),
                  seller: listing.seller,
                  isSynced: true
                }
              });
              addedCount++;
            }
          }
        } catch (err) {
          console.warn(`⚠️ Failed to process buy event:`, err);
        }
      }

      for (const log of userMintLogs) {
        if (txExists(log.transactionHash)) continue;
        try {
          const { tokenId, owner, name, rarity } = log.args;
          
          const tx = await provider.getTransaction(log.transactionHash);
          let price = '0';
          try {
            const marketplaceIface = new ethers.Interface(window.ABIS.MARKETPLACE);
            const parsedTx = marketplaceIface.parseTransaction({ data: tx.data });
            if (parsedTx && parsedTx.name === 'buyPokemon') {
              price = ethers.formatUnits(parsedTx.args[3], TOKEN_DECIMALS);
            }
          } catch (e) {
            console.warn('Could not parse price from transaction:', e);
          }
          
          window.txHistory.add({
            type: 'purchase',
            title: 'Buy Pokémon',
            message: `Purchased ${name} from Official Store`,
            status: 'success',
            tokenAmount: `${price} PKCN`,
            fromAddress: null,
            toAddress: owner,
            nftId: tokenId.toString(),
            hash: log.transactionHash,
            timestamp: (await provider.getBlock(log.blockNumber)).timestamp * 1000,
            details: {
              pokemonName: name,
              pokemonId: tokenId.toString(),
              tokenId: tokenId.toString(),
              rarity: rarity,
              price: price,
              isSynced: true
            }
          });
          addedCount++;
        } catch (err) {
          console.warn(`⚠️ Failed to process mint event:`, err);
        }
      }

      localStorage.setItem(syncKey, 'true');
      console.log(`✅ Sync complete: ${addedCount} new transactions added to history`);

      if (window.txHistoryPage) {
        window.txHistoryPage.render(window.txHistoryPage.currentFilter || 'all');
      }
      if (typeof renderCollection === 'function') {
        setTimeout(() => renderCollection(), 1000);
      }
      if (typeof renderPlayerListings === 'function') {
        setTimeout(() => renderPlayerListings(), 1500);
      }

    } catch (e) {
      console.error('❌ Failed to sync past transactions:', e);
    }
  }

  async function getPokemonMetadata(tokenId, provider) {
    try {
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT, window.ABIS.POKEMON_NFT, provider);
      const uri = await nft.tokenURI(tokenId);
      const meta = await parseTokenURI(uri);
      
      if (!meta) return null;
      
      let pokemonData = null;
      try {
        const name = meta.name?.toLowerCase().trim();
        if (name) {
          const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
          if (res.ok) pokemonData = await res.json();
        }
      } catch (e) {
        console.warn(`Failed to fetch PokeAPI data for ${meta.name}:`, e);
      }
      
      return {
        name: meta.name || `Token #${tokenId}`,
        image: meta.image ? ipfsToHttp(meta.image) : '',
        rarity: meta.attributes?.find(a => 
          a.trait_type?.toLowerCase() === 'rarity' || 
          a.traitType?.toLowerCase() === 'rarity'
        )?.value || 'Common',
        pokemonId: pokemonData?.id || tokenId,
        types: pokemonData?.types?.map(t => t.type.name) || [],
        description: meta.description || 'A mysterious Pokémon with unknown abilities.'
      };
    } catch (e) {
      console.warn(`Failed to get metadata for token #${tokenId}:`, e);
      return null;
    }
  }

  function setMarketplaceMode(mode) {
    const officialSection = document.getElementById('officialMarketSection');
    const playerSection = document.getElementById('playerMarketSection');
    const toggleOfficial = document.getElementById('toggleOfficial');
    const togglePlayer = document.getElementById('togglePlayer');

    if (mode === 'official') {
      toggleOfficial.classList.add('active');
      togglePlayer.classList.remove('active');
      officialSection.style.display = 'block';
      playerSection.style.display = 'none';
      officialCurrentPage = 1;
      renderOfficialGrid();
    } else {
      togglePlayer.classList.add('active');
      toggleOfficial.classList.remove('active');
      officialSection.style.display = 'none';
      playerSection.style.display = 'block';
      playerCurrentPage = 1;

      if (!playerListingsLoaded) {
        renderPlayerListings();
        playerListingsLoaded = true;
      } else {
        renderPlayerMarketplaceGrid();
      }
    }
  }

  // ===== FIX: Unified Filter Handler with proper event delegation =====
  function attachHandlers() {
    // Mode toggle buttons
    document.getElementById('toggleOfficial')?.addEventListener('click', () => setMarketplaceMode('official'));
    document.getElementById('togglePlayer')?.addEventListener('click', () => setMarketplaceMode('player'));
    
    // ✅ FIX: Apply Filters button - handles both marketplace modes
    document.getElementById('applyFilters')?.addEventListener('click', () => {
      const mode = document.getElementById('officialMarketSection').style.display !== 'none' ? 'official' : 'player';
      
      if (mode === 'official') {
        officialCurrentPage = 1;
        renderOfficialGrid();
      } else {
        playerCurrentPage = 1;
        renderPlayerMarketplaceGrid();
      }
      
      console.log(`🔍 Filters applied for ${mode} marketplace`);
    });

    // ✅ FIX: Real-time filter updates on input change (debounced)
    let filterTimeout;
    const debouncedFilter = () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        const mode = document.getElementById('officialMarketSection').style.display !== 'none' ? 'official' : 'player';
        if (mode === 'official') {
          officialCurrentPage = 1;
          renderOfficialGrid();
        } else {
          playerCurrentPage = 1;
          renderPlayerMarketplaceGrid();
        }
      }, 300); // 300ms debounce
    };

    searchInput?.addEventListener('input', debouncedFilter);
    typeFilter?.addEventListener('change', debouncedFilter);
    rarityFilter?.addEventListener('change', debouncedFilter);
    sortSelect?.addEventListener('change', debouncedFilter);

    // Enter key support for search input
    searchInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(filterTimeout); // Cancel debounce
        document.getElementById('applyFilters')?.click();
      }
    });
  }

  function saveRecentlyPurchased() {
    try {
      localStorage.setItem('recentlyPurchasedListings', JSON.stringify([...recentlyPurchasedListings]));
    } catch (e) {
      console.warn('Failed to save recently purchased listings:', e);
    }
  }

  function loadRecentlyPurchased() {
    try {
      const saved = localStorage.getItem('recentlyPurchasedListings');
      if (saved) {
        const parsed = JSON.parse(saved);
        recentlyPurchasedListings = new Set(parsed);
      }
    } catch (e) {
      console.warn('Failed to load recently purchased listings:', e);
    }
  }

  function setupEventListeners() {
    try {
      if (!window.wallet || !window.CONTRACTS) return;

      window.wallet.ensureProvider().then(provider => {
        const marketplace = new ethers.Contract(
          window.CONTRACTS.MARKETPLACE,
          window.ABIS.MARKETPLACE,
          provider
        );

        marketplace.on('*', (event) => {
          console.log('📡 Marketplace event detected:', event.event || event);

          clearTimeout(window.marketplaceRefreshTimeout);
          window.marketplaceRefreshTimeout = setTimeout(() => {
            console.log('🔄 Refreshing listings due to blockchain event');
            renderPlayerListings();
            if (typeof renderCollection === 'function') {
              renderCollection();
            }
          }, 2000);
        });

        console.log('✅ Event listeners set up for real-time updates');
      });
    } catch (e) {
      console.warn('Failed to set up event listeners:', e);
    }
  }

  // ===== Initialization =====
(async function init() {
  console.log('🚀 Initializing marketplace...');
  await cleanupLegacyListings();
  loadRecentlyPurchased();
  await loadTypes();
  
  // ✅ FIX: Ensure decimals load BEFORE allowing listings
  await loadTokenDecimals();
  console.log(`✅ Token decimals confirmed: ${TOKEN_DECIMALS}`);
  
  await loadGen1And2Pokemon();
  attachHandlers();
  setupEventListeners();

    setTimeout(() => {
      console.log('⏰ Starting sync of past listings...');
      syncAllPastTransactions();
    }, 3000);

    window.txHistory.updateUI();

    setTimeout(() => {
      console.log('🎨 Initial render of player listings...');
      renderPlayerListings();
      playerListingsLoaded = true;
    }, 1500);

    setInterval(saveRecentlyPurchased, 30000);
    
    window.listPokemonOnChain = listPokemonOnChain;
    console.log('🌍 Exposed listPokemonOnChain globally');
    
    window.txHistory = window.txHistory;
    console.log('✅ TransactionHistory exposed globally');

    console.log('✅ Marketplace initialization complete');
  })();
});