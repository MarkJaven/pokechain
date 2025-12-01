// ===================================================================
// BATTLE ENGINE - Abilities-Only Combat System (FIXED)
// ===================================================================

const gameState = {
  participants: [],
  matchups: [],
  currentMatch: null,
  matchIndex: 0,
  battleActive: false,
  turn: 0,
  defending: null,
  difficulty: 'normal',
  isComplete: false,
  abilityCache: new Map()
};

const UI = {
  player: {
    sprite: document.getElementById('playerSprite'),
    name: document.getElementById('playerName'),
    hpBar: document.getElementById('playerHpFill'),
    hpText: document.getElementById('playerHpText')
  },
  enemy: {
    sprite: document.getElementById('enemySprite'),
    name: document.getElementById('enemyName'),
    hpBar: document.getElementById('enemyHpFill'),
    hpText: document.getElementById('enemyHpText')
  },
  difficulty: document.getElementById('difficultyBadge'),
  currentMatch: document.getElementById('currentMatch'),
  totalMatches: document.getElementById('totalMatches'),
  battleLog: document.getElementById('battleLog'),
  actionSelection: document.getElementById('actionSelection'),
  abilityButtons: document.getElementById('abilityButtons'),
  defendBtn: document.getElementById('defendBtn'),
  standings: document.getElementById('standingsList'),
  resultScreen: document.getElementById('resultScreen'),
  resultTitle: document.getElementById('resultTitle'),
  resultMessage: document.getElementById('resultMessage'),
  loading: document.getElementById('loadingOverlay')
};

// ===================================================================
// INITIALIZATION - WITH ERROR HANDLING
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    UI.loading.classList.remove('hidden');
    await initializeTournament();
    UI.loading.classList.add('hidden');
    startNextMatch();
  } catch (error) {
    console.error('Initialization failed:', error);
    alert(`Failed to load tournament: ${error.message}. Returning to lobby.`);
    window.location.href = 'tournament.html';
  }
});

async function initializeTournament() {
  const params = new URLSearchParams(window.location.search);
  const pokemonParam = params.get('pokemon');
  
  if (!pokemonParam) throw new Error('No tournament data provided in URL');
  
  let playerData;
  try {
    playerData = JSON.parse(decodeURIComponent(pokemonParam));
  } catch (e) {
    throw new Error('Invalid tournament data format');
  }
  
  gameState.difficulty = params.get('difficulty') || 'normal';
  const opponentCount = parseInt(params.get('opponents')) || 7;
  
  // Validate player data
  if (!playerData.name || !playerData.abilities) {
    throw new Error('Invalid Pokemon data: missing name or abilities');
  }
  
  // Load player Pokemon
  const playerPokemon = await loadPokemonData(playerData, true);
  gameState.participants.push(playerPokemon);
  
  // Generate opponents
  const opponents = await generateOpponents(opponentCount, playerData.pokemonId);
  gameState.participants.push(...opponents);
  
  generateMatchups();
  
  UI.difficulty.textContent = gameState.difficulty.toUpperCase();
  UI.totalMatches.textContent = gameState.matchups.length;
  
  log('battle', `🏆 Tournament begins! ${gameState.participants.length} participants`);
  log('battle', `${gameState.matchups.length} matches scheduled`);
}

// ===================================================================
// POKEMON DATA LOADING - FIXED
// ===================================================================

async function loadPokemonData(pokemonData, isPlayer) {
  const name = pokemonData.name.toLowerCase();
  
  // Fetch Pokemon data with error handling
  let pokemonRes;
  try {
    pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    if (!pokemonRes.ok) throw new Error(`Pokemon ${name} not found`);
  } catch (e) {
    throw new Error(`Failed to fetch Pokemon data: ${e.message}`);
  }
  
  const pokemon = await pokemonRes.json();
  
  // Calculate stats at level 50
  const stats = {
    hp: calculateStat(pokemon.stats.find(s => s.stat.name === 'hp').base_stat, 50, true),
    attack: calculateStat(pokemon.stats.find(s => s.stat.name === 'attack').base_stat, 50),
    defense: calculateStat(pokemon.stats.find(s => s.stat.name === 'defense').base_stat, 50),
    specialAttack: calculateStat(pokemon.stats.find(s => s.stat.name === 'special-attack').base_stat, 50),
    specialDefense: calculateStat(pokemon.stats.find(s => s.stat.name === 'special-defense').base_stat, 50),
    speed: calculateStat(pokemon.stats.find(s => s.stat.name === 'speed').base_stat, 50)
  };
  
  // Use abilities from CARD DATA (passed from tournament), fallback to API
  let abilities = [];
  if (pokemonData.abilities && Array.isArray(pokemonData.abilities) && pokemonData.abilities.length > 0) {
    // Use abilities from the card
    abilities = pokemonData.abilities.map(ab => ({
      name: ab.name ? ab.name.replace(/-/g, ' ') : 'Unknown Ability',
      isHidden: ab.isHidden || false,
      shortEffect: ab.shortEffect || 'A mysterious ability.',
      effect: ab.effect || ab.shortEffect || 'A mysterious ability.'
    }));
  } else {
    // Fallback: fetch from API if card data missing
    abilities = await Promise.all(pokemon.abilities.map(async a => {
      try {
        const abilityData = await fetchAbility(a.ability.url);
        return {
          name: a.ability.name.replace(/-/g, ' '),
          isHidden: a.is_hidden,
          effect: abilityData.effect,
          shortEffect: abilityData.shortEffect
        };
      } catch (e) {
        return {
          name: a.ability.name.replace(/-/g, ' '),
          isHidden: a.is_hidden,
          effect: 'A mysterious ability.',
          shortEffect: 'A mysterious ability.'
        };
      }
    }));
  }
  
  return {
    ...pokemonData,
    id: pokemon.id,
    types: pokemon.types.map(t => t.type.name),
    abilities,
    stats,
    currentHp: stats.hp,
    isPlayer,
    wins: 0,
    losses: 0
  };
}

function calculateStat(baseStat, level, isHp = false) {
  if (isHp) {
    return Math.floor((2 * baseStat * level) / 100) + level + 10;
  }
  return Math.floor(((2 * baseStat * level) / 100) + 5);
}

async function fetchAbility(url) {
  if (gameState.abilityCache.has(url)) {
    return gameState.abilityCache.get(url);
  }
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    const englishEntry = data.effect_entries?.find(e => e.language.name === 'en');
    
    const result = {
      effect: englishEntry?.effect || 'A mysterious ability.',
      shortEffect: englishEntry?.short_effect || 'A mysterious ability.'
    };
    
    gameState.abilityCache.set(url, result);
    return result;
  } catch (e) {
    return {
      effect: 'A mysterious ability.',
      shortEffect: 'A mysterious ability.'
    };
  }
}

// ===================================================================
// OPPONENT GENERATION
// ===================================================================

async function generateOpponents(count, excludeId) {
  const rarities = {
    easy: { common: 60, uncommon: 30, rare: 10, epic: 0, legendary: 0 },
    normal: { common: 30, uncommon: 35, rare: 25, epic: 10, legendary: 0 },
    hard: { common: 10, uncommon: 20, rare: 35, epic: 30, legendary: 5 },
    insane: { common: 0, uncommon: 10, rare: 25, epic: 40, legendary: 25 }
  }[gameState.difficulty];
  
  const usedIds = new Set([excludeId]);
  const opponents = [];
  
  for (let i = 0; i < count; i++) {
    const opponent = await generateUniquePokemon(rarities, usedIds);
    opponents.push(opponent);
  }
  
  return opponents;
}

async function generateUniquePokemon(rarityDist, usedIds) {
  const gen1 = await fetch('https://pokeapi.co/api/v2/generation/1').then(r => r.json());
  const gen2 = await fetch('https://pokeapi.co/api/v2/generation/2').then(r => r.json());
  const allPokemon = [...gen1.pokemon_species, ...gen2.pokemon_species];
  
  let pool = [];
  for (const species of allPokemon) {
    if (usedIds.has(species.name)) continue;
    
    const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${species.name}`);
    if (!pokemonRes.ok) continue;
    
    const pokemon = await pokemonRes.json();
    const bst = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0);
    
    let rarity;
    if (bst >= 580) rarity = 'legendary';
    else if (bst >= 500) rarity = 'epic';
    else if (bst >= 420) rarity = 'rare';
    else if (bst >= 340) rarity = 'uncommon';
    else rarity = 'common';
    
    if (rarityDist[rarity] > 0) {
      pool.push({ name: species.name, rarity, weight: rarityDist[rarity] });
    }
  }
  
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * total;
  
  for (const pokemon of pool) {
    random -= pokemon.weight;
    if (random <= 0) {
      usedIds.add(pokemon.name);
      const data = await loadPokemonData({ name: pokemon.name }, false);
      return data;
    }
  }
  
  return loadPokemonData({ name: 'magikarp' }, false);
}

// ===================================================================
// MATCHUP GENERATION & FLOW
// ===================================================================

function generateMatchups() {
  const matchups = [];
  const n = gameState.participants.length;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchups.push({ p1Index: i, p2Index: j, p1: gameState.participants[i], p2: gameState.participants[j] });
    }
  }
  
  gameState.matchups = matchups.sort(() => Math.random() - 0.5);
  gameState.matchIndex = 0;
}

function startNextMatch() {
  if (gameState.matchIndex >= gameState.matchups.length) {
    endTournament();
    return;
  }
  
  gameState.currentMatch = gameState.matchups[gameState.matchIndex];
  gameState.battleActive = true;
  gameState.turn = 0;
  gameState.defending = null;
  
  const { p1, p2 } = gameState.currentMatch;
  p1.currentHp = p1.stats.hp;
  p2.currentHp = p2.stats.hp;
  
  gameState.matchIndex++;
  UI.currentMatch.textContent = gameState.matchIndex;
  
  log('battle', `⚔️ Match ${gameState.matchIndex}: ${p1.name} vs ${p2.name}`);
  
  renderBattle();
  updateStandings();
  
  setTimeout(() => executeTurn(), 800);
}

function executeTurn() {
  if (!gameState.battleActive) return;
  
  const { p1, p2 } = gameState.currentMatch;
  gameState.defending = null;
  
  if (gameState.turn === 0 && p2.stats.speed > p1.stats.speed) {
    gameState.turn = 1;
  } else if (gameState.turn === 1 && p1.stats.speed > p2.stats.speed) {
    gameState.turn = 0;
  }
  
  const currentBattler = gameState.turn === 0 ? p1 : p2;
  
  if (currentBattler.isPlayer) {
    enablePlayerActions(currentBattler);
  } else {
    setTimeout(() => executeAIActions(currentBattler), 1200);
  }
}

// ===================================================================
// PLAYER ACTIONS
// ===================================================================

function enablePlayerActions(pokemon) {
  UI.abilityButtons.innerHTML = '';
  
  // Use abilities from card data
  const usableAbilities = pokemon.abilities.filter(a => !a.isHidden).slice(0, 2);
  
  usableAbilities.forEach((ability, index) => {
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    
    btn.innerHTML = `
      <div style="font-weight: 800;">${ability.name}</div>
      <div style="font-size: 0.6rem; opacity: 0.8;">
        ${ability.shortEffect.substring(0, 50)}...
      </div>
    `;
    
    btn.onclick = () => playerUseAbility(ability);
    UI.abilityButtons.appendChild(btn);
  });
  
  UI.defendBtn.onclick = () => playerDefend();
  UI.actionSelection.classList.remove('hidden');
  log('battle', 'Your turn! Choose an ability or defend.');
}

async function playerUseAbility(ability) {
  UI.actionSelection.classList.add('hidden');
  
  const { p1, p2 } = gameState.currentMatch;
  const user = gameState.turn === 0 ? p1 : p2;
  
  await executeAbility(user, ability);
  
  if (gameState.battleActive) {
    gameState.turn = 1 - gameState.turn;
    setTimeout(() => executeTurn(), 600);
  }
}

async function playerDefend() {
  UI.actionSelection.classList.add('hidden');
  
  const currentBattler = gameState.turn === 0 ? gameState.currentMatch.p1 : gameState.currentMatch.p2;
  gameState.defending = currentBattler;
  
  const hud = currentBattler.isPlayer ? document.querySelector('.player-side .pokemon-hud') : document.querySelector('.enemy-side .pokemon-hud');
  const sprite = currentBattler.isPlayer ? document.querySelector('.player-side .pokemon-sprite') : document.querySelector('.enemy-side .pokemon-sprite');
  
  hud.classList.add('defending');
  sprite.classList.add('defending');
  
  log('defend', `${currentBattler.name} defends! Damage reduced by 50%`);
  
  gameState.turn = 1 - gameState.turn;
  setTimeout(() => {
    hud.classList.remove('defending');
    sprite.classList.remove('defending');
    executeTurn();
  }, 600);
}

// ===================================================================
// AI ACTIONS & ABILITY EXECUTION
// ===================================================================

async function executeAIActions(attacker) {
  const { p1, p2 } = gameState.currentMatch;
  const defender = attacker === p1 ? p2 : p1;
  
  if (Math.random() < 0.8) {
    const abilities = attacker.abilities.filter(a => !a.isHidden);
    const ability = abilities[Math.floor(Math.random() * abilities.length)] || {
      name: 'Tackle',
      shortEffect: 'A basic attack.'
    };
    await executeAbility(attacker, ability);
  } else {
    gameState.defending = attacker;
    log('defend', `${attacker.name} defends!`);
  }
  
  if (gameState.battleActive) {
    gameState.turn = 1 - gameState.turn;
    setTimeout(() => executeTurn(), 600);
  }
}

async function executeAbility(user, ability) {
  log('ability', `${user.name} used ${ability.name}!`);
  log('ability', `${ability.shortEffect}`);
  
  const effect = ability.shortEffect.toLowerCase();
  const { p1, p2 } = gameState.currentMatch;
  const opponent = user === p1 ? p2 : p1;
  
  const power = effect.includes('boost') || effect.includes('increase') ? 0 : 
                effect.includes('heavy') ? 80 : 
                effect.includes('strong') ? 60 : 40;
  
  if (power > 0) {
    let damage = calculateCustomDamage(power, user, opponent);
    
    if (gameState.defending === opponent) {
      damage = Math.floor(damage * 0.5);
      log('defend', `${opponent.name} defended! Damage reduced to ${damage}`);
    }
    
    opponent.currentHp = Math.max(0, opponent.currentHp - damage);
    log('damage', `Dealt ${damage} damage!`);
    showDamageNumber(opponent, damage);
    updateHpBar(opponent);
    
    if (opponent.currentHp === 0) await handleFaint(opponent);
  } else {
    if (effect.includes('heal') || effect.includes('recover')) {
      const heal = Math.floor(user.stats.hp * 0.3);
      user.currentHp = Math.min(user.stats.hp, user.currentHp + heal);
      log('heal', `${user.name} restored ${heal} HP!`);
      updateHpBar(user);
    } else if (effect.includes('attack') || effect.includes('boost')) {
      log('ability', `${user.name}'s attack power increased!`);
    }
  }
}

function calculateCustomDamage(power, attacker, defender) {
  const level = 50;
  const attackStat = attacker.stats.attack;
  const defenseStat = defender.stats.defense;
  
  let damage = Math.floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2);
  const effectiveness = calculateEffectiveness('normal', defender.types);
  damage = Math.floor(damage * effectiveness);
  damage = Math.floor(damage * (0.85 + Math.random() * 0.15));
  return damage;
}

function calculateEffectiveness(moveType, defenderTypes) {
  const chart = {
    fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
    water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
    grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
    electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
    ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0, dragon: 0.5 },
    flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
    bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
    ghost: { psychic: 2, ghost: 2, dark: 0.5, steel: 0.5, normal: 0 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
    steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
    fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
    normal: { rock: 0.5, ghost: 0, steel: 0.5 }
  };
  
  let multiplier = 1;
  defenderTypes.forEach(type => {
    if (chart[moveType]?.[type]) {
      multiplier *= chart[moveType][type];
    }
  });
  
  if (multiplier > 1) log('effectiveness', "It's super effective!");
  else if (multiplier < 1 && multiplier > 0) log('effectiveness', "It's not very effective...");
  else if (multiplier === 0) log('effectiveness', "No effect!");
  
  return multiplier;
}

// ===================================================================
// BATTLE RESOLUTION
// ===================================================================

async function handleFaint(faintedPokemon) {
  gameState.battleActive = false;
  log('faint', `${faintedPokemon.name} fainted!`);
  
  const { p1, p2 } = gameState.currentMatch;
  const winner = faintedPokemon === p1 ? p2 : p1;
  
  winner.wins++;
  faintedPokemon.losses++;
  
  log('battle', `${winner.name} wins the match!`);
  
  updateStandings();
  
  setTimeout(() => {
    if (gameState.matchIndex < gameState.matchups.length) {
      startNextMatch();
    } else {
      endTournament();
    }
  }, 2000);
}

async function endTournament() {
  gameState.isComplete = true;
  gameState.battleActive = false;
  
  const sorted = [...gameState.participants].sort((a, b) => b.wins - a.wins);
  const player = sorted.find(p => p.isPlayer);
  const rank = sorted.indexOf(player) + 1;
  
  const isVictory = rank === 1;
  const rewards = calculateRewards();
  
  UI.resultTitle.textContent = isVictory ? '🏆 TOURNAMENT CHAMPION!' : 'TOURNAMENT COMPLETE';
  UI.resultMessage.innerHTML = isVictory 
    ? `Perfect! ${player.wins}/${gameState.matchups.length} wins!<br><br>💰 Earned ${rewards.total} PCT Tokens!`
    : `Final Rank: #${rank} with ${player.wins} wins<br><br>💰 Earned ${rewards.total} PCT Tokens!`;
  
  UI.resultScreen.className = `result-screen ${isVictory ? 'victory' : 'defeat'}`;
  UI.resultScreen.classList.remove('hidden');
  
  document.getElementById('returnBtn').onclick = () => {
    window.location.href = 'tournament.html';
  };
  
  log('battle', `🏆 Tournament ended! Your rank: #${rank}`);
}

function calculateRewards() {
  const player = gameState.participants.find(p => p.isPlayer);
  const baseReward = { easy: 10, normal: 25, hard: 50, insane: 100 }[gameState.difficulty];
  const winBonus = player.wins * baseReward;
  const perfectBonus = (player.wins === gameState.matchups.length) ? baseReward * 5 : 0;
  
  return {
    base: baseReward,
    wins: winBonus,
    perfect: perfectBonus,
    total: baseReward + winBonus + perfectBonus
  };
}

function renderBattle() {
  const { p1, p2 } = gameState.currentMatch;
  const player = p1.isPlayer ? p1 : p2;
  const enemy = p1.isPlayer ? p2 : p1;
  
  UI.player.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani-back/${player.name.toLowerCase()}.gif`;
  UI.enemy.sprite.src = `https://play.pokemonshowdown.com/sprites/xyani/${enemy.name.toLowerCase()}.gif`;
  
  UI.player.sprite.onerror = () => {
    UI.player.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani-back/substitute.gif';
  };
  
  UI.enemy.sprite.onerror = () => {
    UI.enemy.sprite.src = 'https://play.pokemonshowdown.com/sprites/xyani/substitute.gif';
  };
  
  UI.player.name.textContent = `#${player.id} ${player.name}`;
  UI.enemy.name.textContent = `#${enemy.id} ${enemy.name}`;
  
  updateHpBar(player);
  updateHpBar(enemy);
}

function updateHpBar(pokemon) {
  const target = pokemon.isPlayer ? UI.player : UI.enemy;
  const percentage = (pokemon.currentHp / pokemon.stats.hp) * 100;
  
  target.hpBar.style.width = `${percentage}%`;
  target.hpText.textContent = `HP: ${pokemon.currentHp}/${pokemon.stats.hp}`;
  
  if (percentage > 50) {
    target.hpBar.style.background = 'linear-gradient(90deg, #00ff9d, #00c474)';
  } else if (percentage > 25) {
    target.hpBar.style.background = 'linear-gradient(90deg, #ffd93d, #ffb800)';
  } else {
    target.hpBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ff3b3b)';
  }
}

function updateStandings() {
  const sorted = [...gameState.participants].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  
  UI.standings.innerHTML = '';
  sorted.forEach((pokemon, index) => {
    const item = document.createElement('div');
    item.className = 'standings-item';
    
    if (pokemon.isPlayer) item.classList.add('player');
    
    if (gameState.currentMatch) {
      const { p1, p2 } = gameState.currentMatch;
      if (p1 === pokemon || p2 === pokemon) item.classList.add('current');
    }
    
    item.innerHTML = `
      <span>${index + 1}. ${pokemon.name}</span>
      <span>${pokemon.wins}-${pokemon.losses}</span>
    `;
    
    UI.standings.appendChild(item);
  });
}

function log(type, message, extra = {}) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  UI.battleLog.appendChild(entry);
  UI.battleLog.scrollTop = UI.battleLog.scrollHeight;
}

function showDamageNumber(pokemon, damage) {
  const sprite = pokemon.isPlayer ? UI.player.sprite : UI.enemy.sprite;
  const rect = sprite.getBoundingClientRect();
  
  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';
  damageEl.textContent = `-${damage}`;
  damageEl.style.color = damage > 50 ? '#ff3b3b' : '#ffd93d';
  damageEl.style.left = `${rect.left + rect.width / 2}px`;
  damageEl.style.top = `${rect.top}px`;
  damageEl.style.position = 'fixed';
  
  document.body.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1500);
}