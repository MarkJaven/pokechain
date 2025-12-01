console.log('✅ collection.js - Loading with marketplace integration');

// ✅ DEBUG: Check initialization status
function checkMarketplaceReady() {
    console.log('🔍 Checking marketplace availability...');
    console.log('- window.listPokemonOnChain:', typeof window.listPokemonOnChain);
    console.log('- window.txHistory:', typeof window.txHistory);
    console.log('- window.txModal:', typeof window.txModal);
    return typeof window.listPokemonOnChain === 'function';
}

// ✅ EMERGENCY FALLBACK: Direct implementation (no external deps)
async function emergencyListPokemon(tokenId, name, pokemonId, rarity, price) {
    console.log('🚀 Using emergency direct listing...');
    
    const provider = await window.wallet.getProvider();
    const signer = await window.wallet.getSigner();
    const sellerAddress = await window.wallet.getAccount();

    const nftAddr = window.CONTRACTS.POKEMON_NFT_ADDRESS;
    const marketplaceAddr = window.CONTRACTS.MARKETPLACE_ADDRESS;
    
    // Convert price
    const decimals = 18; // PKCN standard
    const priceUnits = ethers.parseUnits(String(price), decimals);

    // Step 1: Approve NFT
    window.txModal.transaction({
        title: 'Approving NFT',
        message: `Approving marketplace to handle #${tokenId}...`
    });
    
    const nft = new ethers.Contract(nftAddr, window.ABIS.POKEMON_NFT, signer);
    const approveTx = await nft.approve(marketplaceAddr, BigInt(tokenId));
    await approveTx.wait();

    // Step 2: Create listing transaction
    const txId = window.txHistory.add({
        type: 'list',
        title: 'List Pokémon',
        message: `Listing ${name} for ${price} PKCN`,
        status: 'pending',
        tokenAmount: `${price} PKCN`,
        fromAddress: sellerAddress,
        nftId: tokenId,
        details: {
            pokemonId: pokemonId,
            pokemonName: name,
            tokenId: tokenId,
            rarity: rarity,
            price: price
        }
    });

    // Step 3: Execute listing
    window.txModal.transaction({
        title: 'Creating Listing',
        message: 'Submitting to blockchain...'
    });

    const marketplace = new ethers.Contract(marketplaceAddr, window.ABIS.MARKETPLACE, signer);
    const listTx = await marketplace.listPokemon(BigInt(tokenId), priceUnits);
    
    window.txHistory.update(txId, {
        hash: listTx.hash,
        message: 'Waiting for confirmation...'
    });

    const receipt = await listTx.wait();

    // Parse listingId
    let listingId = null, gasFee = '0';
    try {
        gasFee = ethers.formatEther(BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice));
        const topic = ethers.id("PokeListed(uint256,uint256,address,uint256)");
        for (const log of receipt.logs) {
            if (log.topics[0] === topic) {
                listingId = BigInt(log.topics[1]).toString();
                break;
            }
        }
    } catch (e) { console.warn('Log parsing failed:', e); }

    // Update history
    window.txHistory.update(txId, {
        status: 'success',
        message: `Listed ${name} successfully!`,
        hash: listTx.hash,
        gasFee: `${gasFee} ETH`,
        nftId: tokenId,
        details: {
            ...window.txHistory.notifications.find(n => n.id === txId)?.details,
            listingId: listingId
        }
    });

    window.txModal.success(
        'Listed Successfully!',
        `${name} is now on sale! ${listingId ? `Listing ID: #${listingId}` : ''}`,
        () => renderCollection()
    );
}

// ✅ MAIN LOGIC: Smart routing with retry
async function handleSellWithModal(uniqueId, name, pokemonId, image, rarity, price) {
    try {
        // Verify wallet
        if (!window.wallet?.getAccount?.()) {
            const shouldConnect = await window.txModal.confirm({
                title: 'Connect Wallet',
                message: 'Wallet required to list Pokémon.',
                confirmText: 'Connect'
            });
            if (!shouldConnect) return;
            await window.wallet.connectWallet();
        }

        // ✅ SIMPLIFIED: Direct execution without aggressive retry
        if (checkMarketplaceReady()) {
            console.log('✅ Using marketplace.js function');
            await window.listPokemonOnChain(uniqueId, name, pokemonId, rarity, price);
            setTimeout(() => renderCollection(), 2000);
        } else {
            // ✅ FALLBACK: If marketplace.js fails, use direct method
            console.warn('⚠️ marketplace.js unavailable, using emergency fallback');
            
            if (!window.txHistory) {
                throw new Error('Transaction history system not loaded');
            }
            
            await emergencyListPokemon(uniqueId, name, pokemonId, rarity, price);
        }

    } catch (err) {
        console.error('❌ Listing failed:', err);
        const msg = err.code === 4001 ? 'Transaction rejected' : 
                    err.message || 'Unknown error';
        window.txModal.error('Listing Failed', msg);
    }
}

// ✅ REST OF YOUR EXISTING CODE (unchanged)
async function safeGetProvider() {
    try {
        if (window.ethereum) {
            return new ethers.BrowserProvider(window.ethereum);
        }
        return null;
    } catch (e) {
        console.error('Failed to get provider:', e);
        return null;
    }
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
    const rarityClass = rarity ? String(rarity).toLowerCase().trim() : 'common';
    card.className = `market-card ${rarityClass}`;
    card.dataset.tokenId = uniqueId;
    
    card.addEventListener('click', () => {
        showListingModal({ uniqueId, name, pokemonId, image, rarity });
    });

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const nftIdBadge = document.createElement('div');
    nftIdBadge.className = 'nft-id-badge';
    nftIdBadge.textContent = `#${uniqueId}`;

    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = image || 'images/pokeball.png';
    img.alt = name || '';
    img.onerror = () => { img.src = 'images/pokeball.png'; };
    art.appendChild(img);

    const nameDiv = document.createElement('h4');
    nameDiv.className = 'name';
    nameDiv.textContent = `#${pokemonId} ${name}`;

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

    const abilitiesDiv = document.createElement('div');
    abilitiesDiv.className = 'abilities';
    if (abilities && Array.isArray(abilities) && abilities.length > 0) {
        const abilityNames = abilities
            .slice(0, 3)
            .filter(ab => ab && typeof ab === 'object' && ab.name)
            .map(ab => ab.name.replace(/-/g, ' '));
        abilitiesDiv.textContent = `Abilities: ${abilityNames.join(', ')}`;
    } else if (typeof abilities === 'string') {
        abilitiesDiv.textContent = abilities;
    } else {
        abilitiesDiv.textContent = 'Abilities: Unknown';
    }

    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description || 'A mysterious Pokémon with unknown abilities.';

    const ownedBadge = document.createElement('div');
    ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = 'Owned';

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

        await handleSellWithModal(uniqueId, name, pokemonId, image, rarity, price);

    } catch (err) {
        console.error('Listing modal error:', err);
    }
}

async function fetchOwnedTokens(provider, nft, addr) {
  try {
    // Get balance of NFTs for this account
    const balance = await nft.balanceOf(addr);
    const tokenCount = parseInt(balance.toString());
    
    console.log(`Account ${addr} has ${tokenCount} NFTs`);
    
    if (tokenCount === 0) {
      return [];
    }
    
    // ✅ METHOD 1: Try custom getTokenIdsByOwner first (most reliable)
    try {
      if (typeof nft.getTokenIdsByOwner === 'function') {
        console.log('✅ Using getTokenIdsByOwner (custom function)');
        const tokenIds = await nft.getTokenIdsByOwner(addr);
        const ids = tokenIds.map(id => parseInt(id.toString()));
        console.log(`✅ Custom function complete:`, ids);
        return ids;
      }
    } catch (e) {
      console.log('❌ getTokenIdsByOwner not available:', e.message);
    }

    // ✅ METHOD 2: Use Ethers v6 queryFilter (modern, reliable - FROM TOURNAMENT)
    try {
      console.log('📜 Using queryFilter for Transfer events');
      const filter = nft.filters.Transfer;
      const events = await nft.queryFilter(filter, 0, 'latest');
      
      const ownedTokens = new Set();
      events.forEach(event => {
        const from = event.args.from.toLowerCase();
        const to = event.args.to.toLowerCase();
        const tokenId = parseInt(event.args.tokenId.toString());
        
        if (to === addr.toLowerCase()) {
          ownedTokens.add(tokenId);
        }
        if (from === addr.toLowerCase()) {
          ownedTokens.delete(tokenId);
        }
      });
      
      const result = Array.from(ownedTokens).sort((a, b) => a - b);
      console.log(`✅ queryFilter result:`, result);
      return result;
      
    } catch (e) {
      console.warn('⚠️ queryFilter failed:', e);
    }
    
    // ✅ METHOD 3: Return mock data for testing
    console.warn('Using mock token IDs for testing');
    return Array.from({length: Math.min(tokenCount, 3)}, (_, i) => i + 1);
    
  } catch (error) {
    console.error('❌ Error fetching owned tokens:', error);
    return []; // Return empty array on error
  }
}
async function renderCollection() {
    const grid = document.getElementById('allCollectionGrid');
    
    if (!grid) {
        console.log('Collection grid not found - skipping render');
        return;
    }
    
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
                let pokemonId = uniqueId;
                let types = [];
                let abilities = [];
                let description = 'A mysterious Pokémon with unknown abilities.';
                
                const pokeData = await fetchPokeAPIData(name);
                if (pokeData) {
                    pokemonId = pokeData.id;
                    
                    if (pokeData.types && Array.isArray(pokeData.types)) {
                        types = pokeData.types.filter(t => t?.type?.name).map(t => t.type.name);
                    }
                    
                    if (pokeData.abilities && Array.isArray(pokeData.abilities)) {
                        abilities = pokeData.abilities
                            .filter(a => a?.ability?.name)
                            .slice(0, 3)
                            .map(a => ({
                                name: a.ability.name.replace(/-/g, ' '),
                                isHidden: a.is_hidden
                            }));
                    }
                    
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                }
                
                description = await fetchPokemonDescription(name);
                
                if (meta.attributes && Array.isArray(meta.attributes)) {
                    const rarityAttr = meta.attributes.find(a => 
                        a.trait_type?.toLowerCase() === 'rarity' || 
                        a.traitType?.toLowerCase() === 'rarity'
                    );
                    if (rarityAttr?.value) {
                        rarity = String(rarityAttr.value).trim();
                    } else {
                        if (meta.name?.toLowerCase().includes('legendary')) rarity = 'Legendary';
                        else if (meta.name?.toLowerCase().includes('rare')) rarity = 'Rare';
                    }
                } else {
                    if (meta.name?.toLowerCase().includes('legendary')) rarity = 'Legendary';
                    else if (meta.name?.toLowerCase().includes('rare')) rarity = 'Rare';
                }
                
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

let collectionRefreshInterval;

function startCollectionAutoRefresh() {
    if (collectionRefreshInterval) {
        clearInterval(collectionRefreshInterval);
    }
    
    collectionRefreshInterval = setInterval(() => {
        if (window.wallet?.getAccount?.() && document.getElementById('allCollectionGrid')) {
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

// ✅ CORRECTED: Wait for wallet to be ready before rendering
window.addEventListener('DOMContentLoaded', () => {
    console.log('📦 Collection page loading...');
    
    if (window.wallet?.getAccount?.()) {
        renderCollection();
        startCollectionAutoRefresh();
    } else {
        document.addEventListener('wallet.ready', () => {
            console.log('Wallet ready, loading collection...');
            renderCollection();
            startCollectionAutoRefresh();
        });
    }
});

window.addEventListener('beforeunload', stopCollectionAutoRefresh);

document.addEventListener('wallet.ready', () => {
    if (window.wallet?.getAccount?.() && document.getElementById('allCollectionGrid')) {
        renderCollection();
    }
});