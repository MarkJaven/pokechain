// ===================================================================
// TOURNAMENT SYSTEM - Complete Round-Robin Tournament Setup (Blockchain Ready)
// ===================================================================

// Tournament State Management
const tournamentState = {
    selectedPokemon: null,
    opponentCount: 7,
    difficulty: 'normal',
    isStarting: false,
    hasLoaded: false
};

// Cache for PokeAPI data
const pokeApiCache = new Map();

// DOM Elements
const elements = {
    grid: document.getElementById('pokemonSelectionGrid'),
    loading: document.getElementById('tournamentLoading'),
    noPokemon: document.getElementById('noPokemonMessage'),
    selectedDisplay: document.getElementById('selectedPokemonDisplay'),
    selectedImage: document.getElementById('selectedPokemonImage'),
    selectedName: document.getElementById('selectedPokemonName'),
    selectedId: document.getElementById('selectedPokemonId'),
    startBtn: document.getElementById('startTournamentBtn'),
    startError: document.getElementById('startError'),
    opponentSelect: document.getElementById('opponentCount'),
    difficultySelect: document.getElementById('difficulty'),
    status: document.getElementById('connectionStatus')
};

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', () => {
    console.log('🏆 Tournament page loading...');
    
    // Wait for wallet to be ready before loading Pokemon
    if (window.wallet?.getAccount?.()) {
        loadTournamentPokemon();
    } else {
        // Listen for wallet connection event
        document.addEventListener('wallet.ready', () => {
            console.log('Wallet ready, loading tournament Pokemon...');
            loadTournamentPokemon();
        });
    }
    
    // Setup event listeners
    setupEventListeners();
    
    tournamentState.hasLoaded = true;
});

function setupEventListeners() {
    elements.opponentSelect.addEventListener('change', (e) => {
        tournamentState.opponentCount = parseInt(e.target.value);
        console.log('Opponent count changed to:', tournamentState.opponentCount);
    });
    
    elements.difficultySelect.addEventListener('change', (e) => {
        tournamentState.difficulty = e.target.value;
        console.log('Difficulty changed to:', tournamentState.difficulty);
    });
    
    elements.startBtn.addEventListener('click', () => {
        console.log('Start button clicked, selectedPokemon:', tournamentState.selectedPokemon);
        startTournament();
    });
}

// ===================================================================
// DATA FETCHING
// ===================================================================

async function fetchPokemonDescription(pokemonName) {
    const cacheKey = `desc-${pokemonName.toLowerCase()}`;
    if (pokeApiCache.has(cacheKey)) {
        return pokeApiCache.get(cacheKey);
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
        
        pokeApiCache.set(cacheKey, description);
        return description;
    } catch (e) {
        console.warn(`Failed to fetch description for ${pokemonName}:`, e);
        return "A mysterious Pokémon with unknown abilities.";
    }
}

async function fetchPokeAPIData(pokemonName) {
    const cacheKey = `pokemon-${pokemonName.toLowerCase()}`;
    if (pokeApiCache.has(cacheKey)) {
        return pokeApiCache.get(cacheKey);
    }

    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        const result = {
            id: data.id,
            abilities: data.abilities?.map(ab => ({
                name: ab.ability.name,
                isHidden: ab.is_hidden
            })) || [],
            types: data.types?.map(t => t.type.name) || []
        };
        
        pokeApiCache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.warn(`Failed to fetch PokeAPI data for ${pokemonName}:`, e);
        return null;
    }
}

// ===================================================================
// POKEMON LOADING
// ===================================================================

async function loadTournamentPokemon() {
    try {
        console.log('Loading tournament Pokemon...');
        
        elements.loading.style.display = 'block';
        elements.noPokemon.style.display = 'none';
        elements.grid.innerHTML = '';
        
        // Check wallet connection
        const provider = await safeGetProvider();
        if (!provider) {
            console.log('No provider found');
            elements.status.textContent = '⚠️ Please connect your wallet';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        const account = window.wallet?.getAccount?.();
        if (!account) {
            console.log('No account found');
            elements.status.textContent = '⚠️ Please connect your wallet';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        console.log('Wallet connected:', account);
        elements.status.textContent = 'Wallet connected';
        elements.status.style.color = '#00ff9d';

        // Get contract details
        const nftAddr = window.CONTRACTS?.POKEMON_NFT_ADDRESS;
        const abi = window.ABIS?.POKEMON_NFT;
        
        if (!nftAddr || !abi) {
            console.error('NFT contract not configured');
            throw new Error('NFT contract not configured');
        }

        // Fetch owned tokens
        const nft = new ethers.Contract(nftAddr, abi, provider);
        const tokenIds = await fetchOwnedTokens(provider, nft, account.toLowerCase());
        
        if (!tokenIds || tokenIds.length === 0) {
            console.log('No tokens found');
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        console.log(`Found ${tokenIds.length} tokens`);
        
        // Render Pokemon cards
        elements.grid.innerHTML = '';
        const renderPromises = tokenIds.map(async (tokenId) => {
            try {
                const meta = await resolveMetadata(nft, tokenId);
                if (!meta) {
                    console.warn(`No metadata for token ${tokenId}`);
                    return null;
                }

                let name = meta.name || `Token ${tokenId}`;
                let image = meta.image ? ipfsToHttp(meta.image) : '';
                let rarity = 'Common';
                let pokemonId = tokenId;
                let types = [];
                let abilities = [];

                // Get Pokemon data from PokeAPI
                const pokeData = await fetchPokeAPIData(name);
                if (pokeData) {
                    pokemonId = pokeData.id;
                    types = pokeData.types;
                    abilities = pokeData.abilities;
                }

                // Extract rarity from metadata
                if (meta.attributes && Array.isArray(meta.attributes)) {
                    const rarityAttr = meta.attributes.find(a => 
                        a.trait_type?.toLowerCase() === 'rarity'
                    );
                    if (rarityAttr && rarityAttr.value) {
                        rarity = rarityAttr.value;
                    }
                }

                // Fetch description
                const description = await fetchPokemonDescription(name);

                // Create card element
                const card = createSelectableCard({
                    tokenId: tokenId,
                    pokemonId: pokemonId,
                    name: name,
                    image: image,
                    rarity: rarity,
                    types: types,
                    abilities: abilities,
                    description: description
                });

                return card;
            } catch (tokenError) {
                console.warn(`Skipping token #${tokenId}:`, tokenError);
                return null;
            }
        });

        const cards = await Promise.all(renderPromises);
        const validCards = cards.filter(card => card !== null);
        
        if (validCards.length === 0) {
            showNoPokemonMessage();
            return;
        }
        
        validCards.forEach(card => elements.grid.appendChild(card));
        elements.loading.style.display = 'none';
        console.log(`Rendered ${validCards.length} Pokemon cards`);

    } catch (error) {
        console.error('Failed to load tournament Pokemon:', error);
        elements.loading.style.display = 'none';
        showNoPokemonMessage();
    }
}

function showNoPokemonMessage() {
    elements.noPokemon.style.display = 'block';
    elements.grid.innerHTML = '';
    elements.selectedDisplay.style.display = 'none';
    elements.startBtn.disabled = true;
}

// ===================================================================
// CARD CREATION
// ===================================================================

function createSelectableCard({ tokenId, pokemonId, name, image, rarity, types, abilities, description }) {
    const card = document.createElement('div');
    card.className = `market-card ${(rarity || 'common').toLowerCase()} tournament-card`;
    card.dataset.tokenId = tokenId;
    card.dataset.pokemonId = pokemonId;
    card.dataset.name = name;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    // Pokemon Image
    const art = document.createElement('div');
    art.className = 'pokemon-image';
    const img = document.createElement('img');
    img.src = image || 'images/pokeball.png';
    img.alt = name || '';
    img.onerror = () => { img.src = 'images/pokeball.png'; };
    art.appendChild(img);

    // Pokemon Info Container
    const infoContainer = document.createElement('div');
    infoContainer.className = 'pokemon-info';

    // Name with ID
    const nameDiv = document.createElement('div');
    nameDiv.className = 'pokemon-name';
    nameDiv.textContent = `#${pokemonId} ${name}`;

    // Token ID Badge (upper right)
    const tokenBadge = document.createElement('div');
    tokenBadge.className = 'token-badge';
    tokenBadge.textContent = `#${tokenId}`;

    // Types
    const typesDiv = document.createElement('div');
    typesDiv.className = 'pokemon-types';
    if (types && types.length > 0) {
        types.forEach(type => {
            const badge = document.createElement('span');
            badge.className = `type-badge ${type}`;
            badge.textContent = type.toUpperCase();
            typesDiv.appendChild(badge);
        });
    }

    // Abilities (single line format)
    const abilitiesDiv = document.createElement('div');
    abilitiesDiv.className = 'pokemon-abilities';
    if (abilities && abilities.length > 0) {
        const abilityNames = abilities.slice(0, 3).map(ab => ab.name.replace(/-/g, ' ')).join(', ');
        abilitiesDiv.textContent = `Abilities: ${abilityNames}`;
    } else {
        abilitiesDiv.textContent = 'Abilities: Unknown';
    }

    // Description
    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description || "A mysterious Pokémon ready for battle.";

    // Selection indicator
    const selectIndicator = document.createElement('div');
    selectIndicator.className = 'selection-indicator';
    selectIndicator.innerHTML = '✓ SELECTED';

    // Assemble card
    infoContainer.appendChild(nameDiv);
    infoContainer.appendChild(typesDiv);
    infoContainer.appendChild(abilitiesDiv);
    infoContainer.appendChild(descriptionDiv);
    
    inner.appendChild(art);
    inner.appendChild(infoContainer);
    
    card.appendChild(tokenBadge);
    card.appendChild(selectIndicator);
    card.appendChild(inner);

    // Click handler for selection
    card.addEventListener('click', () => {
        console.log('Card clicked:', { tokenId, name });
        selectPokemonForTournament({
            tokenId: tokenId,
            pokemonId: pokemonId,
            name: name,
            image: image,
            rarity: rarity,
            types: types,
            abilities: abilities,
            description: description,
            cardElement: card
        });
    });

    return card;
}

// ===================================================================
// POKEMON SELECTION
// ===================================================================

function selectPokemonForTournament(pokemon) {
    console.log('Selecting Pokemon:', pokemon);
    
    // Deselect any previously selected card
    document.querySelectorAll('.tournament-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    // Select new card
    pokemon.cardElement.classList.add('selected');
    tournamentState.selectedPokemon = pokemon;

    // Update selected Pokemon display
    elements.selectedImage.src = pokemon.image || 'images/pokeball.png';
    elements.selectedName.textContent = `#${pokemon.pokemonId} ${pokemon.name}`;
    elements.selectedId.textContent = `Token #${pokemon.tokenId}`;
    elements.selectedDisplay.style.display = 'flex';

    // Enable start button
    elements.startBtn.disabled = false;
    elements.startError.style.display = 'none';
    
    console.log('Pokemon selected successfully. Button enabled.');
}

// ===================================================================
// TOURNAMENT START
// ===================================================================

async function startTournament() {
    console.log('startTournament called. State:', {
        selectedPokemon: tournamentState.selectedPokemon,
        isStarting: tournamentState.isStarting
    });
    
    // Validate selection
    if (!tournamentState.selectedPokemon) {
        console.error('No Pokemon selected!');
        elements.startError.style.display = 'block';
        elements.startError.textContent = '⚠️ Please select a Pokémon first!';
        return;
    }
    
    if (tournamentState.isStarting) {
        console.warn('Tournament already starting, ignoring double-click');
        return;
    }
    
    // Prevent double-clicks
    tournamentState.isStarting = true;
    elements.startBtn.disabled = true;
    elements.startError.style.display = 'none';
    
    try {
        console.log('Initiating tournament battle...');
        await initiateTournamentBattle();
    } catch (error) {
        console.error('Failed to start tournament:', error);
        elements.startError.style.display = 'block';
        elements.startError.textContent = '⚠️ Failed to start tournament. Please try again.';
        
        // Reset state on error
        tournamentState.isStarting = false;
        elements.startBtn.disabled = false;
    }
}

async function initiateTournamentBattle() {
  if (!tournamentState.selectedPokemon) {
    throw new Error('No Pokemon selected');
  }
  
  // Prepare player data
  const playerData = {
    tokenId: tournamentState.selectedPokemon.tokenId,
    pokemonId: tournamentState.selectedPokemon.pokemonId,
    name: tournamentState.selectedPokemon.name,
    rarity: tournamentState.selectedPokemon.rarity,
    types: tournamentState.selectedPokemon.types,
    abilities: tournamentState.selectedPokemon.abilities,
    description: tournamentState.selectedPokemon.description
  };
  
  // Log tournament start for blockchain
  await logTournamentStart(playerData);
  
  const params = new URLSearchParams({
    pokemon: encodeURIComponent(JSON.stringify(playerData)),
    opponents: tournamentState.opponentCount,
    difficulty: tournamentState.difficulty
  });
  
  window.location.href = `battle.html?${params.toString()}`;
}

// ===================================================================
// BLOCKCHAIN INTEGRATION HELPERS
// ===================================================================

async function logTournamentStart(playerData) {
  // Prepare data for blockchain logging
  const tournamentData = {
    player: window.wallet.getAccount(),
    pokemonId: playerData.pokemonId,
    tokenId: playerData.tokenId,
    opponentCount: tournamentState.opponentCount,
    difficulty: tournamentState.difficulty,
    timestamp: Date.now(),
    tournamentId: generateTournamentId()
  };
  
  // Store in localStorage for later verification
  localStorage.setItem('currentTournament', JSON.stringify(tournamentData));
  
  // TODO: Call smart contract to create tournament entry
  // await contract.createTournament(tournamentData.tournamentId, playerData.tokenId, tournamentState.difficulty);
  
  console.log('Tournament logged:', tournamentData);
}

function generateTournamentId() {
  return `tour_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Error-safe provider getter
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

// Fetch owned tokens from NFT contract
async function fetchOwnedTokens(provider, contract, account) {
  try {
    // Get balance of NFTs for this account
    const balance = await contract.balanceOf(account);
    const tokenCount = parseInt(balance.toString());
    
    console.log(`Account ${account} has ${tokenCount} NFTs`);
    
    if (tokenCount === 0) {
      return [];
    }
    
    // Try to get token IDs - Method 1: Custom contract function
    try {
      const tokenIds = await contract.getTokenIdsByOwner(account);
      return tokenIds.map(id => parseInt(id.toString()));
    } catch (e) {
      console.warn('getTokenIdsByOwner not available, using sequential scan');
    }
    
    // Method 2: Query Transfer events (more efficient than sequential scan)
    try {
      const filter = contract.filters.Transfer;
      const events = await contract.queryFilter(filter, 0, 'latest');
      
      const ownedTokens = new Set();
      events.forEach(event => {
        const from = event.args.from.toLowerCase();
        const to = event.args.to.toLowerCase();
        const tokenId = parseInt(event.args.tokenId.toString());
        
        if (to === account.toLowerCase()) {
          ownedTokens.add(tokenId);
        }
        if (from === account.toLowerCase()) {
          ownedTokens.delete(tokenId);
        }
      });
      
      return Array.from(ownedTokens).sort((a, b) => a - b);
    } catch (e) {
      console.warn('Event querying failed:', e);
    }
    
    // Method 3: Return mock data for testing
    console.warn('Using mock token IDs for testing');
    return Array.from({length: Math.min(tokenCount, 5)}, (_, i) => i + 1);
    
  } catch (error) {
    console.error('Error fetching owned tokens:', error);
    return []; // Return empty array on error
  }
}

// Resolve metadata for a token
async function resolveMetadata(contract, tokenId) {
  try {
    // Get token URI from contract
    const tokenURI = await contract.tokenURI(tokenId);
    console.log(`Token ${tokenId} URI:`, tokenURI);
    
    // Convert IPFS URI to HTTP if needed
    const httpUrl = ipfsToHttp(tokenURI);
    
    // Fetch metadata
    const response = await fetch(httpUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata for token ${tokenId}: ${response.status}`);
    }
    
    const metadata = await response.json();
    console.log(`Token ${tokenId} metadata loaded:`, metadata);
    return metadata;
  } catch (error) {
    console.error(`Error resolving metadata for token ${tokenId}:`, error);
    // Return mock data as fallback
    return {
      name: `Pokemon ${tokenId}`,
      image: 'images/pokeball.png',
      attributes: [{ trait_type: 'Rarity', value: 'Common' }]
    };
  }
}

// Convert IPFS URI to HTTP URL
function ipfsToHttp(uri) {
  if (!uri) return 'images/pokeball.png';
  
  // Handle ipfs://Qme... format
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${cid}`;
  }
  
  // Handle ipfs://ipfs/Qme... format
  if (uri.startsWith('ipfs://ipfs/')) {
    const path = uri.replace('ipfs://ipfs/', '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  
  // Handle already HTTP URLs
  if (uri.startsWith('http')) {
    return uri;
  }
  
  // Handle JSON data URIs (data:application/json;base64,...)
  if (uri.startsWith('data:')) {
    return uri; // This will be handled by fetch()
  }
  
  // Fallback
  console.warn('Unknown URI format:', uri);
  return 'images/pokeball.png';
}

// Utility: Show transaction modal (placeholder for blockchain txs)
function showTransactionModal(message) {
  const modal = document.createElement('div');
  modal.className = 'transaction-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

// Utility: Hide transaction modal
function hideTransactionModal(modal) {
  if (modal) modal.remove();
}

// Export for use in other modules
window.TournamentAPI = {
    loadTournamentPokemon,
    selectPokemonForTournament,
    startTournament,
    logTournamentStart,
    generateTournamentId
};