// Tournament State
const tournamentState = {
    selectedPokemon: null,
    opponentCount: 7,
    difficulty: 'normal',
    isStarting: false
};

// Cache for PokeAPI descriptions
const descriptionCache = new Map();

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
    overlay: document.getElementById('transitionOverlay'),
    countdown: document.getElementById('countdown'),
    status: document.getElementById('connectionStatus')
};

// Fetch PokeAPI description
async function fetchPokemonDescription(pokemonName) {
    const cacheKey = pokemonName.toLowerCase();
    if (descriptionCache.has(cacheKey)) {
        return descriptionCache.get(cacheKey);
    }

    try {
        const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${cacheKey}`);
        if (!speciesRes.ok) return "A mysterious Pokémon with unknown abilities.";
        
        const speciesData = await speciesRes.json();
        
        // Find English flavor text
        const flavorText = speciesData.flavor_text_entries?.find(
            entry => entry.language.name === 'en'
        );
        
        const description = flavorText 
            ? flavorText.flavor_text.replace(/\n|\f/g, ' ') 
            : "A mysterious Pokémon with unknown abilities.";
        
        descriptionCache.set(cacheKey, description);
        return description;
    } catch (e) {
        console.warn(`Failed to fetch description for ${pokemonName}:`, e);
        return "A mysterious Pokémon with unknown abilities.";
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

                // Get Pokémon data from PokeAPI
                const pokeData = await fetchPokeAPIData(name);
                if (pokeData) {
                    pokemonId = pokeData.id;
                    types = pokeData.types?.map(t => t.type.name) || [];
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
function makeSelectableCard({ uniqueId, pokemonId, name, image, rarity, types, description, tokenId }) {
    const card = document.createElement('div');
    card.className = `market-card ${(rarity || 'common').toLowerCase()} tournament-card`;
    card.dataset.tokenId = uniqueId;
    card.dataset.pokemonId = pokemonId;
    card.dataset.name = name;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    // Unique ID Badge
    const uniqueIdBadge = document.createElement('div');
    uniqueIdBadge.className = 'unique-id-badge';
    uniqueIdBadge.textContent = `#${uniqueId}`;

    // Art
    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = image || 'images/pokeball.png';
    img.alt = name || '';
    img.onerror = () => { img.src = 'images/pokeball.png'; };
    art.appendChild(img);

    // Name
    const h4 = document.createElement('h4');
    h4.className = 'name';
    h4.textContent = `#${pokemonId} ${name}`;

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

    // Description
    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description;

    // Selection indicator
    const selectIndicator = document.createElement('div');
    selectIndicator.className = 'selection-indicator';
    selectIndicator.innerHTML = '✓ SELECTED';
    
    inner.appendChild(art);
    inner.appendChild(h4);
    inner.appendChild(typesDiv);
    inner.appendChild(descriptionDiv);
    inner.appendChild(selectIndicator);
    card.appendChild(uniqueIdBadge);
    card.appendChild(inner);

    // Click handler for selection
    card.addEventListener('click', () => selectPokemonForTournament({
        tokenId: uniqueId,
        pokemonId,
        name,
        image,
        rarity,
        types,
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

// Start tournament with transition
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

    // Show transition
    showBattleTransition();
}

// Show VS transition with countdown
function showBattleTransition() {
    const overlay = elements.overlay;
    const countdown = elements.countdown;
    const playerImg = document.getElementById('playerPokemonBattle');
    
    // Set player Pokemon image
    playerImg.src = tournamentState.selectedPokemon.image || 'images/pokeball.png';
    
    // Random AI trainer name
    const aiNames = ['GARY OAK', 'LANCE', 'CYNTHIA', 'RED', 'BLUE', 'STEVEN', 'IRIS'];
    document.getElementById('aiTrainerName').textContent = 
        aiNames[Math.floor(Math.random() * aiNames.length)];
    
    // Show overlay
    overlay.style.display = 'flex';
    
    // Start countdown
    let count = 3;
    countdown.textContent = count;
    countdown.style.fontSize = '6rem';
    countdown.classList.remove('battle-glow');
    
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdown.textContent = count;
            countdown.classList.add('pulse');
            setTimeout(() => countdown.classList.remove('pulse'), 500);
        } else if (count === 0) {
            countdown.textContent = 'BATTLE!';
            countdown.style.fontSize = '4rem';
            countdown.classList.add('battle-glow');
        } else {
            clearInterval(countdownInterval);
            // Hide overlay and proceed to battle (Phase 2)
            overlay.style.display = 'none';
            initiateTournamentBattle();
        }
    }, 1000);
}

// Placeholder for Phase 2 battle initiation
function initiateTournamentBattle() {
    console.log('🎉 TOURNAMENT STARTING!', tournamentState);
    console.log(`Your ${tournamentState.selectedPokemon.name} vs ${tournamentState.opponentCount} opponents on ${tournamentState.difficulty} difficulty`);
    
    // For Phase 1, just show success message
    if (window.txModal) {
        window.txModal.success(
            'Tournament Started!',
            `Your ${tournamentState.selectedPokemon.name} is ready to battle ${tournamentState.opponentCount} opponents on ${tournamentState.difficulty} difficulty. (Phase 2: Battle system coming soon!)`
        );
    } else {
        alert(`Tournament Started! Your ${tournamentState.selectedPokemon.name} is ready to battle!`);
    }
    
    // Reset state
    tournamentState.isStarting = false;
    elements.startBtn.disabled = false;
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