/* marketplace.js - updated
   - Adds player-listings rendering (reads marketplace logs)
   - Displays NFT tokenId where available
   - Upgrades price ranges by rarity (deterministic)
   - Keeps existing UI & fetch/paging behavior
*/

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const marketGrid = document.getElementById('marketGrid');
  const loader = document.getElementById('loader');
  const fetchMoreBtn = document.getElementById('fetchMoreBtn');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortSelect = document.getElementById('sortSelect');

  const pokeCache = new Map();
  const PAGE_SIZE = 24;
  let offset = 0;
  let allLoaded = false;

  // ---- Pricing / Rarity helpers (deterministic) ----
  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
  }

  function rarityClassLabel(r) { return r ? r.toLowerCase() : 'common'; }

  // Deterministic price per rarity (PKCN units)
  function computeMockPrice(p) {
    const rarity = computeRarity(p.base_experience || 0);
    const idFactor = (p.id % 50); // a small deterministic variance
    switch (rarity) {
      case 'Common': return Math.max(100, 100 + Math.round((p.base_experience || 10) * 1.2) + idFactor);
      case 'Uncommon': return Math.max(300, 300 + Math.round((p.base_experience || 30) * 1.5) + idFactor);
      case 'Rare': return Math.max(700, 700 + Math.round((p.base_experience || 60) * 2.0) + idFactor);
      case 'Epic': return Math.max(1200, 1200 + Math.round((p.base_experience || 100) * 2.3) + idFactor);
      case 'Legendary': return Math.max(1500, 1500 + Math.round((p.base_experience || 200) * 3.0) + idFactor);
      default: return 200;
    }
  }

  // ---- Load types and PokeAPI pages (unchanged behavior) ----
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
      renderGrid();
    } catch (e) {
      console.error('loadPage error', e);
      alert('Failed to load Pokémon. Please try again.');
    } finally {
      if (loader) loader.style.display = 'none';
    }
  }

  function renderGrid() {
    if (!marketGrid) return;
    marketGrid.innerHTML = '';

    // First render player on-chain listings (if any)
    renderPlayerListings().catch(e => console.warn('renderPlayerListings', e));

    const q = (searchInput?.value || '').trim().toLowerCase();
    const type = (typeFilter?.value || '');
    const sortBy = (sortSelect?.value || 'id');

    let items = Array.from(pokeCache.values());
    if (q) {
      items = items.filter(p => (p.name && p.name.includes(q)) || String(p.id) === q);
    }
    if (type) {
      items = items.filter(p => p.types.some(t => t.type.name === type));
    }

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

    items.forEach(p => marketGrid.appendChild(makeCard(p)));
  }

  function makeCard(p) {
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
    // supply placeholder (will be updated)
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

    // fetch remaining supply (non-blocking)
    fetchRemainingSupplyForRarity(p.rarity).then(n => {
      supplySpan.textContent = (typeof n === 'number') ? `${n} left` : '—';
    }).catch(e => {
      supplySpan.textContent = '—';
      console.debug('supply fetch', e);
    });

    return card;
  }

  // ----------------- On-chain integration (mint buys) -----------------
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

  // Ensure marketplace approved to spend 'humanAmount' (number or string) OR an already-scaled BigInt.
  async function ensureTokenApproval(tokenAddress, spender, humanAmountOrRaw) {
    const signer = await window.wallet.getSigner();
    const token = new ethers.Contract(tokenAddress, window.ABIS.ERC20_MIN, signer);

    // If caller provided a raw BigInt-like, treat as already scaled units:
    if (typeof humanAmountOrRaw === 'bigint' || (typeof humanAmountOrRaw === 'string' && /^[0-9]+$/.test(humanAmountOrRaw))) {
      // treat as raw token units
      const rawAmount = BigInt(humanAmountOrRaw.toString());
      const owner = await window.wallet.getAccount();
      const allowance = BigInt((await token.allowance(owner, spender)).toString());
      if (allowance >= rawAmount) return true;
      const tx = await token.approve(spender, rawAmount);
      await tx.wait();
      return true;
    }

    // Otherwise treat as human amount (e.g., '1500' or 1500)
    const human = humanAmountOrRaw;
    const provider = await window.wallet.getProvider();
    const tokenProv = new ethers.Contract(tokenAddress, window.ABIS.ERC20_MIN, provider);
    const decimalsBN = await tokenProv.decimals().catch(() => 18);
    const decimals = Number(decimalsBN.toString ? decimalsBN.toString() : decimalsBN);
    const raw = ethers.parseUnits(String(human), decimals); // BigInt
    const owner = await window.wallet.getAccount();
    const allowance = BigInt((await token.allowance(owner, spender)).toString());
    if (allowance >= BigInt(raw.toString())) return true;
    const tx = await token.connect(signer).approve(spender, raw);
    await tx.wait();
    return true;
  }

  // Buy and mint via Marketplace (existing contract)
  async function buyPokemonOnChain(pokemon) {
    try {
      assertConfig();
      if (!window.wallet.getAccount()) {
        if (!confirm('You must connect your wallet to buy. Connect now?')) return;
        await window.wallet.connectWallet();
      }

      // === Compute price in raw token units using on-chain decimals ===
      const pkcnAddr = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
      const signer = await window.wallet.getSigner();

      // Query decimals directly from contract to avoid stale metadata
      const tokenProv = new ethers.Contract(pkcnAddr, window.ABIS.ERC20_MIN, await window.wallet.getProvider());
      const decimalsBN = await tokenProv.decimals().catch(() => 18);
      const decimals = Number(decimalsBN.toString ? decimalsBN.toString() : decimalsBN);

      // Human price displayed in UI (e.g. 1500). Use decimals to scale correctly.
      let priceUnits;
      if (decimals === 0) {
        // If token has 0 decimals, price is an integer count of tokens
        priceUnits = BigInt(Math.floor(Number(pokemon.price)));
      } else {
        // parseUnits returns BigInt-like (ethers v6)
        priceUnits = ethers.parseUnits(String(pokemon.price), decimals);
      }

      // Friendly confirm message using human-readable formatting
      const humanPrice = (decimals === 0) ? String(priceUnits) : ethers.formatUnits(priceUnits, decimals);
      if (!confirm(`Buy ${pokemon.name} (#${pokemon.id}) for ${humanPrice} PKCN?`)) return;

      // Ensure approval (use the new ensureTokenApproval helper)
      await ensureTokenApproval(pkcnAddr, marketplaceAddr, priceUnits);

      // Now call marketplace.buyPokemon with priceUnits (raw)
      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.buyPokemon(
        pokemon.name,
        computeRarity(pokemon.base_experience || 0),
        pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '',
        priceUnits
      );
      alert('Transaction sent. Confirm in your wallet...');
      const receipt = await tx.wait();


      // parse logs for minted tokenId (NFT contract event or marketplace event)
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
          } catch (e) { /* not this iface/log */ }
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
                // (buyer, tokenId, price)
                mintedTokenId = parsed.args[1].toString();
                break;
              }
            } catch (e) { }
          }
        } catch (e) { console.warn('parse marketplace logs failed', e); }
      }

      // Persist lightweight record with tokenId so Collection shows NFT id
      try {
        const normalizedAcc = window.wallet.getAccount().toLowerCase();
        const key = `purchases_${normalizedAcc}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const purchaseRecord = {
          id: pokemon.id,
          name: pokemon.name,
          price: pokemon.price,
          rarity: computeRarity(pokemon.base_experience || 0),
          timestamp: Date.now(),
          sprites: pokemon.sprites,
          types: pokemon.types,
          abilities: pokemon.abilities,
          base_experience: pokemon.base_experience,
          tokenId: mintedTokenId
        };
        existing.push(purchaseRecord);
        localStorage.setItem(key, JSON.stringify(existing));
        window.dispatchEvent(new CustomEvent('purchases.updated', { detail: { account: normalizedAcc } }));
      } catch (e) { console.warn('Saving purchase failed', e); }

      alert(`✅ Mint confirmed! Token ID: ${mintedTokenId || '(unknown)'}. Check your Collection.`);
      await window.wallet.updateBalanceDisplayIfNeeded();
    } catch (err) {
      console.error('Buy (on-chain) failed', err);
      let message = 'Transaction failed';
      if (err?.reason) message = err.reason;
      else if (err?.message) message = err.message;
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') message = 'Transaction was rejected';
      alert('Buy failed: ' + message);
    }
  }

  // ----------------- Player Listings (on-chain) -----------------
  // We'll scan marketplace contract logs and reconstruct active listings.
  async function fetchActiveListingsFromChain() {
    try {
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
      if (!marketplaceAddr) return [];
      // fetch all logs related to marketplace and parse using MARKETPLACE ABI
      const mpIface = new ethers.Interface(window.ABIS.MARKETPLACE);
      const logs = await provider.getLogs({ address: marketplaceAddr, fromBlock: 0, toBlock: 'latest' });
      const listingsMap = new Map(); // listingId -> listing object
      for (const log of logs) {
        try {
          const parsed = mpIface.parseLog(log);
          const name = parsed.name;
          if (name === 'PokemonListed' || name === 'PokeListed' || name === 'PokeListedEvent' || name === 'PokeListedEvent') {
            // fields: listingId, tokenId, seller, price (ABI-dependent order)
            const args = parsed.args;
            // tolerant unpack: try common positions
            const listingId = args.listingId ?? args[0];
            const tokenId = args.tokenId ?? args[1];
            const seller = args.seller ?? args[2];
            const price = args.price ?? args[3];
            listingsMap.set(listingId.toString(), { listingId: listingId.toString(), tokenId: tokenId.toString(), seller: seller, price: price.toString(), active: true });
          } else if (name === 'ListingBought' || name === 'PokemonBought' || name === 'ListingBoughtEvent') {
            const args = parsed.args;
            const listingId = args.listingId ?? args[0];
            listingsMap.delete(listingId.toString());
          } else if (name === 'PokemonDelisted' || name === 'PokeDelisted' || name === 'PokeDelistedEvent') {
            const args = parsed.args;
            const listingId = args.listingId ?? args[0];
            listingsMap.delete(listingId.toString());
          }
        } catch (e) {
          // log didn't match this ABI — skip
        }
      }
      return Array.from(listingsMap.values());
    } catch (e) {
      console.warn('fetchActiveListingsFromChain failed', e);
      return [];
    }
  }

  // Render fetched listings above market grid
  async function renderPlayerListings() {
    try {
      const listings = await fetchActiveListingsFromChain();
      if (!listings || listings.length === 0) return;

      // create container header
      const wrapper = document.createElement('div');
      wrapper.className = 'player-listings';
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.margin = '12px 0';
      const h = document.createElement('h3');
      h.textContent = 'Player Listings';
      h.style.margin = 0;
      header.appendChild(h);
      wrapper.appendChild(header);

      // create grid of listing cards
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
      grid.style.gap = '16px';
      grid.style.marginBottom = '18px';

      // show up to 12 listings
      const toShow = listings.slice(0, 24);
      for (const L of toShow) {
        const c = await makeListingCard(L);
        grid.appendChild(c);
      }
      wrapper.appendChild(grid);
      marketGrid.appendChild(wrapper);
    } catch (e) {
      console.warn('renderPlayerListings failed', e);
    }
  }

  async function makeListingCard(listing) {
    // fetch NFT metadata from PokeNFT.tokenURI
    const card = document.createElement('div');
    card.className = 'market-card listed';

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    let nameText = `#${listing.tokenId}`;
    let rarity = 'Common';
    try {
      assertConfig();
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, provider);
      const uri = await nft.tokenURI(listing.tokenId);
      // parse data URI or fetch JSON
      const meta = await parseTokenURI(uri);
      if (meta) {
        if (meta.image) img.src = meta.image;
        if (meta.name) nameText = `${meta.name}`;
        if (meta.attributes && meta.attributes.length > 0) {
          const rAttr = meta.attributes.find(a => a.trait_type === 'Rarity' || a.trait_type === 'rarity');
          if (rAttr) rarity = rAttr.value || rarity;
        }
      }
    } catch (e) {
      // fallback image from placeholder
      img.src = 'images/pokeball.png';
      console.warn('makeListingCard metadata fetch failed', e);
    }
    img.alt = nameText;
    art.appendChild(img);

    const nameEl = document.createElement('h4');
    nameEl.className = 'name';
    nameEl.textContent = `${nameText} (NFT #${listing.tokenId})`;

    const typesWrap = document.createElement('div');
    typesWrap.className = 'types';
    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = rarity;
    typesWrap.appendChild(badge);

    const abilities = document.createElement('div');
    abilities.className = 'abilities';
    abilities.textContent = `Seller: ${shortAddress(listing.seller)} • Price: ${formatPrice(listing.price)}`;

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';

    const actions = document.createElement('div');
    actions.className = 'actions';
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn-primary-action';
    buyBtn.textContent = 'Buy Listed';
    buyBtn.onclick = () => buyListedOnChain(listing.listingId, listing.price);
    actions.appendChild(buyBtn);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abilities);
    inner.appendChild(bottom);
    inner.appendChild(actions);
    card.appendChild(inner);
    return card;
  }

  function formatPrice(priceRaw) {
    try {
      // priceRaw is hex / bigint / string from log — try to format using token decimals
      // fallback: show raw
      return (typeof priceRaw === 'string') ? priceRaw : priceRaw.toString();
    } catch (e) { return String(priceRaw); }
  }

  function shortAddress(addr) {
    try { return addr.slice(0, 6) + '...' + addr.slice(-4); } catch (e) { return addr; }
  }

  async function parseTokenURI(uri) {
    try {
      if (!uri) return null;
      if (uri.startsWith('data:application/json;base64,')) {
        const b64 = uri.split(',')[1];
        const txt = atob(b64);
        return JSON.parse(txt);
      }
      // normal URL
      const res = await fetch(uri);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { console.warn('parseTokenURI failed', e); return null; }
  }

  // Buy a listed NFT directly via marketplace.buyListedPokemon(listingId)
  async function buyListedOnChain(listingId, priceRaw) {
    try {
      assertConfig();
      if (!window.wallet.getAccount()) {
        if (!confirm('You must connect your wallet to buy. Connect now?')) return;
        await window.wallet.connectWallet();
      }
      const signer = await window.wallet.getSigner();
      const pkcn = window.CONTRACTS.PKCN_ADDRESS;
      const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
      const meta = await window.wallet.fetchTokenMetadata();
      const decimals = meta.decimals || 18;

      // ensure approval (priceRaw may be string)
      const priceBig = BigInt(priceRaw.toString());
      await ensureTokenApproval(pkcn, marketplaceAddr, priceBig);

      const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
      const tx = await marketplace.buyListedPokemon(BigInt(listingId));
      alert('Transaction sent. Confirm in wallet...');
      await tx.wait();
      alert('Purchase successful — listing bought. Refreshing...');
      await window.wallet.updateBalanceDisplayIfNeeded();
      renderGrid();
    } catch (e) {
      console.error('buyListedOnChain failed', e);
      alert('Buy listed failed: ' + (e?.message || e));
    }
  }

  // ----------------- small UI helpers -----------------
  function attachHandlers() {
    fetchMoreBtn?.addEventListener('click', loadPage);
    searchInput?.addEventListener('input', () => renderGrid());
    typeFilter?.addEventListener('change', () => renderGrid());
    sortSelect?.addEventListener('change', () => renderGrid());
  }

  // init
  (async function init() {
    await loadTypes();
    await loadPage();
    attachHandlers();
  })();

  async function setApprovalForAllIfNeeded() {
  const nft = new ethers.Contract(window.CONTRACTS.POKEMON_NFT_ADDRESS, window.ABIS.POKEMON_NFT, await window.wallet.getSigner());
  const me = (window.wallet.getAccount() || '').toLowerCase();
  const isApproved = await nft.isApprovedForAll(me, window.CONTRACTS.MARKETPLACE_ADDRESS);
  if (!isApproved) {
    const ok = confirm('Approve marketplace to manage all your Pokemon (convenience)?');
    if (!ok) return false;
    const tx = await nft.setApprovalForAll(window.CONTRACTS.MARKETPLACE_ADDRESS, true);
    await tx.wait();
    return true;
  }
  return true;
}


});
