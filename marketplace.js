/* marketplace.js */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const marketGrid = document.getElementById('marketGrid');
  const loader = document.getElementById('loader');
  const fetchMoreBtn = document.getElementById('fetchMoreBtn');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortSelect = document.getElementById('sortSelect');
  const listedItemsContainer = document.getElementById('listedItems');

  const listModalEl = document.getElementById('listModal');
  const listModal = listModalEl ? new bootstrap.Modal(listModalEl) : null;
  const modalPokemonPreview = document.getElementById('modalPokemonPreview');
  const listPriceInput = document.getElementById('listPriceInput');
  const confirmListBtn = document.getElementById('confirmListBtn');

  const pokeCache = new Map();
  const PAGE_SIZE = 24;
  let offset = 0;
  let allLoaded = false;

  function getListings() { 
    return JSON.parse(localStorage.getItem('pokemarket_listings') || '[]'); 
  }
  
  function saveListings(list) { 
    localStorage.setItem('pokemarket_listings', JSON.stringify(list)); 
  }

  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
  }

  function rarityClassLabel(r) {
    return r.toLowerCase();
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
    } catch (e) {
      console.error('type load failed', e);
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
      const details = await Promise.all(
        results.map(it => fetch(it.url).then(res => res.json()))
      );
      details.forEach(d => pokeCache.set(d.id, d));
      offset += PAGE_SIZE;
      renderGrid();
    } catch (e) {
      console.error('loadPage error', e);
    } finally {
      if (loader) loader.style.display = 'none';
    }
  }

  function computeMockPrice(p) {
    const be = p.base_experience || 10;
    const abilities = (p.abilities || []).length;
    return Math.max(1, Math.round((be * 0.03 + abilities * 0.5) * 10) / 10);
  }

  function rarityRank(r) {
    switch (r) {
      case 'Legendary': return 5;
      case 'Epic': return 4;
      case 'Rare': return 3;
      case 'Uncommon': return 2;
      default: return 1;
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
      items = items.filter(p => 
        (p.name && p.name.includes(q)) || String(p.id) === q
      );
    }
    if (type) {
      items = items.filter(p => 
        p.types.some(t => t.type.name === type)
      );
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
      if (sortBy === 'rarity') return rarityRank(b.rarity) - rarityRank(a.rarity);
      return 0;
    });

    items.forEach(p => marketGrid.appendChild(makeCard(p)));
  }

  function makeCard(p) {
    const card = document.createElement('div');
    const rarity = rarityClassLabel(p.rarity);
    card.className = `market-card ${rarity}`;

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
    abil.textContent = 'Abilities: ' + (p.abilities.map(a => a.ability.name).slice(0, 3).join(', ') || '—');

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    const price = document.createElement('div');
    price.className = 'price-pill';
    price.textContent = `${p.price} $PCT`;
    bottom.appendChild(price);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const listings = getListings();
    const listing = listings.find(l => l.pokemonId === p.id && !l.sold);

    const leftBtn = document.createElement('button');
    leftBtn.className = 'btn-secondary-action';
    leftBtn.textContent = listing ? 'Edit' : 'List';
    leftBtn.onclick = () => openListModal(p);

    const rightBtn = document.createElement('button');
    rightBtn.className = 'btn-primary-action';
    rightBtn.textContent = listing && !listing.sold ? 'Buy' : 'View';
    rightBtn.onclick = () => {
      if (listing && !listing.sold) performBuy(listing);
      else showDetails(p);
    };

    actions.appendChild(leftBtn);
    actions.appendChild(rightBtn);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abil);
    inner.appendChild(bottom);
    inner.appendChild(actions);

    card.appendChild(inner);
    return card;
  }

  function showDetails(p) {
    alert(`${p.name} (#${p.id})\n\nTypes: ${p.types.map(t => t.type.name).join(', ')}\nAbilities: ${p.abilities.map(a => a.ability.name).join(', ')}\nBase XP: ${p.base_experience}`);
  }

  let currentListingPokemon = null;

  function openListModal(p) {
    if (!listModal) {
      alert('Modal missing');
      return;
    }
    currentListingPokemon = p;
    if (modalPokemonPreview) {
      modalPokemonPreview.innerHTML = `
        <img src="${p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default}" 
             style="width:72px;height:72px;object-fit:contain"/>
        <div>
          <strong class="text-capitalize">#${p.id} ${p.name}</strong>
          <div class="small-muted">${p.types.map(t => t.type.name).join(', ')}</div>
        </div>
      `;
    }
    const existing = getListings().find(l => l.pokemonId === p.id);
    if (listPriceInput) {
      listPriceInput.value = existing ? existing.price : p.price;
    }
    listModal.show();
  }

  if (confirmListBtn) {
    confirmListBtn.addEventListener('click', () => {
      if (!currentListingPokemon) return;
      const price = Number(listPriceInput.value) || computeMockPrice(currentListingPokemon);
      const listings = getListings();
      const idx = listings.findIndex(l => l.pokemonId === currentListingPokemon.id);
      
      if (idx >= 0) {
        listings[idx].price = price;
        listings[idx].sold = false;
      } else {
        listings.push({
          pokemonId: currentListingPokemon.id,
          price,
          seller: 'you (local)',
          sold: false,
          timestamp: Date.now()
        });
      }
      
      saveListings(listings);
      if (listModal) listModal.hide();
      renderGrid();
      renderListedItems();
      alert('Listed successfully!');
    });
  }

  function performBuy(listing) {
    if (!confirm(`Buy Pokémon #${listing.pokemonId} for ${listing.price} $PCT?`)) return;
    const listings = getListings();
    const idx = listings.findIndex(l => l.pokemonId === listing.pokemonId);
    
    if (idx >= 0) {
      listings[idx].sold = true;
      listings[idx].buyer = 'demo-buyer';
      listings[idx].soldAt = Date.now();
      saveListings(listings);
    }
    
    renderGrid();
    renderListedItems();
    alert('Purchase successful!');
  }

  function renderListedItems() {
    if (!listedItemsContainer) return;
    const lists = getListings();
    listedItemsContainer.innerHTML = '';
    
    if (lists.length === 0) {
      listedItemsContainer.innerHTML = '<div class="small-muted">No items listed yet.</div>';
      return;
    }
    
    lists.forEach(l => {
      const p = pokeCache.get(l.pokemonId);
      if (!p) return;
      
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';
      
      const card = document.createElement('div');
      card.className = 'card bg-dark p-3 d-flex flex-row gap-3 align-items-center';
      card.innerHTML = `
        <img src='${p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default}' 
             style='width:80px;height:80px;object-fit:contain'/>
        <div>
          <strong class='text-capitalize'>#${p.id} ${p.name}</strong>
          <div class='small-muted'>Price: ${l.price} $PCT</div>
          ${l.sold ? '<div class="text-danger">SOLD</div>' : ''}
        </div>
      `;
      
      col.appendChild(card);
      listedItemsContainer.appendChild(col);
    });
  }

  if (searchInput) searchInput.addEventListener('input', () => renderGrid());
  if (typeFilter) typeFilter.addEventListener('change', () => renderGrid());
  if (sortSelect) sortSelect.addEventListener('change', () => renderGrid());
  if (fetchMoreBtn) fetchMoreBtn.addEventListener('click', loadPage);

  (async function init() {
    await loadTypes();
    await loadPage();
    renderGrid();
    renderListedItems();
  })();
});