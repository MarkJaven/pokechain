// ===================================================================
// SIMPLE OFF-CHAIN PVP SYSTEM - PROTOTYPE
// No blockchain, no payments, just fun battles!
// ===================================================================

const pvpState = {
  selectedPokemon: null,
  supabaseClient: null,
  subscription: null,
  playerName: null,
  roomRefreshInterval: null,
  currentMode: "browse",
  currentRoomId: null,
  modalShown: false, // Track if start battle modal has been shown
  navigatingToBattle: false, // Prevent duplicate navigation
};

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
  console.log('🎮 PvP Lobby initializing...');

  // Initialize Supabase
  pvpState.supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  // Get or create player name
  pvpState.playerName = localStorage.getItem('pvpPlayerName') || `Player${Math.floor(Math.random() * 1000)}`;
  localStorage.setItem('pvpPlayerName', pvpState.playerName);

  console.log('✅ PvP Lobby initialized for:', pvpState.playerName);

  // Load mock collection (for prototype)
  await loadMockCollection();

  // Load available rooms
  await refreshRoomsList();

  // Start periodic room refresh
  pvpState.roomRefreshInterval = setInterval(refreshRoomsList, 5000);

  // Setup event listeners
  setupPvPEventListeners();
});

// ===================================================================
// MOCK POKEMON COLLECTION (FOR PROTOTYPE)
// ===================================================================

async function loadMockCollection() {
  const grid = document.getElementById("pvpPokemonGrid");
  if (!grid) return;

  grid.innerHTML = `
        <div class="text-center" style="grid-column: 1/-1; padding: 40px;">
            <div class="spinner-border text-success"></div>
            <p style="margin-top: 15px; color: rgba(255,255,255,0.6);">Loading your collection...</p>
        </div>
    `;

  // Mock Pokemon data for prototype
  const mockPokemon = [
    { id: 1, name: 'Charmander', tokenId: 1, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png', types: [{ type: { name: 'fire' } }] },
    { id: 2, name: 'Squirtle', tokenId: 2, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png', types: [{ type: { name: 'water' } }] },
    { id: 3, name: 'Bulbasaur', tokenId: 3, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png', types: [{ type: { name: 'grass' } }] },
    { id: 4, name: 'Pikachu', tokenId: 4, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png', types: [{ type: { name: 'electric' } }] },
    { id: 5, name: 'Charizard', tokenId: 5, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', types: [{ type: { name: 'fire' } }, { type: { name: 'flying' } }] },
    { id: 6, name: 'Blastoise', tokenId: 6, image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/9.png', types: [{ type: { name: 'water' } }] },
  ];

  // Simulate loading delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  grid.innerHTML = "";

  mockPokemon.forEach(pokemon => {
    const card = createPvPPokemonCard(pokemon);
    grid.appendChild(card);
  });

  console.log("✅ Mock collection loaded");
}

// ===================================================================
// SIMPLE ROOM CREATION (NO BLOCKCHAIN)
// ===================================================================

async function createPvPRoom() {
  if (!pvpState.selectedPokemon) {
    await showPvPModal({
      title: "Select Pokémon",
      message: "Please select a Pokémon first!",
      confirmText: "OK",
    });
    return;
  }

  const confirmed = await showPvPModal({
    title: "⚔️ Create Battle Room",
    message: `Ready to create a room with ${pvpState.selectedPokemon.name}?<br><br>
        <strong>Pokémon:</strong> ${pvpState.selectedPokemon.name}<br><br>
        <span style="color: var(--success);">🎮 Just for fun - no stakes!</span>`,
    confirmText: "Create Room",
    cancelText: "Cancel",
  });

  if (!confirmed) return;

  const loadingModal = showPvPLoading("Creating room...", "Please wait...");

  try {
    const roomId = generateRoomId();
    pvpState.currentRoomId = roomId;
    pvpState.modalShown = false; // Reset modal flag for new room
    console.log("🎮 Creator setting currentRoomId:", roomId);

    // Create room in Supabase
    const { data: room, error } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .insert({
        room_id: roomId,
        creator_name: pvpState.playerName,
        status: "waiting",
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Add creator as player
    const { error: playerError } = await pvpState.supabaseClient
      .from("pvp_players")
      .insert({
        room_id: roomId,
        player_name: pvpState.playerName,
        pokemon_data: pvpState.selectedPokemon,
        is_creator: true,
        ready: false
      });

    if (playerError) throw playerError;

    closePvPLoading();

    await showPvPSuccess(
      "✅ Room Created!",
      `Room created successfully!<br><br>
            Waiting for an opponent to join...`
    );

    console.log("🎮 Creator subscribing to room:", roomId);
    subscribeToRoom(roomId);
    refreshRoomsList();
  } catch (error) {
    closePvPLoading();
    await showPvPError("❌ Error", `Failed to create room: ${error.message}`);
  }
}

// ===================================================================
// REAL-TIME SUBSCRIPTION (SIMPLIFIED)
// ===================================================================

function subscribeToRoom(roomId) {
  // Don't unsubscribe if we're already subscribed to the same room
  if (pvpState.subscription && pvpState.currentRoomId === roomId) {
    console.log(`📡 Already subscribed to room: ${roomId}`);
    return;
  }

  if (pvpState.subscription) {
    pvpState.subscription.unsubscribe();
  }

  pvpState.subscription = pvpState.supabaseClient
    .channel(`room_${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "pvp_rooms",
        filter: `room_id=eq.${roomId}`,
      },
      async (payload) => {
        console.log(`📨 Room update received for room ${roomId}:`, payload.new);
        await handleRoomUpdate(payload.new);
      }
    )
    .subscribe((status) => {
      console.log(`📡 Subscription status for room ${roomId}:`, status);
    });

  console.log(`📡 Subscribed to room: ${roomId}`);
}

async function handleRoomUpdate(room) {
  console.log("📨 handleRoomUpdate called:", room.status, "Current room:", pvpState.currentRoomId, "Room ID:", room.room_id);

  // Handle joiner acceptance - show Start Battle prompt for both players
  if (room.status === "ready" && pvpState.currentRoomId === room.room_id && !pvpState.modalShown) {
    console.log("🎯 Ready status detected for current room, showing modal for:", pvpState.playerName);
    pvpState.modalShown = true;
    await showStartBattlePrompt(room.room_id);
  }

  // Handle battle completion
  if (room.status === "completed" && pvpState.currentRoomId === room.room_id) {
    await showPvPSuccess(
      "✅ Battle Complete",
      "Battle concluded! Thanks for playing."
    );
    window.location.href = "pvp-lobby.html";
  }
}

// ===================================================================
// START BATTLE PROMPT FOR BOTH PLAYERS
// ===================================================================

function showSynchronizedLoading() {
  // Remove any existing loading screens
  const existing = document.getElementById('syncLoadingScreen');
  if (existing) return;

  const loadingScreen = document.createElement('div');
  loadingScreen.id = 'syncLoadingScreen';
  loadingScreen.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    backdrop-filter: blur(10px);
  `;

  loadingScreen.innerHTML = `
    <div style="text-align: center;">
      <div style="
        width: 80px;
        height: 80px;
        border: 6px solid rgba(0, 255, 157, 0.2);
        border-top: 6px solid var(--primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 30px;
      "></div>
      <h2 style="color: var(--primary); margin-bottom: 15px; font-size: 2rem; font-weight: 800;">
        ⚔️ BATTLE STARTING
      </h2>
      <p style="color: white; font-size: 1.2rem; margin-bottom: 10px;">
        Both players ready!
      </p>
      <p style="color: rgba(255,255,255,0.6); font-size: 1rem;">
        Loading battle arena...
      </p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.appendChild(loadingScreen);
}

async function showStartBattlePrompt(roomId) {
  console.log("🎯 showStartBattlePrompt called for room:", roomId, "player:", pvpState.playerName);
  
  return new Promise((resolve) => {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'battlePromptModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    `;

    modal.innerHTML = `
      <div class="modal-content" style="
        background: var(--glass);
        border: 2px solid var(--primary);
        border-radius: 15px;
        padding: 30px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 0 30px rgba(0, 255, 157, 0.3);
      ">
        <h3 style="color: var(--primary); margin-bottom: 15px; font-size: 1.5rem;">
          ⚔️ Ready to Battle!
        </h3>
        <p style="color: white; margin-bottom: 25px; line-height: 1.5;">
          Both players must click "Start Battle" to begin.<br><br>
          <span id="readyStatus">Waiting for both players to confirm...</span>
        </p>
        <div style="display: flex; gap: 15px; justify-content: center;">
          <button id="startBattleBtn" class="btn btn-success" style="padding: 12px 24px; font-size: 1.1rem;">
            🚀 Start Battle
          </button>
          <button id="cancelBattleBtn" class="btn btn-outline-secondary" style="padding: 12px 24px;">
            Cancel
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let pollInterval = null;
    let isProcessing = false;

    // Poll function to check if both players are ready
    const pollReadyStatus = async () => {
      if (isProcessing) return;
      
      try {
        const { data: players } = await pvpState.supabaseClient
          .from("pvp_players")
          .select("ready, player_name")
          .eq("room_id", roomId);

        if (!players) return;

        const readyCount = players.filter(p => p.ready).length;
        const statusEl = document.getElementById('readyStatus');
        
        console.log(`🔄 Polling: ${readyCount}/2 players ready`);
        
        if (statusEl) {
          statusEl.textContent = `Ready: ${readyCount}/2 players`;
          if (readyCount === 1) {
            statusEl.style.color = '#ffd93d';
          }
        }

        // If both players are ready, start the battle!
        if (readyCount >= 2 && !isProcessing) {
          isProcessing = true;
          console.log('🎯 Both players ready! Starting battle...');
          
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }

          // Update room status to battling (only one player needs to do this)
          await pvpState.supabaseClient
            .from("pvp_rooms")
            .update({ status: "battling" })
            .eq("room_id", roomId);

          // Close modal and show loading
          modal.remove();
          showSynchronizedLoading();

          // Navigate to battle
          setTimeout(() => {
            startPvPBattle(roomId);
            resolve(true);
          }, 2000);
        }
      } catch (error) {
        console.error('Error polling ready status:', error);
      }
    };

    // Handle Start Battle button
    document.getElementById('startBattleBtn').onclick = async () => {
      const btn = document.getElementById('startBattleBtn');
      btn.disabled = true;
      btn.textContent = 'Ready! ✓';
      btn.style.background = '#ffd93d';
      btn.style.color = '#000';

      try {
        // Mark this player as ready
        await pvpState.supabaseClient
          .from("pvp_players")
          .update({ ready: true })
          .eq("room_id", roomId)
          .eq("player_name", pvpState.playerName);

        console.log('✅ Marked as ready, starting to poll...');

        // Start polling every 500ms to check if both players are ready
        pollInterval = setInterval(pollReadyStatus, 500);
        
        // Also check immediately
        await pollReadyStatus();

      } catch (error) {
        console.error('❌ Failed to mark as ready:', error);
        btn.disabled = false;
        btn.textContent = '🚀 Start Battle';
        btn.style.background = '';
        btn.style.color = '';
        await showPvPError("❌ Error", "Failed to mark as ready. Please try again.");
      }
    };

    // Handle Cancel button
    document.getElementById('cancelBattleBtn').onclick = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      modal.remove();
      resolve(false);
    };

    // Clean up on modal close
    window.addEventListener('beforeunload', () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    });
  });
}

// ===================================================================
// BATTLE START (UNCHANGED)
// ===================================================================

async function startPvPBattle(roomId) {
  // Prevent duplicate navigation
  if (pvpState.navigatingToBattle) {
    console.log('⚠️ Already navigating to battle, skipping...');
    return;
  }
  
  pvpState.navigatingToBattle = true;
  console.log("🚀 startPvPBattle called for room:", roomId);
  
  try {
    const { data: room } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .select("*")
      .eq("room_id", roomId)
      .single();

    const { data: players } = await pvpState.supabaseClient
      .from("pvp_players")
      .select("*")
      .eq("room_id", roomId);

    console.log("📊 Room data:", room);
    console.log("👥 Players data:", players);

    if (!room || !players || players.length !== 2) {
      throw new Error("Invalid room or player data");
    }

    const creator = players.find((p) => p.is_creator);
    const joiner = players.find((p) => !p.is_creator);

    const params = new URLSearchParams({
      mode: "pvp",
      roomId: roomId,
      players: encodeURIComponent(
        JSON.stringify([
          {
            player_name: creator.player_name,
            pokemon_data: creator.pokemon_data,
          },
          {
            player_name: joiner.player_name,
            pokemon_data: joiner.pokemon_data,
          },
        ])
      ),
    });

    console.log("🎮 Starting PvP battle with params:", params.toString());
    console.log("🔗 Navigating to:", `battle-pvp.html?${params.toString()}`);
    window.location.href = `battle-pvp.html?${params.toString()}`;
  } catch (error) {
    pvpState.navigatingToBattle = false;
    await showPvPError("❌ Error", `Failed to start battle: ${error.message}`);
  }
}

// ===================================================================
// SIMPLE MODAL FALLBACK (if txModal not available)
// ===================================================================

function createSimpleModal(title, message, buttons = []) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;

    // Create modal content
    const modal = document.createElement("div");
    modal.style.cssText = `
            background: rgba(20, 20, 30, 0.95);
            border: 2px solid var(--primary, #00ff9d);
            border-radius: 15px;
            padding: 20px;
            max-width: 500px;
            width: 90%;
            backdrop-filter: blur(10px);
        `;

    // Title
    const titleEl = document.createElement("h3");
    titleEl.textContent = title;
    titleEl.style.cssText =
      "color: var(--primary, #00ff9d); margin-bottom: 15px;";
    modal.appendChild(titleEl);

    // Message
    const messageEl = document.createElement("div");
    messageEl.innerHTML = message;
    messageEl.style.cssText = "margin-bottom: 20px; color: white;";
    modal.appendChild(messageEl);

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText =
      "display: flex; gap: 10px; justify-content: flex-end;";

    buttons.forEach((btn) => {
      const button = document.createElement("button");
      button.textContent = btn.text;
      button.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-weight: 600;
            `;

      if (btn.primary) {
        button.style.cssText +=
          "background: var(--primary, #00ff9d); color: black;";
      } else {
        button.style.cssText +=
          "background: rgba(255,255,255,0.1); color: white;";
      }

      button.onclick = () => {
        document.body.removeChild(overlay);
        resolve(btn.value !== undefined ? btn.value : true);
      };
      buttonContainer.appendChild(button);
    });

    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

// ===================================================================
// MODAL WRAPPER (uses txModal if available, fallback otherwise)
// ===================================================================

async function showPvPModal(config) {
  if (window.txModal && window.txModal.confirm) {
    return await window.txModal.confirm(config);
  } else {
    // Fallback to simple modal
    const buttons = [];
    if (config.cancelText) {
      buttons.push({ text: config.cancelText, value: false });
    }
    buttons.push({
      text: config.confirmText || "OK",
      value: true,
      primary: true,
    });

    return await createSimpleModal(config.title, config.message, buttons);
  }
}

async function showPvPLoading(title, message) {
  if (window.txModal && window.txModal.loading) {
    return window.txModal.loading(title, message);
  } else {
    // Simple loading fallback
    return createSimpleModal(
      title,
      `<div style="text-align: center;"><div class="spinner-border text-success"></div><p style="margin-top: 15px;">${message}</p></div>`,
      []
    );
  }
}

function closePvPLoading() {
  if (window.txModal && window.txModal.close) {
    window.txModal.close();
  } else {
    // Remove any simple modals
    const overlays = document.querySelectorAll(
      'div[style*="position: fixed"][style*="z-index: 9999"]'
    );
    overlays.forEach((overlay) => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    });
  }
}

async function showPvPError(title, message) {
  if (window.txModal && window.txModal.error) {
    return window.txModal.error(title, message);
  } else {
    return createSimpleModal(title, message, [
      { text: "OK", value: true, primary: true },
    ]);
  }
}

async function showPvPSuccess(title, message) {
  if (window.txModal && window.txModal.success) {
    return window.txModal.success(title, message);
  } else {
    return createSimpleModal(title, message, [
      { text: "OK", value: true, primary: true },
    ]);
  }
}

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener("DOMContentLoaded", async () => {
  console.log("⚔️ PvP Lobby loading...");

  // Initialize Supabase
  pvpState.supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  // Wait for wallet to be ready
  if (window.wallet?.getAccount?.()) {
    await initializePvPLobby();
  } else {
    document.addEventListener("wallet.ready", () => initializePvPLobby());
  }
});

async function initializePvPLobby() {
  try {
    pvpState.myAddress = window.wallet.getAccount().toLowerCase();
    console.log("✅ PvP Lobby initialized for:", pvpState.myAddress);

    // Load user's collection
    await loadPvPCollection();

    // Load available rooms
    await refreshRoomsList();

    // Start periodic room refresh
    pvpState.roomRefreshInterval = setInterval(refreshRoomsList, 5000);

    // Setup event listeners
    setupPvPEventListeners();
  } catch (error) {
    console.error("❌ Failed to initialize PvP lobby:", error);
    document.getElementById("pvpError").textContent =
      "Failed to load PvP lobby";
    document.getElementById("pvpError").style.display = "block";
  }
}

// ===================================================================
// LOAD USER'S POKEMON COLLECTION
// ===================================================================

async function loadPvPCollection() {
  try {
    console.log("🎴 Loading PvP collection...");

    const grid = document.getElementById("pvpPokemonGrid");
    if (!grid) return;

    grid.innerHTML = `
            <div class="text-center" style="grid-column: 1/-1; padding: 40px;">
                <div class="spinner-border text-success"></div>
                <p style="margin-top: 15px; color: rgba(255,255,255,0.6);">Loading your collection...</p>
            </div>
        `;

    const provider = await window.wallet.getProvider();
    const account = window.wallet.getAccount().toLowerCase();

    console.log("🔗 Provider:", provider ? "Available" : "Not available");
    console.log("👤 Account:", account);
    console.log("📋 NFT Contract:", window.CONTRACTS?.POKEMON_NFT);

    const nftAddr = window.CONTRACTS.POKEMON_NFT;
    const abi = window.ABIS.POKEMON_NFT;

    if (!nftAddr || !abi) {
      throw new Error("NFT contract not configured");
    }

    const nft = new ethers.Contract(nftAddr, abi, provider);
    console.log("🔗 NFT Contract instance created");

    const tokenIds = await fetchOwnedTokens(provider, nft, account);
    console.log("🆔 Found token IDs:", tokenIds);

    if (!tokenIds || tokenIds.length === 0) {
      console.log("❌ No tokens found");
      grid.innerHTML = `
                <div class="text-center" style="grid-column: 1/-1; padding: 40px; color: rgba(255,255,255,0.5);">
                    <p>No Pokémon found in your collection</p>
                    <p style="font-size: 0.9rem;">Visit the marketplace to acquire Pokémon</p>
                </div>
            `;
      return;
    }

    console.log(`✅ Found ${tokenIds.length} Pokémon for PvP`);
    console.log('Token IDs:', tokenIds);

    grid.innerHTML = "";

    // Process Pokémon in batches to avoid overwhelming the UI
    const batchSize = 10;
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (tokenId) => {
        try {
          const meta = await resolveMetadata(nft, tokenId);
          if (!meta) return null;

          let name = meta.name || `Token ${tokenId}`;
          let image = meta.image ? ipfsToHttp(meta.image) : "";
          let types = [];

          // Get types from PokeAPI
          const pokeData = await fetchPokeAPIData(name);
          if (pokeData) {
            types = pokeData.types || [];
          }

          return {
            tokenId: tokenId,
            name: name,
            image: image,
            types: types,
            pokemonId: pokeData?.id || tokenId,
          };
        } catch (error) {
          console.warn(`Failed to load metadata for token ${tokenId}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Add to grid
      batchResults.forEach((pokemon) => {
        if (pokemon) {
          console.log(`🎴 Rendering Pokemon: ${pokemon.name} (Token ID: ${pokemon.tokenId})`);
          const card = createPvPPokemonCard(pokemon);
          grid.appendChild(card);
        }
      });

      // Small delay between batches to keep UI responsive
      if (i + batchSize < tokenIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    console.log("✅ PvP collection loaded");
  } catch (error) {
    console.error("❌ Failed to load PvP collection:", error);
    const grid = document.getElementById("pvpPokemonGrid");
    if (grid) {
      grid.innerHTML = `
                <div class="text-center" style="grid-column: 1/-1; padding: 40px; color: #ff6b00;">
                    <p>Failed to load collection</p>
                    <p style="font-size: 0.9rem;">${error.message}</p>
                </div>
            `;
    }
  }
}

function createPvPPokemonCard(pokemon) {
  const card = document.createElement("div");
  card.className = "pvp-pokemon-card";
  card.dataset.tokenId = pokemon.tokenId;
  card.dataset.name = pokemon.name;

  card.innerHTML = `
        <img src="${pokemon.image}" alt="${
    pokemon.name
  }" onerror="this.src='https://via.placeholder.com/80x80?text=?'">
        <div class="pokemon-name">${pokemon.name}</div>
        <div class="pokemon-types">
            ${pokemon.types
              .map(
                (type) =>
                  `<span class="type-badge type-${type.type?.name || type}">${
                    type.type?.name || type
                  }</span>`
              )
              .join("")}
        </div>
    `;

  card.addEventListener("click", () => selectPvPPokemon(pokemon, card));
  return card;
}

function selectPvPPokemon(pokemon, card) {
  // Remove previous selection
  document.querySelectorAll(".pvp-pokemon-card.selected").forEach((c) => {
    c.classList.remove("selected");
  });

  // Select this one
  card.classList.add("selected");
  pvpState.selectedPokemon = pokemon;

  // Update display
  const display = document.getElementById("selectedPokemonDisplay");
  const img = document.getElementById("selectedPokemonImage");
  const name = document.getElementById("selectedPokemonName");
  const id = document.getElementById("selectedPokemonId");

  img.src = pokemon.image;
  name.textContent = pokemon.name;
  id.textContent = `#${pokemon.pokemonId}`;

  display.style.display = "flex";

  // Enable create room button
  document.getElementById("createRoomBtn").disabled = false;
  document.getElementById("createRoomBtn").textContent = "CREATE ROOM";
}

// ===================================================================
// LOAD AND REFRESH ROOMS LIST
// ===================================================================

async function refreshRoomsList() {
  try {
    console.log("🔄 Refreshing rooms list...");

    const roomsList = document.getElementById("roomsList");
    if (!roomsList) return;

  // Get available rooms (waiting status, not created by current user)
    const { data: rooms, error } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .select("*")
      .eq("status", "waiting")
      .neq("creator_name", pvpState.playerName)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    // Get players for these rooms
    if (rooms && rooms.length > 0) {
      const roomIds = rooms.map((r) => r.room_id);
      const { data: players, error: playersError } =
        await pvpState.supabaseClient
          .from("pvp_players")
          .select("*")
          .in("room_id", roomIds);

      if (!playersError && players) {
        // Attach players to rooms
        rooms.forEach((room) => {
          room.pvp_players = players.filter((p) => p.room_id === room.room_id);
        });
      } else {
        console.warn("Failed to fetch players for rooms:", playersError);
        // Continue without player data
        rooms.forEach((room) => {
          room.pvp_players = [];
        });
      }
    }

    // Get my rooms
    const { data: myRooms, error: myError } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .select("*")
      .eq("creator_name", pvpState.playerName)
      .in("status", ["waiting", "ready", "battling"])
      .order("created_at", { ascending: false });

    if (myError) {
      console.warn("Failed to fetch my rooms:", myError);
      // Continue with empty myRooms
    }

    // Get players for my rooms
    if (myRooms && myRooms.length > 0) {
      const myRoomIds = myRooms.map((r) => r.room_id);
      const { data: myPlayers, error: myPlayersError } =
        await pvpState.supabaseClient
          .from("pvp_players")
          .select("*")
          .in("room_id", myRoomIds);

      if (!myPlayersError && myPlayers) {
        // Attach players to my rooms
        myRooms.forEach((room) => {
          room.pvp_players = myPlayers.filter(
            (p) => p.room_id === room.room_id
          );
        });
      } else {
        console.warn("Failed to fetch players for my rooms:", myPlayersError);
        // Continue without player data
        myRooms.forEach((room) => {
          room.pvp_players = [];
        });
      }
    }

    // Clear current content
    roomsList.innerHTML = "";

    // Show my rooms first
    if (myRooms && myRooms.length > 0) {
      const mySection = document.createElement("div");
      mySection.innerHTML =
        '<h5 style="color: var(--warning); margin-bottom: 10px;">My Rooms</h5>';
      myRooms.forEach((room) => renderRoomCard(room, mySection, true));
      roomsList.appendChild(mySection);
    }

    // Show available rooms
    if (rooms && rooms.length > 0) {
      if (myRooms && myRooms.length > 0) {
        const divider = document.createElement("hr");
        divider.style.borderColor = "rgba(255,255,255,0.2)";
        divider.style.margin = "20px 0";
        roomsList.appendChild(divider);
      }

      const availableSection = document.createElement("div");
      availableSection.innerHTML =
        '<h5 style="color: var(--primary); margin-bottom: 10px;">Available Rooms</h5>';
      rooms.forEach((room) => renderRoomCard(room, availableSection, false));
      roomsList.appendChild(availableSection);
    }

    // Show empty state
    if ((!rooms || rooms.length === 0) && (!myRooms || myRooms.length === 0)) {
      roomsList.innerHTML = `
                <div class="text-center" style="padding: 40px; color: rgba(255,255,255,0.5);">
                    <p>No active rooms found</p>
                    <p style="font-size: 0.9rem;">Create a room to start battling!</p>
                </div>
            `;
    }

    console.log(
      `✅ Loaded ${rooms?.length || 0} available rooms, ${
        myRooms?.length || 0
      } my rooms`
    );

    // Check if current room is ready and show modal if needed (fallback for subscription issues)
    if (pvpState.currentRoomId && !pvpState.modalShown) {
      const currentRoom = myRooms?.find(r => r.room_id === pvpState.currentRoomId);
      if (currentRoom && currentRoom.status === "ready") {
        console.log("🎯 Current room is ready, showing modal as fallback");
        pvpState.modalShown = true;
        await showStartBattlePrompt(pvpState.currentRoomId);
      }
    }
  } catch (error) {
    console.error("❌ Failed to refresh rooms list:", error);
    const roomsList = document.getElementById("roomsList");
    if (roomsList) {
      roomsList.innerHTML = `
                <div class="text-center" style="padding: 40px; color: #ff6b00;">
                    <p>Failed to load rooms</p>
                    <p style="font-size: 0.9rem;">${error.message}</p>
                </div>
            `;
    }
  }
}

function renderRoomCard(room, container, isMyRoom) {
  const card = document.createElement("div");
  card.className = `room-card ${isMyRoom ? "my-room" : ""}`;

  const creator = room.pvp_players?.find((p) => p.is_creator);
  const pokemon = creator?.pokemon_data;

  // Determine status text and button
  let statusText = "WAITING";
  let statusClass = "status-waiting";
  let buttonHtml = "";

  if (isMyRoom) {
    if (room.status === "waiting") {
      statusText = "WAITING";
      buttonHtml = '<button class="btn btn-sm btn-outline-warning" disabled>Waiting for opponent</button>';
    } else if (room.status === "ready") {
      statusText = "GETTING READY";
      statusClass = "status-ready";
      const readyCount = room.pvp_players?.filter(p => p.ready).length || 0;
      buttonHtml = `<button class="btn btn-sm btn-success" disabled>Getting ready... (${readyCount}/2 ready)</button>`;
    } else if (room.status === "battling") {
      statusText = "BATTLE";
      statusClass = "status-battling";
      buttonHtml = '<button class="btn btn-sm btn-primary" disabled>In battle...</button>';
    }
  } else {
    if (room.status === "waiting") {
      statusText = "WAITING";
      buttonHtml = `<button class="btn btn-sm btn-success join-room-btn" data-room-id="${room.room_id}">Join Battle</button>`;
    } else if (room.status === "ready") {
      statusText = "GETTING READY";
      statusClass = "status-ready";
      const readyCount = room.pvp_players?.filter(p => p.ready).length || 0;
      buttonHtml = `<button class="btn btn-sm btn-outline-info" disabled>Starting soon... (${readyCount}/2 ready)</button>`;
    } else if (room.status === "battling") {
      statusText = "BATTLE";
      statusClass = "status-battling";
      buttonHtml = '<button class="btn btn-sm btn-outline-secondary" disabled>In progress...</button>';
    }
  }

  card.innerHTML = `
        <div class="room-header">
            <div class="room-status ${statusClass}">${statusText}</div>
            ${isMyRoom ? `<button class="btn btn-sm btn-outline-danger delete-room-btn" data-room-id="${room.room_id}" title="Delete Room">🗑️</button>` : ''}
        </div>
        <div class="room-details">
            <div>
                <strong>${pokemon?.name || "Unknown"}</strong><br>
                <small style="color: rgba(255,255,255,0.6);">Creator: ${room.creator_name}</small>
            </div>
            <div class="room-action">
                ${buttonHtml}
            </div>
        </div>
    `;

  // Add event listeners
  if (!isMyRoom && room.status === "waiting") {
    const joinBtn = card.querySelector(".join-room-btn");
    if (joinBtn) {
      joinBtn.addEventListener("click", () => joinPvPRoom(room.room_id));
    }
  }

  if (isMyRoom) {
    const deleteBtn = card.querySelector(".delete-room-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => deletePvPRoom(room.room_id));
    }
  }

  container.appendChild(card);
}

// ===================================================================
// JOIN PVP ROOM
// ===================================================================

async function joinPvPRoom(roomId) {
  try {
    console.log("🎯 Joining room:", roomId);

    // Get room details
    const { data: room, error: roomError } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .select("*")
      .eq("room_id", roomId)
      .single();

    if (roomError) throw roomError;

    // Check if user has selected a Pokemon
    if (!pvpState.selectedPokemon) {
      await showPvPModal({
        title: "Select Pokémon",
        message: "Please select a Pokémon from your collection first!",
        confirmText: "OK",
      });
      return;
    }

    // Confirm join
    const confirmed = await showPvPModal({
      title: "⚔️ Join Battle",
      message: `Join this room and battle with ${pvpState.selectedPokemon.name}?<br><br>
            <strong>Your Pokémon:</strong> ${pvpState.selectedPokemon.name}<br><br>
            <span style="color: var(--success);">🎮 Just for fun - no stakes!</span>`,
      confirmText: "Join & Battle",
      cancelText: "Cancel",
    });

    if (!confirmed) return;

    const loadingModal = showPvPLoading("Joining room...", "Please wait...");

    // Subscribe to room updates FIRST
    subscribeToRoom(roomId);

    // Set current room ID for this player
    pvpState.currentRoomId = roomId;
    pvpState.modalShown = false; // Reset modal flag for joined room

    // Add player to room
    const { error: playerError } = await pvpState.supabaseClient
      .from("pvp_players")
      .insert({
        room_id: roomId,
        player_name: pvpState.playerName,
        pokemon_data: pvpState.selectedPokemon,
        is_creator: false,
        ready: false
      });

    if (playerError) throw playerError;

    // Update room status to ready - both players will get start battle prompts
    const { error: updateError } = await pvpState.supabaseClient
      .from("pvp_rooms")
      .update({ status: "ready" })
      .eq("room_id", roomId);

    if (updateError) {
      console.error("❌ Failed to update room status:", updateError);
      throw updateError;
    }

    console.log("✅ Room status updated to ready");

    // Manually trigger the modal for the joiner since subscription might not catch the update
    setTimeout(() => {
      handleRoomUpdate({ room_id: roomId, status: "ready" });
    }, 500);

    closePvPLoading();

    // Don't start battle here - subscription will show start battle modal for both players
  } catch (error) {
    closePvPLoading();
    console.error("❌ Failed to join room:", error);
    await showPvPError("❌ Error", `Failed to join room: ${error.message}`);
  }
}

// ===================================================================
// DELETE PVP ROOM
// ===================================================================

async function deletePvPRoom(roomId) {
  // Get room status to show appropriate confirmation message
  const { data: room } = await pvpState.supabaseClient
    .from("pvp_rooms")
    .select("status")
    .eq("room_id", roomId)
    .single();

  let message = `Are you sure you want to delete this room?<br><br>
        <span style="color: var(--warning);">⚠️ This action cannot be undone!</span>`;

  if (room?.status === "battling") {
    message = `This room is currently in battle. Deleting it will end the match for both players.<br><br>
        <span style="color: var(--danger);">⚠️ This will interrupt an active battle!</span><br><br>
        Are you sure you want to delete this room?`;
  } else if (room?.status === "ready") {
    message = `This room is getting ready to start a battle. Deleting it will cancel the match setup.<br><br>
        <span style="color: var(--warning);">⚠️ Both players are preparing to battle!</span><br><br>
        Are you sure you want to delete this room?`;
  }

  const confirmed = await window.txModal.confirm({
    title: "🗑️ Delete Room",
    message: message,
    confirmText: "Delete Room",
    cancelText: "Cancel",
  });

  if (!confirmed) return;

  try {
    const loadingModal = showPvPLoading("Deleting room...", "Please wait...");

    // Delete players first (due to foreign key constraint)
    await pvpState.supabaseClient
      .from("pvp_players")
      .delete()
      .eq("room_id", roomId);

    // Delete the room
    await pvpState.supabaseClient
      .from("pvp_rooms")
      .delete()
      .eq("room_id", roomId);

    closePvPLoading();

    await showPvPSuccess(
      "✅ Room Deleted",
      "The room has been successfully deleted."
    );

    // Refresh the room list
    await refreshRoomsList();

  } catch (error) {
    closePvPLoading();
    await showPvPError("❌ Error", `Failed to delete room: ${error.message}`);
  }
}

// ===================================================================
// EVENT LISTENERS
// ===================================================================

function setupPvPEventListeners() {
  // Create room button
  const createBtn = document.getElementById("createRoomBtn");
  if (createBtn) {
    createBtn.addEventListener("click", createPvPRoom);
  }
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function generateRoomId() {
  return "room_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

async function fetchOwnedTokens(provider, nftContract, account) {
  try {
    // Get balance of NFTs for this account
    const balance = await nftContract.balanceOf(account);
    const tokenCount = parseInt(balance.toString());

    console.log(`Account ${account} has ${tokenCount} NFTs`);

    if (tokenCount === 0) {
      return [];
    }

    // ✅ METHOD 1: Try custom getTokenIdsByOwner first (most reliable)
    try {
      if (typeof nftContract.getTokenIdsByOwner === "function") {
        console.log("✅ Using getTokenIdsByOwner (custom function)");
        const tokenIds = await nftContract.getTokenIdsByOwner(account);
        const ids = tokenIds.map((id) => parseInt(id.toString()));
        console.log(`✅ Custom function complete:`, ids);
        return ids;
      }
    } catch (e) {
      console.log("❌ getTokenIdsByOwner not available:", e.message);
    }

    // ✅ METHOD 2: Use Ethers v6 queryFilter (modern, reliable)
    try {
      console.log("📜 Using queryFilter for Transfer events");
      const filter = nftContract.filters.Transfer;
      const events = await nftContract.queryFilter(filter, 0, "latest");

      const ownedTokens = new Set();
      events.forEach((event) => {
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

      const result = Array.from(ownedTokens).sort((a, b) => a - b);
      console.log(`✅ queryFilter result:`, result);
      return result;
    } catch (e) {
      console.warn("⚠️ queryFilter failed:", e);
    }

    // ✅ METHOD 3: Fallback to tokenOfOwnerByIndex (original method)
    try {
      console.log("🔄 Using tokenOfOwnerByIndex fallback");
      const tokenIds = [];
      for (let i = 0; i < tokenCount; i++) {
        try {
          const tokenId = await nftContract.tokenOfOwnerByIndex(account, i);
          tokenIds.push(parseInt(tokenId.toString()));
        } catch (error) {
          console.warn(`Failed to get token at index ${i}:`, error);
        }
      }
      console.log(`✅ tokenOfOwnerByIndex result:`, tokenIds);
      return tokenIds;
    } catch (e) {
      console.warn("⚠️ tokenOfOwnerByIndex failed:", e);
    }

    // ✅ METHOD 4: Return mock data for testing
    console.warn("Using mock token IDs for testing");
    return Array.from({ length: Math.min(tokenCount, 3) }, (_, i) => i + 1);
  } catch (error) {
    console.error("❌ Error fetching owned tokens:", error);
    return []; // Return empty array on error
  }
}

async function resolveMetadata(nftContract, tokenId) {
  try {
    const tokenURI = await nftContract.tokenURI(tokenId);
    const httpURI = ipfsToHttp(tokenURI);
    const response = await fetch(httpURI);
    if (!response.ok) throw new Error("Failed to fetch metadata");
    return await response.json();
  } catch (error) {
    console.warn(`Failed to resolve metadata for token ${tokenId}:`, error);
    return null;
  }
}

function ipfsToHttp(ipfsUrl) {
  if (!ipfsUrl) return "";
  if (ipfsUrl.startsWith("http")) return ipfsUrl;
  return ipfsUrl.replace("ipfs://", "https://ipfs.io/ipfs/");
}

async function fetchPokeAPIData(pokemonName) {
  try {
    const cleanName = pokemonName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${cleanName}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn(`Failed to fetch PokeAPI data for ${pokemonName}:`, error);
    return null;
  }
}