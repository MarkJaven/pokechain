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

function makeCard({ uniqueId, pokemonId, name, image, rarity, types, abilities, description }) {
  const card = document.createElement('div');
  card.className = `market-card ${(rarity || 'common').toLowerCase()}`;
  card.dataset.tokenId = uniqueId;
  
  // Make card clickable - show listing modal
  card.addEventListener('click', () => {
    showListingModal({ uniqueId, name, pokemonId, image, rarity });
  });

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // NFT ID Badge - Upper Right
  const nftIdBadge = document.createElement('div');
  nftIdBadge.className = 'nft-id-badge';
  nftIdBadge.textContent = `#${uniqueId}`;

  // Pokemon Image
  const art = document.createElement('div');
  art.className = 'art';
  const img = document.createElement('img');
  img.src = image || 'images/pokeball.png';
  img.alt = name || '';
  img.onerror = () => { img.src = 'images/pokeball.png'; };
  art.appendChild(img);

  // Pokemon name with ID
  const nameDiv = document.createElement('h4');
  nameDiv.className = 'name';
  nameDiv.textContent = `#${pokemonId} ${name}`;

  // Types
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

  // Abilities
  const abilitiesDiv = document.createElement('div');
  abilitiesDiv.className = 'abilities';
  if (abilities && Array.isArray(abilities) && abilities.length > 0) {
    const abilityNames = abilities.slice(0, 3).map(ab => ab.name.replace(/-/g, ' '));
    abilitiesDiv.textContent = `Abilities: ${abilityNames.join(', ')}`;
  } else if (typeof abilities === 'string') {
    abilitiesDiv.textContent = abilities;
  } else {
    abilitiesDiv.textContent = 'Abilities: Unknown';
  }

  // Description
  const descriptionDiv = document.createElement('div');
  descriptionDiv.className = 'pokemon-description';
  descriptionDiv.textContent = description || 'A mysterious Pokémon with unknown abilities.';

  // Owned badge
  const ownedBadge = document.createElement('div');
  ownedBadge.className = 'owned-badge';
  ownedBadge.textContent = 'Owned';

  // Build card
  inner.appendChild(art);
  inner.appendChild(nameDiv);
  inner.appendChild(typesDiv);
  inner.appendChild(abilitiesDiv);
  inner.appendChild(descriptionDiv);
  inner.appendChild(ownedBadge);
  
  card.appendChild(nftIdBadge);
  card.appendChild(inner);
  
  return card;
}

async function showListingModal({ uniqueId, name, pokemonId, image, rarity }) {
  try {
    if (!window.txModal) {
      alert('Transaction modal not loaded. Please refresh the page.');
      return;
    }

    // Show confirmation modal first
    const confirmed = await window.txModal.confirm({
      type: 'confirm',
      title: 'List Pokémon for Sale',
      message: `Do you want to list this Pokémon on the marketplace?`,
      details: [
        { label: 'Pokémon', value: `#${pokemonId} ${name}` },
        { label: 'Rarity', value: rarity },
        { label: 'NFT ID', value: `#${uniqueId}` }
      ],
      confirmText: 'Continue',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    // Prompt for price
    const priceInput = await window.txModal.prompt({
      type: 'confirm',
      title: 'Set Sale Price',
      message: `Enter the price for #${pokemonId} ${name}`,
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

    if (!priceInput) return;

    const price = parseFloat(priceInput);

    // Final confirmation with price
    const finalConfirmed = await window.txModal.confirm({
      title: 'Confirm Listing',
      message: `Confirm listing your Pokémon for sale?`,
      details: [
        { label: 'Pokémon', value: `#${pokemonId} ${name}` },
        { label: 'Rarity', value: rarity },
        { label: 'NFT ID', value: `#${uniqueId}` },
        { label: 'Price', value: `${price} PKCN`, highlight: true }
      ],
      confirmText: 'Confirm Listing',
      cancelText: 'Cancel'
    });

    if (!finalConfirmed) return;

    // Proceed with listing
    await handleSellWithModal(uniqueId, name, pokemonId, image, rarity, price);

  } catch (err) {
    console.error('Listing modal error:', err);
  }
}
// ===== IMPROVED: Better error handling and user feedback =====
async function handleSellWithModal(uniqueId, name, pokemonId, image, rarity, price) {
  try {
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
      title: 'Listing Pokémon',
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
          message: 'Granting marketplace permission to manage your Pokémon...',
          subtitle: 'Confirm the approval transaction in your wallet.'
        });
        
        const approveTx = await nft.setApprovalForAll(marketplaceAddr, true);
        await approveTx.wait();
      }
    } catch (approvalError) {
      console.warn('Approval check/set failed, trying individual approval:', approvalError);
      
      window.txModal.transaction({
        title: 'Approve Marketplace',
        message: 'Granting marketplace permission for this Pokémon...',
        subtitle: 'Confirm the approval transaction in your wallet.'
      });
      
      try {
        const approveTx = await nft.approve(marketplaceAddr, BigInt(uniqueId));
        await approveTx.wait();
      } catch (individualApprovalError) {
        throw new Error('Failed to approve marketplace. Make sure your NFT contract supports ERC721 approval functions.');
      }
    }

    // Step 2: List the Pokémon
    window.txModal.transaction({
      title: 'Creating Listing',
      message: 'Listing your Pokémon on the marketplace...',
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
    
    let errorMessage = 'Failed to list Pokémon for sale.';
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

async function renderCollection() {
  const grid = document.getElementById('allCollectionGrid');
  const totalEl = document.getElementById('totalPokemon');
  const rareEl = document.getElementById('rarePokemon');
  const emptyState = document.getElementById('emptyState');
  const loadingEl = document.getElementById('collectionLoading');

  const renderedTokenIds = new Set();
  
  if (loadingEl) loadingEl.style.display = 'block';
  if (grid) {
    grid.style.display = 'none';
    grid.innerHTML = '';
  }
  
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

    if (loadingEl) loadingEl.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    for (const uniqueId of ids) {
      if (renderedTokenIds.has(uniqueId)) {
        console.log(`⚠️ Skipping duplicate token #${uniqueId}`);
        continue;
      }
      renderedTokenIds.add(uniqueId);
      
      try {
        const meta = await resolveMetadata(nft, uniqueId);
        if (!meta) {
          console.warn(`No metadata found for token #${uniqueId}`);
          continue;
        }
        
        let name = meta.name || `Token ${uniqueId}`;
        let image = meta.image ? ipfsToHttp(meta.image) : '';
        let rarity = 'Common';
        
        if (meta.attributes && Array.isArray(meta.attributes)) {
          const rarityAttr = meta.attributes.find(a => 
            a.trait_type?.toLowerCase() === 'rarity'
          );
          if (rarityAttr && rarityAttr.value) {
            rarity = rarityAttr.value;
          }
        }
        
        let pokemonId = uniqueId;
        let types = [];
        let abilities = [];
        let description = 'A mysterious Pokémon with unknown abilities.';
        
        const pokeData = await fetchPokeAPIData(name);
        if (pokeData) {
          pokemonId = pokeData.id;
          
          if (pokeData.types && Array.isArray(pokeData.types)) {
            types = pokeData.types.map(t => t.type.name);
          }
          
          if (pokeData.abilities && Array.isArray(pokeData.abilities)) {
            abilities = pokeData.abilities.slice(0, 3).map(a => ({
              name: a.ability?.name || '',
              isHidden: a.is_hidden
            })).filter(a => a.name);
          }
          
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        // Fetch description
        description = await fetchPokemonDescription(name);
        
        const card = makeCard({ 
          uniqueId, 
          pokemonId, 
          name, 
          image, 
          rarity, 
          types, 
          abilities,
          description 
        });
        
        if (grid && !grid.querySelector(`[data-token-id="${uniqueId}"]`)) {
          grid.appendChild(card);
          total++;
          if (['rare','epic','legendary'].includes(rarity.toLowerCase())) rareCount++;
        }
        
      } catch (tokenError) {
        console.error(`Error processing token #${uniqueId}:`, tokenError);
      }
    }

    if (totalEl) totalEl.textContent = total;
    if (rareEl) rareEl.textContent = rareCount;
    
  } catch (error) {
    console.error('Failed to render collection:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    window.txModal?.error('Collection Error', 'Failed to load your collection. Please try again.');
  }
}
// ADD description fetcher (same as marketplace)
async function fetchPokemonDescription(pokemonName) {
  const cacheKey = pokemonName.toLowerCase();
  
  try {
    const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${cacheKey}`);
    if (!speciesRes.ok) return "A mysterious Pokémon with unknown abilities.";
    
    const speciesData = await speciesRes.json();
    
    const flavorText = speciesData.flavor_text_entries?.find(
      entry => entry.language.name === 'en'
    );
    
    const description = flavorText 
      ? flavorText.flavor_text.replace(/\n|\f/g, ' ') 
      : "A mysterious Pokémon with unknown abilities.";
    
    return description;
  } catch (e) {
    console.warn(`Failed to fetch description for ${pokemonName}:`, e);
    return "A mysterious Pokémon with unknown abilities.";
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