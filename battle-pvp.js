// ===================================================================
// SIMPLE OFF-CHAIN PVP BATTLE SYSTEM - FIXED ATTACK LOGIC
// Ensures attacks always hit the opponent, not yourself
// ===================================================================

const battleState = {
  roomId: null,
  p1: null,
  p2: null,
  myPlayerName: null,
  opponentPlayerName: null,
  myPokemon: null,
  opponentPokemon: null,
  currentTurn: null,
  round: 1,
  defending: null,
  battleActive: false,
  supabaseClient: null,
  subscription: null,
  waitingForOpponent: false,
  p1Name: null,
  p2Name: null,
  isPlayer1: true
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

const TYPE_CHART = {
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, water: 0.5, rock: 0.5, fire: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, ground: 0 },
  normal: { rock: 0.5, ghost: 0, steel: 0.5 }
};

window.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🎮 PvP Battle initializing...');

    battleState.supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );

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

    const myPlayerName = localStorage.getItem('pvpPlayerName') || 'Unknown Player';
    const myPlayerData = players.find(p => p.player_name === myPlayerName);
    const opponentData = players.find(p => p.player_name !== myPlayerName);

    if (!myPlayerData || !opponentData) {
      console.error('❌ Could not identify players');
      alert('Could not identify players. Please return to the PvP lobby.');
      window.location.href = 'pvp-lobby.html';
      return;
    }

    const sortedPlayers = [...players].sort((a, b) => a.player_name.localeCompare(b.player_name));
    battleState.isPlayer1 = sortedPlayers[0].player_name === myPlayerName;
    
    battleState.p1 = await createBattlePokemon(sortedPlayers[0].pokemon_data);
    battleState.p2 = await createBattlePokemon(sortedPlayers[1].pokemon_data);

    // Store player names for damage calculation
    battleState.p1Name = sortedPlayers[0].player_name;
    battleState.p2Name = sortedPlayers[1].player_name;

    if (battleState.isPlayer1) {
      battleState.myPokemon = battleState.p1;
      battleState.opponentPokemon = battleState.p2;
    } else {
      battleState.myPokemon = battleState.p2;
      battleState.opponentPokemon = battleState.p1;
    }

    battleState.myPlayerName = myPlayerName;
    battleState.opponentPlayerName = opponentData.player_name;

    console.log('🎯 Battle Setup:', {
      myName: battleState.myPlayerName,
      myPokemon: battleState.myPokemon.name,
      opponentName: battleState.opponentPlayerName,
      opponentPokemon: battleState.opponentPokemon.name,
      isPlayer1: battleState.isPlayer1
    });

    await initializeBattleState(sortedPlayers[0].player_name, sortedPlayers[1].player_name);
    subscribeToBattle();
    renderBattle();
    battleState.battleActive = true;
    checkTurn();

  } catch (error) {
    console.error('❌ Battle initialization failed:', error);
    alert(`Failed to load battle: ${error.message}`);
    window.location.href = 'pvp-lobby.html';
  }
});

async function createBattlePokemon(pokemonData) {
  const name = pokemonData.name.toLowerCase();
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
  if (!response.ok) throw new Error(`Pokemon ${name} not found`);
  
  const data = await response.json();
  
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
    currentHp: stats.hp
  };
}

function calculateStat(base, level, iv, isHp = false) {
  if (isHp) {
    return Math.floor((2 * base + iv) * level / 100) + level + 10;
  }
  return Math.floor(((2 * base + iv) * level / 100) + 5);
}

function renderBattle() {
  const player = battleState.myPokemon;
  const enemy = battleState.opponentPokemon;

  UI.player.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani-back/${player.name.toLowerCase()}.gif`;
  UI.enemy.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani/${enemy.name.toLowerCase()}.gif`;

  UI.player.sprite.onerror = () => {
    UI.player.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani-back/substitute.gif';
  };
  UI.enemy.sprite.onerror = () => {
    UI.enemy.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani/substitute.gif';
  };

  UI.player.name.textContent = player.name;
  UI.enemy.name.textContent = enemy.name;

  updateHpBar(player);
  updateHpBar(enemy);
}

function updateHpBar(pokemon) {
  const isMyPokemon = (pokemon === battleState.myPokemon);
  const target = isMyPokemon ? UI.player : UI.enemy;
  
  const percentage = Math.max(0, (pokemon.currentHp / pokemon.maxHp) * 100);
  
  target.hpBar.style.width = `${percentage}%`;
  target.hpText.textContent = `${pokemon.currentHp}/${pokemon.maxHp}`;
  
  if (percentage > 50) {
    target.hpBar.style.background = 'linear-gradient(90deg, #00ff9d, #00c474)';
  } else if (percentage > 25) {
    target.hpBar.style.background = 'linear-gradient(90deg, #ffd93d, #ffb800)';
  } else {
    target.hpBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ff3b3b)';
  }
}

async function initializeBattleState(p1Name, p2Name) {
  try {
    const { data: existing } = await battleState.supabaseClient
      .from('pvp_battle_state')
      .select('*')
      .eq('room_id', battleState.roomId);

    if (existing && existing.length > 0) {
      const state = existing[0];
      battleState.currentTurn = state.current_turn;
      battleState.round = state.round;

      if (state.p1_name === battleState.p1Name) {
        battleState.p1.currentHp = state.p1_hp;
        battleState.p2.currentHp = state.p2_hp;
      } else {
        battleState.p1.currentHp = state.p2_hp;
        battleState.p2.currentHp = state.p1_hp;
      }
      
      updateHpBar(battleState.p1);
      updateHpBar(battleState.p2);
      checkTurn();
      return;
    }

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
      .select();

    if (error) {
      const { data: existingData } = await battleState.supabaseClient
        .from('pvp_battle_state')
        .select('*')
        .eq('room_id', battleState.roomId);

      if (existingData && existingData.length > 0) {
        const state = existingData[0];
        battleState.currentTurn = state.current_turn;
        battleState.round = state.round;
        
        if (state.p1_name === battleState.p1Name) {
          battleState.p1.currentHp = state.p1_hp;
          battleState.p2.currentHp = state.p2_hp;
        } else {
          battleState.p1.currentHp = state.p2_hp;
          battleState.p2.currentHp = state.p1_hp;
        }
        
        updateHpBar(battleState.p1);
        updateHpBar(battleState.p2);
      }
    } else {
      if (data && data.length > 0) {
        battleState.currentTurn = data[0].current_turn;
      }
    }

    checkTurn();

  } catch (error) {
    console.error('❌ Failed to initialize battle state:', error);
    throw error;
  }
}

async function submitAction(actionType, abilityName = null) {
  try {
    console.log('📤 I am attacking:', {
      myName: battleState.myPlayerName,
      myPokemon: battleState.myPokemon.name,
      targetPokemon: battleState.opponentPokemon.name,
      actionType: actionType
    });

    const { error } = await battleState.supabaseClient
      .from('pvp_battle_actions')
      .insert({
        room_id: battleState.roomId,
        player_name: battleState.myPlayerName,
        action_type: actionType,
        ability_name: abilityName,
        round: battleState.round,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    
    UI.actionPanel.classList.add('hidden');
    battleState.waitingForOpponent = true;
    showWaitingIndicator();

  } catch (error) {
    console.error('❌ Failed to submit action:', error);
    alert('Failed to submit action. Please try again.');
  }
}

function subscribeToBattle() {
  battleState.subscription = battleState.supabaseClient
    .channel(`battle_${battleState.roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'pvp_battle_actions',
      filter: `room_id=eq.${battleState.roomId}`
    }, async (payload) => {
      await handleOpponentAction(payload.new);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'pvp_battle_state',
      filter: `room_id=eq.${battleState.roomId}`
    }, async (payload) => {
      await handleStateUpdate(payload.new);
    })
    .subscribe();
}

async function handleOpponentAction(action) {
  // Ignore my own actions
  if (action.player_name === battleState.myPlayerName) {
    console.log('📥 Ignoring my own action');
    return;
  }

  console.log('📥 Opponent action received:', {
    attackerName: action.player_name,
    attackerPokemon: battleState.opponentPokemon.name,
    defenderPokemon: battleState.myPokemon.name,
    actionType: action.action_type
  });

  hideWaitingIndicator();

  if (action.action_type === 'defend') {
    console.log(`🛡️ ${action.player_name} defends!`);
    battleState.defending = battleState.opponentPokemon;
  } else if (action.action_type === 'attack') {
    // Calculate damage - opponent attacks me
    const attacker = battleState.opponentPokemon;
    const defender = battleState.myPokemon;
    
    const damage = calculateDamage(60, attacker.types[0], attacker, defender);
    let finalDamage = damage;

    if (battleState.defending === defender) {
      finalDamage = Math.floor(finalDamage * 0.5);
      console.log('🛡️ Damage reduced by defense!');
    }

    if (Math.random() < 0.1) {
      finalDamage = Math.floor(finalDamage * 1.5);
      console.log('⭐ Critical hit!');
    }

    console.log(`💥 ${attacker.name} attacks ${defender.name} for ${finalDamage} damage!`);

    // Apply damage - THE KEY FIX: opponent attacked, so I take damage
    await applyDamageToDefender(action.player_name, finalDamage);
  }

  await resolveTurn();
}

// NEW FUNCTION: Clear logic for who takes damage
async function applyDamageToDefender(attackerPlayerName, damage) {
  try {
    console.log('💢 Applying damage:', {
      attacker: attackerPlayerName,
      damage: damage
    });

    const attackerIsP1 = (attackerPlayerName === battleState.p1Name);
    
    let newP1Hp, newP2Hp;
    if (attackerIsP1) {
      newP1Hp = battleState.p1.currentHp;
      newP2Hp = Math.max(0, battleState.p2.currentHp - damage);
      battleState.p2.currentHp = newP2Hp;
      console.log(`✅ P1 (${battleState.p1Name}) attacked, P2 (${battleState.p2Name}) takes ${damage} damage`);
    } else {
      newP1Hp = Math.max(0, battleState.p1.currentHp - damage);
      newP2Hp = battleState.p2.currentHp;
      battleState.p1.currentHp = newP1Hp;
      console.log(`✅ P2 (${battleState.p2Name}) attacked, P1 (${battleState.p1Name}) takes ${damage} damage`);
    }

    // Show damage animation on the correct Pokemon
    const damagedPokemon = attackerIsP1 ? battleState.p2 : battleState.p1;
    showDamageNumber(damagedPokemon, damage);
    updateHpBar(damagedPokemon);
    
    const isMyPokemon = (damagedPokemon === battleState.myPokemon);
    const wrapper = isMyPokemon ? UI.player.wrapper : UI.enemy.wrapper;
    
    // Add attack effect animation
    showAttackEffect(wrapper);
    
    wrapper.querySelector('.pokemon-sprite').classList.add('hit-flinch');
    setTimeout(() => wrapper.querySelector('.pokemon-sprite').classList.remove('hit-flinch'), 400);

    // Save to database
    await battleState.supabaseClient
      .from('pvp_battle_state')
      .update({
        p1_hp: newP1Hp,
        p2_hp: newP2Hp
      })
      .eq('room_id', battleState.roomId);

    console.log(`💾 HP saved - P1: ${newP1Hp}/${battleState.p1.maxHp}, P2: ${newP2Hp}/${battleState.p2.maxHp}`);

  } catch (error) {
    console.error('❌ Failed to apply damage:', error);
  }
}

async function resolveTurn() {
  if (checkBattleEnd()) {
    return;
  }

  const nextTurn = battleState.currentTurn === battleState.p1Name ? 
    battleState.p2Name : battleState.p1Name;

  console.log('🔄 Turn switching from', battleState.currentTurn, 'to', nextTurn);

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
  console.log('📊 State update received:', state);
  battleState.currentTurn = state.current_turn;
  battleState.round = state.round;

  if (state.p1_name === battleState.p1Name) {
    battleState.p1.currentHp = state.p1_hp;
    battleState.p2.currentHp = state.p2_hp;
  } else {
    battleState.p1.currentHp = state.p2_hp;
    battleState.p2.currentHp = state.p1_hp;
  }

  updateHpBar(battleState.p1);
  updateHpBar(battleState.p2);

  if (checkBattleEnd()) {
    return;
  }

  checkTurn();
}

function checkTurn() {
  if (!battleState.battleActive) return;

  if (!battleState.currentTurn || !battleState.myPlayerName) {
    return;
  }

  console.log('🎯 Turn check - Current:', battleState.currentTurn, 'Me:', battleState.myPlayerName);

  if (battleState.currentTurn === battleState.myPlayerName) {
    console.log('✅ My turn!');
    battleState.waitingForOpponent = false;
    hideWaitingIndicator();
    enablePlayerActions();
    UI.actionPanel.classList.remove('hidden');
  } else {
    console.log('⏳ Waiting for opponent');
    battleState.waitingForOpponent = true;
    showWaitingIndicator();
    UI.actionPanel.classList.add('hidden');
  }
}

function enablePlayerActions() {
  UI.abilityButtons.innerHTML = '';

  if (battleState.currentTurn !== battleState.myPlayerName || !battleState.battleActive) {
    UI.actionPanel.classList.add('hidden');
    return;
  }

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
  if (battleState.currentTurn !== battleState.myPlayerName || !battleState.battleActive) {
    return;
  }
  submitAction('attack', ability.name);
}

function defend() {
  if (battleState.currentTurn !== battleState.myPlayerName || !battleState.battleActive) {
    return;
  }
  submitAction('defend');
  battleState.defending = battleState.myPokemon;
}

function checkBattleEnd() {
  const { p1, p2 } = battleState;
  
  if (p1.currentHp <= 0 || p2.currentHp <= 0) {
    battleState.battleActive = false;
    
    const winner = p1.currentHp > 0 ? p1 : p2;
    const loser = p1.currentHp > 0 ? p2 : p1;
    
    console.log('🏆 Battle ended!', {
      winner: winner.name,
      winnerHp: winner.currentHp,
      loser: loser.name,
      loserHp: loser.currentHp
    });
    
    UI.actionPanel.classList.add('hidden');
    hideWaitingIndicator();
    
    const isMyPokemonLoser = (loser === battleState.myPokemon);
    const loserWrapper = isMyPokemonLoser ? UI.player.wrapper : UI.enemy.wrapper;
    const spriteContainer = loserWrapper.querySelector('.sprite-container');
    if (spriteContainer) {
      spriteContainer.classList.add('fainted');
    }
    
    setTimeout(() => {
      endBattle(winner, loser);
    }, 2000);
    
    return true;
  }
  
  return false;
}

async function endBattle(winner, loser) {
  if (battleState.subscription) {
    battleState.supabaseClient.removeChannel(battleState.subscription);
    battleState.subscription = null;
  }

  const didIWin = (winner === battleState.myPokemon);

  UI.resultTitle.textContent = didIWin ? 'VICTORY!' : 'DEFEAT';
  UI.resultMessage.innerHTML = `
    ${didIWin ? '🎉 You won with ' + winner.name + '!' : '💔 You lost. ' + winner.name + ' won!'}<br><br>
    <span style="color: var(--primary);">Thanks for playing! 🎮</span>
  `;

  const resultContent = UI.resultScreen.querySelector('.result-content');
  resultContent.className = `result-content ${didIWin ? 'victory' : 'defeat'}`;
  UI.resultScreen.classList.remove('hidden');

  try {
    await battleState.supabaseClient
      .from('pvp_battle_state')
      .update({
        status: 'completed',
        winner: didIWin ? battleState.myPlayerName : battleState.opponentPlayerName
      })
      .eq('room_id', battleState.roomId);

    await battleState.supabaseClient
      .from('pvp_players')
      .delete()
      .eq('room_id', battleState.roomId);

    await battleState.supabaseClient
      .from('pvp_rooms')
      .delete()
      .eq('room_id', battleState.roomId);

    setTimeout(() => {
      window.location.href = 'pvp-lobby.html';
    }, 3000);

  } catch (error) {
    console.error('❌ Failed to cleanup battle:', error);
    setTimeout(() => {
      window.location.href = 'pvp-lobby.html';
    }, 3000);
  }
}

function showWaitingIndicator() {
  UI.actionPanel.classList.add('hidden');
  
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

function showDamageNumber(pokemon, damage) {
  const isMyPokemon = (pokemon === battleState.myPokemon);
  const wrapper = isMyPokemon ? UI.player.wrapper : UI.enemy.wrapper;
  
  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';
  damageEl.textContent = `-${damage}`;
  damageEl.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: ${damage > 50 ? '#ff3b3b' : '#ffd93d'};
    font-size: 2rem;
    font-weight: 800;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    pointer-events: none;
    animation: float-up 1.5s ease-out forwards;
  `;
  
  wrapper.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1500);
}

function showAttackEffect(targetWrapper) {
  const effect = document.createElement('div');
  effect.className = 'attack-effect';
  effect.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.8) 0%, rgba(255, 215, 0, 0.4) 50%, transparent 100%);
    border-radius: 50%;
    pointer-events: none;
    animation: attackPulse 0.6s ease-out forwards;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
  `;
  
  // Add animation to DOM if not already there
  if (!document.querySelector('style[data-attack-animation]')) {
    const style = document.createElement('style');
    style.setAttribute('data-attack-animation', 'true');
    style.textContent = `
      @keyframes attackPulse {
        0% {
          transform: translate(-50%, -50%) scale(0.5);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.5);
          opacity: 0;
        }
      }
      
      @keyframes float-up {
        0% {
          opacity: 1;
          transform: translateY(0) scale(0.7);
        }
        50% {
          opacity: 1;
          transform: translateY(-40px) scale(1.3);
        }
        100% {
          opacity: 0;
          transform: translateY(-80px) scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  targetWrapper.appendChild(effect);
  setTimeout(() => effect.remove(), 600);
}

function calculateDamage(power, moveType, attacker, defender) {
  const level = 50;
  const attackStat = attacker.stats.attack;
  const defenseStat = defender.stats.defense;
  
  let damage = Math.floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2);
  
  if (attacker.types.includes(moveType)) {
    damage = Math.floor(damage * 1.5);
  }
  
  const effectiveness = getTypeEffectiveness(moveType, defender.types);
  damage = Math.floor(damage * effectiveness);
  
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