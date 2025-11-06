/* marketplace.js - patched for reliable buy + localStorage sync
   Updated to handle tokens with 0 decimals (integer-only tokens) */
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

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)"
  ];

  function computeMockPrice(p) {
    const be = p.base_experience || 10;
    const abilities = (p.abilities || []).length;
    return Math.max(1, Math.round((be * 0.03 + abilities * 0.5) * 10) / 10);
  }

  function rarityClassLabel(r) {
    return r ? r.toLowerCase() : 'common';
  }

  async function loadTypes() {
    if (!typeFilter) return;
    try {
      const res = await fetch('https://pokeapi.co/api/v2/type');
      const json = await res.json();
      json.results.filter(t => !['unknown','shadow'].includes(t.name)).forEach(t => {
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

    items.sort((a,b)=>{
      if (sortBy === 'id') return a.id - b.id;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price') return a.price - b.price;
      return 0;
    });

    items.forEach(p => marketGrid.appendChild(makeCard(p)));
  }

  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
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
    abil.textContent = 'Abilities: ' + (p.abilities.map(a => a.ability.name).slice(0,3).join(', ') || '—');

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    const price = document.createElement('div');
    price.className = 'price-pill';
    price.textContent = `${p.price} PKCN`;
    bottom.appendChild(price);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn-primary-action';
    buyBtn.textContent = 'Buy';
    buyBtn.onclick = () => buyPokemon(p);
    actions.appendChild(buyBtn);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abil);
    inner.appendChild(bottom);
    inner.appendChild(actions);

    card.appendChild(inner);
    return card;
  }

  async function buyPokemon(pokemon) {
    try {
      // ensure wallet helper exists
      if (!window.wallet) throw new Error('Wallet helper not available');

      let acc = window.wallet.getAccount();
      if (!acc) {
        if (!confirm('You must connect your wallet to buy. Connect now?')) return;
        await window.wallet.connectWallet();
        acc = window.wallet.getAccount();
        if (!acc) return;
      }

      // normalize to lowercase for storage key consistency
      const normalizedAcc = acc.toLowerCase();

      const TOKEN = window.wallet.CONFIG.TOKEN_ADDRESS;
      const OWNER = window.wallet.CONFIG.MARKETPLACE_OWNER;

      if (!TOKEN || TOKEN.includes('YOUR_') || !OWNER || OWNER.includes('MARKETPLACE')) {
        alert('Token or marketplace owner not configured. Please set addresses in wallet.js');
        return;
      }

      // ensure provider + signer
      await window.wallet.ensureProvider();
      const provider = await window.wallet.getProvider();
      const signer = await window.wallet.getSigner();

      // read token using provider
      const tokenRead = new ethers.Contract(TOKEN, ERC20_ABI, provider);
      // safe decimals + symbol
      let decimals = 18;
      let symbol = 'PKCN';
      try {
        const decRes = await tokenRead.decimals();
        decimals = Number(decRes);
      } catch (e) {
        console.warn('Failed to fetch decimals; using fallback 18', e);
      }
      try {
        symbol = await tokenRead.symbol();
      } catch (e) {
        console.warn('Failed to fetch symbol; using fallback PKCN', e);
      }

      console.log('Token decimals:', decimals);
      console.log('Token symbol:', symbol);

      const balance = await tokenRead.balanceOf(acc);
      console.log('User balance (raw):', balance.toString());

      // Calculate price in token units safely depending on decimals
      let priceUnits;
      if (decimals === 0) {
        // token is integer-only: price must be integer
        if (!Number.isFinite(pokemon.price)) {
          throw new Error('Invalid pokemon price');
        }
        if (!Number.isInteger(pokemon.price)) {
          // ask user to proceed with rounding down
          const rounded = Math.floor(pokemon.price);
          const ok = confirm(
            `Token has 0 decimals (integer-only). The listed price ${pokemon.price} will be rounded down to ${rounded} ${symbol}. Continue?`
          );
          if (!ok) return;
          priceUnits = BigInt(rounded);
        } else {
          priceUnits = BigInt(pokemon.price);
        }
      } else {
        // decimals > 0: use parseUnits to compute correct bigint
        priceUnits = ethers.parseUnits(pokemon.price.toString(), decimals);
      }

      console.log('Price in units:', priceUnits.toString());

      // convert balance to bigint safely (ethers v6 returns bigint for numeric types)
      const balanceBig = (typeof balance === 'bigint') ? balance : BigInt(balance.toString());

      if (balanceBig < priceUnits) {
        const balanceFormatted = ethers.formatUnits(balanceBig, decimals);
        alert(`Insufficient ${symbol} balance. You need ${pokemon.price} ${symbol} but only have ${balanceFormatted} ${symbol}`);
        return;
      }

      const proceed = confirm(`Buy ${pokemon.name} (#${pokemon.id}) for ${pokemon.price} ${symbol}?`);
      if (!proceed) return;

      // write contract (transfer)
      const tokenWrite = new ethers.Contract(TOKEN, ERC20_ABI, signer);
      const tx = await tokenWrite.transfer(OWNER, priceUnits);

      alert('Transaction sent! Waiting for confirmation...\nTx: ' + (tx.hash || tx.transactionHash || tx.toString()));
      await tx.wait();

      // persist purchase (normalize acc inside savePurchase)
      savePurchase(pokemon, normalizedAcc);

      // emit event so collection pages refresh
      window.dispatchEvent(new CustomEvent('purchases.updated', { detail: { account: normalizedAcc } }));

      alert(`✅ Purchase confirmed!\n${pokemon.name} has been added to your collection.`);
      await window.wallet.updateBalanceDisplayIfNeeded();

    } catch (err) {
      console.error('Buy error', err);
      let msg = 'Transaction failed';
      if (err?.reason) msg = err.reason;
      else if (err?.message) msg = err.message;
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') msg = 'Transaction was rejected';
      alert('Purchase failed: ' + msg);
    }
  }

  function savePurchase(pokemon, normalizedAcc) {
    try {
      let acc = normalizedAcc || (window.wallet && window.wallet.getAccount());
      if (!acc) return;
      acc = acc.toLowerCase(); // normalize again to be safe

      const key = `purchases_${acc}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');

      const purchase = {
        id: pokemon.id,
        name: pokemon.name,
        price: pokemon.price,
        rarity: pokemon.rarity,
        timestamp: Date.now(),
        sprites: pokemon.sprites,
        types: pokemon.types,
        abilities: pokemon.abilities,
        base_experience: pokemon.base_experience
      };

      existing.push(purchase);
      localStorage.setItem(key, JSON.stringify(existing));

      // dispatch same-tab event
      window.dispatchEvent(new CustomEvent('purchases.updated', { detail: { account: acc } }));
    } catch (e) {
      console.error('Failed to save purchase', e);
    }
  }

  if (searchInput) searchInput.addEventListener('input', () => renderGrid());
  if (typeFilter) typeFilter.addEventListener('change', () => renderGrid());
  if (sortSelect) sortSelect.addEventListener('change', () => renderGrid());
  if (fetchMoreBtn) fetchMoreBtn.addEventListener('click', loadPage);

  (async function init(){
    await loadTypes();
    await loadPage();
  })();
});
