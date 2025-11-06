/* collection.js - patched to normalize keys and auto-refresh on wallet + storage events */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const starterGrid = document.getElementById('starterGrid');
  const purchasedGrid = document.getElementById('purchasedGrid');
  const emptyState = document.getElementById('emptyState');
  const starterToggle = document.getElementById('starterToggle');
  const purchasedToggle = document.getElementById('purchasedToggle');

  const STARTER_IDS = [1, 4, 7];

  function computeMockPrice(p) {
    const be = p.base_experience || 10;
    const abilities = (p.abilities || []).length;
    return Math.max(1, Math.round((be * 0.03 + abilities * 0.5) * 10) / 10);
  }

  function computeRarity(baseExp) {
    if (baseExp >= 200) return 'Legendary';
    if (baseExp >= 150) return 'Epic';
    if (baseExp >= 100) return 'Rare';
    if (baseExp >= 60) return 'Uncommon';
    return 'Common';
  }

  function rarityClassLabel(r) {
    return r ? r.toLowerCase() : 'common';
  }

  async function loadStarters() {
    try {
      const promises = STARTER_IDS.map(id =>
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(r => r.json())
      );
      const starters = await Promise.all(promises);

      starterGrid.innerHTML = '';
      starters.forEach(p => {
        const enriched = {
          ...p,
          price: computeMockPrice(p),
          rarity: computeRarity(p.base_experience || 0)
        };
        starterGrid.appendChild(makeCollectionCard(enriched, true));
      });

      document.getElementById('starterCount').textContent = starters.length;
    } catch (e) {
      console.error('Failed to load starters', e);
    }
  }

  function loadPurchases() {
    const rawAcc = window.wallet?.getAccount();
    if (!rawAcc) {
      purchasedGrid.innerHTML = '<div class="empty-purchased"><p>Connect wallet to view your purchases</p></div>';
      document.getElementById('purchasedCount').textContent = '0';
      return [];
    }

    const acc = rawAcc.toLowerCase(); // normalize

    try {
      const key = `purchases_${acc}`;
      const purchases = JSON.parse(localStorage.getItem(key) || '[]');

      purchasedGrid.innerHTML = '';
      if (purchases.length === 0) {
        purchasedGrid.innerHTML = '<div class="empty-purchased"><p>No purchased Pokémon yet. Visit the marketplace!</p></div>';
      } else {
        purchases.forEach(p => {
          purchasedGrid.appendChild(makeCollectionCard(p, false));
        });
      }

      document.getElementById('purchasedCount').textContent = purchases.length;
      return purchases;
    } catch (e) {
      console.error('Failed to load purchases', e);
      return [];
    }
  }

  function makeCollectionCard(p, isStarter) {
    const card = document.createElement('div');
    const rarityClass = rarityClassLabel(p.rarity);
    card.className = `collection-card market-card ${rarityClass}`;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    if (isStarter) {
      const badge = document.createElement('div');
      badge.className = 'card-badge';
      badge.textContent = '★ STARTER';
      card.appendChild(badge);
    }

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
    abil.textContent = 'Abilities: ' + (p.abilities?.map(a => a.ability?.name || a.name).slice(0, 2).join(', ') || '—');

    const bottom = document.createElement('div');
    bottom.className = 'bottom-row';
    const price = document.createElement('div');
    price.className = 'price-pill';
    price.textContent = `${p.price} PKCN`;
    bottom.appendChild(price);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-secondary-action';
    viewBtn.textContent = 'View';
    viewBtn.onclick = () => alert(`${p.name}\nBase XP: ${p.base_experience}\nRarity: ${p.rarity}`);
    actions.appendChild(viewBtn);

    const battleBtn = document.createElement('button');
    battleBtn.className = 'btn-primary-action';
    battleBtn.textContent = 'Battle';
    battleBtn.onclick = () => alert(`${p.name} is ready for battle!`);
    actions.appendChild(battleBtn);

    inner.appendChild(art);
    inner.appendChild(nameEl);
    inner.appendChild(typesWrap);
    inner.appendChild(abil);
    inner.appendChild(bottom);
    inner.appendChild(actions);

    card.appendChild(inner);
    return card;
  }

  function updateStats(purchases) {
    const total = STARTER_IDS.length + purchases.length;
    const rareAndAbove = purchases.filter(p =>
      ['Rare', 'Epic', 'Legendary'].includes(p.rarity)
    ).length;
    const totalValue = purchases.reduce((sum, p) => sum + (p.price || 0), 0);
    const battleReady = total;

    document.getElementById('totalPokemon').textContent = total;
    document.getElementById('rarePokemon').textContent = rareAndAbove;
    document.getElementById('totalValue').textContent = totalValue.toFixed(1);
    document.getElementById('battleReady').textContent = battleReady;

    if (total === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  starterToggle?.addEventListener('click', () => {
    starterToggle.classList.toggle('active');
    starterGrid.classList.toggle('active');
  });

  purchasedToggle?.addEventListener('click', () => {
    purchasedToggle.classList.toggle('active');
    purchasedGrid.classList.toggle('active');
  });

  // Refresh purchases when wallet becomes ready or account changes
  document.addEventListener('wallet.ready', () => {
    try {
      const purchases = loadPurchases();
      updateStats(purchases);
      console.log('wallet.ready -> purchases refreshed');
    } catch (e) { console.warn('wallet.ready handler error', e); }
  });

  // Handle MetaMask account changes (same-session)
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', (accounts) => {
      try {
        const purchases = loadPurchases();
        updateStats(purchases);
        console.log('accountsChanged -> purchases refreshed', accounts);
      } catch (e) { console.warn('accountsChanged handler error', e); }
    });
  }

  // Listen for purchases.updated (dispatched by marketplace when purchase occurs)
  window.addEventListener('purchases.updated', (ev) => {
    try {
      const acc = window.wallet?.getAccount();
      if (!acc) return;
      const normalized = acc.toLowerCase();
      if (!ev.detail || !ev.detail.account || ev.detail.account === normalized) {
        const purchases = loadPurchases();
        updateStats(purchases);
        console.log('purchases.updated -> refreshed purchases');
      }
    } catch(e) { console.warn(e); }
  });

  // Listen for cross-tab storage changes
  window.addEventListener('storage', (ev) => {
    if (!ev.key) return;
    if (!ev.key.startsWith('purchases_')) return;
    try {
      const acc = window.wallet?.getAccount();
      if (!acc) return;
      if (ev.key === `purchases_${acc.toLowerCase()}`) {
        const purchases = loadPurchases();
        updateStats(purchases);
        console.log('storage event -> refreshed purchases for current account');
      }
    } catch(e) { console.warn(e); }
  });

  (async function init() {
    await loadStarters();

    // try to load purchases immediately (if wallet already connected)
    let purchases = loadPurchases();
    updateStats(purchases);

    // If wallet helper exists but there's no account yet, wait briefly for wallet to auto-connect
    try {
      if (window.wallet && !window.wallet.getAccount()) {
        await new Promise((resolve) => {
          let resolved = false;
          const finish = () => { if (!resolved) { resolved = true; cleanup(); resolve(); } };
          const cleanup = () => {
            document.removeEventListener('wallet.ready', finish);
            if (window.ethereum && window.ethereum.removeListener) {
              try { window.ethereum.removeListener('accountsChanged', finish); } catch(e){}
            }
            clearTimeout(timeoutId);
          };

          document.addEventListener('wallet.ready', finish);
          if (window.ethereum && window.ethereum.on) {
            window.ethereum.on('accountsChanged', finish);
          }
          const timeoutId = setTimeout(finish, 1200); // fallback after 1.2s
        });

        purchases = loadPurchases();
        updateStats(purchases);
        console.log('init: purchases refreshed after wallet ready / account change');
      }
    } catch (e) {
      console.warn('init: wallet waiting failed', e);
    }
  })();

});
