console.log('collection.js - Improved NFT collection management loaded');

async function safeGetProvider() {
  if (!window.wallet || !window.wallet.getProvider) return null;
  try { return await window.wallet.getProvider(); } catch { return null; }
}

function decodeBase64Json(dataUri) {
  try {
    const b64 = dataUri.split(',')[1];
    return JSON.parse(atob(b64));
  } catch { return null; }
}

function ipfsToHttp(uri) {
  return uri?.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + uri.slice(7) : uri;
}

async function fetchJson(uri) {
  try {
    if (uri.startsWith('data:application/json;base64,')) return decodeBase64Json(uri);
    if (uri.startsWith('ipfs://')) uri = ipfsToHttp(uri);
    const res = await fetch(uri);
    return await res.json();
  } catch { return null; }
}

async function resolveMetadata(nft, id) {
  try {
    const uri = await nft.tokenURI(id);
    if (uri.startsWith('data:')) return decodeBase64Json(uri);
    return await fetchJson(uri);
  } catch { return null; }
}

// Fetch Pokemon data from PokeAPI by name
async function fetchPokeAPIData(pokemonName) {
  try {
    const cleanName = pokemonName.toLowerCase().trim();
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`Failed to fetch PokeAPI data for ${pokemonName}:`, e);
    return null;
  }
}

function makeCard({ uniqueId, pokemonId, name, image, rarity, types, abilities }) {
  const card = document.createElement('div');
  card.className = `market-card ${(rarity || 'common').toLowerCase()}`;
  card.dataset.tokenId = uniqueId; // Store token ID for tracking
  
  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // Unique ID Badge (absolute positioned on card, not inner)
  const uniqueIdBadge = document.createElement('div');
  uniqueIdBadge.className = 'unique-id-badge';
  uniqueIdBadge.textContent = `#${uniqueId}`;

  // Art section
  const art = document.createElement('div');
  art.className = 'art';
  const img = document.createElement('img');
  img.src = image || '';
  img.alt = name || '';
  art.appendChild(img);

  // Pokemon name with PokeAPI ID
  const h4 = document.createElement('h4');
  h4.className = 'name';
  h4.textContent = `#${pokemonId} ${name || ''}`;

  // Types section
  const typesDiv = document.createElement('div');
  typesDiv.className = 'types';
  if (types && types.length > 0) {
    types.forEach(type => {
      const badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = type.toUpperCase();
      typesDiv.appendChild(badge);
    });
  }

  // Abilities section
  const abilitiesDiv = document.createElement('div');
  abilitiesDiv.className = 'abilities';
  abilitiesDiv.textContent = abilities || '';

  // Owned badge
  const ownedBadge = document.createElement('div');
  ownedBadge.className = 'owned-badge';
  ownedBadge.textContent = 'Owned';

  // Actions wrapper with sell button
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  const sellBtn = document.createElement('button');
  sellBtn.className = 'btn-primary-action btn-sell';
  sellBtn.textContent = 'List for Sale';
  sellBtn.onclick = () => handleSell(uniqueId, name, pokemonId, image, rarity);
  actionsDiv.appendChild(sellBtn);

  // Build the card structure
  inner.appendChild(art);
  inner.appendChild(h4);
  inner.appendChild(typesDiv);
  inner.appendChild(abilitiesDiv);
  inner.appendChild(ownedBadge);
  inner.appendChild(actionsDiv);
  
  card.appendChild(uniqueIdBadge);
  card.appendChild(inner);
  
  return card;
}

// ===== IMPROVED: Better error handling and user feedback =====
async function handleSell(uniqueId, name, pokemonId, image, rarity) {
  try {
    if (!window.txModal) {
      alert('Transaction modal not loaded. Please refresh the page.');
      return;
    }

    // Prompt for price
    const priceInput = await window.txModal.prompt({
      type: 'confirm',
      title: 'List Pokemon for Sale',
      message: `Set the price for #${pokemonId} ${name}`,
      label: 'Price (PKCN)',
      placeholder: 'Enter price in PKCN tokens',
      inputType: 'number',
      confirmText: 'List for Sale',
      validate: (value) => {
        const num = parseFloat(value);
        if (!num || num <= 0) {
          alert('Please enter a valid price greater than 0');
          return false;
        }
        return true;
      }
    });

    if (!priceInput) return; // User cancelled

    const price = parseFloat(priceInput);

    // Confirm listing
    const confirmed = await window.txModal.confirm({
      title: 'Confirm Listing',
      message: `Are you sure you want to list this Pokemon for sale?`,
      details: [
        { label: 'Pokemon', value: `#${pokemonId} ${name}` },
        { label: 'Rarity', value: rarity },
        { label: 'Token ID', value: `#${uniqueId}` },
        { label: 'Price', value: `${price} PKCN`, highlight: true }
      ],
      confirmText: 'Confirm Listing',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    // Check wallet connection
    if (!window.wallet || !window.wallet.getAccount()) {
      if (!await window.txModal.confirm({
        title: 'Connect Wallet',
        message: 'You need to connect your wallet to list items for sale.',
        confirmText: 'Connect Wallet'
      })) return;
      
      await window.wallet.connectWallet();
    }

    // Start transaction
    window.txModal.transaction({
      title: 'Listing Pokemon',
      message: 'Approving marketplace access and creating listing...',
      subtitle: 'Please confirm both transactions in your wallet.'
    });

    const signer = await window.wallet.getSigner();
    const provider = await window.wallet.getProvider();
    
    // Get contract instances
    const nftAddr = window.CONTRACTS.POKEMON_NFT_ADDRESS;
    const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
    const pkcnAddr = window.CONTRACTS.PKCN_ADDRESS;
    
    const nft = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, signer);
    const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
    
    // Get token decimals
    const tokenProv = new ethers.Contract(pkcnAddr, window.ABIS.ERC20_MIN, provider);
    const decimalsBN = await tokenProv.decimals().catch(() => 18);
    const decimals = Number(decimalsBN.toString ? decimalsBN.toString() : decimalsBN);
    
    // Convert price to token units
    let priceUnits;
    if (decimals === 0) {
      priceUnits = BigInt(Math.floor(price));
    } else {
      priceUnits = ethers.parseUnits(String(price), decimals);
    }

    // Step 1: Check and set approval for marketplace
    try {
      const isApproved = await nft.isApprovedForAll(window.wallet.getAccount(), marketplaceAddr);
      
      if (!isApproved) {
        window.txModal.transaction({
          title: 'Approve Marketplace',
          message: 'Granting marketplace permission to manage your Pokemon...',
          subtitle: 'Confirm the approval transaction in your wallet.'
        });
        
        const approveTx = await nft.setApprovalForAll(marketplaceAddr, true);
        await approveTx.wait();
      }
    } catch (approvalError) {
      console.warn('Approval check/set failed, trying individual approval:', approvalError);
      
      // Fallback: Try individual token approval
      window.txModal.transaction({
        title: 'Approve Marketplace',
        message: 'Granting marketplace permission for this Pokemon...',
        subtitle: 'Confirm the approval transaction in your wallet.'
      });
      
      try {
        const approveTx = await nft.approve(marketplaceAddr, BigInt(uniqueId));
        await approveTx.wait();
      } catch (individualApprovalError) {
        throw new Error('Failed to approve marketplace. Make sure your NFT contract supports ERC721 approval functions.');
      }
    }

    // Step 2: List the Pokemon
    window.txModal.transaction({
      title: 'Creating Listing',
      message: 'Listing your Pokemon on the marketplace...',
      subtitle: 'Confirm the listing transaction in your wallet.'
    });

    const listTx = await marketplace.listPokemon(BigInt(uniqueId), priceUnits);
    await listTx.wait();

    // Success!
    window.txModal.success(
      'Listed Successfully!',
      `Your ${name} is now listed on the marketplace for ${price} PKCN. Other players can now purchase it!`,
      () => {
        // Refresh the collection
        renderCollection();
      }
    );

  } catch (err) {
    console.error('Sell failed:', err);
    
    let errorMessage = 'Failed to list Pokemon for sale.';
    if (err?.reason) errorMessage = err.reason;
    else if (err?.message) errorMessage = err.message;
    if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
      errorMessage = 'Transaction was rejected by user.';
    }
    
    window.txModal.error('Listing Failed', errorMessage);
  }
}

// ===== IMPROVED: More efficient token fetching with better error handling =====
async function fetchOwnedTokens(provider, nft, addr) {
  const iface = new ethers.Interface([
    "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)"
  ]);
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await provider.getBlockNumber();
  let logs = [];
  
  try {
    // Try fetching logs in smaller chunks to avoid timeout issues
    const chunkSize = 10000; 
    let fromBlock = Math.max(0, latest - 50000);
    
    while (fromBlock < latest) {
      const toBlock = Math.min(fromBlock + chunkSize, latest);
      try {
        const chunkLogs = await provider.getLogs({
          address: nft.target,
          fromBlock: fromBlock,
          toBlock: toBlock,
          topics: [topic]
        });
        logs = logs.concat(chunkLogs);
      } catch (chunkError) {
        console.warn(`Failed to fetch logs for blocks ${fromBlock}-${toBlock}:`, chunkError);
      }
      fromBlock = toBlock + 1;
    }
  } catch (e) { 
    console.warn('getLogs failed completely:', e); 
  }

  const owned = new Set();
  for (const l of logs) {
    try {
      const { args } = iface.parseLog(l);
      const from = args.from.toLowerCase(), to = args.to.toLowerCase();
      const tid = args.tokenId.toString();
      if (to === addr) owned.add(tid);
      if (from === addr) owned.delete(tid);
    } catch {}
  }
  return [...owned].map(Number);
}

// ===== IMPROVED: Better error handling and loading states =====
async function renderCollection() {
  const grid = document.getElementById('allCollectionGrid');
  const totalEl = document.getElementById('totalPokemon');
  const rareEl = document.getElementById('rarePokemon');
  const emptyState = document.getElementById('emptyState');
  const loadingEl = document.getElementById('collectionLoading');

  // Show loading state
  if (loadingEl) loadingEl.style.display = 'block';
  if (grid) grid.style.display = 'none';
  
  if (grid) grid.innerHTML = '';
  
  const provider = await safeGetProvider();
  if (!provider) {
    if (loadingEl) loadingEl.style.display = 'none';
    console.error('No provider available');
    return;
  }

  let acc = window.wallet?.getAccount?.();
  if (!acc) {
    try {
      await window.wallet?.connectWallet?.();
      acc = window.wallet?.getAccount?.();
    } catch (e) {
      console.error('Failed to connect wallet:', e);
    }
  }
  
  if (!acc) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    window.txModal?.error('Wallet Required', 'Please connect your wallet to view your collection.');
    return;
  }

  const addr = acc.toLowerCase();
  const nftAddr = window.CONTRACTS?.POKEMON_NFT_ADDRESS;
  const abi = window.ABIS?.POKEMON_NFT;
  
  if (!nftAddr || !abi) {
    if (loadingEl) loadingEl.style.display = 'none';
    console.error('NFT contract not configured');
    return;
  }
  
  const nft = new ethers.Contract(nftAddr, abi, provider);

  try {
    const ids = await fetchOwnedTokens(provider, nft, addr);
    let total = 0, rareCount = 0;

    if (ids.length === 0) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      if (totalEl) totalEl.textContent = '0';
      if (rareEl) rareEl.textContent = '0';
      return;
    }

    // Show grid and hide loading
    if (loadingEl) loadingEl.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    // Process tokens in batches to avoid overwhelming the UI
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (uniqueId) => {
        try {
          // Get NFT metadata from contract
          const meta = await resolveMetadata(nft, uniqueId);
          if (!meta) {
            console.warn(`No metadata found for token #${uniqueId}`);
            return;
          }
          
          console.log('NFT metadata for #' + uniqueId + ':', meta);
          
          // Extract basic info from NFT metadata
          let name = meta.name || `Token ${uniqueId}`;
          let image = meta.image ? ipfsToHttp(meta.image) : '';
          let rarity = 'Common';
          
          // Get rarity from attributes
          if (meta.attributes && Array.isArray(meta.attributes)) {
            const rarityAttr = meta.attributes.find(a => 
              a.trait_type?.toLowerCase() === 'rarity'
            );
            if (rarityAttr && rarityAttr.value) {
              rarity = rarityAttr.value;
            }
          }
          
          // Now fetch additional data from PokeAPI using the pokemon name
          let pokemonId = uniqueId; // fallback
          let types = [];
          let abilities = '';
          
          const pokeData = await fetchPokeAPIData(name);
          if (pokeData) {
            console.log('PokeAPI data for ' + name + ':', pokeData);
            
            // Get Pokemon ID from PokeAPI
            pokemonId = pokeData.id;
            
            // Get types from PokeAPI
            if (pokeData.types && Array.isArray(pokeData.types)) {
              types = pokeData.types.map(t => t.type.name);
            }
            
            // Get abilities from PokeAPI
            if (pokeData.abilities && Array.isArray(pokeData.abilities)) {
              const abilityNames = pokeData.abilities
                .slice(0, 3)
                .map(a => a.ability?.name || '')
                .filter(Boolean);
              if (abilityNames.length > 0) {
                abilities = `Abilities: ${abilityNames.join(', ')}`;
              }
            }
            
            // Capitalize name properly
            name = name.charAt(0).toUpperCase() + name.slice(1);
          }
          
          console.log('✅ Final card data:', { 
            uniqueId, 
            pokemonId, 
            name, 
            rarity, 
            types, 
            abilities 
          });
          
          const card = makeCard({ uniqueId, pokemonId, name, image, rarity, types, abilities });
          
          // Add card to grid in the correct order
          if (grid) {
            grid.appendChild(card);
          }
          
          total++;
          if (['rare','epic','legendary'].includes(rarity.toLowerCase())) rareCount++;
          
        } catch (tokenError) {
          console.error(`Error processing token #${uniqueId}:`, tokenError);
        }
      }));
      
      // Small delay between batches to keep UI responsive
      if (i + batchSize < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Update counters
    if (totalEl) totalEl.textContent = total;
    if (rareEl) rareEl.textContent = rareCount;
    
  } catch (error) {
    console.error('Failed to render collection:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    window.txModal?.error('Collection Error', 'Failed to load your collection. Please try again.');
  }
}

// ===== Auto-refresh collection periodically =====
let collectionRefreshInterval;

function startCollectionAutoRefresh() {
  // Clear existing interval
  if (collectionRefreshInterval) {
    clearInterval(collectionRefreshInterval);
  }
  
  // Refresh collection every 30 seconds to catch new purchases
  collectionRefreshInterval = setInterval(() => {
    if (window.wallet?.getAccount?.()) {
      renderCollection();
    }
  }, 30000);
}

function stopCollectionAutoRefresh() {
  if (collectionRefreshInterval) {
    clearInterval(collectionRefreshInterval);
    collectionRefreshInterval = null;
  }
}

// ===== Event Listeners =====
window.addEventListener('load', () => {
  renderCollection();
  startCollectionAutoRefresh();
});

// Stop auto-refresh when page unloads
window.addEventListener('beforeunload', stopCollectionAutoRefresh);

// Refresh collection when wallet connects/disconnects
document.addEventListener('wallet.ready', () => {
  if (window.wallet?.getAccount?.()) {
    renderCollection();
  }
});