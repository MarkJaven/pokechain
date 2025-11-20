document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  let TOKEN_DECIMALS = 18;

  // ===== State Management =====
  let pendingPurchases = new Set();
  let pendingTransactionHashes = new Set();
  let activeListings = new Map();
  let recentlyPurchasedListings = new Set();
  let inactiveListings = new Set();

  // ===== Enhanced Transaction History =====
  class TransactionHistory {
    constructor() {
      this.key = 'pokechain_tx_history_v2';
      this.notifications = this.load();
      this.maxItems = 100;
    }

    load() {
      try {
        const saved = localStorage.getItem(this.key);
        if (!saved) {
          const old = localStorage.getItem('pokechain_tx_history');
          if (old) {
            const oldData = JSON.parse(old);
            localStorage.removeItem('pokechain_tx_history');
            return oldData.map(tx => ({
              ...tx,
              tokenAmount: null,
              gasFee: null,
              nftId: null,
              fromAddress: null,
              toAddress: null,
              read: true
            }));
          }
        }
        const loaded = saved ? JSON.parse(saved) : [];
        console.log(`💾 Loaded ${loaded.length} transactions from history`);
        return loaded;
      } catch {
        console.warn('⚠️ Failed to load transaction history');
        return [];
      }
    }

    save() {
      try {
        const trimmed = this.notifications.slice(-this.maxItems);
        localStorage.setItem(this.key, JSON.stringify(trimmed));
        console.log(`💾 Saved ${trimmed.length} transactions to history`);
      } catch (e) {
        console.error('❌ Failed to save transaction history:', e);
      }
    }

    // ✅ FIXED: Prevent duplicate transactions
    add(tx) {
      // Check for duplicate (same type + nftId + timestamp within 1 min)
      const isDuplicate = this.notifications.some(existing =>
        existing.type === tx.type &&
        existing.nftId === tx.nftId &&
        Math.abs(existing.timestamp - Date.now()) < 60000 // Same action within 1 min
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
        nftId: tx.nftId || null, // ✅ Always preserve NFT ID
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
        // Ensure nftId is preserved if not explicitly updated
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
      console.log(`📊 Types: ${all.map(tx => tx.type).join(', ')}`);
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

  window.txHistory = new TransactionHistory();

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

  const marketGrid = document.getElementById('officialMarketGrid');
  const playerListingsGrid = document.getElementById('playerListingsGrid');
  const loader = document.getElementById('loader');
  const playerListingsLoader = document.getElementById('playerListingsLoader');
  const fetchMoreBtn = document.getElementById('fetchMoreBtn');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortSelect = document.getElementById('sortSelect');

  const pokeCache = new Map();
  let playerListingsLoaded = false;

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
        opt.value = t.name;
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
      const token = new ethers.Contract(window.CONTRACTS.PKCN_ADDRESS, window.ABIS.ERC20_MIN, provider);
      const decimalsBN = await token.decimals();
      TOKEN_DECIMALS = Number(decimalsBN.toString());
      console.log(`✅ Token decimals loaded: ${TOKEN_DECIMALS}`);
    } catch (e) {
      console.warn('Failed to fetch token decimals, defaulting to 18');
      TOKEN_DECIMALS = 18;
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
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);
      const remain = await nft.remainingSupply(rarity);
      return Number(remain.toString());
    } catch (e) {
      console.warn('fetchRemainingSupplyForRarity failed', e);
      return '—';
    }
  }

  function renderOfficialGrid() {
    if (!marketGrid) return;

    const q = (searchInput?.value || '').trim().toLowerCase();
    const type = (typeFilter?.value || '');
    const sortBy = (sortSelect?.value || 'id');

    let items = Array.from(pokeCache.values());
    if (q) items = items.filter(p => (p.name && p.name.includes(q)) || String(p.id) === q);
    if (type) items = items.filter(p => p.types.some(t => t.type.name === type));

    items = items.map(p => ({
      ...p,
      price: computeMockPrice(p),
      rarity: computeRarity(p.base_experience || 0)
    }));

    items.sort((a, b) => {
      if (sortBy === 'id') return a.id - b.id;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price') return a.price - b.price;
      return 0;
    });

    marketGrid.innerHTML = '';
    items.forEach(p => marketGrid.appendChild(makeOfficialCard(p)));
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

  // ===== FIXED: Only approve if needed =====
  async function ensureTokenApproval(tokenAddress, spender, humanAmountOrRaw) {
    const signer = await window.wallet.getSigner();
    const token = new ethers.Contract(tokenAddress, window.ABIS.ERC20_MIN, signer);
    const owner = await window.wallet.getAccount();

    // Check current allowance FIRST
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

    console.log('🔄 Insufficient allowance, requesting approval...');
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
    const nftAddr = window.CONTRACTS.POKEMON_NFT_ADDRESS;

    try {
      assertConfig();
      const pkcnAddr = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;

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

      // Record token count BEFORE
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, provider);
      const balanceBefore = await nft.balanceOf(buyerAddress).catch(() => 0);
      console.log(`📊 Balance before: ${balanceBefore.toString()}`);

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
          // ✅ REMOVED: image field
        }
      });

      window.txModal.transaction({
        title: 'Purchasing Pokemon',
        message: 'Please confirm the transaction in your wallet...'
      });

      await ensureTokenApproval(pkcnAddr, marketplaceAddr, rawPrice);

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);

      // Execute purchase
      const tx = await marketplace.buyPokemon(
        pokemon.name,
        pokemon.rarity,
        pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '',
        rawPrice
      );

      pendingTransactionHashes.delete(txKey);
      window.txHistory.update(txId, {
        hash: tx.hash,
        message: 'Transaction submitted, waiting for confirmation...'
      });

      const receipt = await tx.wait();
      console.log('✅ Receipt received. Logs:', receipt.logs.length);

      // ===== ROBUST TOKEN ID EXTRACTION =====
      let mintedTokenId = null;
      let gasFee = '0';

      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );

        // Method 1: Check event topics directly (most reliable for indexed events)
        const pokemonMintedTopic = ethers.id("PokemonMinted(uint256,address,string,string)");
        const transferTopic = ethers.id("Transfer(address,address,uint256)");

        console.log(`🔍 Scanning ${receipt.logs.length} logs for topics...`);
        console.log(`Looking for: ${pokemonMintedTopic} or ${transferTopic}`);

        for (const log of receipt.logs) {
          // Only check logs from the NFT contract
          if (log.address.toLowerCase() !== nftAddr.toLowerCase()) {
            console.log(`⏭️ Skipping log from ${log.address}`);
            continue;
          }

          console.log(`📜 Log from NFT contract. Topic: ${log.topics[0]}`);

          // Check for PokemonMinted event
          if (log.topics[0] === pokemonMintedTopic) {
            // tokenId is indexed, so it's in topics[1]
            mintedTokenId = BigInt(log.topics[1]).toString();
            console.log(`✅ Found PokemonMinted event! Token ID: ${mintedTokenId}`);
            break;
          }

          // Fallback: Check for Transfer event (also emitted on mint)
          if (log.topics[0] === transferTopic && !mintedTokenId) {
            // tokenId is indexed, in topics[3] for Transfer
            mintedTokenId = BigInt(log.topics[3]).toString();
            console.log(`✅ Found Transfer event! Token ID: ${mintedTokenId}`);
            // Don't break - PokemonMinted is more reliable if it appears later
          }
        }

        // Method 2: If still not found, query contract directly
        if (!mintedTokenId) {
          console.warn('⚠️ Could not parse from logs, querying contract...');
          const nftWithSigner = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, signer);
          const balanceAfter = await nftWithSigner.balanceOf(buyerAddress);

          if (balanceAfter > balanceBefore) {
            // Get the newest token
            const newIndex = balanceAfter - 1n;
            mintedTokenId = await nftWithSigner.tokenOfOwnerByIndex(buyerAddress, newIndex);
            mintedTokenId = mintedTokenId.toString();
            console.log(`✅ Queried token ID: ${mintedTokenId}`);
          } else {
            console.error('❌ Balance did not increase after mint');
          }
        }

        // Update with found ID (or null if truly unknown)
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
        // Transaction likely succeeded even if parsing failed
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
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;

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
          const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);
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

  async function renderPlayerListings() {
    try {
      if (!playerListingsGrid) return;

      if (playerListingsLoader) playerListingsLoader.style.display = 'flex';

      playerListingsGrid.innerHTML = '';

      const listings = await window.fetchActiveListingsFromChain();

      const uniqueListings = new Map();
      listings.forEach(listing => {
        const existing = uniqueListings.get(listing.tokenId);
        if (!existing || listing.blockNumber > existing.blockNumber) {
          uniqueListings.set(listing.tokenId, listing);
        }
      });

      const finalListings = Array.from(uniqueListings.values());

      const countEl = document.getElementById('playerListingCount');
      if (countEl) {
        countEl.textContent = finalListings.length > 0 ? `${finalListings.length} available` : 'No listings yet';
      }

      if (finalListings.length === 0) {
        console.log('⚠️ No active player listings found');
        if (playerListingsLoader) playerListingsLoader.style.display = 'none';
        return;
      }

      for (const listing of finalListings) {
        if (playerListingsGrid.querySelector(`[data-listing-id="${listing.listingId}"]`)) {
          console.log(`⚠️ Skipping duplicate listing #${listing.listingId}`);
          continue;
        }

        const card = await makeListingCard(listing);
        playerListingsGrid.appendChild(card);
      }

      if (playerListingsLoader) playerListingsLoader.style.display = 'none';
      console.log(`Rendered ${finalListings.length} active listings`);

    } catch (e) {
      console.error('renderPlayerListings failed:', e);
      if (playerListingsLoader) playerListingsLoader.style.display = 'none';
    }
  }

  async function makeListingCard(listing) {
    let nameText = `Token #${listing.tokenId}`;
    let rarity = 'Common';
    let pokemonId = listing.tokenId;
    let imageUrl = 'images/pokeball.png';
    let types = [];
    let abilities = '';
    let description = 'A mysterious Pokémon with unknown abilities.';

    try {
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);

      const uri = await nft.tokenURI(listing.tokenId);
      const meta = await parseTokenURI(uri);

      if (meta) {
        if (meta.image) imageUrl = ipfsToHttp(meta.image);
        if (meta.name) nameText = meta.name.charAt(0).toUpperCase() + meta.name.slice(1);

        try {
          const pokeRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${meta.name.toLowerCase()}`);
          if (pokeRes.ok) {
            const pokeData = await pokeRes.json();
            pokemonId = pokeData.id;
            types = pokeData.types?.map(t => t.type.name) || [];
            const abilityNames = pokeData.abilities?.slice(0, 3).map(a => a.ability.name) || [];
            abilities = abilityNames.length > 0 ? `Abilities: ${abilityNames.join(', ')}` : '';
          }

          const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${meta.name.toLowerCase()}`);
          if (speciesRes.ok) {
            const speciesData = await speciesRes.json();
            const flavorText = speciesData.flavor_text_entries?.find(e => e.language.name === 'en');
            if (flavorText) {
              description = flavorText.flavor_text.replace(/\n|\f/g, ' ');
            }
          }
        } catch (e) {
          console.warn(`Couldn't fetch PokeAPI data for ${meta.name}`);
        }

        if (meta.attributes && Array.isArray(meta.attributes)) {
          const rarityAttr = meta.attributes.find(a =>
            a.trait_type?.toLowerCase() === 'rarity'
          );
          if (rarityAttr?.value) {
            rarity = String(rarityAttr.value).trim();
          }
        }
      }
    } catch (e) {
      console.error(`Failed to load metadata for token #${listing.tokenId}:`, e);
    }

    const rarityClass = rarityClassLabel(rarity);
    const card = document.createElement('div');
    card.className = `market-card listed ${rarityClass}`;
    card.dataset.listingId = listing.listingId;

    // ✅ FIX: Check ownership ON CLICK, not during render
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
    abilitiesDiv.textContent = abilities || `NFT Token #${listing.tokenId}`;

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

    // ✅ ADD VISUAL INDICATOR if user owns this (optional but helpful)
    const currentUser = window.wallet?.getAccount?.()?.toLowerCase();
    if (currentUser === listing.seller.toLowerCase()) {
      card.style.border = '2px solid #4CAF50'; // Green border for owned cards
      card.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
      card.title = 'Click to manage your listing';
    }

    return card;
  }

  async function showPlayerListingModal(listing, pokemonName, pokemonId, rarity, isOwner, tokenId) {
    if (isOwner) {
      // ✅ FULL DELIST LOGIC with tokenId parameter
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
      // ... (existing buy logic)
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
  // ✅ CORRECT: Single, unified buyListedOnChain function
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
      const pkcnAddr = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;

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

      // ✅ Store nftId immediately, not just in details
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
          // ✅ REMOVED: image field
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

      // Safe receipt parsing
      let gasFee = '0';
      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );
      } catch (e) {
        console.warn('Gas calculation failed:', e);
      }

      // ✅ Update with same nftId to ensure it's preserved
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

  // FIXED delistPokemon with nftId field added
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

      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);

      txId = window.txHistory.add({
        type: 'delist',
        title: 'Cancel Listing',
        message: `Removing ${pokemonName} from marketplace`,
        status: 'pending',
        fromAddress: await window.wallet.getAccount(),
        nftId: tokenId, // ✅ FIX: Added missing nftId field
        details: {
          pokemonId: pokemonId,
          pokemonName: pokemonName,
          listingId: listingId,
          tokenId: tokenId // ✅ Also add to details for extra reference
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
        nftId: tokenId // ✅ FIX: Ensure nftId is preserved in update
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
          nftId: tokenId // ✅ FIX: Preserve nftId even on failure
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

  // ===== LISTING TRANSACTION HISTORY with nftId preservation =====
  // ✅ FIXED: Properly await signer
  async function listPokemonOnChain(tokenId, pokemonName, pokemonId, rarity, price) {
    const txKey = `list-${tokenId}-${Date.now()}`;
    if (pendingTransactionHashes.has(txKey)) {
      console.warn('⚠️ Duplicate listing prevented');
      return;
    }
    pendingTransactionHashes.add(txKey);

    let txId = null;
    try {
      assertConfig();
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
      const nftAddr = window.CONTRACTS.POKEMON_NFT_ADDRESS;

      // Ensure wallet is connected
      if (!window.wallet.getAccount()) {
        await window.wallet.connectWallet();
      }

      // ✅ CRITICAL FIX: Get signer and address properly
      const signer = await window.wallet.getSigner(); // Await the Promise
      if (!signer) throw new Error("Failed to get signer");

      const sellerAddress = await signer.getAddress(); // Then get address
      const priceBig = ethers.parseUnits(String(price), TOKEN_DECIMALS);

      // Check current approvals
      const nft = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, signer);
      const approved = await nft.getApproved(tokenId);

      if (approved.toLowerCase() !== marketplaceAddr.toLowerCase()) {
        window.txModal.transaction({
          title: 'Approving Marketplace',
          message: 'Please approve the marketplace to handle your NFT...'
        });

        const approveTx = await nft.approve(marketplaceAddr, tokenId);
        await approveTx.wait();
      }

      // Add pending transaction to history
      txId = window.txHistory.add({
        type: 'list',
        title: 'List Pokémon',
        message: `Listing ${pokemonName} for sale`,
        status: 'pending',
        tokenAmount: `${price} PKCN`,
        fromAddress: sellerAddress,
        toAddress: null,
        nftId: tokenId,
        details: {
          pokemonId: pokemonId,
          pokemonName: pokemonName,
          tokenId: tokenId,
          rarity: rarity,
          price: price
        }
      });

      console.log(`📋 Listing transaction added to history with ID: ${txId}, nftId: ${tokenId}`);

      window.txModal.transaction({
        title: 'Creating Listing',
        message: 'Please confirm the transaction in your wallet...'
      });

      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.listPokemon(BigInt(tokenId), priceBig);

      pendingTransactionHashes.delete(txKey);
      window.txHistory.update(txId, {
        hash: tx.hash,
        message: 'Transaction submitted, waiting for confirmation...'
      });

      const receipt = await tx.wait();

      // Parse listingId from logs
      let listingId = null;
      let gasFee = '0';

      try {
        gasFee = TransactionHistory.formatGas(
          receipt.gasUsed.toString(),
          receipt.gasPrice.toString()
        );

        const listTopic = ethers.id("PokeListed(uint256,uint256,address,uint256)");
        console.log(`🔍 Parsing logs for topic: ${listTopic}`);
        for (const log of receipt.logs) {
          console.log(`📜 Log topic: ${log.topics[0]}`);
          if (log.topics[0] === listTopic) {
            listingId = BigInt(log.topics[1]).toString();
            console.log(`✅ Found PokeListed event! Listing ID: ${listingId}`);
            break;
          }
        }

        if (!listingId) {
          console.warn('⚠️ Could not find PokeListed event in logs');
        }
      } catch (e) {
        console.error('❌ Log parsing failed:', e);
      }

      // Get the original transaction details before updating
      const originalTx = window.txHistory.notifications.find(n => n.id === txId);
      const originalNftId = originalTx?.nftId || tokenId;

      window.txHistory.update(txId, {
        status: 'success',
        message: `Successfully listed ${pokemonName}!`,
        hash: tx.hash,
        gasFee: `${gasFee} ETH`,
        nftId: originalNftId,
        details: {
          ...originalTx?.details,
          listingId: listingId
        }
      });

      console.log(`✅ Listing transaction completed: ${txId}, nftId preserved: ${originalNftId}`);

      window.txModal.success(
        'Listing Created!',
        `Your ${pokemonName} has been listed for sale! ${listingId ? `Listing ID: #${listingId}` : ''}`,
        () => {
          renderPlayerListings();
        }
      );
    } catch (e) {
      console.error('❌ listPokemonOnChain failed:', e);
      let message = 'Failed to create listing';
      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      else if (e?.reason) message = e.reason;
      else if (e?.message) message = e.message;

      if (txId) {
        window.txHistory.update(txId, {
          status: 'failed',
          message: message,
          nftId: tokenId
        });
      }

      window.txModal.error('Listing Failed', message);
    } finally {
      pendingTransactionHashes.delete(txKey);
      if (txId) {
        setTimeout(() => window.txHistory.markAsRead(txId), 3000);
      }
    }
  }
 // ✅ FIXED: Comprehensive transaction sync - replaces the old syncPastListings function
async function syncAllPastTransactions() {
  try {
    if (!window.wallet.getAccount()) return;

    // Use new sync key to force re-sync with enhanced logic
    const syncKey = `pokechain_tx_sync_all_${window.wallet.getAccount().toLowerCase()}`;
    const hasSynced = localStorage.getItem(syncKey);
    if (hasSynced) {
      console.log('✅ All past transactions already synced, skipping...');
      return;
    }

    console.log('🔄 First-time sync of all past transactions from blockchain...');
    const provider = await window.wallet.getProvider();
    const marketplace = new ethers.Contract(
      window.CONTRACTS.MARKETPLACE_ADDRESS,
      window.ABIS.MARKETPLACE,
      provider
    );
    const nft = new ethers.Contract(
      window.CONTRACTS.POKEMON_NFT_ADDRESS,
      window.ABIS.POKEMON_NFT,
      provider
    );

    const currentUser = window.wallet.getAccount().toLowerCase();
    const fromBlock = -10000; // Last 10k blocks

    // Query all events in parallel for better performance
    console.log('📡 Querying blockchain events...');
    const [userListLogs, allDelistLogs, allBuyLogs, userMintLogs] = await Promise.all([
      // User's list events
      marketplace.queryFilter(marketplace.filters.PokeListed(null, null, currentUser), fromBlock, 'latest'),
      // All delist events (we'll filter later)
      marketplace.queryFilter(marketplace.filters.PokeDelisted(null), fromBlock, 'latest'),
      // All marketplace purchase events (we'll filter later)
      marketplace.queryFilter(marketplace.filters.ListingBought(null, null), fromBlock, 'latest'),
      // User's mint events (official purchases)
      nft.queryFilter(nft.filters.PokemonMinted(null, currentUser), fromBlock, 'latest')
    ]);

    console.log(`📜 Found ${userListLogs.length} list, ${allDelistLogs.length} delist, ${allBuyLogs.length} buy, ${userMintLogs.length} mint events`);

    // Build a comprehensive map of all listings for cross-reference
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

    // 1️⃣ Process LIST events (user as seller)
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

    // 2️⃣ Process DELIST events (user as seller)
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

    // 3️⃣ Process MARKETPLACE PURCHASE events (user as buyer)
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

    // 4️⃣ Process OFFICIAL PURCHASE events (user as buyer)
    for (const log of userMintLogs) {
      if (txExists(log.transactionHash)) continue;
      try {
        const { tokenId, owner, name, rarity } = log.args;
        
        // Try to parse price from transaction input
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

    // Refresh UI components
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

// ✅ Helper function to get Pokemon metadata
async function getPokemonMetadata(tokenId, provider) {
  try {
    const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);
    const uri = await nft.tokenURI(tokenId);
    const meta = await parseTokenURI(uri);
    
    if (!meta) return null;
    
    // Try to get additional PokeAPI data
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
    } else {
      togglePlayer.classList.add('active');
      toggleOfficial.classList.remove('active');
      officialSection.style.display = 'none';
      playerSection.style.display = 'block';

      if (!playerListingsLoaded) {
        renderPlayerListings();
        playerListingsLoaded = true;
      }
    }
  }

  function attachHandlers() {
    searchInput?.addEventListener('input', () => renderOfficialGrid());
    typeFilter?.addEventListener('change', () => renderOfficialGrid());
    sortSelect?.addEventListener('change', () => renderOfficialGrid());

    document.getElementById('toggleOfficial')?.addEventListener('click', () => setMarketplaceMode('official'));
    document.getElementById('togglePlayer')?.addEventListener('click', () => setMarketplaceMode('player'));
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
          window.CONTRACTS.MARKETPLACE_ADDRESS,
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

  (async function init() {
    console.log('🚀 Initializing marketplace...');
    await cleanupLegacyListings();
    loadRecentlyPurchased();
    await loadTypes();
    await loadTokenDecimals();
    await loadGen1And2Pokemon();
    attachHandlers();
    setupEventListeners();

    // Sync past listings after a delay
    setTimeout(() => {
      console.log('⏰ Starting sync of past listings...');
      syncAllPastTransactions();
    }, 3000);

    window.txHistory.updateUI();

    // Initial render of player listings
    setTimeout(() => {
      console.log('🎨 Initial render of player listings...');
      renderPlayerListings();
      playerListingsLoaded = true;
    }, 1500);

    // Save recently purchased listings periodically
    setInterval(saveRecentlyPurchased, 30000);
    // ✅ EXPOSE the listing function to collection.js

    window.listPokemonOnChain = listPokemonOnChain;
    console.log('🌍 Exposed listPokemonOnChain globally');
    window.txHistory = txHistory; // Already exposed but good to confirm

    console.log('✅ Marketplace initialization complete');
  })();


});