// ===================================================================
// PVP LOBBY SYSTEM - FIXED ARCHITECTURE
// ===================================================================
// Key fixes:
// 1. Sequential staking (Creator → Joiner)
// 2. Contract creates match only after both stakes confirmed
// 3. Proper transaction state management

const pvpState = {
    selectedPokemon: null,
    betAmount: 250,
    supabaseClient: null,
    subscription: null,
    myAddress: null,
    roomRefreshInterval: null,
    currentMode: 'browse',
    currentRoomId: null
};

// DOM Elements
const elements = {
    createRoomBtn: document.getElementById('createRoomBtn'),
    betAmountInput: document.getElementById('betAmount'),
    selectedDisplay: document.getElementById('selectedPokemonDisplay'),
    selectedImage: document.getElementById('selectedPokemonImage'),
    selectedName: document.getElementById('selectedPokemonName'),
    selectedId: document.getElementById('selectedPokemonId'),
    roomsList: document.getElementById('roomsList'),
    myRoomsList: document.getElementById('myRoomsList'),
    myRoomsSection: document.getElementById('myRoomsSection'),
    pokemonGrid: document.getElementById('pvpPokemonGrid'),
    loadingOverlay: document.getElementById('pvpLoadingOverlay'),
    loadingMessage: document.getElementById('loadingMessage'),
    errorDiv: document.getElementById('pvpError')
};

// ===================================================================
// MODAL SYSTEM
// ===================================================================

function showModal(title, message, buttons = []) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'pvp-modal-overlay';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); display: flex; align-items: center;
            justify-content: center; z-index: 10000; backdrop-filter: blur(5px);
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: linear-gradient(135deg, rgba(20,20,30,0.98), rgba(10,10,20,0.95));
            border: 2px solid var(--primary); border-radius: 20px; padding: 30px;
            max-width: 500px; width: 90%; box-shadow: 0 20px 60px rgba(0,255,157,0.3);
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.cssText = 'color: var(--primary); margin-bottom: 20px; font-weight: 800;';

        const messageEl = document.createElement('p');
        messageEl.innerHTML = message;
        messageEl.style.cssText = 'color: white; margin-bottom: 25px; line-height: 1.6;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.className = btn.primary ? 'btn btn-primary' : 'btn btn-secondary';
            button.style.cssText = btn.primary ? 
                'background: linear-gradient(180deg, var(--primary), #00c474); border: none; font-weight: 700;' :
                'background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);';
            button.onclick = () => {
                document.body.removeChild(modal);
                resolve(btn.value);
            };
            buttonContainer.appendChild(button);
        });

        content.appendChild(titleEl);
        content.appendChild(messageEl);
        content.appendChild(buttonContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    });
}

function showLoadingModal(message) {
    const modal = document.createElement('div');
    modal.id = 'pvpLoadingModal';
    modal.className = 'pvp-modal-overlay';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); display: flex; align-items: center;
        justify-content: center; z-index: 10000; backdrop-filter: blur(5px);
    `;

    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(20,20,30,0.98), rgba(10,10,20,0.95));
                    border: 2px solid var(--primary); border-radius: 20px; padding: 40px;
                    text-align: center; box-shadow: 0 20px 60px rgba(0,255,157,0.3);">
            <div class="spinner-border text-success" style="width: 3rem; height: 3rem; margin-bottom: 20px;"></div>
            <h4 id="loadingModalMessage" style="color: var(--primary); font-weight: 700; margin: 0;">${message}</h4>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function updateLoadingModal(message) {
    const msgEl = document.getElementById('loadingModalMessage');
    if (msgEl) msgEl.textContent = message;
}

function hideLoadingModal() {
    const modal = document.getElementById('pvpLoadingModal');
    if (modal) document.body.removeChild(modal);
}

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 PvP Lobby loading...');

    if (!initializeSupabase()) {
        showError('❌ Supabase not initialized. Check config.js');
        return;
    }

    if (window.wallet?.getAccount?.()) {
        await initPvPLobby();
    } else {
        document.addEventListener('wallet.ready', async () => {
            await initPvPLobby();
        });
    }

    setupEventListeners();
    setupModeToggle();
    startRoomPolling();
});

function initializeSupabase() {
    if (typeof window.supabase !== 'undefined' && window.SUPABASE_CONFIG) {
        try {
            pvpState.supabaseClient = window.supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            console.log('✅ Supabase client initialized for PvP');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Supabase:', error);
            return false;
        }
    }
    return false;
}

async function initPvPLobby() {
    pvpState.myAddress = window.wallet.getAccount().toLowerCase();
    await loadPlayerPokemon();
    await refreshRoomsList();
    console.log('✅ PvP Lobby initialized for address:', pvpState.myAddress);
}

function setupEventListeners() {
    elements.createRoomBtn.addEventListener('click', async () => {
        await createPvPRoom();
    });

    elements.betAmountInput.addEventListener('input', (e) => {
        pvpState.betAmount = parseInt(e.target.value) || 250;
    });
}

// ===================================================================
// MODE TOGGLE SYSTEM
// ===================================================================

function setupModeToggle() {
    const hero = document.querySelector('.collection-hero');
    if (!hero) return;

    const modeToggle = document.createElement('div');
    modeToggle.style.cssText = 'display: flex; gap: 15px; margin-top: 20px; justify-content: center;';
    modeToggle.innerHTML = `
        <button id="browseModeBtn" class="btn btn-lg btn-primary" style="min-width: 150px;">
            🎮 Browse Rooms
        </button>
        <button id="createModeBtn" class="btn btn-lg btn-outline-success" style="min-width: 150px;">
            ⚔️ Create Room
        </button>
    `;
    hero.appendChild(modeToggle);

    document.getElementById('browseModeBtn').addEventListener('click', () => switchMode('browse'));
    document.getElementById('createModeBtn').addEventListener('click', () => switchMode('create'));
}

function switchMode(mode) {
    pvpState.currentMode = mode;
    
    const browseBtn = document.getElementById('browseModeBtn');
    const createBtn = document.getElementById('createModeBtn');
    const createSection = document.querySelector('.create-room-section');
    const roomsSection = document.querySelector('.rooms-section');

    if (mode === 'browse') {
        browseBtn.className = 'btn btn-lg btn-primary';
        createBtn.className = 'btn btn-lg btn-outline-success';
        
        if (createSection) createSection.style.display = 'none';
        if (roomsSection) roomsSection.style.display = 'block';
    } else {
        browseBtn.className = 'btn btn-lg btn-outline-primary';
        createBtn.className = 'btn btn-lg btn-success';
        
        if (createSection) createSection.style.display = 'block';
        if (roomsSection) roomsSection.style.display = 'block';
    }
}

// ===================================================================
// POKEMON SELECTION (unchanged - working correctly)
// ===================================================================

async function loadPlayerPokemon() {
    try {
        const provider = await safeGetProvider();
        const account = pvpState.myAddress;
        
        const nftContract = new ethers.Contract(
            window.CONTRACTS.POKEMON_NFT,
            window.ABIS.POKEMON_NFT,
            provider
        );

        const balance = await nftContract.balanceOf(account);
        const tokenCount = parseInt(balance.toString());

        if (tokenCount === 0) {
            elements.pokemonGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 20px; color: rgba(255,255,255,0.5);">You don\'t own any Pokémon yet.<br><a href="marketplace.html" style="color: var(--primary); text-decoration: underline;">Visit Marketplace</a></div>';
            return;
        }

        console.log(`🔍 Account has ${tokenCount} Pokemon...`);
        
        elements.pokemonGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 40px;"><div class="spinner-border text-success"></div><p style="margin-top: 15px;">Loading your Pokémon...</p></div>';
        
        const tokenIds = await fetchOwnedTokens(provider, nftContract, account);
        
        if (tokenIds.length === 0) {
            elements.pokemonGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 20px; color: rgba(255,255,255,0.5);">Could not find your Pokémon. Try refreshing.</div>';
            return;
        }
        
        elements.pokemonGrid.innerHTML = '';
        
        for (const tokenId of tokenIds) {
            const tokenIdNum = parseInt(tokenId.toString());
            const metadata = await fetchPokemonMetadata(nftContract, tokenIdNum);
            
            if (metadata) {
                const card = createPokemonCard(metadata);
                elements.pokemonGrid.appendChild(card);
            }
        }
        
        console.log(`✅ Loaded ${tokenIds.length} Pokemon`);

    } catch (error) {
        console.error('❌ Failed to load Pokemon:', error);
        elements.pokemonGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 20px; color: #ff6b00;">Error loading Pokémon</div>';
    }
}

async function fetchOwnedTokens(provider, nft, addr) {
    try {
        const balance = await nft.balanceOf(addr);
        const tokenCount = parseInt(balance.toString());
        
        if (tokenCount === 0) return [];
        
        try {
            if (typeof nft.getTokenIdsByOwner === 'function') {
                const tokenIds = await nft.getTokenIdsByOwner(addr);
                return tokenIds.map(id => parseInt(id.toString()));
            }
        } catch (e) {
            console.log('getTokenIdsByOwner not available');
        }

        try {
            console.log('📜 Using queryFilter for Transfer events');
            const filter = nft.filters.Transfer;
            const events = await nft.queryFilter(filter, 0, 'latest');
            
            const ownedTokens = new Set();
            events.forEach(event => {
                const from = event.args.from.toLowerCase();
                const to = event.args.to.toLowerCase();
                const tokenId = parseInt(event.args.tokenId.toString());
                
                if (to === addr.toLowerCase()) ownedTokens.add(tokenId);
                if (from === addr.toLowerCase()) ownedTokens.delete(tokenId);
            });
            
            return Array.from(ownedTokens).sort((a, b) => a - b);
        } catch (e) {
            console.warn('⚠️ queryFilter failed:', e);
        }
        
        return Array.from({length: Math.min(tokenCount, 3)}, (_, i) => i + 1);
        
    } catch (error) {
        console.error('❌ Error fetching owned tokens:', error);
        return [];
    }
}

async function fetchPokemonMetadata(contract, tokenId) {
    try {
        const tokenURI = await contract.tokenURI(tokenId);
        
        let metadata;
        if (tokenURI.startsWith('data:application/json;base64,')) {
            const base64Data = tokenURI.split(',')[1];
            const jsonString = atob(base64Data);
            metadata = JSON.parse(jsonString);
        } else {
            const response = await fetch(ipfsToHttp(tokenURI));
            metadata = await response.json();
        }
        
        const pokemonName = metadata.name;
        const rarity = metadata.attributes?.find(a => a.trait_type === 'Rarity')?.value || 'common';
        
        const pokeData = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`).then(r => r.json());
        
        return {
            tokenId: tokenId,
            name: pokemonName,
            pokemonId: pokeData.id,
            image: ipfsToHttp(metadata.image),
            types: pokeData.types.map(t => t.type.name),
            abilities: pokeData.abilities.map(a => ({
                name: a.ability.name,
                isHidden: a.is_hidden
            })),
            rarity: rarity,
            stats: pokeData.stats.map(s => ({
                name: s.stat.name,
                value: s.base_stat
            }))
        };
    } catch (error) {
        console.warn(`⚠️ Failed to fetch token #${tokenId}:`, error.message);
        return null;
    }
}

function createPokemonCard(pokemon) {
    if (!pokemon) return null;
    
    const card = document.createElement('div');
    card.className = `pvp-pokemon-card ${pokemon.rarity.toLowerCase()}`;
    card.dataset.tokenId = pokemon.tokenId;

    card.innerHTML = `
        <img src="${pokemon.image}" alt="${pokemon.name}" onerror="this.src='images/pokeball.png'">
        <div class="pokemon-name">#${pokemon.pokemonId} ${pokemon.name}</div>
        <div class="pokemon-types">
            ${pokemon.types.map(type => `<span class="type-badge ${type}">${type.toUpperCase()}</span>`).join('')}
        </div>
    `;

    card.addEventListener('click', () => {
        selectPokemon(pokemon, card);
    });

    return card;
}

function selectPokemon(pokemon, cardElement) {
    if (!pokemon) return;
    
    document.querySelectorAll('.pvp-pokemon-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    
    pvpState.selectedPokemon = pokemon;
    
    elements.selectedImage.src = pokemon.image;
    elements.selectedName.textContent = `#${pokemon.pokemonId} ${pokemon.name}`;
    elements.selectedId.textContent = `Token #${pokemon.tokenId}`;
    elements.selectedDisplay.style.display = 'flex';
    elements.selectedDisplay.style.alignItems = 'center';
    elements.selectedDisplay.style.gap = '15px';

    elements.createRoomBtn.disabled = false;
    
    console.log('✅ Selected:', pokemon.name);
}

// ===================================================================
// 🔧 FIXED: ROOM CREATION - Creator does NOT stake yet
// ===================================================================

async function createPvPRoom() {
    if (!pvpState.selectedPokemon) {
        await showModal('Select Pokémon', 'Please select a Pokémon first!', [
            { text: 'OK', value: true, primary: true }
        ]);
        return;
    }

    if (pvpState.betAmount < 50) {
        await showModal('Invalid Bet', 'Minimum bet is 50 PKCN', [
            { text: 'OK', value: true, primary: true }
        ]);
        return;
    }

    const confirmed = await showModal(
        '⚔️ Create Battle Room',
        `Ready to create a room with ${pvpState.selectedPokemon.name}?<br><br>
        <strong>Bet Amount:</strong> ${pvpState.betAmount} PKCN<br>
        <strong>Pokémon:</strong> #${pvpState.selectedPokemon.pokemonId} ${pvpState.selectedPokemon.name}`,
        [
            { text: 'Cancel', value: false },
            { text: 'Create Room', value: true, primary: true }
        ]
    );

    if (!confirmed) return;

    const loadingModal = showLoadingModal('Creating room...');

    try {
        const roomId = generateRoomId();
        pvpState.currentRoomId = roomId;
        console.log(`🎮 Creating room: ${roomId}`);

        // ✅ FIX: Only create Supabase room, NO blockchain transaction yet
        const { data: room, error } = await pvpState.supabaseClient
            .from('pvp_rooms')
            .insert({
                room_id: roomId,
                creator_address: pvpState.myAddress,
                bet_amount: pvpState.betAmount,
                status: 'waiting'
            })
            .select()
            .single();

        if (error) throw error;

        // Store creator's Pokemon data
        const { error: playerError } = await pvpState.supabaseClient
            .from('pvp_players')
            .insert({
                room_id: roomId,
                player_address: pvpState.myAddress,
                token_id: pvpState.selectedPokemon.tokenId,
                pokemon_data: pvpState.selectedPokemon,
                is_creator: true,
                transaction_status: 'pending' // Not staked yet
            });

        if (playerError) throw playerError;

        hideLoadingModal();
        
        await showModal(
            '✅ Room Created!',
            `Room created successfully!<br><br>
            <strong>Room ID:</strong> ${roomId.substring(0, 16)}...<br><br>
            Waiting for an opponent to join...`,
            [{ text: 'OK', value: true, primary: true }]
        );
        
        subscribeToRoom(roomId);
        refreshRoomsList();
        switchMode('browse');

    } catch (error) {
        hideLoadingModal();
        await showModal('❌ Error', `Failed to create room: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

// ===================================================================
// 🔧 FIXED: JOIN ROOM - Joiner does NOT stake yet
// ===================================================================

async function joinRoom(roomId) {
    if (!pvpState.selectedPokemon) {
        await showModal('Select Pokémon', 'Please select a Pokémon first!', [
            { text: 'OK', value: true, primary: true }
        ]);
        return;
    }

    const { data: room } = await pvpState.supabaseClient
        .from('pvp_rooms')
        .select('*')
        .eq('room_id', roomId)
        .single();

    const confirmed = await showModal(
        '⚔️ Join Battle Room',
        `Ready to join this battle?<br><br>
        <strong>Bet Amount:</strong> ${room.bet_amount} PKCN<br>
        <strong>Your Pokémon:</strong> #${pvpState.selectedPokemon.pokemonId} ${pvpState.selectedPokemon.name}`,
        [
            { text: 'Cancel', value: false },
            { text: 'Join Room', value: true, primary: true }
        ]
    );

    if (!confirmed) return;

    const loadingModal = showLoadingModal('Joining room...');

    try {
        // Check if already joined
        const { data: existing } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', roomId)
            .eq('player_address', pvpState.myAddress);

        if (existing && existing.length > 0) {
            hideLoadingModal();
            await showModal('Already Joined', 'You are already in this room', [
                { text: 'OK', value: true, primary: true }
            ]);
            return;
        }

        // ✅ FIX: Store joiner's data, NO blockchain transaction yet
        const { error } = await pvpState.supabaseClient
            .from('pvp_players')
            .insert({
                room_id: roomId,
                player_address: pvpState.myAddress,
                token_id: pvpState.selectedPokemon.tokenId,
                pokemon_data: pvpState.selectedPokemon,
                is_creator: false,
                transaction_status: 'pending' // Not staked yet
            });

        if (error) throw error;

        // Update room to 'pending' (waiting for creator's acceptance)
        await pvpState.supabaseClient
            .from('pvp_rooms')
            .update({ status: 'pending' })
            .eq('room_id', roomId);

        hideLoadingModal();
        
        await showModal(
            '✅ Join Request Sent!',
            'Waiting for creator to accept your challenge...',
            [{ text: 'OK', value: true, primary: true }]
        );
        
        pvpState.currentRoomId = roomId;
        subscribeToRoom(roomId);
        refreshRoomsList();

    } catch (error) {
        hideLoadingModal();
        await showModal('❌ Error', `Failed to join room: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

// ===================================================================
// 🔧 FIXED: ACCEPT/DECLINE - Triggers staking sequence
// ===================================================================

async function acceptJoin(roomId, joinerAddress) {
    const confirmed = await showModal(
        '⚔️ Accept Challenge',
        'Accept this challenge?<br><br>Both players will stake PKCN and battle begins!',
        [
            { text: 'Cancel', value: false },
            { text: 'Accept & Stake', value: true, primary: true }
        ]
    );

    if (!confirmed) return;

    const loadingModal = showLoadingModal('Accepting challenge...');

    try {
        // Update room status to 'staking'
        await pvpState.supabaseClient
            .from('pvp_rooms')
            .update({ status: 'staking' })
            .eq('room_id', roomId);

        // ✅ CRITICAL FIX: Creator stakes FIRST
        updateLoadingModal('Processing your stake (1/2)...');
        await processCreatorStake(roomId);
        
        hideLoadingModal();

        // Notify joiner to stake (via subscription)
        await showModal(
            '✅ Stake Successful!',
            'Your stake confirmed!<br><br>Waiting for opponent to stake...',
            [{ text: 'OK', value: true, primary: true }]
        );

    } catch (error) {
        hideLoadingModal();
        
        // Revert room status on error
        await pvpState.supabaseClient
            .from('pvp_rooms')
            .update({ status: 'pending' })
            .eq('room_id', roomId);
            
        await showModal('❌ Error', `Failed to accept: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

async function declineJoin(roomId) {
    try {
        // Remove joiner from room
        await pvpState.supabaseClient
            .from('pvp_players')
            .delete()
            .eq('room_id', roomId)
            .eq('is_creator', false);

        // Reset room to waiting
        await pvpState.supabaseClient
            .from('pvp_rooms')
            .update({ status: 'waiting' })
            .eq('room_id', roomId);

        await showModal('❌ Challenge Declined', 'You declined the challenge', [
            { text: 'OK', value: true, primary: true }
        ]);
        refreshRoomsList();
    } catch (error) {
        await showModal('❌ Error', `Failed to decline: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

// ===================================================================
// 🔧 FIXED: SEQUENTIAL STAKING LOGIC
// ===================================================================

/**
 * ✅ STEP 1: Creator approves and stakes their PKCN
 */
async function processCreatorStake(roomId) {
    console.log('💰 STEP 1: Creator staking...');
    
    try {
        const provider = await safeGetProvider();
        const signer = await provider.getSigner();
        
        const pkcnContract = new ethers.Contract(
            window.CONTRACTS.PKCN,
            window.ABIS.PKCN,
            signer
        );

        const { data: room } = await pvpState.supabaseClient
            .from('pvp_rooms')
            .select('*')
            .eq('room_id', roomId)
            .single();

        const { data: players } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', roomId)
            .order('is_creator', { ascending: false });

        const creator = players.find(p => p.is_creator);
        const joiner = players.find(p => !p.is_creator);

        if (!creator || !joiner) throw new Error('Player data not found');

        const stakeAmount = ethers.parseUnits(room.bet_amount.toString(), 18);

        // Check balance
        const balance = await pkcnContract.balanceOf(pvpState.myAddress);
        if (balance < stakeAmount) {
            throw new Error(`Insufficient balance. Need ${room.bet_amount} PKCN`);
        }

        // Approve PKCN
        console.log(`Approving ${room.bet_amount} PKCN...`);
        const approveTx = await pkcnContract.approve(
            window.CONTRACTS.TOURNAMENT,
            stakeAmount
        );
        await approveTx.wait();
        console.log('✅ Joiner approval successful:', approveTx.hash);

        // Update joiner's transaction status
        await pvpState.supabaseClient
            .from('pvp_players')
            .update({ transaction_status: 'approved' })
            .eq('room_id', roomId)
            .eq('player_address', pvpState.myAddress);

        // ✅ STEP 1: Initialize match (if not already done)
        console.log('🔗 Checking if match initialized...');
        const matchData = await tournamentContract.getPvPMatchData(roomId);
        
        if (!matchData.matchId || matchData.matchId === '') {
            console.log('🔗 Initializing PvP match on blockchain...');
            const initTx = await tournamentContract.initializePvPMatch(
                roomId,
                creator.player_address,
                joiner.player_address,
                creator.token_id,
                joiner.token_id
            );
            await initTx.wait();
            console.log('✅ Match initialized:', initTx.hash);
        }
        
        // ✅ STEP 2: Joiner stakes their PKCN
        console.log('💰 Staking PKCN for joiner...');
        const stakeTx = await tournamentContract.stakePvP(roomId);
        const receipt = await stakeTx.wait();
        console.log('✅ Joiner staked:', receipt.hash);

        // Update both players to 'completed'
        await pvpState.supabaseClient
            .from('pvp_players')
            .update({ transaction_status: 'completed' })
            .eq('room_id', roomId);

        // Update room status to 'ready'
        await pvpState.supabaseClient
            .from('pvp_rooms')
            .update({ 
                status: 'ready',
                transaction_hash: receipt.hash
            })
            .eq('room_id', roomId);

        console.log('✅ Both players staked. Starting battle...');
        await startPvPBattle(roomId);

    } catch (error) {
        console.error('❌ Joiner stake failed:', error);
        throw error;
    }
}

// ===================================================================
// 🔧 FIXED: REAL-TIME SUBSCRIPTION - Triggers joiner staking
// ===================================================================

function subscribeToRoom(roomId) {
    if (pvpState.subscription) {
        pvpState.subscription.unsubscribe();
    }

    pvpState.subscription = pvpState.supabaseClient
        .channel(`room_${roomId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pvp_rooms',
            filter: `room_id=eq.${roomId}`
        }, async (payload) => {
            await handleRoomUpdate(payload.new);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pvp_players',
            filter: `room_id=eq.${roomId}`
        }, async (payload) => {
            await handlePlayersUpdate(payload.new);
        })
        .subscribe();

    console.log(`📡 Subscribed to room: ${roomId}`);
}

async function handleRoomUpdate(room) {
    console.log('📨 Room update:', room.status);
    
    // ✅ TRIGGER: Joiner stakes when room becomes 'staking'
    if (room.status === 'staking' && pvpState.currentRoomId === room.room_id) {
        const { data: player } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', room.room_id)
            .eq('player_address', pvpState.myAddress)
            .single();

        // If I'm the joiner and haven't staked yet
        if (player && !player.is_creator && player.transaction_status === 'pending') {
            const confirmed = await showModal(
                '⚔️ Battle Accepted!',
                'The creator accepted your challenge!<br><br>You need to stake your PKCN to start the battle.',
                [
                    { text: 'Cancel', value: false },
                    { text: 'Stake & Battle', value: true, primary: true }
                ]
            );

            if (confirmed) {
                const loadingModal = showLoadingModal('Processing your stake (2/2)...');
                try {
                    await processJoinerStake(room.room_id);
                } catch (error) {
                    hideLoadingModal();
                    await showModal('❌ Stake Failed', error.message, [
                        { text: 'OK', value: true, primary: true }
                    ]);
                }
            } else {
                // User declined to stake - leave room
                await leaveRoom(room.room_id);
            }
        }
    }
    
    // ✅ TRIGGER: Start battle when both staked
    else if (room.status === 'ready' && pvpState.currentRoomId === room.room_id) {
        console.log('🎮 Room ready! Starting battle...');
        setTimeout(() => {
            startPvPBattle(room.room_id);
        }, 1000);
    }
    
    else if (room.status === 'canceled') {
        await showModal('❌ Room Canceled', 'The room was canceled', [
            { text: 'OK', value: true, primary: true }
        ]);
        refreshRoomsList();
    }
}

async function handlePlayersUpdate(player) {
    console.log('👤 Player update:', player.transaction_status);
    refreshRoomsList();
}

// ===================================================================
// BATTLE START (unchanged)
// ===================================================================

async function startPvPBattle(roomId) {
    try {
        const { data: room } = await pvpState.supabaseClient
            .from('pvp_rooms')
            .select('*')
            .eq('room_id', roomId)
            .single();

        const { data: players } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', roomId);

        if (!room || !players || players.length !== 2) {
            throw new Error('Invalid room or player data');
        }

        hideLoadingModal();

        const creator = players.find(p => p.is_creator);
        const joiner = players.find(p => !p.is_creator);

        const params = new URLSearchParams({
            mode: 'pvp',
            roomId: roomId,
            betAmount: room.bet_amount,
            players: encodeURIComponent(JSON.stringify([
                {
                    player_address: creator.player_address,
                    pokemon_data: creator.pokemon_data
                },
                {
                    player_address: joiner.player_address,
                    pokemon_data: joiner.pokemon_data
                }
            ]))
        });

        console.log('🎮 Starting PvP battle with params:', params.toString());
        window.location.href = `battle.html?${params.toString()}`;

    } catch (error) {
        hideLoadingModal();
        await showModal('❌ Error', `Failed to start battle: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

// ===================================================================
// CANCEL/LEAVE (unchanged but with proper checks)
// ===================================================================

async function cancelRoom(roomId) {
    const { data: players } = await pvpState.supabaseClient
        .from('pvp_players')
        .select('*')
        .eq('room_id', roomId);

    const anyStaked = players.some(p => p.transaction_status === 'approved' || p.transaction_status === 'completed');

    if (anyStaked) {
        await showModal(
            '⚠️ Cannot Cancel',
            'One or more players have already approved PKCN.<br><br>The match will auto-expire after timeout.',
            [{ text: 'OK', value: true, primary: true }]
        );
        return;
    }

    const confirmed = await showModal(
        '❌ Cancel Match',
        'Are you sure you want to cancel this match?',
        [
            { text: 'No', value: false },
            { text: 'Yes, Cancel', value: true, primary: true }
        ]
    );

    if (!confirmed) return;

    try {
        await pvpState.supabaseClient
            .from('pvp_players')
            .delete()
            .eq('room_id', roomId);

        await pvpState.supabaseClient
            .from('pvp_rooms')
            .delete()
            .eq('room_id', roomId);

        await showModal('✅ Match Canceled', 'Match has been canceled successfully', [
            { text: 'OK', value: true, primary: true }
        ]);
        
        pvpState.currentRoomId = null;
        refreshRoomsList();
    } catch (error) {
        await showModal('❌ Error', `Failed to cancel: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

async function leaveRoom(roomId) {
    const { data: player } = await pvpState.supabaseClient
        .from('pvp_players')
        .select('*')
        .eq('room_id', roomId)
        .eq('player_address', pvpState.myAddress)
        .single();

    if (player && (player.transaction_status === 'approved' || player.transaction_status === 'completed')) {
        await showModal(
            '⚠️ Cannot Leave',
            'You have already approved PKCN on-chain.<br><br>The match will auto-expire after timeout.',
            [{ text: 'OK', value: true, primary: true }]
        );
        return;
    }

    const confirmed = await showModal(
        '❌ Leave Match',
        'Are you sure you want to leave this match?',
        [
            { text: 'No', value: false },
            { text: 'Yes, Leave', value: true, primary: true }
        ]
    );

    if (!confirmed) return;

    try {
        await pvpState.supabaseClient
            .from('pvp_players')
            .delete()
            .eq('room_id', roomId)
            .eq('player_address', pvpState.myAddress);

        const { data: remainingPlayers } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', roomId);

        if (remainingPlayers.length === 0) {
            await pvpState.supabaseClient
                .from('pvp_rooms')
                .delete()
                .eq('room_id', roomId);
        } else {
            await pvpState.supabaseClient
                .from('pvp_rooms')
                .update({ status: 'waiting' })
                .eq('room_id', roomId);
        }

        await showModal('✅ Left Match', 'You have left the match successfully', [
            { text: 'OK', value: true, primary: true }
        ]);
        
        pvpState.currentRoomId = null;
        refreshRoomsList();
    } catch (error) {
        await showModal('❌ Error', `Failed to leave: ${error.message}`, [
            { text: 'OK', value: true, primary: true }
        ]);
    }
}

// ===================================================================
// ROOMS LIST (unchanged)
// ===================================================================

async function refreshRoomsList() {
    try {
        const { data: rooms, error } = await pvpState.supabaseClient
            .from('pvp_rooms')
            .select(`
                *,
                pvp_players (*)
            `)
            .in('status', ['waiting', 'pending', 'staking']);

        if (error) throw error;

        renderRoomsList(rooms);

    } catch (error) {
        console.error('❌ Failed to load rooms:', error);
        elements.roomsList.innerHTML = '<div class="text-center" style="padding: 20px; color: #ff6b00;">Error loading rooms</div>';
    }
}

function renderRoomsList(rooms) {
    if (!rooms) return;
    
    const myRooms = rooms.filter(r => r.creator_address === pvpState.myAddress);
    const joinedRooms = rooms.filter(r => 
        r.creator_address !== pvpState.myAddress && 
        r.pvp_players.some(p => p.player_address === pvpState.myAddress)
    );
    const availableRooms = rooms.filter(r => 
        r.creator_address !== pvpState.myAddress && 
        r.status === 'waiting' &&
        !r.pvp_players.some(p => p.player_address === pvpState.myAddress)
    );

    if (availableRooms.length === 0) {
        elements.roomsList.innerHTML = '<div class="text-center" style="padding: 40px; color: rgba(255,255,255,0.5);">No available rooms. Create one!</div>';
    } else {
        elements.roomsList.innerHTML = availableRooms.map(room => createRoomCard(room)).join('');
    }

    const allMyRooms = [...myRooms, ...joinedRooms];
    if (allMyRooms.length > 0) {
        elements.myRoomsSection.style.display = 'block';
        elements.myRoomsList.innerHTML = allMyRooms.map(room => 
            room.creator_address === pvpState.myAddress ? 
            createMyRoomCard(room) : 
            createJoinedRoomCard(room)
        ).join('');
    } else {
        elements.myRoomsSection.style.display = 'none';
    }
}

function createRoomCard(room) {
    const creator = room.creator_address;
    const isJoined = room.pvp_players.some(p => p.player_address === pvpState.myAddress);

    return `
        <div class="room-card ${isJoined ? 'joined' : ''}" onclick="handleRoomClick('${room.room_id}')">
            <div class="room-header">
                <div>
                    <strong style="color: var(--primary);">Room ${room.room_id.substring(0, 8)}...</strong>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
                        Creator: ${creator.substring(0, 6)}...${creator.substring(38)}
                    </div>
                </div>
                <div class="room-bet">${room.bet_amount} PKCN</div>
            </div>
            <div class="room-status status-${room.status}">
                ${room.status.toUpperCase()}
            </div>
            <div class="room-details">
                <div>Players: ${room.pvp_players.length}/2</div>
                <div>Created: ${new Date(room.created_at).toLocaleTimeString()}</div>
            </div>
            <button class="btn btn-primary room-action" ${!pvpState.selectedPokemon || isJoined ? 'disabled' : ''}>
                ${isJoined ? 'JOINED ✓' : 'JOIN ROOM'}
            </button>
        </div>
    `;
}

function createMyRoomCard(room) {
    const joiner = room.pvp_players.find(p => !p.is_creator);
    
    return `
        <div class="room-card my-room">
            <div class="room-header">
                <div>
                    <strong style="color: var(--warning);">My Room ${room.room_id.substring(0, 8)}...</strong>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
                        Bet: ${room.bet_amount} PKCN
                    </div>
                </div>
                <div class="room-status status-${room.status}">
                    ${room.status.toUpperCase()}
                </div>
            </div>
            <div style="font-size: 0.9rem; margin-top: 10px;">
                ${joiner ? `Joiner: ${joiner.player_address.substring(0, 6)}...` : 'Waiting for opponent...'}
            </div>
            ${room.status === 'pending' && joiner ? `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn btn-success btn-sm" style="flex: 1;" onclick="event.stopPropagation(); acceptJoin('${room.room_id}', '${joiner.player_address}')">
                        ACCEPT & STAKE
                    </button>
                    <button class="btn btn-danger btn-sm" style="flex: 1;" onclick="event.stopPropagation(); declineJoin('${room.room_id}')">
                        DECLINE
                    </button>
                </div>
            ` : room.status === 'waiting' ? `
                <button class="btn btn-warning btn-sm" style="width: 100%; margin-top: 10px;" onclick="event.stopPropagation(); cancelRoom('${room.room_id}')">
                    CANCEL ROOM
                </button>
            ` : room.status === 'staking' ? `
                <div style="margin-top: 10px; padding: 10px; background: rgba(0, 196, 255, 0.1); border-radius: 8px; font-size: 0.85rem; color: var(--info);">
                    ⏳ Waiting for joiner to stake PKCN...
                </div>
            ` : ''}
        </div>
    `;
}

function createJoinedRoomCard(room) {
    const creator = room.creator_address;
    
    return `
        <div class="room-card joined">
            <div class="room-header">
                <div>
                    <strong style="color: var(--info);">Joined Room ${room.room_id.substring(0, 8)}...</strong>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
                        Creator: ${creator.substring(0, 6)}...${creator.substring(38)}
                    </div>
                </div>
                <div class="room-status status-${room.status}">
                    ${room.status.toUpperCase()}
                </div>
            </div>
            <div style="font-size: 0.9rem; margin-top: 10px; color: rgba(255,255,255,0.8);">
                ${room.status === 'pending' ? '⏳ Waiting for creator to accept...' : 
                  room.status === 'staking' ? '⏳ Creator staked. Your turn to stake!' : 
                  'Waiting...'}
            </div>
            ${room.status === 'pending' ? `
                <button class="btn btn-danger btn-sm" style="width: 100%; margin-top: 10px;" onclick="event.stopPropagation(); leaveRoom('${room.room_id}')">
                    LEAVE ROOM
                </button>
            ` : ''}
        </div>
    `;
}

function handleRoomClick(roomId) {
    if (!pvpState.selectedPokemon) {
        showModal('Select Pokémon', 'Please select a Pokémon first!', [
            { text: 'OK', value: true, primary: true }
        ]);
        return;
    }
    joinRoom(roomId);
}

function startRoomPolling() {
    pvpState.roomRefreshInterval = setInterval(() => {
        refreshRoomsList();
    }, 5000);
}

// ===================================================================
// HELPERS
// ===================================================================

function generateRoomId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    const accountSlice = pvpState.myAddress.substring(2, 8);
    return `pvp_${timestamp}_${random}_${accountSlice}`;
}

function ipfsToHttp(uri) {
    if (!uri) return 'images/pokeball.png';
    if (uri.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }
    return uri;
}

async function safeGetProvider() {
    if (!window.ethereum) throw new Error('MetaMask not installed');
    return new ethers.BrowserProvider(window.ethereum);
}

function showError(message) {
    elements.errorDiv.style.display = 'block';
    elements.errorDiv.innerHTML = message;
    setTimeout(() => {
        elements.errorDiv.style.display = 'none';
    }, 5000);
}

window.addEventListener('beforeunload', () => {
    if (pvpState.subscription) {
        pvpState.subscription.unsubscribe();
    }
    if (pvpState.roomRefreshInterval) {
        clearInterval(pvpState.roomRefreshInterval);
    }
});
            .select('*')
            .eq('room_id', roomId)
            .single();

        const stakeAmount = ethers.parseUnits(room.bet_amount.toString(), 18);

        // Check balance
        const balance = await pkcnContract.balanceOf(pvpState.myAddress);
        if (balance < stakeAmount) {
            throw new Error(`Insufficient balance. Need ${room.bet_amount} PKCN`);
        }

        // Approve PKCN for Tournament contract
        console.log(`Approving ${room.bet_amount} PKCN...`);
        const approveTx = await pkcnContract.approve(
            window.CONTRACTS.TOURNAMENT,
            stakeAmount
        );
        await approveTx.wait();
        console.log('✅ Approval successful:', approveTx.hash);

        // ✅ CRITICAL: Creator also stakes their PKCN
        const tournamentContract = new ethers.Contract(
            window.CONTRACTS.TOURNAMENT,
            window.ABIS.TOURNAMENT,
            signer
        );

        // Get player data to initialize match
        const { data: players } = await pvpState.supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('room_id', roomId)
            .order('is_creator', { ascending: false });

        const creator = players.find(p => p.is_creator);
        const joiner = players.find(p => !p.is_creator);

        // Initialize match on-chain (if not already done)
        console.log('🔗 Initializing match on blockchain...');
        const matchData = await tournamentContract.getPvPMatchData(roomId);
        
        if (!matchData.matchId || matchData.matchId === '') {
            const initTx = await tournamentContract.initializePvPMatch(
                roomId,
                creator.player_address,
                joiner.player_address,
                creator.token_id,
                joiner.token_id
            );
            await initTx.wait();
            console.log('✅ Match initialized');
        }

        // Stake creator's PKCN
        console.log('💰 Staking PKCN for creator...');
        const stakeTx = await tournamentContract.stakePvP(roomId);
        await stakeTx.wait();
        console.log('✅ Creator staked');

        // Update creator's transaction status
        await pvpState.supabaseClient
            .from('pvp_players')
            .update({ transaction_status: 'approved' })
            .eq('room_id', roomId)
            .eq('player_address', pvpState.myAddress);

        console.log('✅ Creator stake approved. Waiting for joiner...');

    } catch (error) {
        console.error('❌ Creator stake failed:', error);
        throw error;
    }
}

/**
 * ✅ STEP 2: Joiner approves and stakes their PKCN, then creates match on-chain
 */
async function processJoinerStake(roomId) {
    console.log('💰 STEP 2: Joiner staking...');
    
    try {
        const provider = await safeGetProvider();
        const signer = await provider.getSigner();
        
        const pkcnContract = new ethers.Contract(
            window.CONTRACTS.PKCN,
            window.ABIS.PKCN,
            signer
        );

        const tournamentContract = new ethers.Contract(
            window.CONTRACTS.TOURNAMENT,
            window.ABIS.TOURNAMENT,
            signer
        );

        const { data: room } = await pvpState.supabaseClient
            .from('pvp_rooms')