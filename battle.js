// ===================================================================
// BATTLE ENGINE - Blockchain Enhanced (FIXED FOR YOUR CONFIG)
// ===================================================================

const gameState = {
  participants: [],
  matchups: [],
  currentBattle: null,
  matchIndex: 0,
  battleActive: false,
  difficulty: 'normal',
  isComplete: false,
  abilityCache: new Map(),
  tournamentId: null
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
  loading: document.getElementById('loadingOverlay'),
  arena: document.getElementById('battleArena')
};

// Type effectiveness chart (unchanged)
const TYPE_CHART = {
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

const ABILITY_TYPE_MAP = {
  'flamethrower': 'fire', 'ember': 'fire', 'fire blast': 'fire', 'fire punch': 'fire',
  'hydro pump': 'water', 'surf': 'water', 'water gun': 'water', 'waterfall': 'water',
  'thunderbolt': 'electric', 'thunder': 'electric', 'thunder punch': 'electric',
  'ice beam': 'ice', 'blizzard': 'ice', 'ice punch': 'ice',
  'solar beam': 'grass', 'razor leaf': 'grass', 'vine whip': 'grass',
  'psychic': 'psychic', 'psybeam': 'psychic',
  'shadow ball': 'ghost', 'lick': 'ghost',
  'dragon claw': 'dragon', 'dragon breath': 'dragon',
  'dark pulse': 'dark', 'bite': 'dark', 'crunch': 'dark',
  'flash cannon': 'steel', 'iron head': 'steel',
  'moonblast': 'fairy', 'play rough': 'fairy',
  'earthquake': 'ground', 'dig': 'ground',
  'brave bird': 'flying', 'aerial ace': 'flying',
  'close combat': 'fighting', 'karate chop': 'fighting',
  'sludge bomb': 'poison', 'poison jab': 'poison',
  'rock slide': 'rock', 'stone edge': 'rock',
  'zen headbutt': 'psychic', 'confusion': 'psychic',
  'tackle': 'normal', 'quick attack': 'normal', 'hyper beam': 'normal'
};

// ===================================================================
// INITIALIZATION (FIXED)
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    UI.loading.classList.remove('hidden');
    
    // Get tournament ID from URL params
    const urlParams = new URLSearchParams(window.location.search);
    gameState.tournamentId = urlParams.get('tournamentId');
    
    if (!gameState.tournamentId) {
      // Try to get from localStorage (backward compatibility)
      gameState.tournamentId = localStorage.getItem('currentTournamentId');
    }
    
    if (!gameState.tournamentId) {
      console.warn('⚠️ No tournament ID found. Tournament results cannot be saved to blockchain.');
    } else {
      console.log('🎯 Tournament ID:', gameState.tournamentId);
    }
    
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
  
  if (!playerData.name || !playerData.abilities) {
    throw new Error('Invalid Pokemon data: missing name or abilities');
  }
  
  const playerPokemon = await loadPokemonMetadata(playerData, true);
  gameState.participants.push(playerPokemon);
  
  const opponents = await generateOpponents(opponentCount);
  gameState.participants.push(...opponents);
  
  generateMatchups();
  
  UI.difficulty.textContent = gameState.difficulty.toUpperCase();
  UI.totalMatches.textContent = gameState.matchups.length;
  
  log('battle', `🏆 Tournament begins! ${gameState.participants.length} participants`);
  log('battle', `${gameState.matchups.length} matches scheduled`);
}

// ===================================================================
// CRITICAL FIX: TOURNAMENT COMPLETION WITH BLOCKCHAIN
// ===================================================================

async function endTournament() {
  gameState.isComplete = true;
  gameState.battleActive = false;

  const sorted = [...gameState.participants].sort((a, b) => b.wins - a.wins);
  const player = sorted.find(p => p.isPlayer);
  const rank = sorted.indexOf(player) + 1;

  const isVictory = rank === 1;
  const rewards = calculateRewards();

  // Show processing screen
  UI.resultTitle.textContent = 'Processing Tournament...';
  UI.resultMessage.textContent = 'Submitting results to blockchain...';
  UI.resultScreen.classList.remove('hidden');

  try {
    // Check if we have a tournament ID
    if (!gameState.tournamentId) {
      throw new Error('No tournament ID found. Cannot save results to blockchain.');
    }

    // Check if wallet is connected
    if (!window.wallet || !window.wallet.getAccount || !window.wallet.getAccount()) {
      throw new Error('Wallet not connected. Please connect your wallet to claim rewards.');
    }

    // Get provider and signer using your wallet.js
    const provider = await window.wallet.getProvider();
    const signer = await window.wallet.getSigner();
    const account = window.wallet.getAccount();

    console.log(' Submitting tournament results for:', account);
    console.log(' Tournament ID:', gameState.tournamentId);
    console.log(' Wins:', player.wins);

    // Check if tournament contract is configured
    if (!window.CONTRACTS?.TOURNAMENT || !window.ABIS?.TOURNAMENT) {
      throw new Error('Tournament contract not configured in config.js');
    }

    // Initialize tournament contract (using your config format)
    const tournamentContract = new ethers.Contract(
      window.CONTRACTS.TOURNAMENT, // Uses "TOURNAMENT" not "TOURNAMENT_ADDRESS"
      window.ABIS.TOURNAMENT,      // Uses "TOURNAMENT" not "TOURNAMENT_ABI"
      signer
    );

    // Calculate perfect bonus
    const totalPlayerMatches = gameState.participants.length - 1;
    const isPerfect = player.wins === totalPlayerMatches;

    console.log(`✅ Completing tournament with ${player.wins} wins (Perfect: ${isPerfect})`);

    // Complete tournament on-chain
    UI.resultMessage.textContent = 'Submitting tournament results...';
    const completeTx = await tournamentContract.completeTournament(
      gameState.tournamentId,
      player.wins,
      isPerfect
    );

    await completeTx.wait();
    console.log('✅ Tournament completed on-chain');

    // Claim reward
    UI.resultMessage.textContent = 'Claiming your PKCN reward...';
    const claimTx = await tournamentContract.claimReward(gameState.tournamentId);
    await claimTx.wait();

    console.log('✅ Reward claimed successfully');

    // Update local storage with tournament history
    const history = JSON.parse(localStorage.getItem('tournamentHistory') || '[]');
    if (!history.includes(gameState.tournamentId)) {
      history.push(gameState.tournamentId);
      localStorage.setItem('tournamentHistory', JSON.stringify(history));
    }

    // Clear current tournament from storage
    localStorage.removeItem('currentTournamentId');
    localStorage.removeItem('currentTournament');

    // Update balance display
    await updateBalanceDisplay();

    // Show success results
    showTournamentResult(isVictory, rank, rewards.total, true, gameState.tournamentId);

  } catch (error) {
    console.error('❌ Failed to claim rewards:', error);
    
    let errorMessage = 'Transaction failed. ';
    if (error.message.includes('user rejected')) {
      errorMessage = 'Transaction rejected. Please approve the transaction to claim rewards.';
    } else if (error.message.includes('already claimed')) {
      errorMessage = 'Rewards already claimed. Check your PKCN balance.';
    } else if (error.message.includes('Tournament not complete')) {
      errorMessage = 'Tournament not completed on-chain yet. Please try again later.';
    } else if (error.message.includes('No tournament ID')) {
      errorMessage = 'No tournament ID found. Your results are saved locally but not on blockchain.';
    } else if (error.message.includes('Wallet not connected')) {
      errorMessage = 'Wallet not connected. Connect your wallet to claim rewards.';
    } else if (error.message.includes('Tournament contract not configured')) {
      errorMessage = 'Tournament contract not configured. Please check config.js.';
    } else {
      errorMessage += error.message.substring(0, 100);
    }
    
    // Still show results but indicate manual claiming needed
    showTournamentResult(isVictory, rank, rewards.total, false, gameState.tournamentId, errorMessage);
  }
}

// ===================================================================
// UPDATED RESULT DISPLAY FUNCTION
// ===================================================================

function showTournamentResult(isVictory, rank, totalReward, success = true, tournamentId = null, errorMessage = null) {
  UI.resultTitle.textContent = isVictory ? '🏆 TOURNAMENT CHAMPION!' : 'TOURNAMENT COMPLETE';
  
  const player = gameState.participants.find(p => p.isPlayer);
  let message = '';
  
  if (success) {
    message = `${isVictory ? 'Perfect performance!' : 'Good effort!'}<br><br>
              Final Rank: #${rank} with ${player.wins} wins<br>
              💰 Earned ${totalReward} PKCN Tokens!`;
    
    if (tournamentId) {
      message += `<br>🏷️ Tournament ID: ${tournamentId.substring(0, 20)}...`;
    }
  } else {
    message = `Final Rank: #${rank} with ${player.wins} wins<br><br>
              ${errorMessage || '⚠️ Rewards not claimed automatically. Please claim manually from your profile.'}`;
    
    if (tournamentId) {
      message += `<br><br>Tournament ID: ${tournamentId.substring(0, 20)}...`;
      message += `<br>Save this ID to claim rewards later from your profile.`;
    }
  }
  
  UI.resultMessage.innerHTML = message;
  UI.resultScreen.querySelector('.result-content').className = `result-content ${isVictory ? 'victory' : 'defeat'}`;
  UI.resultScreen.classList.remove('hidden');
  
  // Set up return button
  const returnBtn = document.getElementById('returnBtn');
  if (returnBtn) {
    returnBtn.onclick = () => {
      window.location.href = 'tournament.html';
    };
  }
  
  log('battle', `🎉 Tournament ended! Rank: #${rank}, Wins: ${player.wins}/${gameState.participants.length - 1}, Rewards: ${totalReward} PKCN`);
}

// ===================================================================
// BALANCE UPDATE FUNCTION (USES YOUR WALLET.JS)
// ===================================================================

async function updateBalanceDisplay() {
  try {
    if (!window.wallet || !window.wallet.updateBalanceDisplayIfNeeded) return;
    
    await window.wallet.updateBalanceDisplayIfNeeded();
    console.log('✅ Balance display updated');
  } catch (error) {
    console.warn('Failed to update balance display:', error);
  }
}

// ===================================================================
// REWARD CALCULATION (UNCHANGED)
// ===================================================================

function calculateRewards() {
  const player = gameState.participants.find(p => p.isPlayer);
  const totalPlayerMatches = gameState.participants.length - 1;
  
  const baseReward = { easy: 10, normal: 25, hard: 50, insane: 100 }[gameState.difficulty];
  const winBonus = player.wins * baseReward;
  const isPerfect = player.wins === totalPlayerMatches;
  const perfectBonus = isPerfect ? baseReward * 5 : 0;
  
  console.log(`[Rewards] Wins: ${player.wins}/${totalPlayerMatches}, Perfect: ${isPerfect}, Bonus: ${perfectBonus}`);
  
  return {
    base: baseReward,
    wins: winBonus,
    perfect: perfectBonus,
    total: baseReward + winBonus + perfectBonus
  };
}

// ===================================================================
// REST OF THE BATTLE FUNCTIONS (UNCHANGED - KEEP ALL EXISTING CODE BELOW)
// ===================================================================

// HP VALIDATION UTILITY
function ensureNumber(value, defaultValue = 100) {
  const num = Number(value);
  return (isNaN(num) || num < 0) ? defaultValue : Math.floor(num);
}

async function loadPokemonMetadata(pokemonData, isPlayer) {
  const name = pokemonData.name.toLowerCase();
  let pokemonRes;
  
  try {
    pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    if (!pokemonRes.ok) throw new Error(`Pokemon ${name} not found`);
  } catch (e) {
    throw new Error(`Failed to fetch Pokemon data: ${e.message}`);
  }
  
  const pokemon = await pokemonRes.json();
  const ivs = {
    hp: Math.floor(Math.random() * 32),
    attack: Math.floor(Math.random() * 32),
    defense: Math.floor(Math.random() * 32),
    specialAttack: Math.floor(Math.random() * 32),
    specialDefense: Math.floor(Math.random() * 32),
    speed: Math.floor(Math.random() * 32)
  };
  
  const getBaseStat = (statName) => {
    const stat = pokemon.stats.find(s => s.stat.name === statName);
    return stat ? stat.base_stat : 50;
  };
  
  const stats = {
    hp: calculateStat(getBaseStat('hp'), 50, ivs.hp, true),
    attack: calculateStat(getBaseStat('attack'), 50, ivs.attack),
    defense: calculateStat(getBaseStat('defense'), 50, ivs.defense),
    specialAttack: calculateStat(getBaseStat('special-attack'), 50, ivs.specialAttack),
    specialDefense: calculateStat(getBaseStat('special-defense'), 50, ivs.specialDefense),
    speed: calculateStat(getBaseStat('speed'), 50, ivs.speed)
  };
  
  let abilities = [];
  if (pokemonData.abilities && Array.isArray(pokemonData.abilities) && pokemonData.abilities.length > 0) {
    abilities = await Promise.all(pokemonData.abilities.map(async (ab) => {
      const abilityName = ab.name || ab;
      const isHidden = ab.isHidden || false;
      
      try {
        const abilityData = await fetchAbilityFromName(abilityName);
        return {
          name: abilityName.replace(/-/g, ' '),
          isHidden: isHidden,
          shortEffect: abilityData.shortEffect,
          effect: abilityData.effect
        };
      } catch (e) {
        return {
          name: abilityName.replace(/-/g, ' '),
          isHidden: isHidden,
          shortEffect: '',
          effect: ''
        };
      }
    }));
  } else {
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
          effect: '',
          shortEffect: ''
        };
      }
    }));
  }
  
  const bst = pokemon.stats.reduce((sum, s) => sum + (s.base_stat || 0), 0);
  const rarity = calculateRarityFromBST(bst);
  
  return {
    id: pokemon.id,
    name: pokemonData.name,
    types: pokemon.types.map(t => t.type.name),
    abilities,
    stats,
    ivs,
    maxHp: stats.hp,
    isPlayer,
    wins: 0,
    losses: 0,
    rarity
  };
}

function calculateStat(baseStat, level, iv, isHp = false) {
  if (isHp) {
    return Math.floor((2 * baseStat + iv) * level / 100) + level + 10;
  }
  return Math.floor(((2 * baseStat + iv) * level / 100) + 5);
}

function calculateRarityFromBST(bst) {
  if (bst >= 580) return 'legendary';
  if (bst >= 500) return 'epic';
  if (bst >= 420) return 'rare';
  if (bst >= 340) return 'uncommon';
  return 'common';
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
      effect: englishEntry?.effect || '',
      shortEffect: englishEntry?.short_effect || ''
    };
    
    gameState.abilityCache.set(url, result);
    return result;
  } catch (e) {
    return {
      effect: '',
      shortEffect: ''
    };
  }
}

async function fetchAbilityFromName(name) {
  const cacheKey = `ability-${name.toLowerCase()}`;
  if (gameState.abilityCache.has(cacheKey)) {
    return gameState.abilityCache.get(cacheKey);
  }
  
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/ability/${name.toLowerCase()}`);
    if (!res.ok) throw new Error(`Ability ${name} not found`);
    
    const data = await res.json();
    const englishEntry = data.effect_entries?.find(e => e.language.name === 'en');
    
    const result = {
      effect: englishEntry?.effect || '',
      shortEffect: englishEntry?.short_effect || ''
    };
    
    gameState.abilityCache.set(cacheKey, result);
    return result;
  } catch (e) {
    return {
      effect: '',
      shortEffect: ''
    };
  }
}

async function generateOpponents(count) {
  const rarityDist = {
    easy: { common: 70, uncommon: 25, rare: 5, epic: 0, legendary: 0 },
    normal: { common: 30, uncommon: 35, rare: 25, epic: 10, legendary: 0 },
    hard: { common: 10, uncommon: 20, rare: 35, epic: 30, legendary: 5 },
    insane: { common: 0, uncommon: 10, rare: 25, epic: 40, legendary: 25 }
  }[gameState.difficulty];
  
  const usedIds = new Set([gameState.participants[0]?.id]);
  const opponents = [];
  
  for (let i = 0; i < count; i++) {
    const opponent = await generateUniquePokemon(rarityDist, usedIds);
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
    const rarity = calculateRarityFromBST(bst);
    
    if (rarityDist[rarity] > 0) {
      pool.push({ name: species.name, rarity, weight: rarityDist[rarity], bst });
    }
  }
  
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * total;
  
  for (const pokemon of pool) {
    random -= pokemon.weight;
    if (random <= 0) {
      usedIds.add(pokemon.name);
      const data = await loadPokemonMetadata({ name: pokemon.name }, false);
      log('battle', `👤 Generated opponent: ${data.name} (${data.rarity}, BST: ${pokemon.bst})`);
      return data;
    }
  }
  
  return loadPokemonMetadata({ name: 'magikarp' }, false);
}

function generateMatchups() {
  const matchups = [];
  const n = gameState.participants.length;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchups.push({ p1Index: i, p2Index: j });
    }
  }
  
  gameState.matchups = matchups.sort(() => Math.random() - 0.5);
  gameState.matchIndex = 0;
}

function createBattlePokemon(metadata) {
  const battleMon = {
    ...metadata,
    battleId: `${metadata.id}_${Date.now()}_${Math.random()}`
  };
  
  if (battleMon.maxHp === undefined || battleMon.maxHp === null || isNaN(battleMon.maxHp)) {
    console.error(`[HP BUG] Invalid maxHp for ${battleMon.name}, reconstructing from stats`);
    battleMon.maxHp = ensureNumber(battleMon.stats?.hp, 100);
  }
  
  battleMon.currentHp = ensureNumber(battleMon.maxHp);
  
  console.log(`[BattleState] ${battleMon.name} - HP: ${battleMon.currentHp}/${battleMon.maxHp}`);
  
  return battleMon;
}

function startNextMatch() {
  if (gameState.matchIndex >= gameState.matchups.length) {
    endTournament();
    return;
  }
  
  const matchup = gameState.matchups[gameState.matchIndex];
  const p1Meta = gameState.participants[matchup.p1Index];
  const p2Meta = gameState.participants[matchup.p2Index];
  
  gameState.currentBattle = {
    p1: createBattlePokemon(p1Meta),
    p2: createBattlePokemon(p2Meta),
    turn: 0,
    round: 1,
    defending: null,
    actionsThisRound: 0
  };
  
  if (gameState.currentBattle.p1.currentHp !== gameState.currentBattle.p1.maxHp ||
      gameState.currentBattle.p2.currentHp !== gameState.currentBattle.p2.maxHp) {
    console.error('[CRITICAL HP BUG] HP not reset to max!', gameState.currentBattle);
  }
  
  gameState.battleActive = true;
  gameState.matchIndex++;
  
  UI.currentMatch.textContent = gameState.matchIndex;
  
  log('battle', `⚔️ Match ${gameState.matchIndex}: ${p1Meta.name} vs ${p2Meta.name}`);
  log('battle', `📊 Round ${gameState.currentBattle.round} begins!`);
  log('battle', `❤️ HP Reset: ${gameState.currentBattle.p1.name} → ${gameState.currentBattle.p1.currentHp}/${gameState.currentBattle.p1.maxHp}`);
  log('battle', `❤️ HP Reset: ${gameState.currentBattle.p2.name} → ${gameState.currentBattle.p2.currentHp}/${gameState.currentBattle.p2.maxHp}`);
  
  UI.arena.setAttribute('data-round', gameState.currentBattle.round);
  
  renderBattle();
  updateStandings();
  
  setTimeout(() => executeTurn(), 800);
}

function executeTurn() {
  if (!gameState.battleActive || !gameState.currentBattle) return;
  
  const { p1, p2 } = gameState.currentBattle;
  
  if (gameState.currentBattle.actionsThisRound === 0) {
    gameState.currentBattle.defending = null;
    removeDefendVisuals();
  }
  
  const currentBattler = gameState.currentBattle.turn === 0 ? p1 : p2;
  
  if (currentBattler.isPlayer) {
    enablePlayerActions(currentBattler);
  } else {
    setTimeout(() => executeAIActions(currentBattler), 1200);
  }
}

function enablePlayerActions(pokemon) {
  UI.abilityButtons.innerHTML = '';
  const usableAbilities = pokemon.abilities;
  
  usableAbilities.forEach((ability) => {
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    btn.innerHTML = `<div style="font-weight: 800;">${ability.name}</div>`;
    btn.onclick = () => playerUseAbility(ability);
    UI.abilityButtons.appendChild(btn);
  });
  
  UI.defendBtn.onclick = () => playerDefend();
  UI.actionSelection.classList.remove('hidden');
  log('battle', `🎮 Your turn! Choose an ability or defend.`);
}

async function playerUseAbility(ability) {
  UI.actionSelection.classList.add('hidden');
  const { p1, p2 } = gameState.currentBattle;
  const user = gameState.currentBattle.turn === 0 ? p1 : p2;
  
  await executeAbility(user, ability);
  completeAction();
}

async function playerDefend() {
  UI.actionSelection.classList.add('hidden');
  
  const currentBattler = gameState.currentBattle.turn === 0 ? gameState.currentBattle.p1 : gameState.currentBattle.p2;
  gameState.currentBattle.defending = currentBattler;
  
  addDefendVisuals(currentBattler);
  
  const outcome = calculateDefenseOutcome(currentBattler);
  log('defend', `🛡️ ${currentBattler.name} takes a defensive stance! ${getDefenseMessage(outcome)}`);
  
  completeAction();
}

function completeAction() {
  gameState.currentBattle.turn = 1 - gameState.currentBattle.turn;
  gameState.currentBattle.actionsThisRound++;
  
  if (gameState.currentBattle.actionsThisRound >= 2) {
    gameState.currentBattle.actionsThisRound = 0;
    gameState.currentBattle.round++;
    UI.arena.setAttribute('data-round', gameState.currentBattle.round);
    
    setTimeout(() => {
      if (gameState.battleActive) {
        log('battle', `📊 Round ${gameState.currentBattle.round} begins!`);
        executeTurn();
      }
    }, 1000);
  } else {
    setTimeout(() => executeTurn(), 600);
  }
}

async function executeAIActions(attacker) {
  const { p1, p2 } = gameState.currentBattle;
  const defender = attacker === p1 ? p2 : p1;
  
  const healthPercent = attacker.currentHp / attacker.maxHp;
  
  if (healthPercent < 0.3 || Math.random() < 0.25) {
    gameState.currentBattle.defending = attacker;
    addDefendVisuals(attacker);
    const outcome = calculateDefenseOutcome(attacker);
    log('defend', `🛡️ ${attacker.name} defends! ${getDefenseMessage(outcome)}`);
  } else {
    const abilities = attacker.abilities;
    const ability = abilities[Math.floor(Math.random() * abilities.length)] || {
      name: 'Tackle',
      shortEffect: ''
    };
    await executeAbility(attacker, ability);
  }
  
  completeAction();
}

async function executeAbility(user, ability) {
  log('ability', `💥 ${user.name} used ${ability.name}!`);
  
  const moveType = getAbilityType(ability.name, user.types);
  applyAttackAnimation(user, moveType);
  
  const { p1, p2 } = gameState.currentBattle;
  const opponent = user === p1 ? p2 : p1;
  
  if (!calculateHitChance(user, opponent)) {
    log('effectiveness', '💨 Attack missed!');
    playMissAnimation(opponent);
    return;
  }
  
  const effect = ability.shortEffect.toLowerCase();
  
  if (effect.includes('heal') || effect.includes('recover')) {
    const healAmount = Math.floor(user.maxHp * 0.15 + user.stats.specialAttack * 0.05);
    const actualHeal = Math.min(healAmount, Math.floor(user.maxHp * 0.5));
    
    const currentHp = ensureNumber(user.currentHp);
    const maxHp = ensureNumber(user.maxHp);
    
    user.currentHp = Math.min(maxHp, currentHp + actualHeal);
    log('heal', `💚 ${user.name} restored ${actualHeal} HP!`);
    updateHpBar(user);
    return;
  }
  
  let power = 60;
  if (effect.includes('heavy') || effect.includes('powerful')) power = 90;
  else if (effect.includes('strong')) power = 75;
  else if (effect.includes('light') || effect.includes('weak')) power = 40;
  
  let damage = calculateDamage(power, moveType, user, opponent);
  
  if (gameState.currentBattle.defending === opponent) {
    const outcome = calculateDefenseOutcome(opponent);
    damage = applyDefenseReduction(damage, outcome);
  }
  
  if (isCriticalHit()) {
    damage = Math.floor(damage * 1.5);
    log('effectiveness', '❗ CRITICAL HIT!');
  }
  
  opponent.currentHp = Math.max(0, ensureNumber(opponent.currentHp) - damage);
  log('damage', `💢 Dealt ${damage} damage!`);
  showDamageNumber(opponent, damage);
  updateHpBar(opponent);
  
  playHitAnimation(opponent);
  
  if (opponent.currentHp === 0) await handleFaint(opponent);
}

function getAbilityType(abilityName, pokemonTypes) {
  const name = abilityName.toLowerCase();
  for (const [key, type] of Object.entries(ABILITY_TYPE_MAP)) {
    if (name.includes(key)) return type;
  }
  return pokemonTypes[0];
}

function calculateDamage(power, moveType, attacker, defender) {
  const level = 50;
  const attackStat = attacker.stats.attack;
  const defenseStat = defender.stats.defense;
  
  let damage = Math.floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2);
  const effectiveness = calculateTypeEffectiveness(moveType, defender.types);
  damage = Math.floor(damage * effectiveness);
  damage = Math.floor(damage * (0.85 + Math.random() * 0.15));
  return Math.max(1, damage);
}

function calculateTypeEffectiveness(moveType, defenderTypes) {
  if (!moveType || !TYPE_CHART[moveType]) return 1;
  
  let multiplier = 1;
  defenderTypes.forEach(type => {
    if (TYPE_CHART[moveType]?.[type]) {
      multiplier *= TYPE_CHART[moveType][type];
    }
  });
  
  if (multiplier > 1.25) log('effectiveness', "✨ It's super effective!");
  else if (multiplier < 1 && multiplier > 0) log('effectiveness', "It's not very effective...");
  else if (multiplier === 0) log('effectiveness', "❌ No effect!");
  
  return multiplier;
}

function calculateHitChance(attacker, defender) {
  const speedDiff = attacker.stats.speed - defender.stats.speed;
  const baseHit = 0.9;
  const hitRate = Math.min(0.95, baseHit + (speedDiff * 0.002));
  return Math.random() < hitRate;
}

function isCriticalHit() {
  return Math.random() < 0.06;
}

function calculateDefenseOutcome(pokemon) {
  const rand = Math.random();
  if (rand < 0.1) return 'parry';
  if (rand < 0.3) return 'block';
  return 'defend';
}

function applyDefenseReduction(damage, outcome) {
  switch(outcome) {
    case 'parry':
      log('defend', '⚔️ Perfect parry! No damage taken!');
      return 0;
    case 'block':
      log('defend', '🛡️ Attack blocked! Damage reduced by 50%');
      return Math.floor(damage * 0.5);
    default:
      return Math.floor(damage * 0.7);
  }
}

function getDefenseMessage(outcome) {
  switch(outcome) {
    case 'parry': return 'Perfect parry active!';
    case 'block': return 'Block stance active!';
    default: return 'Defense stance active!';
  }
}

async function handleFaint(faintedPokemon) {
  gameState.battleActive = false;
  log('faint', `💀 ${faintedPokemon.name} fainted!`);
  
  const { p1, p2 } = gameState.currentBattle;
  const winner = faintedPokemon === p1 ? p2 : p1;
  
  const winnerMeta = gameState.participants.find(p => p.id === winner.id);
  const faintedMeta = gameState.participants.find(p => p.id === faintedPokemon.id);
  
  if (winnerMeta) winnerMeta.wins++;
  if (faintedMeta) faintedMeta.losses++;
  
  log('battle', `🏆 ${winner.name} wins the match!`);
  
  updateStandings();
  
  setTimeout(() => {
    if (gameState.matchIndex < gameState.matchups.length) {
      startNextMatch();
    } else {
      endTournament();
    }
  }, 2500);
}

function renderBattle() {
  const { p1, p2 } = gameState.currentBattle;
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
  try {
    const maxHp = ensureNumber(pokemon.maxHp, 100);
    const currentHp = ensureNumber(pokemon.currentHp, maxHp);
    const target = pokemon.isPlayer ? UI.player : UI.enemy;
    
    const percentage = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
    
    target.hpBar.style.width = `${percentage}%`;
    target.hpText.textContent = `HP: ${currentHp}/${maxHp}`;
    
    // Force DOM reflow
    target.hpBar.offsetHeight;
    
    // Color based on health
    if (percentage > 50) {
      target.hpBar.style.background = 'linear-gradient(90deg, #00ff9d, #00c474)';
    } else if (percentage > 25) {
      target.hpBar.style.background = 'linear-gradient(90deg, #ffd93d, #ffb800)';
    } else {
      target.hpBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ff3b3b)';
    }
  } catch (error) {
    console.error('updateHpBar error (emergency fallback):', error, pokemon);
    const target = pokemon.isPlayer ? UI.player : UI.enemy;
    target.hpText.textContent = 'HP: ERROR/100';
  }
}

function updateStandings() {
  const sorted = [...gameState.participants].sort((a, b) => b.wins - a.wins);
  
  UI.standings.innerHTML = '';
  sorted.forEach((pokemon, index) => {
    const item = document.createElement('div');
    item.className = 'standings-item';
    
    if (pokemon.isPlayer) item.classList.add('player');
    
    if (gameState.currentBattle) {
      const currentIds = [gameState.currentBattle.p1.id, gameState.currentBattle.p2.id];
      if (currentIds.includes(pokemon.id)) item.classList.add('current');
    }
    
    const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    
    item.innerHTML = `
      <span style="font-weight: 800;">${rankEmoji} ${pokemon.name}</span>
      <span style="opacity: 0.8;">${pokemon.wins}W-${pokemon.losses}L</span>
    `;
    
    UI.standings.appendChild(item);
  });
}

function log(type, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  UI.battleLog.appendChild(entry);
  UI.battleLog.scrollTop = UI.battleLog.scrollHeight;
  
  if (UI.battleLog.children.length > 60) {
    UI.battleLog.removeChild(UI.battleLog.firstChild);
  }
}

function showDamageNumber(pokemon, damage) {
  const wrapper = pokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';
  damageEl.textContent = `-${damage}`;
  damageEl.style.color = damage > 75 ? '#ff3b3b' : '#ffd93d';
  
  const rect = wrapper.getBoundingClientRect();
  const arenaRect = UI.arena.getBoundingClientRect();
  damageEl.style.left = `${rect.left + rect.width / 2 - arenaRect.left}px`;
  damageEl.style.top = `${rect.top - arenaRect.top - 20}px`;
  damageEl.style.position = 'absolute';
  
  UI.arena.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1500);
}

function applyAttackAnimation(attacker, moveType) {
  const wrapper = attacker.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.sprite-container');
  
  sprite.className = 'sprite-container';
  
  setTimeout(() => {
    sprite.classList.add(`attack-${moveType || 'normal'}`);
    sprite.classList.add('attacking');
  }, 100);
  
  setTimeout(() => {
    sprite.classList.remove(`attack-${moveType || 'normal'}`);
    sprite.classList.remove('attacking');
  }, 600);
}

function playHitAnimation(defender) {
  const wrapper = defender.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.pokemon-sprite');
  
  sprite.classList.add('hit-flinch');
  setTimeout(() => sprite.classList.remove('hit-flinch'), 300);
}

function playMissAnimation(defender) {
  const wrapper = defender.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.sprite-container');
  
  sprite.classList.add('dodge');
  setTimeout(() => sprite.classList.remove('dodge'), 400);
}

function addDefendVisuals(pokemon) {
  const wrapper = pokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const hud = wrapper.querySelector('.pokemon-hud');
  const sprite = wrapper.querySelector('.sprite-container');
  
  hud.classList.add('defending');
  sprite.classList.add('defending');
}

function removeDefendVisuals() {
  document.querySelectorAll('.defending').forEach(el => {
    el.classList.remove('defending');
  });
}