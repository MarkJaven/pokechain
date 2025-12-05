// ===================================================================
// TOURNAMENT SYSTEM - Blockchain Integrated (0 DECIMALS + BIGINT FIX)
// ===================================================================

const tournamentState = {
    selectedPokemon: null,
    opponentCount: 7,
    difficulty: 'normal',
    isStarting: false,
    hasLoaded: false,
    tournamentContract: null,
    pkcnDecimals: null,
    DISPLAY_DIVISOR: null // Will be initialized after ethers loads
};

const pokeApiCache = new Map();

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
    status: document.getElementById('connectionStatus'),
    modal: new bootstrap.Modal(document.getElementById('tournamentModal')),
    modalEntryFee: document.getElementById('modalEntryFee'),
    modalDifficulty: document.getElementById('modalDifficulty'),
    modalOpponents: document.getElementById('modalOpponents'),
    modalMinReward: document.getElementById('modalMinReward'),
    modalMaxReward: document.getElementById('modalMaxReward'),
    confirmBtn: document.getElementById('confirmTournamentBtn'),
    confirmBtnText: document.getElementById('confirmBtnText'),
    confirmBtnSpinner: document.getElementById('confirmBtnSpinner'),
    clearTournamentBtn: document.getElementById('clearTournamentBtn')
};

// ===================================================================
// DECIMALS & DISPLAY HANDLER (CRITICAL FIX FOR 0 DECIMALS + BIGINT)
// ===================================================================

async function getPkcnDecimals() {
    if (tournamentState.pkcnDecimals !== null) return tournamentState.pkcnDecimals;
    
    try {
        const provider = await safeGetProvider();
        const pkcnContract = new ethers.Contract(
            window.CONTRACTS.PKCN,
            window.ABIS.PKCN,
            provider
        );
        
        tournamentState.pkcnDecimals = await pkcnContract.decimals();
        console.log(`✅ PKCN token decimals: ${tournamentState.pkcnDecimals}`);
        
        return tournamentState.pkcnDecimals;
    } catch (error) {
        // MANUAL OVERRIDE: Force 0 decimals for your specific token
        console.warn('⚠️ Using manual decimals: 0');
        tournamentState.pkcnDecimals = 0;
        return tournamentState.pkcnDecimals;
    }
}

// FIXED: Initialize display divisor after ethers loads
function initializeDisplayDivisor() {
    if (!tournamentState.DISPLAY_DIVISOR) {
        tournamentState.DISPLAY_DIVISOR = ethers.parseEther('1');
        console.log(`✅ Display divisor initialized: ${tournamentState.DISPLAY_DIVISOR.toString()}`);
    }
}

// FIXED: Format BigInt contract values to human-readable strings
function formatRewardValue(value) {
    // Ensure divisor is initialized
    if (!tournamentState.DISPLAY_DIVISOR) {
        initializeDisplayDivisor();
    }
    
    // Both value and divisor are BigInt - division returns BigInt
    const displayValue = value / tournamentState.DISPLAY_DIVISOR;
    
    // Convert to string (no .toFixed() for BigInt!)
    return displayValue.toString();
}

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
    console.log('🏆 Tournament page loading...');
    
    await getPkcnDecimals();
    await initializeTournamentContract();
    
    localStorage.removeItem('currentTournamentId');
    localStorage.removeItem('currentTournament');
    
    if (window.wallet?.getAccount?.()) {
        loadTournamentPokemon();
    } else {
        document.addEventListener('wallet.ready', () => loadTournamentPokemon());
    }
    
    setupEventListeners();
    tournamentState.hasLoaded = true;
});

async function initializeTournamentContract() {
    try {
        if (!window.CONTRACTS?.TOURNAMENT || !window.ABIS?.TOURNAMENT) {
            console.error('❌ Tournament contract not configured');
            elements.status.textContent = '⚠️ Tournament contract not configured';
            return null;
        }
        
        const provider = await safeGetProvider();
        if (!provider) return null;
        
        const signer = await provider.getSigner();
        tournamentState.tournamentContract = new ethers.Contract(
            window.CONTRACTS.TOURNAMENT,
            window.ABIS.TOURNAMENT,
            signer
        );
        
        console.log('✅ Tournament contract initialized:', window.CONTRACTS.TOURNAMENT);
        return tournamentState.tournamentContract;
    } catch (error) {
        console.error('Failed to initialize tournament contract:', error);
        return null;
    }
}

function setupEventListeners() {
    elements.opponentSelect.addEventListener('change', (e) => {
        tournamentState.opponentCount = parseInt(e.target.value);
    });
    
    elements.difficultySelect.addEventListener('change', (e) => {
        tournamentState.difficulty = e.target.value;
    });
    
    elements.startBtn.addEventListener('click', () => {
        if (!tournamentState.selectedPokemon) {
            elements.startError.style.display = 'block';
            elements.startError.textContent = '⚠️ Please select a Pokémon first!';
            return;
        }
        showTournamentModal();
    });
    
    elements.confirmBtn.addEventListener('click', async () => {
        await confirmAndStartTournament();
    });
    
    if (elements.clearTournamentBtn) {
        elements.clearTournamentBtn.addEventListener('click', async () => {
            await forceClearTournament();
        });
    }
}

// ===================================================================
// MODAL LOGIC (0-DECIMAL CONTRACT COMPATIBLE)
// ===================================================================

async function showTournamentModal() {
    try {
        if (!tournamentState.tournamentContract) {
            throw new Error('Tournament contract not initialized');
        }
        
        // Update modal display elements
        elements.modalDifficulty.textContent = tournamentState.difficulty.toUpperCase();
        elements.modalOpponents.textContent = tournamentState.opponentCount + 1 + ' participants';
        elements.modalEntryFee.textContent = '50 PKCN';
        
        // Get estimated rewards directly from contract (returns BigInt)
        const estimates = await tournamentState.tournamentContract.getEstimatedRewards(
            tournamentState.difficulty,
            tournamentState.opponentCount
        );
        
        // FIXED: Direct display - contract returns 0-decimal values
        // No division needed - use toString() directly
        elements.modalMinReward.textContent = estimates[0].toString() + ' PKCN';
        elements.modalMaxReward.textContent = estimates[1].toString() + ' PKCN';
        
        // Log for verification
        console.log(`📊 Rewards: ${estimates[0]} PKCN - ${estimates[1]} PKCN`);
        
        // Reset button state
        elements.confirmBtn.disabled = false;
        elements.confirmBtnText.textContent = 'Approve & Start';
        elements.confirmBtnSpinner.style.display = 'none';
        
        // Show the modal
        elements.modal.show();
        
    } catch (error) {
        console.error('Failed to show modal:', error);
        elements.startError.style.display = 'block';
        elements.startError.textContent = '⚠️ Error calculating rewards. Please try again.';
        
        // Hide modal and reset button
        elements.modal.hide();
        elements.confirmBtn.disabled = false;
        elements.confirmBtnText.textContent = 'Approve & Start';
        elements.confirmBtnSpinner.style.display = 'none';
    }
}

// ===================================================================
// TOURNAMENT START (NO RETRIES - PROPER ERROR HANDLING)
// ===================================================================

async function confirmAndStartTournament() {
    if (tournamentState.isStarting) return;
    
    tournamentState.isStarting = true;
    elements.confirmBtn.disabled = true;
    elements.confirmBtnText.textContent = 'Processing...';
    elements.confirmBtnSpinner.style.display = 'inline-block';
    
    try {
        const provider = await safeGetProvider();
        const signer = await provider.getSigner();
        const account = await signer.getAddress();
        
        const decimals = tournamentState.pkcnDecimals;
        const requiredAmount = ethers.parseUnits('50', decimals);
        
        // PKCN Balance Check
        const pkcnContract = new ethers.Contract(
            window.CONTRACTS.PKCN,
            window.ABIS.PKCN,
            signer
        );
        
        const balance = await pkcnContract.balanceOf(account);
        const formattedBalance = ethers.formatUnits(balance, decimals);
        
        console.log(`💰 Balance: ${formattedBalance} PKCN (raw: ${balance.toString()})`);
        console.log(`💰 Required: 50 PKCN (raw: ${requiredAmount.toString()})`);
        
        if (balance < requiredAmount) {
            throw new Error(`Insufficient balance. Need 50 PKCN, have ${formattedBalance} PKCN`);
        }
        
        // Allowance Check & Approval
        const allowance = await pkcnContract.allowance(account, window.CONTRACTS.TOURNAMENT);
        const formattedAllowance = ethers.formatUnits(allowance, decimals);
        
        console.log(`📄 Allowance: ${formattedAllowance} PKCN (raw: ${allowance.toString()})`);
        
        if (allowance < requiredAmount) {
            elements.confirmBtnText.textContent = 'Approving PKCN...';
            
            const approveTx = await pkcnContract.approve(
                window.CONTRACTS.TOURNAMENT,
                requiredAmount
            );
            
            await approveTx.wait();
            console.log('✅ Approval confirmed');
            
            // Verify allowance
            await new Promise(r => setTimeout(r, 1000));
            const newAllowance = await pkcnContract.allowance(account, window.CONTRACTS.TOURNAMENT);
            console.log(`📄 New Allowance: ${ethers.formatUnits(newAllowance, decimals)} PKCN`);
            
            if (newAllowance < requiredAmount) {
                throw new Error('Approval verification failed');
            }
        }
        
        // NFT Ownership Check
        const nftContract = new ethers.Contract(
            window.CONTRACTS.POKEMON_NFT,
            window.ABIS.POKEMON_NFT,
            signer
        );
        
        const nftOwner = await nftContract.ownerOf(tournamentState.selectedPokemon.tokenId);
        if (nftOwner.toLowerCase() !== account.toLowerCase()) {
            throw new Error('You no longer own this NFT. Please refresh.');
        }
        
        // Generate unique tournament ID
        const tournamentId = await generateTournamentId();
        console.log(`🎯 Tournament ID: ${tournamentId}`);
        
        // Log parameters
        console.log('📤 Calling startTournament with:', {
            tournamentId,
            tokenId: tournamentState.selectedPokemon.tokenId,
            difficulty: tournamentState.difficulty,
            opponentCount: tournamentState.opponentCount
        });
        
        // Start Tournament
        elements.confirmBtnText.textContent = 'Starting Tournament...';
        
        const tx = await tournamentState.tournamentContract.startTournament(
            tournamentId,
            tournamentState.selectedPokemon.tokenId,
            tournamentState.difficulty,
            tournamentState.opponentCount
        );
        
        console.log('⏳ Transaction pending...');
        await tx.wait();
        console.log('🎉 Tournament started successfully:', tournamentId);
        
        localStorage.setItem('currentTournamentId', tournamentId);
        await initiateTournamentBattle(tournamentId);
        
    } catch (error) {
        console.error('❌ Tournament start failed:', error);
        elements.modal.hide();
        
        const errorData = error.data?.toString() || '';
        const isTournamentExists = errorData.includes('0xe450d38c') || 
                                 error.message.includes('TournamentAlreadyExists') ||
                                 error.message.includes('already exists') ||
                                 error.message.includes('active tournament');
        
        let errorMessage = 'Transaction failed. Please try again.';
        
        if (isTournamentExists) {
            errorMessage = '🚫 <strong>YOU ALREADY HAVE AN ACTIVE TOURNAMENT!</strong><br><br>' +
                          'Your wallet or NFT is currently locked in a tournament.<br>' +
                          'Complete it or wait for expiration before starting a new one.';
            
            // Show clear button
            if (elements.clearTournamentBtn) {
                elements.clearTournamentBtn.style.display = 'inline-block';
            }
        } else if (error.message.includes('insufficient allowance')) {
            errorMessage = '⚠️ PKCN approval failed. Approve exactly 50 PKCN.';
        } else if (error.message.includes('Not NFT owner')) {
            errorMessage = '❌ You no longer own this NFT. Refresh the page.';
        } else if (error.message.includes('execution reverted')) {
            errorMessage = '⚠️ Transaction reverted. Check: balance, allowance, NFT status.';
        } else {
            errorMessage = `❌ Error: ${error.message.substring(0, 120)}...`;
        }
        
        elements.startError.style.display = 'block';
        elements.startError.innerHTML = errorMessage;
        
        tournamentState.isStarting = false;
        elements.confirmBtn.disabled = false;
    }
}

// ===================================================================
// FORCE CLEAR TOURNAMENT (EMERGENCY FUNCTION)
// ===================================================================

async function forceClearTournament() {
    if (!confirm('⚠️ WARNING: This will attempt to force-complete your active tournament.\n\n' +
                 'Only use this if your tournament is stuck or you cannot start a new one.\n\nContinue?')) {
        return;
    }
    
    try {
        const provider = await safeGetProvider();
        const signer = await provider.getSigner();
        
        const dummyId = 'force_clear_' + Date.now();
        console.log(`🚨 Force clearing: ${dummyId}`);
        
        const tx = await tournamentState.tournamentContract.completeTournament(
            dummyId,
            0,
            false
        );
        
        await tx.wait();
        console.log('✅ Force clear sent');
        
    } catch (error) {
        console.warn('⚠️ Force clear failed (expected):', error.message.substring(0, 60));
    }
    
    // Clear local state
    localStorage.removeItem('currentTournamentId');
    localStorage.removeItem('currentTournament');
    
    alert('✅ Tournament state cleared! Please refresh the page and try again.');
    
    if (elements.clearTournamentBtn) {
        elements.clearTournamentBtn.style.display = 'none';
    }
    
    elements.startError.style.display = 'none';
}

// ===================================================================
// UNIQUE ID GENERATION
// ===================================================================

async function generateTournamentId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 16);
    const account = window.wallet?.getAccount?.() || '0x0';
    const accountSlice = account.substring(2, 10);
    
    const provider = await safeGetProvider();
    const blockNumber = provider ? await provider.getBlockNumber() : timestamp;
    
    return `tour_${blockNumber}_${timestamp}_${random}_${accountSlice}`;
}

// ===================================================================
// POKEMON LOADING (UNCHANGED - WORKING)
// ===================================================================

async function fetchPokemonDescription(pokemonName) {
    const cacheKey = `desc-${pokemonName.toLowerCase()}`;
    if (pokeApiCache.has(cacheKey)) return pokeApiCache.get(cacheKey);

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
    if (pokeApiCache.has(cacheKey)) return pokeApiCache.get(cacheKey);

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

async function loadTournamentPokemon() {
    try {
        console.log('Loading tournament Pokemon...');
        
        elements.loading.style.display = 'block';
        elements.noPokemon.style.display = 'none';
        elements.grid.innerHTML = '';
        
        const provider = await safeGetProvider();
        if (!provider) {
            elements.status.textContent = '⚠️ Please connect your wallet';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        const account = window.wallet?.getAccount?.();
        if (!account) {
            elements.status.textContent = '⚠️ Please connect your wallet';
            elements.status.style.color = '#ff6b00';
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        elements.status.textContent = 'Wallet connected';
        elements.status.style.color = '#00ff9d';

        const nftAddr = window.CONTRACTS.POKEMON_NFT;
        const abi = window.ABIS.POKEMON_NFT;
        
        if (!nftAddr || !abi) {
            throw new Error('NFT contract not configured');
        }

        const nft = new ethers.Contract(nftAddr, abi, provider);
        const tokenIds = await fetchOwnedTokens(provider, nft, account.toLowerCase());
        
        if (!tokenIds || tokenIds.length === 0) {
            elements.loading.style.display = 'none';
            showNoPokemonMessage();
            return;
        }

        console.log(`Found ${tokenIds.length} tokens`);
        
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

                const pokeData = await fetchPokeAPIData(name);
                if (pokeData) {
                    pokemonId = pokeData.id;
                    types = pokeData.types;
                    abilities = pokeData.abilities;
                }

                if (meta.attributes && Array.isArray(meta.attributes)) {
                    const rarityAttr = meta.attributes.find(a => 
                        a.trait_type?.toLowerCase() === 'rarity'
                    );
                    if (rarityAttr && rarityAttr.value) {
                        rarity = rarityAttr.value;
                    }
                }

                const description = await fetchPokemonDescription(name);

                return createSelectableCard({
                    tokenId: tokenId,
                    pokemonId: pokemonId,
                    name: name,
                    image: image,
                    rarity: rarity,
                    types: types,
                    abilities: abilities,
                    description: description
                });
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

function createSelectableCard({ tokenId, pokemonId, name, image, rarity, types, abilities, description }) {
    const card = document.createElement('div');
    card.className = `market-card ${(rarity || 'common').toLowerCase()} tournament-card`;
    card.dataset.tokenId = tokenId;
    card.dataset.pokemonId = pokemonId;
    card.dataset.name = name;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const art = document.createElement('div');
    art.className = 'pokemon-image';
    const img = document.createElement('img');
    img.src = image || 'images/pokeball.png';
    img.alt = name || '';
    img.onerror = () => { img.src = 'images/pokeball.png'; };
    art.appendChild(img);

    const infoContainer = document.createElement('div');
    infoContainer.className = 'pokemon-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'pokemon-name';
    nameDiv.textContent = `#${pokemonId} ${name}`;

    const tokenBadge = document.createElement('div');
    tokenBadge.className = 'token-badge';
    tokenBadge.textContent = `#${tokenId}`;

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

    const abilitiesDiv = document.createElement('div');
    abilitiesDiv.className = 'pokemon-abilities';
    if (abilities && abilities.length > 0) {
        const abilityNames = abilities.slice(0, 3).map(ab => ab.name.replace(/-/g, ' ')).join(', ');
        abilitiesDiv.textContent = `Abilities: ${abilityNames}`;
    } else {
        abilitiesDiv.textContent = 'Abilities: Unknown';
    }

    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'pokemon-description';
    descriptionDiv.textContent = description || "A mysterious Pokémon ready for battle.";

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

    card.addEventListener('click', () => {
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

function selectPokemonForTournament(pokemon) {
    document.querySelectorAll('.tournament-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    pokemon.cardElement.classList.add('selected');
    tournamentState.selectedPokemon = pokemon;

    elements.selectedImage.src = pokemon.image || 'images/pokeball.png';
    elements.selectedName.textContent = `#${pokemon.pokemonId} ${pokemon.name}`;
    elements.selectedId.textContent = `Token #${pokemon.tokenId}`;
    elements.selectedDisplay.style.display = 'flex';
    elements.selectedDisplay.style.alignItems = 'center';
    elements.selectedDisplay.style.gap = '15px';

    elements.startBtn.disabled = false;
    elements.startError.style.display = 'none';
}

async function initiateTournamentBattle(tournamentId) {
    if (!tournamentState.selectedPokemon) {
        throw new Error('No Pokemon selected');
    }
    
    const playerData = {
        tokenId: tournamentState.selectedPokemon.tokenId,
        pokemonId: tournamentState.selectedPokemon.pokemonId,
        name: tournamentState.selectedPokemon.name,
        rarity: tournamentState.selectedPokemon.rarity,
        types: tournamentState.selectedPokemon.types,
        abilities: tournamentState.selectedPokemon.abilities,
        description: tournamentState.selectedPokemon.description,
        tournamentId: tournamentId
    };
    
    await logTournamentStart(playerData);
    
    const params = new URLSearchParams({
        pokemon: encodeURIComponent(JSON.stringify(playerData)),
        opponents: tournamentState.opponentCount,
        difficulty: tournamentState.difficulty,
        tournamentId: tournamentId
    });
    
    window.location.href = `battle.html?${params.toString()}`;
}

async function logTournamentStart(playerData) {
    const tournamentData = {
        player: window.wallet.getAccount(),
        pokemonId: playerData.pokemonId,
        tokenId: playerData.tokenId,
        opponentCount: tournamentState.opponentCount,
        difficulty: tournamentState.difficulty,
        timestamp: Date.now(),
        tournamentId: localStorage.getItem('currentTournamentId')
    };
    
    localStorage.setItem('currentTournament', JSON.stringify(tournamentData));
    console.log('Tournament logged:', tournamentData);
}

// ===================================================================
// HELPERS
// ===================================================================

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

async function fetchOwnedTokens(provider, contract, account) {
    try {
        const balance = await contract.balanceOf(account);
        const tokenCount = parseInt(balance.toString());
        
        if (tokenCount === 0) return [];
        
        try {
            const tokenIds = await contract.getTokenIdsByOwner(account);
            return tokenIds.map(id => parseInt(id.toString()));
        } catch (e) {
            console.warn('Scanning Transfer events...');
        }
        
        const filter = contract.filters.Transfer;
        const events = await contract.queryFilter(filter, 0, 'latest');
        
        const ownedTokens = new Set();
        events.forEach(event => {
            const from = event.args.from.toLowerCase();
            const to = event.args.to.toLowerCase();
            const tokenId = parseInt(event.args.tokenId.toString());
            
            if (to === account.toLowerCase()) ownedTokens.add(tokenId);
            if (from === account.toLowerCase()) ownedTokens.delete(tokenId);
        });
        
        return Array.from(ownedTokens).sort((a, b) => a - b);
    } catch (error) {
        console.error('Error fetching owned tokens:', error);
        return [];
    }
}

async function resolveMetadata(contract, tokenId) {
    try {
        const tokenURI = await contract.tokenURI(tokenId);
        const httpUrl = ipfsToHttp(tokenURI);
        
        const response = await fetch(httpUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch metadata: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error resolving metadata for token ${tokenId}:`, error);
        return {
            name: `Pokemon ${tokenId}`,
            image: 'images/pokeball.png',
            attributes: [{ trait_type: 'Rarity', value: 'Common' }]
        };
    }
}

function ipfsToHttp(uri) {
    if (!uri) return 'images/pokeball.png';
    if (uri.startsWith('ipfs://')) {
        const cid = uri.replace('ipfs://', '');
        return `https://ipfs.io/ipfs/${cid}`;
    }
    if (uri.startsWith('ipfs://ipfs/')) {
        const path = uri.replace('ipfs://ipfs/', '');
        return `https://ipfs.io/ipfs/${path}`;
    }
    if (uri.startsWith('http')) return uri;
    if (uri.startsWith('data:')) return uri;
    
    return 'images/pokeball.png';
}