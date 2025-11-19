document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  let TOKEN_DECIMALS = 18; 
  
  // ===== State Management for Preventing Duplicates =====
  let pendingPurchases = new Set();
  let activeListings = new Map();
  let recentlyPurchasedListings = new Set();
  let inactiveListings = new Set();

  // ===== Helper Functions =====
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

  // FIX: Ensure lowercase and trimmed output
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

  // ===== Load Gen 1-2 Pokemon =====
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

  // ===== Per-rarity supply function =====
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
    
    // CRITICAL FIX: Include base_experience in dataset so purchase can compute rarity correctly
    card.dataset.pokemon = JSON.stringify({
      id: p.id,
      name: p.name,
      base_experience: p.base_experience || 0, // ENSURE THIS IS INCLUDED
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

    // Supply Badge - Upper Right (per-rarity supply)
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

    // Art section
    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || '';
    img.alt = p.name || '';
    art.appendChild(img);

    // Pokemon name with ID
    const nameEl = document.createElement('h4');
    nameEl.className = 'name';
    nameEl.textContent = `#${p.id} ${p.name}`;

    // Types
    const typesWrap = document.createElement('div');
    typesWrap.className = 'types';
    (p.types || []).forEach(t => {
      const tb = document.createElement('span');
      tb.className = 'type-badge';
      tb.textContent = t.type.name.toUpperCase();
      typesWrap.appendChild(tb);
    });

    // Abilities
    const abil = document.createElement('div');
    abil.className = 'abilities';
    const abilityNames = (p.abilities?.map(a => a.ability?.name || a.name).slice(0, 3) || []);
    abil.textContent = abilityNames.length > 0 ? `Abilities: ${abilityNames.join(', ')}` : 'Abilities: Unknown';

    // Description
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

    // Price display at bottom
    const priceDiv = document.createElement('div');
    priceDiv.className = 'price-display';
    const pricePill = document.createElement('div');
    pricePill.className = 'price-pill';
    pricePill.textContent = `${p.price} PKCN`;
    priceDiv.appendChild(pricePill);

    // Build card
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
    const token = new ethers.Contract(tokenAddress, window.ABIS.ERC20_MIN, signer);

    if (typeof humanAmountOrRaw === 'bigint' || (typeof humanAmountOrRaw === 'string' && /^[0-9]+$/.test(humanAmountOrRaw))) {
      const rawAmount = BigInt(humanAmountOrRaw.toString());
      const owner = await window.wallet.getAccount();
      const allowance = BigInt((await token.allowance(owner, spender)).toString());
      if (allowance >= rawAmount) return true;
      const tx = await token.approve(spender, rawAmount);
      await tx.wait();
      return true;
    }

    const human = humanAmountOrRaw;
    const raw = ethers.parseUnits(String(human), TOKEN_DECIMALS);
    const owner = await window.wallet.getAccount();
    const allowance = BigInt((await token.allowance(owner, spender)).toString());
    if (allowance >= BigInt(raw.toString())) return true;
    const tx = await token.connect(signer).approve(spender, raw);
    await tx.wait();
    return true;
  }

  async function buyPokemonOnChain(pokemon) {
    try {
      assertConfig();

      if (!window.wallet.getAccount()) {
        const shouldConnect = await window.txModal.confirm({
          title: 'Connect Wallet',
          message: 'You must connect your wallet to buy Pokemon.',
          confirmText: 'Connect Wallet'
        });
        if (!shouldConnect) return;
        await window.wallet.connectWallet();
      }

      const pkcnAddr = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;

      const rawPrice = ethers.parseUnits(String(pokemon.price), TOKEN_DECIMALS);

      const confirmed = await window.txModal.confirm({
        title: 'Buy Pokemon',
        message: `Confirm purchase of this Pokemon?`,
        details: [
          { label: 'Pokemon', value: `#${pokemon.id} ${pokemon.name}` },
          { label: 'Rarity', value: pokemon.rarity },
          { label: 'Price', value: `${pokemon.price} PKCN`, highlight: true }
        ],
        confirmText: 'Buy Now',
        cancelText: 'Cancel'
      });

      if (!confirmed) return;

      window.txModal.transaction({
        title: 'Purchasing Pokemon',
        message: 'Approving payment and minting your Pokemon...',
        subtitle: 'Please confirm the transactions in your wallet.'
      });

      await ensureTokenApproval(pkcnAddr, marketplaceAddr, rawPrice);

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      
      // CRITICAL FIX: Pass the rarity STRING instead of base_experience number
      // The contract expects a rarity string to check supply, not a number
      const tx = await marketplace.buyPokemon(
        pokemon.name,
        pokemon.rarity, // FIX: Pass rarity string, not base_experience number!
        pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '',
        rawPrice
      );

      const receipt = await tx.wait();

      let mintedTokenId = null;
      try {
        const nftIface = new ethers.Interface(window.ABIS.POKEMON_NFT);
        for (const log of receipt.logs) {
          try {
            const parsed = nftIface.parseLog(log);
            if (parsed && (parsed.name === 'PokeMinted' || parsed.name === 'PokemonMinted')) {
              mintedTokenId = parsed.args[0].toString();
              break;
            }
          } catch {}
        }
      } catch (e) {
        console.warn('Failed to parse NFT logs for tokenId', e);
      }

      if (!mintedTokenId) {
        try {
          const mpIface = new ethers.Interface(window.ABIS.MARKETPLACE);
          for (const log of receipt.logs) {
            try {
              const parsed = mpIface.parseLog(log);
              if (parsed && (parsed.name === 'PokePurchased' || parsed.name === 'PokemonPurchased')) {
                mintedTokenId = parsed.args[1].toString();
                break;
              }
            } catch {}
          }
        } catch (e) {
          console.warn('parse marketplace logs failed', e);
        }
      }

      window.txModal.success(
        'Purchase Successful!',
        `You have successfully purchased ${pokemon.name}! Token ID: ${mintedTokenId || '(unknown)'}. Check your Collection.`,
        () => {
          window.wallet.updateBalanceDisplayIfNeeded();
          renderOfficialGrid(); // Refresh supply
        }
      );
    } catch (err) {
      console.error('Buy (on-chain) failed', err);
      let message = 'Transaction failed';
      if (err?.reason) message = err.reason;
      else if (err?.message) message = err.message;
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      window.txModal.error('Purchase Failed', message);
    }
  }

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
          if (!parsed) continue;
          
          const eventName = parsed.name;
          const args = parsed.args;
          const eventKey = `${log.blockNumber}-${log.logIndex}`;

          if (processedSet.has(eventKey)) continue;
          processedSet.add(eventKey);

          if (eventName === 'PokemonListed' || eventName === 'PokeListed') {
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
            console.log(`✅ ADDED: Listing #${listingId} (${eventName})`);
          }
          
          else if (eventName === 'PokemonDelisted' || eventName === 'PokeDelisted' ||
                   eventName === 'PokemonBought' || eventName === 'PokeBought') {
            const listingId = args.listingId?.toString() || args[0]?.toString();
            if (listingsMap.has(listingId)) {
              listingsMap.delete(listingId);
              recentlyPurchasedListings.add(listingId);
              console.log(`❌ REMOVED: Listing #${listingId} (${eventName})`);
            }
          }
          
        } catch (parseError) {
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
        
        // FIX: Ensure rarity is a string and trim whitespace
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
    
    const currentUser = window.wallet?.getAccount?.()?.toLowerCase();
    const isOwner = currentUser === listing.seller.toLowerCase();
    
    card.addEventListener('click', () => {
      showPlayerListingModal(listing, nameText, pokemonId, rarity, isOwner);
    });

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    // NFT ID Badge - Upper Right
    const nftIdBadge = document.createElement('div');
    nftIdBadge.className = 'nft-id-badge';
    nftIdBadge.textContent = `#${listing.tokenId}`;

    // Art
    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = nameText;
    art.appendChild(img);

    // Name
    const nameEl = document.createElement('h4');
    nameEl.className = 'name';
    nameEl.textContent = `#${pokemonId} ${nameText}`;

    // Types
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

    // Abilities
    const abilitiesDiv = document.createElement('div');
    abilitiesDiv.className = 'abilities';
    abilitiesDiv.textContent = abilities || `NFT Token #${listing.tokenId}`;

    // Description
    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description;

    // Price
    const priceDiv = document.createElement('div');
    priceDiv.className = 'price-display';
    const pricePill = document.createElement('div');
    pricePill.className = 'price-pill';
    pricePill.textContent = formatPrice(listing.price);
    priceDiv.appendChild(pricePill);

    // Build card
    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abilitiesDiv);
    inner.appendChild(descriptionDiv);
    inner.appendChild(priceDiv);
    
    card.appendChild(nftIdBadge);
    card.appendChild(inner);
    
    return card;
  }

  async function showPlayerListingModal(listing, pokemonName, pokemonId, rarity, isOwner) {
    if (isOwner) {
      const confirmed = await window.txModal.confirm({
        title: 'Cancel Listing',
        message: `Remove your Pokémon from the marketplace?`,
        details: [
          { label: 'Pokémon', value: `#${pokemonId} ${pokemonName}` },
          { label: 'Rarity', value: rarity },
          { label: 'NFT ID', value: `#${listing.tokenId}` },
          { label: 'Listing ID', value: `#${listing.listingId}` }
        ],
        confirmText: 'Cancel Listing',
        cancelText: 'Keep Listed',
        dangerous: true
      });
      
      if (confirmed) {
        await delistPokemon(listing.listingId, pokemonName, pokemonId);
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
        await buyListedOnChain(listing.listingId, listing.price, pokemonName, pokemonId, listing.seller);
      }
    }
  }

  async function buyListedOnChain(listingId, priceRaw, pokemonName, pokemonId, seller) {
    if (pendingPurchases.has(listingId)) {
      console.warn(`⚠️ Purchase already in progress for listing #${listingId}`);
      return;
    }
    
    pendingPurchases.add(listingId);
    removeListingFromUI(listingId);
    recentlyPurchasedListings.add(listingId);
    
    try {
      assertConfig();

      if (!window.wallet.getAccount()) {
        const shouldConnect = await window.txModal.confirm({
          title: 'Connect Wallet',
          message: 'You must connect your wallet to buy listed Pokemon.',
          confirmText: 'Connect Wallet'
        });
        if (!shouldConnect) {
          pendingPurchases.delete(listingId);
          return;
        }
        await window.wallet.connectWallet();
      }

      const priceBig = BigInt(priceRaw.toString());
      const humanPrice = ethers.formatUnits(priceBig, TOKEN_DECIMALS);

      const confirmed = await window.txModal.confirm({
        title: 'Buy Listed Pokemon',
        message: `Purchase this Pokemon from another player?`,
        details: [
          { label: 'Pokemon', value: `#${pokemonId} ${pokemonName}` },
          { label: 'Seller', value: shortAddress(seller) },
          { label: 'Price', value: `${humanPrice} PKCN`, highlight: true }
        ],
        confirmText: 'Buy Now',
        cancelText: 'Cancel'
      });

      if (!confirmed) {
        pendingPurchases.delete(listingId);
        return;
      }

      window.txModal.transaction({
        title: 'Buying Listed Pokemon',
        message: 'Processing purchase from marketplace...',
        subtitle: 'The seller will receive the PKCN tokens.'
      });

      const pkcn = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;

      await ensureTokenApproval(pkcn, marketplaceAddr, priceBig);

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.buyListedPokemon(BigInt(listingId));
      
      const receipt = await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));

      window.txModal.success(
        'Purchase Successful!',
        `You have successfully purchased ${pokemonName} from ${shortAddress(seller)}! Check your Collection.`,
        () => {
          window.wallet.updateBalanceDisplayIfNeeded();
          pendingPurchases.delete(listingId);
          setTimeout(() => renderPlayerListings(), 1000);
        }
      );
    } catch (e) {
      console.error('buyListedOnChain failed', e);
      let message = 'Failed to purchase listing';
      if (e?.reason) message = e.reason;
      else if (e?.message) message = e.message;
      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      
      pendingPurchases.delete(listingId);
      recentlyPurchasedListings.delete(listingId);
      restoreListingToUI(listingId);
      
      window.txModal.error('Purchase Failed', message);
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

  async function delistPokemon(listingId, pokemonName, pokemonId) {
    try {
      assertConfig();
      await window.wallet.ensureProvider();
      
      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(
        window.CONTRACTS.MARKETPLACE_ADDRESS, 
        window.ABIS.MARKETPLACE, 
        signer
      );

      const confirmed = await window.txModal.confirm({
        title: 'Cancel Listing',
        message: `Remove your Pokemon from the marketplace?`,
        details: [
          { label: 'Pokemon', value: `#${pokemonId} ${pokemonName}` },
          { label: 'Listing ID', value: `#${listingId}` }
        ],
        confirmText: 'Cancel Listing',
        cancelText: 'Keep Listed',
        dangerous: true
      });

      if (!confirmed) return;

      window.txModal.transaction({
        title: 'Canceling Listing',
        message: 'Removing your Pokemon from the marketplace...',
        subtitle: 'Confirm the transaction in your wallet.'
      });

      let tx;
      try {
        tx = await marketplace.cancelListing(BigInt(listingId));
      } catch (gasError) {
        console.warn('Gas estimation failed, trying with manual limit:', gasError);
        tx = await marketplace.cancelListing(BigInt(listingId), { gasLimit: 50000 });
      }
      
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error('Transaction reverted on blockchain');
      }

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
      
      window.txModal.error('Delist Failed', message);
      setTimeout(() => renderPlayerListings(), 1500);
    }
  }

  // ===== Toggle Logic =====
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

  // ===== Persist recently purchased listings across sessions =====
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

  // ===== CRITICAL: Real-time event listeners =====
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

  // ===== Initialization =====
  (async function init() {
    await cleanupLegacyListings();
    loadRecentlyPurchased();
    await loadTypes();
    await loadTokenDecimals();
    await loadGen1And2Pokemon();
    attachHandlers();
    setupEventListeners();
    
    setTimeout(() => {
      renderPlayerListings();
      playerListingsLoaded = true;
    }, 1000);
    
    setInterval(saveRecentlyPurchased, 30000);
  })();
});