// ===================================================================
// SIMPLE OFF-CHAIN PVP BATTLE SYSTEM - PROTOTYPE
// No blockchain, no payments, just fun synchronous battles!
// ===================================================================

const battleState = {
  roomId: null,
  p1: null,
  p2: null,
  myPlayerName: null,
  opponentPlayerName: null,
  myPokemon: null,
  opponentPokemon: null,
  currentTurn: null, // Player name whose turn it is
  round: 1,
  defending: null,
  battleActive: false,
  supabaseClient: null,
  subscription: null,
  waitingForOpponent: false
};

const UI = {
  player: {
    sprite: document.getElementById('playerSprite'),
    name: document.getElementById('playerName'),
    hpBar: document.getElementById('playerHpFill'),
    hpText: document.getElementById('playerHpText'),
    wrapper: document.getElementById('playerWrapper')
  },
  enemy: {
    sprite: document.getElementById('enemySprite'),
    name: document.getElementById('enemyName'),
    hpBar: document.getElementById('enemyHpFill'),
    hpText: document.getElementById('enemyHpText'),
    wrapper: document.getElementById('enemyWrapper')
  },
  actionPanel: document.getElementById('actionPanel'),
  abilityButtons: document.getElementById('abilityButtons'),
  defendBtn: document.getElementById('defendBtn'),
  resultScreen: document.getElementById('resultScreen'),
  resultTitle: document.getElementById('resultTitle'),
  resultMessage: document.getElementById('resultMessage'),
  arena: document.getElementById('battleArena')
};

// Type effectiveness chart
const TYPE_CHART = {
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, water: 0.5, rock: 0.5, fire: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, ground: 0 },
  normal: { rock: 0.5, ghost: 0, steel: 0.5 }
};

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🎮 PvP Battle initializing...');

    // Initialize Supabase
    battleState.supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );

    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('roomId');
    const playersParam = params.get('players');

    if (!roomId || !playersParam) {
      console.error('❌ Missing required URL parameters');
      alert('Invalid battle link. Please return to the PvP lobby.');
      window.location.href = 'pvp-lobby.html';
      return;
    }

    battleState.roomId = roomId;

    let players;
    try {
      players = JSON.parse(decodeURIComponent(playersParam));
    } catch (e) {
      console.error('❌ Invalid players data');
      alert('Invalid battle data. Please return to the PvP lobby.');
      window.location.href = 'pvp-lobby.html';
      return;
    }

    if (!players || players.length !== 2) {
      console.error('❌ Invalid player data');
      alert('Invalid player data. Please return to the PvP lobby.');
      window.location.href = 'pvp-lobby.html';
      return;
    }

    // Get player name from localStorage (same as lobby)
    const myPlayerName = localStorage.getItem('pvpPlayerName') || 'Unknown Player';

    // Determine which player is me
    const myPlayerData = players.find(p => p.player_name === myPlayerName);
    const opponentData = players.find(p => p.player_name !== myPlayerName);

    if (!myPlayerData || !opponentData) {
      console.error('❌ Could not identify players');
      alert('Could not identify players. Please return to the PvP lobby.');
      window.location.href = 'pvp-lobby.html';
      return;
    }

    // Create battle Pokemon - ensure consistent p1/p2 assignment
    // Sort players by name to ensure consistent assignment regardless of who creates the battle
    const sortedPlayers = [...players].sort((a, b) => a.player_name.localeCompare(b.player_name));
    battleState.p1 = await createBattlePokemon(sortedPlayers[0].pokemon_data, sortedPlayers[0].player_name === myPlayerName);
    battleState.p2 = await createBattlePokemon(sortedPlayers[1].pokemon_data, sortedPlayers[1].player_name === myPlayerName);

    battleState.myPokemon = battleState.p1.isPlayer ? battleState.p1 : battleState.p2;
    battleState.opponentPokemon = battleState.p1.isPlayer ? battleState.p2 : battleState.p1;

    battleState.myPlayerName = myPlayerName;
    battleState.opponentPlayerName = opponentData.player_name;

    // Initialize battle state in Supabase with consistent player order
    await initializeBattleState(sortedPlayers[0].player_name, sortedPlayers[1].player_name);

    // Subscribe to battle actions
    subscribeToBattle();

    // Start battle
    renderBattle();
    battleState.battleActive = true;

    // Initial turn check
    console.log('🎯 Initial turn check - current turn:', battleState.currentTurn, 'my name:', battleState.myPlayerName);
    checkTurn();

  } catch (error) {
    console.error('❌ Battle initialization failed:', error);
    alert(`Failed to load battle: ${error.message}`);
    window.location.href = 'pvp-lobby.html';
  }
});

// ===================================================================
// POKEMON CREATION
// ===================================================================

async function createBattlePokemon(pokemonData, isPlayer) {
  const name = pokemonData.name.toLowerCase();
  
  // Fetch from PokeAPI
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
  if (!response.ok) throw new Error(`Pokemon ${name} not found`);
  
  const data = await response.json();
  
  // Calculate stats
  const stats = {
    hp: calculateStat(data.stats.find(s => s.stat.name === 'hp').base_stat, 50, 15, true),
    attack: calculateStat(data.stats.find(s => s.stat.name === 'attack').base_stat, 50, 15),
    defense: calculateStat(data.stats.find(s => s.stat.name === 'defense').base_stat, 50, 15),
    specialAttack: calculateStat(data.stats.find(s => s.stat.name === 'special-attack').base_stat, 50, 15),
    specialDefense: calculateStat(data.stats.find(s => s.stat.name === 'special-defense').base_stat, 50, 15),
    speed: calculateStat(data.stats.find(s => s.stat.name === 'speed').base_stat, 50, 15)
  };

  return {
    id: data.id,
    name: pokemonData.name,
    tokenId: pokemonData.tokenId,
    types: data.types.map(t => t.type.name),
    abilities: pokemonData.abilities || data.abilities.slice(0, 4).map(a => ({
      name: a.ability.name,
      isHidden: a.is_hidden
    })),
    stats: stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    isPlayer: isPlayer
  };
}

function calculateStat(base, level, iv, isHp = false) {
  if (isHp) {
    return Math.floor((2 * base + iv) * level / 100) + level + 10;
  }
  return Math.floor(((2 * base + iv) * level / 100) + 5);
}

// ===================================================================
// BATTLE RENDERING
// ===================================================================

function renderBattle() {
  const player = battleState.p1;
  const enemy = battleState.p2;

  // Set sprites
  UI.player.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani-back/${player.name.toLowerCase()}.gif`;
  UI.enemy.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani/${enemy.name.toLowerCase()}.gif`;

  UI.player.sprite.onerror = () => {
    UI.player.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani-back/substitute.gif';
  };
  UI.enemy.sprite.onerror = () => {
    UI.enemy.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani/substitute.gif';
  };

  // Set names
  UI.player.name.textContent = player.name;
  UI.enemy.name.textContent = enemy.name;

  // Update HP
  updateHpBar(player);
  updateHpBar(enemy);
}

function updateHpBar(pokemon) {
  const target = pokemon.isPlayer ? UI.player : UI.enemy;
  const percentage = Math.max(0, (pokemon.currentHp / pokemon.maxHp) * 100);
  
  target.hpBar.style.width = `${percentage}%`;
  target.hpText.textContent = `${pokemon.currentHp}/${pokemon.maxHp}`;
  
  // Color based on HP
  if (percentage > 50) {
    target.hpBar.style.background = 'linear-gradient(90deg, #00ff9d, #00c474)';
  } else if (percentage > 25) {
    target.hpBar.style.background = 'linear-gradient(90deg, #ffd93d, #ffb800)';
  } else {
    target.hpBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ff3b3b)';
  }
}

// ===================================================================
// BATTLE STATE MANAGEMENT (SUPABASE)
// ===================================================================

async function initializeBattleState(p1Name, p2Name) {
  try {
    // Check if battle state already exists
    const { data: existing } = await battleState.supabaseClient
      .from('pvp_battle_state')
      .select('*')
      .eq('room_id', battleState.roomId)
      .single();

    if (existing) {
      console.log('📊 Battle state already exists, loading...');
      battleState.currentTurn = existing.current_turn;
      battleState.round = existing.round;

      // Restore HP
      battleState.p1.currentHp = existing.p1_hp;
      battleState.p2.currentHp = existing.p2_hp;
      updateHpBar(battleState.p1);
      updateHpBar(battleState.p2);

      // Check whose turn it is
      checkTurn();
      return;
    }

    // Try to create initial battle state (only one player should succeed)
    const p1Speed = battleState.p1.stats.speed;
    const p2Speed = battleState.p2.stats.speed;
    const firstTurn = p1Speed >= p2Speed ? p1Name : p2Name;

    const { data, error } = await battleState.supabaseClient
      .from('pvp_battle_state')
      .insert({
        room_id: battleState.roomId,
        p1_name: p1Name,
        p2_name: p2Name,
        current_turn: firstTurn,
        round: 1,
        p1_hp: battleState.p1.maxHp,
        p2_hp: battleState.p2.maxHp,
        p1_max_hp: battleState.p1.maxHp,
        p2_max_hp: battleState.p2.maxHp,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      // If insertion failed (another player already created it), fetch existing
      console.log('📊 Battle state creation failed, fetching existing...');
      const { data: existing } = await battleState.supabaseClient
        .from('pvp_battle_state')
        .select('*')
        .eq('room_id', battleState.roomId)
        .single();

      if (existing) {
        console.log('📊 Loading existing battle state:', existing);
        battleState.currentTurn = existing.current_turn;
        battleState.round = existing.round;
        
        // Map server HP to correct players based on server player names
        if (existing.p1_name === battleState.p1.playerName) {
          battleState.p1.currentHp = existing.p1_hp;
          battleState.p2.currentHp = existing.p2_hp;
        } else {
          battleState.p1.currentHp = existing.p2_hp;
          battleState.p2.currentHp = existing.p1_hp;
        }
        
        updateHpBar(battleState.p1);
        updateHpBar(battleState.p2);
        
        console.log('✅ Existing battle state loaded, current turn:', battleState.currentTurn);
      }
    } else {
      battleState.currentTurn = data.current_turn;
      console.log('✅ Battle state initialized, first turn:', firstTurn);
    }

    checkTurn();

  } catch (error) {
    console.error('❌ Failed to initialize battle state:', error);
    throw error;
  }
}

async function submitAction(actionType, abilityName = null) {
  try {
    console.log('📤 Submitting action:', actionType, abilityName);

    const { error } = await battleState.supabaseClient
      .from('pvp_battle_actions')
      .insert({
        room_id: battleState.roomId,
        player_name: battleState.myPlayerName,
        action_type: actionType,
        ability_name: abilityName,
        round: battleState.round
      });

    if (error) throw error;

    console.log('✅ Action submitted');
    
    // Hide action panel and show waiting
    UI.actionPanel.classList.add('hidden');
    battleState.waitingForOpponent = true;
    showWaitingIndicator();

  } catch (error) {
    console.error('❌ Failed to submit action:', error);
    alert('Failed to submit action. Please try again.');
  }
}

// ===================================================================
// REAL-TIME SUBSCRIPTION
// ===================================================================

function subscribeToBattle() {
  battleState.subscription = battleState.supabaseClient
    .channel(`battle_${battleState.roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'pvp_battle_actions',
      filter: `room_id=eq.${battleState.roomId}`
    }, async (payload) => {
      console.log('📨 New action received:', payload.new);
      await handleOpponentAction(payload.new);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'pvp_battle_state',
      filter: `room_id=eq.${battleState.roomId}`
    }, async (payload) => {
      console.log('📊 Battle state updated:', payload.new);
      await handleStateUpdate(payload.new);
    })
    .subscribe();

  console.log('📡 Subscribed to battle updates');
}

async function handleOpponentAction(action) {
  if (action.player_name === battleState.myPlayerName) {
    return; // Ignore my own actions
  }

  hideWaitingIndicator();

  const attacker = battleState.opponentPokemon;
  const defender = battleState.myPokemon;

  if (action.action_type === 'defend') {
    console.log(`🛡️ ${attacker.name} defends!`);
    battleState.defending = attacker;
  } else if (action.action_type === 'attack') {
    const ability = { name: action.ability_name };
    await executeAttack(attacker, defender, ability);
  }

  // Process turn resolution
  await resolveTurn();
}

async function resolveTurn() {
  // Check if battle ended
  if (checkBattleEnd()) return;

  // Update turn in database
  const nextTurn = battleState.currentTurn === battleState.p1.playerName ? 
    battleState.p2.playerName : battleState.p1.playerName;

  await battleState.supabaseClient
    .from('pvp_battle_state')
    .update({
      current_turn: nextTurn,
      round: battleState.round + 1,
      p1_hp: battleState.p1.currentHp,
      p2_hp: battleState.p2.currentHp
    })
    .eq('room_id', battleState.roomId);

  battleState.currentTurn = nextTurn;
  battleState.round++;
  battleState.defending = null;

  checkTurn();
}

function handleStateUpdate(state) {
  console.log('📊 Battle state update received:', state);
  battleState.currentTurn = state.current_turn;
  battleState.round = state.round;
  
  // Update HP from server - map based on server player names
  if (state.p1_name === battleState.p1.playerName) {
    battleState.p1.currentHp = state.p1_hp;
    battleState.p2.currentHp = state.p2_hp;
  } else {
    battleState.p1.currentHp = state.p2_hp;
    battleState.p2.currentHp = state.p1_hp;
  }
  
  updateHpBar(battleState.p1);
  updateHpBar(battleState.p2);

  checkTurn();
}

// ===================================================================
// TURN MANAGEMENT
// ===================================================================

function checkTurn() {
  if (!battleState.battleActive) return;

  console.log('🎯 Current turn:', battleState.currentTurn, 'My player name:', battleState.myPlayerName);

  if (battleState.currentTurn === battleState.myPlayerName) {
    console.log('✅ My turn!');
    battleState.waitingForOpponent = false;
    hideWaitingIndicator();
    enablePlayerActions();
  } else {
    console.log('⏳ Opponent\'s turn');
    battleState.waitingForOpponent = true;
    showWaitingIndicator();
  }
}

function enablePlayerActions() {
  UI.abilityButtons.innerHTML = '';
  
  const abilities = battleState.myPokemon.abilities.slice(0, 4);
  abilities.forEach(ability => {
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    btn.textContent = ability.name.replace(/-/g, ' ').toUpperCase();
    btn.onclick = () => useAbility(ability);
    UI.abilityButtons.appendChild(btn);
  });

  UI.defendBtn.onclick = () => defend();
  UI.actionPanel.classList.remove('hidden');
}

function useAbility(ability) {
  submitAction('attack', ability.name);
  
  // Execute my attack locally
  const attacker = battleState.myPokemon;
  const defender = battleState.opponentPokemon;
  executeAttack(attacker, defender, ability);
}

function defend() {
  submitAction('defend');
  battleState.defending = battleState.myPokemon;
  console.log('🛡️ You defend!');
}

function showWaitingIndicator() {
  UI.actionPanel.classList.add('hidden');
  
  // Show waiting message
  const existing = document.getElementById('waitingIndicator');
  if (existing) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'waitingIndicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 217, 61, 0.9);
    color: #000;
    padding: 15px 30px;
    border-radius: 10px;
    font-weight: 800;
    z-index: 1000;
    box-shadow: 0 5px 20px rgba(255, 217, 61, 0.5);
  `;
  indicator.textContent = '⏳ Waiting for opponent...';
  document.body.appendChild(indicator);
}

function hideWaitingIndicator() {
  const indicator = document.getElementById('waitingIndicator');
  if (indicator) indicator.remove();
}

function executeAttack(attacker, defender, ability) {
  console.log(`💥 ${attacker.name} used ${ability.name}!`);

  // Calculate damage
  const power = 60;
  const moveType = attacker.types[0]; // Simplified
  let damage = calculateDamage(power, moveType, attacker, defender);

  // Apply defense reduction
  if (battleState.defending === defender) {
    damage = Math.floor(damage * 0.5);
    console.log('🛡️ Damage reduced by defense!');
  }

  // Critical hit chance
  if (Math.random() < 0.1) {
    damage = Math.floor(damage * 1.5);
    console.log('⭐ Critical hit!');
  }

  // Apply damage
  defender.currentHp = Math.max(0, defender.currentHp - damage);
  
  // Show damage number
  showDamageNumber(defender, damage);
  
  // Update HP bar
  updateHpBar(defender);
  
  // Add hit animation
  const targetWrapper = defender.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  targetWrapper.querySelector('.pokemon-sprite').classList.add('hit-flinch');
  setTimeout(() => {
    targetWrapper.querySelector('.pokemon-sprite').classList.remove('hit-flinch');
  }, 400);

  console.log(`💢 ${damage} damage dealt! ${defender.name} HP: ${defender.currentHp}/${defender.maxHp}`);
}

function calculateDamage(power, moveType, attacker, defender) {
  const level = 50;
  const attackStat = attacker.stats.attack;
  const defenseStat = defender.stats.defense;
  
  let damage = Math.floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2);
  
  // STAB bonus
  if (attacker.types.includes(moveType)) {
    damage = Math.floor(damage * 1.5);
  }
  
  // Type effectiveness
  const effectiveness = getTypeEffectiveness(moveType, defender.types);
  damage = Math.floor(damage * effectiveness);
  
  // Remove random factor for deterministic damage
  // damage = Math.floor(damage * (0.85 + Math.random() * 0.15));
  
  return Math.max(1, damage);
}

function getTypeEffectiveness(moveType, defenderTypes) {
  let multiplier = 1;
  
  defenderTypes.forEach(defType => {
    if (TYPE_CHART[moveType]?.[defType]) {
      multiplier *= TYPE_CHART[moveType][defType];
    }
  });
  
  return multiplier;
}

function showDamageNumber(pokemon, damage) {
  const wrapper = pokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';
  damageEl.textContent = `-${damage}`;
  damageEl.style.color = damage > 50 ? '#ff3b3b' : '#ffd93d';
  damageEl.style.position = 'absolute';
  damageEl.style.top = '50%';
  damageEl.style.left = '50%';
  
  wrapper.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1500);
}

// ===================================================================
// BATTLE END
// ===================================================================

function checkBattleEnd() {
  const { p1, p2 } = battleState;
  
  if (p1.currentHp <= 0 || p2.currentHp <= 0) {
    battleState.battleActive = false;
    
    const winner = p1.currentHp > 0 ? p1 : p2;
    const loser = p1.currentHp > 0 ? p2 : p1;
    
    // Add faint animation
    const loserWrapper = loser.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
    loserWrapper.querySelector('.sprite-container').classList.add('fainted');
    
    setTimeout(() => {
      endBattle(winner, loser);
    }, 2000);
    
    return true;
  }
  
  return false;
}

async function endBattle(winner, loser) {
  console.log('🏆 Battle ended!', { winner: winner.name, loser: loser.name });

  // Unsubscribe from real-time updates
  if (battleState.subscription) {
    battleState.supabaseClient.removeChannel(battleState.subscription);
    battleState.subscription = null;
  }

  // Show result screen
  UI.resultTitle.textContent = winner.isPlayer ? 'VICTORY!' : 'DEFEAT';
  UI.resultMessage.innerHTML = `
    ${winner.isPlayer ? '🎉 You won!' : '💔 You lost.'}<br><br>
    <span style="color: var(--success);">Thanks for playing! 🎮</span>
  `;

  const resultContent = UI.resultScreen.querySelector('.result-content');
  resultContent.className = `result-content ${winner.isPlayer ? 'victory' : 'defeat'}`;
  UI.resultScreen.classList.remove('hidden');

  // Update Supabase battle state
  try {
    await battleState.supabaseClient
      .from('pvp_battle_state')
      .update({
        status: 'completed'
      })
      .eq('room_id', battleState.roomId);

    console.log('✅ Battle result saved to Supabase');

    // Redirect to lobby after 3 seconds
    setTimeout(() => {
      window.location.href = 'pvp-lobby.html';
    }, 3000);

  } catch (error) {
    console.error('❌ Failed to update battle result:', error);
    // Still redirect even if update fails
    setTimeout(() => {
      window.location.href = 'pvp-lobby.html';
    }, 3000);
  }
}