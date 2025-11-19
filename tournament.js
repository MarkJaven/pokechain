// Tournament State
const tournamentState = {
    selectedPokemon: null,
    opponentCount: 7,
    difficulty: 'normal',
    isStarting: false
};

// Cache for PokeAPI data
const pokeApiCache = new Map();

// Tournament DOM Elements
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

// Fetch PokeAPI description
async function fetchPokemonDescription(pokemonName) {
    const cacheKey = pokemonName.toLowerCase();
    if (pokeApiCache.has(cacheKey + '_desc')) {
        return pokeApiCache.get(cacheKey + '_desc');
    }

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
        
        pokeApiCache.set(cacheKey + '_desc', description);
        return description;
    } catch (e) {
        console.warn(`Failed to fetch description for ${pokemonName}:`, e);
        return "A mysterious Pokémon with unknown abilities.";
    }
}

// Fetch comprehensive PokeAPI data
async function fetchPokeAPIData(pokemonName) {
    const cacheKey = pokemonName.toLowerCase();
    if (pokeApiCache.has(cacheKey)) {
        return pokeApiCache.get(cacheKey);
    }

    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cacheKey}`);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        const abilities = data.abilities?.map(ab => ({
            name: ab.ability.name,
            isHidden: ab.is_hidden
        })) || [];
        
        const types = data.types?.map(t => t.type.name) || [];
        
        const result = {
            id: data.id,
            abilities,
            types
        };
        
        pokeApiCache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.warn(`Failed to fetch PokeAPI data for ${pokemonName}:`, e);
        return null;
    }
}

// Load owned Pokémon for tournament selection
async function loadTournamentPokemon() {
    try {
        elements.loading.style.display = 'block';
        elements.noPokemon.style.display = 'none';
        
        const provider = await safeGetProvider();
        if (!provider) {
            elements.status.textContent = '⚠️ Please connect your wallet to view your Pokémon';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            return;
        }

        const acc = window.wallet?.getAccount?.();
        if (!acc) {
            elements.status.textContent = '⚠️ Please connect your wallet to view your Pokémon';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            return;
        }

        elements.status.textContent = 'Wallet connected';
        elements.status.style.color = '#00ff9d';

        const nftAddr = window.CONTRACTS?.POKEMON_NFT_ADDRESS;
        const abi = window.ABIS?.POKEMON_NFT;
        
        if (!nftAddr || !abi) {
            throw new Error('NFT contract not configured');
        }

        const nft = new ethers.Contract(nftAddr, abi, provider);
        const tokenIds = await fetchOwnedTokens(provider, nft, acc.toLowerCase());
        
        if (tokenIds.length === 0) {
            elements.loading.style.display = 'none';
            elements.noPokemon.style.display = 'block';
            elements.grid.innerHTML = '';
            return;
        }

        // Render Pokémon cards
        elements.grid.innerHTML = '';
        const renderPromises = tokenIds.map(async (tokenId) => {
            try {
                const meta = await resolveMetadata(nft, tokenId);
                if (!meta) return null;

                let name = meta.name || `Token ${tokenId}`;
                let image = meta.image ? ipfsToHttp(meta.image) : '';
                let rarity = 'Common';
                let pokemonId = tokenId;
                let types = [];
                let abilities = [];

                // Get Pokémon data from PokeAPI
                const pokeData = await fetchPokeAPIData(name);
                if (pokeData) {
                    pokemonId = pokeData.id;
                    types = pokeData.types;
                    abilities = pokeData.abilities;
                }

                // Extract rarity
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

                const card = makeSelectableCard({
                    uniqueId: tokenId,
                    pokemonId,
                    name,
                    image,
                    rarity,
                    types,
                    abilities,
                    description,
                    tokenId
                });

                return card;
            } catch (tokenError) {
                console.warn(`Skipping token #${tokenId}:`, tokenError);
                return null;
            }
        });

        const cards = await Promise.all(renderPromises);
        cards.filter(card => card !== null).forEach(card => elements.grid.appendChild(card));
        
        elements.loading.style.display = 'none';

    } catch (error) {
        console.error('Failed to load tournament Pokémon:', error);
        elements.loading.style.display = 'none';
        elements.noPokemon.style.display = 'block';
    }
}

// Create a selectable Pokémon card for tournament
function makeSelectableCard({ uniqueId, pokemonId, name, image, rarity, types, abilities, description, tokenId }) {
    const card = document.createElement('div');
    card.className = `market-card ${(rarity || 'common').toLowerCase()} tournament-card`;
    card.dataset.tokenId = uniqueId;
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
    tokenBadge.textContent = `#${uniqueId}`;

    // Types
    const typesDiv = document.createElement('div');
    typesDiv.className = 'pokemon-types';
    if (types && types.length > 0) {
        types.forEach(type => {
            const badge = document.createElement('span');
            badge.className = 'type-badge';
            badge.textContent = type.toUpperCase();
            typesDiv.appendChild(badge);
        });
    }

    // Abilities - NEW FORMAT (single line with comma separation)
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
    descriptionDiv.textContent = description;

    // Selection indicator
    const selectIndicator = document.createElement('div');
    selectIndicator.className = 'selection-indicator';
    selectIndicator.innerHTML = '✓ SELECTED';
    
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
    card.addEventListener('click', () => selectPokemonForTournament({
        tokenId: uniqueId,
        pokemonId,
        name,
        image,
        rarity,
        types,
        abilities,
        description,
        cardElement: card
    }));

    return card;
}

// Handle Pokémon selection
function selectPokemonForTournament(pokemon) {
    // Deselect previous
    document.querySelectorAll('.tournament-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    // Select new
    pokemon.cardElement.classList.add('selected');
    tournamentState.selectedPokemon = pokemon;

    // Update selected display
    elements.selectedImage.src = pokemon.image || 'images/pokeball.png';
    elements.selectedName.textContent = `#${pokemon.pokemonId} ${pokemon.name}`;
    elements.selectedId.textContent = `Token #${pokemon.tokenId}`;
    elements.selectedDisplay.style.display = 'flex';

    // Enable start button
    elements.startBtn.disabled = false;
    elements.startError.style.display = 'none';
}

// Start tournament (direct battle initiation)
async function startTournament() {
    if (!tournamentState.selectedPokemon || tournamentState.isStarting) {
        elements.startError.style.display = 'block';
        return;
    }

    tournamentState.isStarting = true;
    elements.startBtn.disabled = true;
    elements.startError.style.display = 'none';

    // Store settings
    tournamentState.opponentCount = parseInt(elements.opponentSelect.value);
    tournamentState.difficulty = elements.difficultySelect.value;

    // Directly proceed to battle
    initiateTournamentBattle();
}

function initiateTournamentBattle() {
    // Store settings in state
    tournamentState.opponentCount = parseInt(elements.opponentSelect.value);
    tournamentState.difficulty = elements.difficultySelect.value;
    
    // Prepare tournament data for battle page
    const tournamentData = {
        ...tournamentState.selectedPokemon,
        // Ensure image is HTTP URL (not IPFS)
        image: tournamentState.selectedPokemon.image || 'images/pokeball.png'
    };
    
    // Create URL parameters
    const params = new URLSearchParams({
        pokemon: encodeURIComponent(JSON.stringify(tournamentData)),
        opponents: tournamentState.opponentCount,
        difficulty: tournamentState.difficulty
    });
    
    // Reset state before redirect
    tournamentState.isStarting = false;
    
    // Redirect to battle arena
    window.location.href = `battle.html?${params.toString()}`;
}
// Initialize tournament page
window.addEventListener('DOMContentLoaded', () => {
    // Wait for wallet to be ready
    if (window.wallet?.getAccount?.()) {
        loadTournamentPokemon();
    } else {
        // Listen for wallet connection
        document.addEventListener('wallet.ready', () => {
            loadTournamentPokemon();
        });
    }
    
    // Settings change handlers
    elements.opponentSelect.addEventListener('change', (e) => {
        tournamentState.opponentCount = parseInt(e.target.value);
    });
    
    elements.difficultySelect.addEventListener('change', (e) => {
        tournamentState.difficulty = e.target.value;
    });
    
    // Start button handler
    elements.startBtn.addEventListener('click', startTournament);
});