/* marketplace.js - final fixed version with 0 decimal support */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ===== Global Token Decimals (cached) =====
  let TOKEN_DECIMALS = 18; // Default fallback

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
      // Use cached decimals instead of hardcoded 18
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

  // ===== Main Variables =====
  const marketGrid = document.getElementById('officialMarketGrid');
  const playerListingsGrid = document.getElementById('playerListingsGrid');
  const loader = document.getElementById('loader');
  const playerListingsLoader = document.getElementById('playerListingsLoader');
  const fetchMoreBtn = document.getElementById('fetchMoreBtn');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortSelect = document.getElementById('sortSelect');

  const pokeCache = new Map();
  const PAGE_SIZE = 24;
  let offset = 0;
  let allLoaded = false;
  let playerListingsLoaded = false;

  // ===== Pricing & Rarity Helpers =====
  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
  }

  function rarityClassLabel(r) { return r ? r.toLowerCase() : 'common'; }

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

  async function loadPage() {
    if (allLoaded) return;
    if (loader) loader.style.display = 'flex';
    try {
      const url = `https://pokeapi.co/api/v2/pokemon?limit=${PAGE_SIZE}&offset=${offset}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed ' + r.status);
      const j = await r.json();
      const results = j.results || [];
      if (results.length === 0) {
        allLoaded = true;
        return;
      }
      const details = await Promise.all(results.map(it => fetch(it.url).then(res => res.json())));
      details.forEach(d => pokeCache.set(d.id, d));
      offset += PAGE_SIZE;
      renderOfficialGrid();
    } catch (e) {
      console.error('loadPage error', e);
      window.txModal?.error('Load Failed', 'Failed to load Pokémon. Please try again.');
    } finally {
      if (loader) loader.style.display = 'none';
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

    // Clear and render official cards
    marketGrid.innerHTML = '';
    items.forEach(p => marketGrid.appendChild(makeOfficialCard(p)));
  }

  function makeOfficialCard(p) {
    const card = document.createElement('div');
    const rarityClass = rarityClassLabel(p.rarity);
    card.className = `market-card ${rarityClass}`;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

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
      tb.textContent = t.type.name;
      typesWrap.appendChild(tb);
    });

    const abil = document.createElement('div');
    abil.className = 'abilities';
    abil.textContent = 'Abilities: ' + (p.abilities?.map(a => a.ability?.name || a.name).slice(0, 3).join(', ') || '—');

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    const price = document.createElement('div');
    price.className = 'price-pill';
    price.textContent = `${p.price} PKCN`;
    const supplySpan = document.createElement('div');
    supplySpan.className = 'supply-pill';
    supplySpan.textContent = '… left';
    supplySpan.style.fontSize = '11px';
    supplySpan.style.marginLeft = '8px';
    bottom.appendChild(price);
    bottom.appendChild(supplySpan);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn-primary-action';
    buyBtn.textContent = 'Buy';
    buyBtn.onclick = () => buyPokemonOnChain(p);
    actions.appendChild(buyBtn);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abil);
    inner.appendChild(bottom);
    inner.appendChild(actions);

    card.appendChild(inner);

    fetchRemainingSupplyForRarity(p.rarity)
      .then(n => { supplySpan.textContent = (typeof n === 'number') ? `${n} left` : '—'; })
      .catch(() => { supplySpan.textContent = '—'; });

    return card;
  }

  function assertConfig() {
    if (!window.CONTRACTS || !window.ABIS) throw new Error('Missing config.js (CONTRACTS/ABIS)');
    if (!window.wallet) throw new Error('Missing wallet.js helper');
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

  async function ensureTokenApproval(tokenAddress, spender, humanAmountOrRaw) {
    const signer = await window.wallet.getSigner();
    const token = new ethers.Contract(tokenAddress, window.ABIS.ERC20_MIN, signer);

    // Use cached decimals for raw conversion
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
    const raw = ethers.parseUnits(String(human), TOKEN_DECIMALS); // Use cached decimals
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

      // Use cached decimals for price conversion
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
      const tx = await marketplace.buyPokemon(
        pokemon.name,
        computeRarity(pokemon.base_experience || 0),
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
      const fromBlock = Math.max(0, latest - 200000);
      
      console.log(`🔍 Fetching marketplace events from blocks ${fromBlock} → ${latest}`);

      const mpIface = new ethers.Interface(window.ABIS.MARKETPLACE);
      
      // Get all logs from the marketplace contract
      const logs = await provider.getLogs({
        address: marketplaceAddr,
        fromBlock: fromBlock,
        toBlock: 'latest'
      });
      
      console.log(`📝 Found ${logs.length} total logs from marketplace`);

      // CRITICAL: Sort chronologically to process events in order
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      
      const listingsMap = new Map();
      
      for (const log of logs) {
        try {
          const parsed = mpIface.parseLog(log);
          const eventName = parsed.name;
          const args = parsed.args;
          
          console.log(`📋 Processing event: ${eventName} at block ${log.blockNumber}`);

          // Handle BOTH event name variants
          if (eventName === 'PokemonListed' || eventName === 'PokeListed') {
            const listingId = args.listingId?.toString() || args[0]?.toString();
            const tokenId = args.tokenId?.toString() || args[1]?.toString();
            const seller = args.seller || args[2];
            const price = args.price || args[3];
            
            listingsMap.set(listingId, {
              listingId,
              tokenId,
              seller,
              price,
              active: true,
              eventName // Track which variant was used
            });
            console.log(`✅ ADDED: Listing #${listingId} for token #${tokenId} by ${seller} (${eventName})`);
          }
          
          // Handle delisting events (both variants)
          else if (eventName === 'PokemonDelisted' || eventName === 'PokeDelisted') {
            const listingId = args.listingId?.toString() || args[0]?.toString();
            if (listingsMap.has(listingId)) {
              listingsMap.delete(listingId);
              console.log(`❌ REMOVED: Delisted listing #${listingId}`);
            }
          }
          
          // Handle purchase events (both variants)
          else if (eventName === 'PokemonBought' || eventName === 'PokeBought') {
            const listingId = args.listingId?.toString() || args[0]?.toString();
            if (listingsMap.has(listingId)) {
              listingsMap.delete(listingId);
              console.log(`❌ REMOVED: Sold listing #${listingId}`);
            }
          }
          
        } catch (parseError) {
          // Log non-matching logs for debugging
          console.debug("⚠️ Log doesn't match Marketplace ABI:", log.topics[0]);
        }
      }

      const finalListings = Array.from(listingsMap.values());
      console.log(`✅ FINAL: ${finalListings.length} active player listings`);
      return finalListings;
      
    } catch (e) {
      console.error("❌ fetchActiveListingsFromChain failed:", e);
      return [];
    }
  };

  async function renderPlayerListings() {
    try {
      if (!playerListingsGrid) return;
      
      // Show loader
      if (playerListingsLoader) playerListingsLoader.style.display = 'flex';
      
      const listings = await window.fetchActiveListingsFromChain();
      
      // Update count
      const countEl = document.getElementById('playerListingCount');
      if (countEl) {
        countEl.textContent = listings.length > 0 ? `${listings.length} available` : 'No listings yet';
      }

      // Clear grid
      playerListingsGrid.innerHTML = '';

      if (!listings || listings.length === 0) {
        console.log('⚠️ No active player listings found');
        if (playerListingsLoader) playerListingsLoader.style.display = 'none';
        return;
      }

      // Render cards
      for (const L of listings) {
        const card = await makeListingCard(L);
        playerListingsGrid.appendChild(card);
      }
      
      if (playerListingsLoader) playerListingsLoader.style.display = 'none';
    } catch (e) {
      console.error('❌ renderPlayerListings failed:', e);
      if (playerListingsLoader) playerListingsLoader.style.display = 'none';
    }
  }

  async function makeListingCard(listing) {
    let nameText = `Token #${listing.tokenId}`;
    let rarity = 'Common';
    let pokemonId = listing.tokenId;
    let imageUrl = 'images/pokeball.png';

    try {
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);
      
      // Get tokenURI
      const uri = await nft.tokenURI(listing.tokenId);
      console.log(`🖼️ Token #${listing.tokenId} URI:`, uri);
      
      const meta = await parseTokenURI(uri);
      if (meta) {
        if (meta.image) imageUrl = ipfsToHttp(meta.image);
        if (meta.name) nameText = meta.name.charAt(0).toUpperCase() + meta.name.slice(1);
        
        // Get Pokemon ID from PokeAPI
        try {
          const pokeRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${meta.name.toLowerCase()}`);
          if (pokeRes.ok) {
            const pokeData = await pokeRes.json();
            pokemonId = pokeData.id;
          }
        } catch (e) {
          console.warn(`⚠️ Couldn't fetch PokeAPI data for ${meta.name}`);
        }
        
        // Extract rarity from attributes
        if (meta.attributes && Array.isArray(meta.attributes)) {
          const rarityAttr = meta.attributes.find(a => 
            a.trait_type?.toLowerCase() === 'rarity'
          );
          if (rarityAttr?.value) rarity = rarityAttr.value;
        }
      }
    } catch (e) {
      console.error(`❌ Failed to load metadata for token #${listing.tokenId}:`, e);
    }

    // Apply rarity class to card
    const rarityClass = rarityClassLabel(rarity);
    const card = document.createElement('div');
    card.className = `market-card listed ${rarityClass}`;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

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
    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = rarity;
    typesWrap.appendChild(badge);

    const currentUser = window.wallet?.getAccount?.()?.toLowerCase();
    const isOwner = currentUser === listing.seller.toLowerCase();

    const ownerDiv = document.createElement('div');
    ownerDiv.className = `owner-badge ${isOwner ? 'self' : ''}`;
    ownerDiv.textContent = isOwner ? '👤 Your Listing' : `👤 Seller: ${shortAddress(listing.seller)}`;

    const abilities = document.createElement('div');
    abilities.className = 'abilities';
    abilities.textContent = `NFT Token #${listing.tokenId}`;

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    const priceDiv = document.createElement('div');
    priceDiv.className = 'price-pill';
    priceDiv.textContent = formatPrice(listing.price);
    bottom.appendChild(priceDiv);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (isOwner) {
      const delistBtn = document.createElement('button');
      delistBtn.className = 'btn-secondary-action';
      delistBtn.textContent = 'Cancel Listing';
      delistBtn.onclick = () => delistPokemon(listing.listingId, nameText, pokemonId);
      actions.appendChild(delistBtn);
    } else {
      const buyBtn = document.createElement('button');
      buyBtn.className = 'btn-primary-action';
      buyBtn.textContent = 'Buy Now';
      buyBtn.onclick = () => buyListedOnChain(listing.listingId, listing.price, nameText, pokemonId, listing.seller);
      actions.appendChild(buyBtn);
    }

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(ownerDiv);
    inner.appendChild(abilities);
    inner.appendChild(bottom);
    inner.appendChild(actions);
    card.appendChild(inner);
    
    return card;
  }

  async function buyListedOnChain(listingId, priceRaw, pokemonName, pokemonId, seller) {
    try {
      assertConfig();

      if (!window.wallet.getAccount()) {
        const shouldConnect = await window.txModal.confirm({
          title: 'Connect Wallet',
          message: 'You must connect your wallet to buy listed Pokemon.',
          confirmText: 'Connect Wallet'
        });
        if (!shouldConnect) return;
        await window.wallet.connectWallet();
      }

      const priceBig = BigInt(priceRaw.toString());
      // CORRECTED: Use TOKEN_DECIMALS instead of hardcoded 18
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

      if (!confirmed) return;

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
      await tx.wait();

      window.txModal.success(
        'Purchase Successful!',
        `You have successfully purchased ${pokemonName} from ${shortAddress(seller)}! Check your Collection.`,
        () => {
          window.wallet.updateBalanceDisplayIfNeeded();
          renderPlayerListings(); // Refresh player listings
        }
      );
    } catch (e) {
      console.error('buyListedOnChain failed', e);
      let message = 'Failed to purchase listing';
      if (e?.reason) message = e.reason;
      else if (e?.message) message = e.message;
      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      window.txModal.error('Purchase Failed', message);
    }
  }

  async function delistPokemon(listingId, pokemonName, pokemonId) {
    try {
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

      const signer = await window.wallet.getSigner();
      const marketplace = new ethers.Contract(window.CONTRACTS.MARKETPLACE_ADDRESS, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.delistPokemon(BigInt(listingId));
      await tx.wait();

      window.txModal.success(
        'Listing Canceled',
        `Your ${pokemonName} has been removed from the marketplace.`,
        () => renderPlayerListings() // Refresh player listings
      );
    } catch (e) {
      console.error('delistPokemon failed', e);
      let message = 'Failed to cancel listing';
      if (e?.reason) message = e.reason;
      else if (e?.message) message = e.message;
      if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      window.txModal.error('Delist Failed', message);
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
      
      // Load player listings when switching to player mode
      if (!playerListingsLoaded) {
        renderPlayerListings();
        playerListingsLoaded = true;
      }
    }
  }

  function attachHandlers() {
    fetchMoreBtn?.addEventListener('click', loadPage);
    searchInput?.addEventListener('input', () => renderOfficialGrid());
    typeFilter?.addEventListener('change', () => renderOfficialGrid());
    sortSelect?.addEventListener('change', () => renderOfficialGrid());
    
    // Toggle buttons
    document.getElementById('toggleOfficial')?.addEventListener('click', () => setMarketplaceMode('official'));
    document.getElementById('togglePlayer')?.addEventListener('click', () => setMarketplaceMode('player'));
  }

  // ===== Initialization =====
  (async function init() {
    await loadTypes();
    await loadTokenDecimals(); // Load decimals first
    await loadPage();
    attachHandlers();
    
    // Load player listings in background
    setTimeout(() => {
      renderPlayerListings();
      playerListingsLoaded = true;
    }, 1000);
  })();
});