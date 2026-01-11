// ===================================================================
// BATTLE ENGINE - Blockchain Enhanced (AI-ONLY SPEED-UP)
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

// ===================================================================
// PVP MODE INTEGRATION
// ===================================================================

function isPvPMode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mode') === 'pvp';
}

function getPvPParams() {
    if (!isPvPMode()) return null;
    
    const urlParams = new URLSearchParams(window.location.search);
    return {
        roomId: urlParams.get('roomId'),
        betAmount: urlParams.get('betAmount'),
        players: JSON.parse(decodeURIComponent(urlParams.get('players')))
    };
}

async function startPvPBattle() {
    const pvpParams = getPvPParams();
    if (!pvpParams) {
        console.error('❌ No PvP parameters found');
        window.location.href = 'pvp-lobby.html';
        return;
    }

    console.log('🎮 Starting PvP Battle:', pvpParams);
    
    // Hide tournament UI elements
    UI.difficulty.style.display = 'none';
    document.querySelector('.match-counter').style.display = 'none';
    UI.standings.parentElement.style.display = 'none';
    
    // Show PvP info
    const pvpInfo = document.createElement('div');
    pvpInfo.className = 'pvp-battle-info';
    pvpInfo.innerHTML = `
        <div style="position: absolute; top: 10px; right: 20px; background: rgba(255, 217, 61, 0.2); 
                    border: 2px solid var(--warning); border-radius: 10px; padding: 10px 20px;">
            <div style="font-weight: 800; color: var(--warning);">⚔️ PvP BATTLE</div>
            <div style="font-size: 0.9rem; color: white;">Bet: ${pvpParams.betAmount} PKCN</div>
        </div>
    `;
    UI.arena.parentElement.appendChild(pvpInfo);

    // Find our Pokemon and opponent's Pokemon
    const myPlayer = pvpParams.players.find(p => p.player_address === window.wallet.getAccount().toLowerCase());
    const opponentPlayer = pvpParams.players.find(p => p.player_address !== window.wallet.getAccount().toLowerCase());

    if (!myPlayer || !opponentPlayer) {
        console.error('❌ Could not find players in PvP params');
        window.location.href = 'pvp-lobby.html';
        return;
    }

    // Initialize PvP battle
    const matchData = {
        match_id: pvpParams.roomId,
        player1_address: pvpParams.players[0].player_address,
        player2_address: pvpParams.players[1].player_address,
        player1_pokemon: pvpParams.players[0].pokemon_data,
        player2_pokemon: pvpParams.players[1].pokemon_data,
        battle_seed: `${pvpParams.roomId}_${Date.now()}`
    };

    // Initialize PvP battle engine
    window.PvPBattle.init(matchData, window.wallet.getAccount(), pvpState.supabaseClient);
    
    // Create battle state for UI
    gameState.currentBattle = {
        p1: createBattlePokemon(myPlayer.pokemon_data, true),
        p2: createBattlePokemon(opponentPlayer.pokemon_data, false),
        turn: null,
        round: 1,
        actionsThisRound: 0,
        defending: null
    };

    // Set turn order by speed
    gameState.currentBattle.turn = determineFirstAttacker(gameState.currentBattle.p1, gameState.currentBattle.p2);
    
    renderBattle();
    executeTurn();
}

// Override endTournament for PvP
async function endTournament() {
    if (isPvPMode()) {
        await endPvPBattle();
        return;
    }
    
    // Original tournament logic
    await endTournament();
}

async function endPvPBattle() {
    const pvpParams = getPvPParams();
    if (!pvpParams) return;

    gameState.isComplete = true;
    gameState.battleActive = false;

    const { p1, p2 } = gameState.currentBattle;
    const winner = p1.currentHp > 0 ? p1 : p2;
    
    console.log('🏆 PvP Battle ended. Winner:', winner.name);

    // Show result screen
    UI.resultTitle.textContent = winner.isPlayer ? 'VICTORY!' : 'DEFEAT';
    UI.resultMessage.innerHTML = `
        ${winner.isPlayer ? '🎉 You won the PvP battle!' : '💔 You lost the battle.'}<br><br>
        Bet Amount: ${pvpParams.betAmount} PKCN<br>
        ${winner.isPlayer ? `You won ${pvpParams.betAmount * 2} PKCN!` : 'Better luck next time!'}
    `;
    UI.resultScreen.querySelector('.result-content').className = `result-content ${winner.isPlayer ? 'victory' : 'defeat'}`;
    UI.resultScreen.classList.remove('hidden');

    if (winner.isPlayer) {
        // Claim reward
        try {
            const provider = await safeGetProvider();
            const signer = await provider.getSigner();
            const tournamentContract = new ethers.Contract(
                window.CONTRACTS.TOURNAMENT,
                window.ABIS.TOURNAMENT,
                signer
            );

            UI.resultMessage.innerHTML += '<br><br>Claiming reward...';
            
            const claimTx = await tournamentContract.claimPvPReward(pvpParams.roomId);
            await claimTx.wait();
            
            UI.resultMessage.innerHTML += '<br>✅ Reward claimed!';
            await updateBalanceDisplay();

        } catch (error) {
            console.error('❌ Failed to claim reward:', error);
            UI.resultMessage.innerHTML += '<br>⚠️ Failed to claim reward automatically. Check your profile.';
        }
    }

    // Clean up room
    try {
        // Could delete room here or mark as completed
        console.log('✅ PvP battle completed');
    } catch (error) {
        console.warn('⚠️ Room cleanup failed:', error);
    }

    const returnBtn = document.getElementById('returnBtn');
    returnBtn.onclick = () => {
        window.location.href = 'pvp-lobby.html';
    };
}

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
  arena: document.getElementById('battleArena'),
  aiIndicator: document.getElementById('aiBattleIndicator')
};

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

const RARITY_MULTIPLIERS = {
  common: 1.00,
  uncommon: 1.05,
  rare: 1.10,
  epic: 1.18,
  legendary: 1.30
};

const ABILITY_OVERRIDES = {
  'flamethrower': { power: 90, type: 'fire', damageClass: 'special' },
  'ember': { power: 40, type: 'fire', damageClass: 'special' },
  'fire blast': { power: 110, type: 'fire', damageClass: 'special' },
  'fire punch': { power: 75, type: 'fire', damageClass: 'physical' },
  'hydro pump': { power: 110, type: 'water', damageClass: 'special' },
  'surf': { power: 90, type: 'water', damageClass: 'special' },
  'water gun': { power: 40, type: 'water', damageClass: 'special' },
  'waterfall': { power: 80, type: 'water', damageClass: 'physical' },
  'thunderbolt': { power: 90, type: 'electric', damageClass: 'special' },
  'thunder': { power: 110, type: 'electric', damageClass: 'special' },
  'thunder punch': { power: 75, type: 'electric', damageClass: 'physical' },
  'ice beam': { power: 90, type: 'ice', damageClass: 'special' },
  'blizzard': { power: 110, type: 'ice', damageClass: 'special' },
  'ice punch': { power: 75, type: 'ice', damageClass: 'physical' },
  'solar beam': { power: 120, type: 'grass', damageClass: 'special' },
  'razor leaf': { power: 55, type: 'grass', damageClass: 'physical' },
  'vine whip': { power: 45, type: 'grass', damageClass: 'physical' },
  'psychic': { power: 90, type: 'psychic', damageClass: 'special' },
  'psybeam': { power: 65, type: 'psychic', damageClass: 'special' },
  'shadow ball': { power: 80, type: 'ghost', damageClass: 'special' },
  'lick': { power: 30, type: 'ghost', damageClass: 'physical' },
  'dragon claw': { power: 80, type: 'dragon', damageClass: 'physical' },
  'dragon breath': { power: 60, type: 'dragon', damageClass: 'special' },
  'dark pulse': { power: 80, type: 'dark', damageClass: 'special' },
  'bite': { power: 60, type: 'dark', damageClass: 'physical' },
  'crunch': { power: 80, type: 'dark', damageClass: 'physical' },
  'flash cannon': { power: 80, type: 'steel', damageClass: 'special' },
  'iron head': { power: 80, type: 'steel', damageClass: 'physical' },
  'moonblast': { power: 95, type: 'fairy', damageClass: 'special' },
  'play rough': { power: 90, type: 'fairy', damageClass: 'physical' },
  'earthquake': { power: 100, type: 'ground', damageClass: 'physical' },
  'dig': { power: 80, type: 'ground', damageClass: 'physical' },
  'brave bird': { power: 120, type: 'flying', damageClass: 'physical' },
  'aerial ace': { power: 60, type: 'flying', damageClass: 'physical' },
  'close combat': { power: 120, type: 'fighting', damageClass: 'physical' },
  'karate chop': { power: 50, type: 'fighting', damageClass: 'physical' },
  'sludge bomb': { power: 90, type: 'poison', damageClass: 'special' },
  'poison jab': { power: 80, type: 'poison', damageClass: 'physical' },
  'rock slide': { power: 75, type: 'rock', damageClass: 'physical' },
  'stone edge': { power: 100, type: 'rock', damageClass: 'physical' },
  'zen headbutt': { power: 80, type: 'psychic', damageClass: 'physical' },
  'confusion': { power: 50, type: 'psychic', damageClass: 'special' },
  'tackle': { power: 40, type: 'normal', damageClass: 'physical' },
  'quick attack': { power: 40, type: 'normal', damageClass: 'physical' },
  'hyper beam': { power: 150, type: 'normal', damageClass: 'special' }
};

function deepClone(obj) {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

function getAbilityProperties(abilityName, pokemonTypes) {
  const name = abilityName.toLowerCase();
  
  if (ABILITY_OVERRIDES[name]) {
    return ABILITY_OVERRIDES[name];
  }
  
  const moveType = getAbilityType(abilityName, pokemonTypes);
  const power = name.includes('hyper beam') ? 150 :
                name.includes('blast') || name.includes('pump') || name.includes('beam') ? 110 :
                name.includes('thrower') || name.includes('wave') ? 90 :
                name.includes('punch') || name.includes('kick') || name.includes('claw') ? 75 :
                name.includes('attack') || name.includes('slash') ? 70 :
                name.includes('tackle') || name.includes('quick attack') ? 40 :
                60;
                
  const specialTypes = ['fire', 'water', 'electric', 'ice', 'grass', 'psychic', 'dragon', 'dark', 'fairy', 'ghost'];
  const damageClass = specialTypes.includes(moveType) ? 'special' : 'physical';
  
  return { power, type: moveType, damageClass };
}

// ===================================================================
// BATTLE HISTORY STORAGE
// ===================================================================

/**
 * Saves the current tournament battle to localStorage history
 */
function saveBattleHistory(battleData) {
  try {
    // Load existing history
    let history = JSON.parse(localStorage.getItem('battleHistory') || '[]');
    
    // Create battle record
    const record = {
      tournamentId: gameState.tournamentId || `local_${Date.now()}`,
      timestamp: Date.now(),
      playerPokemon: {
        name: battleData.p1.isPlayer ? battleData.p1.name : battleData.p2.name,
        id: battleData.p1.isPlayer ? battleData.p1.id : battleData.p2.id,
        tokenId: battleData.p1.isPlayer ? battleData.p1.tokenId : battleData.p2.tokenId,
        rarity: battleData.p1.isPlayer ? battleData.p1.rarity : battleData.p2.rarity
      },
      opponent: {
        name: battleData.p1.isPlayer ? battleData.p2.name : battleData.p1.name,
        id: battleData.p1.isPlayer ? battleData.p2.id : battleData.p1.id,
        rarity: battleData.p1.isPlayer ? battleData.p2.rarity : battleData.p1.rarity
      },
      rounds: battleData.round,
      result: battleData.winner?.isPlayer ? 'win' : 'loss',
      winner: battleData.winner?.name || 'Unknown',
      difficulty: gameState.difficulty,
      matchIndex: gameState.matchIndex,
      totalMatches: gameState.matchups.length,
      defending: battleData.defending ? {
        player: battleData.defending.name,
        outcome: calculateDefenseOutcome(battleData.defending)
      } : null
    };
    
    history.unshift(record); // Add to beginning (newest first)
    
    // Keep only last 100 battles to prevent storage bloat
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    
    localStorage.setItem('battleHistory', JSON.stringify(history));
    console.log('✅ Battle history saved:', record);
    
  } catch (error) {
    console.error('❌ Failed to save battle history:', error);
  }
}

/**
 * ✅ SAVES UNCLAIMED REWARD when MetaMask transaction fails/cancels
 * Stores data in localStorage so user can claim later from profile
 */
function saveUnclaimedReward(tournamentId, rewardAmount, playerWins, totalOpponents, difficulty) {
  console.log('=== Saving Unclaimed Reward (CANCELED TRANSACTION) ===');
  console.log('Tournament ID:', tournamentId);
  console.log('Reward:', rewardAmount);
  console.log('Wins:', playerWins);
  console.log('Opponents:', totalOpponents);
  console.log('Difficulty:', difficulty);

  try {
    // ✅ FIX 1: Only save if it's a valid blockchain tournament ID (not local)
    if (!tournamentId || tournamentId.startsWith('local_')) {
      console.log('⚠️ Skipping - local tournament ID');
      return;
    }

    // ✅ FIX 2: Validate all required parameters
    if (!rewardAmount || rewardAmount <= 0) {
      console.log('⚠️ Skipping - invalid reward amount');
      return;
    }

    if (typeof playerWins === 'undefined' || typeof totalOpponents === 'undefined') {
      console.log('⚠️ Skipping - missing wins/opponents data');
      return;
    }

    // ✅ FIX 3: Load existing unclaimed rewards with proper error handling
    let unclaimed = [];
    try {
      const rawData = localStorage.getItem('unclaimedRewardsLocal');
      if (rawData) {
        unclaimed = JSON.parse(rawData);
        // Ensure it's an array
        if (!Array.isArray(unclaimed)) {
          console.warn('⚠️ Invalid data format, resetting...');
          unclaimed = [];
        }
      }
    } catch (parseError) {
      console.error('❌ Error parsing existing data:', parseError);
      unclaimed = [];
    }

    console.log('📦 Loaded existing unclaimed rewards:', unclaimed.length);

    // ✅ FIX 4: Check if already exists to avoid duplicates
    const existingIndex = unclaimed.findIndex(u => u.tournamentId === tournamentId);
    if (existingIndex !== -1) {
      console.log('⚠️ Tournament already exists in unclaimed rewards, updating...');
      // Update existing entry instead of duplicating
      unclaimed[existingIndex] = {
        tournamentId,
        reward: rewardAmount,
        timestamp: Date.now(),
        difficulty: difficulty || 'normal',
        wins: playerWins,
        opponentCount: totalOpponents
      };
    } else {
      // ✅ FIX 5: Create new reward entry with all required fields
      const newReward = {
        tournamentId,
        reward: rewardAmount,
        timestamp: Date.now(),
        difficulty: difficulty || 'normal',
        wins: playerWins,
        opponentCount: totalOpponents
      };

      console.log('➕ Adding new unclaimed reward:', newReward);
      unclaimed.push(newReward);
    }

    // ✅ FIX 6: Save with proper error handling
    try {
      localStorage.setItem('unclaimedRewardsLocal', JSON.stringify(unclaimed));
      console.log('✅ SUCCESSFULLY SAVED TO localStorage');
    } catch (saveError) {
      console.error('❌ CRITICAL ERROR saving to localStorage:', saveError);
      // Check if it's a quota error
      if (saveError.name === 'QuotaExceededError') {
        console.error('💾 Storage quota exceeded! Clearing old entries...');
        // Keep only last 10 entries
        unclaimed = unclaimed.slice(-10);
        localStorage.setItem('unclaimedRewardsLocal', JSON.stringify(unclaimed));
      }
      throw saveError;
    }
    
    // ✅ FIX 7: Verify save was successful
    const verify = JSON.parse(localStorage.getItem('unclaimedRewardsLocal'));
    console.log('🔍 Verified saved data:', verify);
    
    const foundEntry = verify.find(u => u.tournamentId === tournamentId);
    if (foundEntry) {
      console.log('✅ Verification successful:', foundEntry);
    } else {
      console.error('❌ Verification failed! Entry not found after save');
    }

  } catch (error) {
    console.error('❌ CRITICAL ERROR in saveUnclaimedReward:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

/**
 * ✅ SAVES TOURNAMENT SUMMARY to localStorage history
 * This is called after every tournament completes
 */
function saveTournamentSummary(finalRank, totalReward) {
  try {
    const player = gameState.participants.find(p => p.isPlayer);
    if (!player) return;

    const summary = {
      tournamentId: gameState.tournamentId || `tournament_${Date.now()}`,
      timestamp: Date.now(),
      playerPokemon: {
        name: player.name,
        id: player.id,
        rarity: player.rarity,
        tokenId: player.tokenId || 0
      },
      difficulty: gameState.difficulty,
      opponentCount: gameState.participants.length - 1,
      wins: player.wins,
      losses: player.losses,
      finalRank: finalRank,
      totalReward: totalReward,
      matches: gameState.matchIndex,
      success: totalReward > 0
    };

    // Load existing tournament history
    let tournamentHistory = JSON.parse(localStorage.getItem('tournamentHistory') || '[]');
    tournamentHistory.unshift(summary);

    // Keep only last 50 tournaments
    if (tournamentHistory.length > 50) {
      tournamentHistory = tournamentHistory.slice(0, 50);
    }

    localStorage.setItem('tournamentHistory', JSON.stringify(tournamentHistory));
    console.log('✅ Tournament summary saved:', summary);

  } catch (error) {
    console.error('❌ Failed to save tournament summary:', error);
  }
}
/**
 * Saves tournament summary to localStorage
 * This is called after every tournament completes
 */
// ===================================================================
// INITIALIZATION (REMOVED MATCH DELAYS)
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // MINIMAL LOADING - Instant start
    UI.loading.classList.remove('hidden');
    
    const urlParams = new URLSearchParams(window.location.search);
    gameState.tournamentId = urlParams.get('tournamentId') || localStorage.getItem('currentTournamentId');
    
    if (gameState.tournamentId) {
      console.log('🎯 Tournament ID:', gameState.tournamentId);
    } else {
      console.warn('⚠️ No tournament ID found.');
    }
    
    await initializeTournament();
    UI.loading.classList.add('hidden');
    
    // CRITICAL FIX: Ensure startNextMatch completes before calling executeTurn
    await startNextMatch();
    
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
  
  // CRITICAL FIX: Ensure matchups were generated
  if (gameState.matchups.length === 0) {
    throw new Error('Failed to generate matchups. No valid opponents.');
  }
  
  UI.difficulty.textContent = gameState.difficulty.toUpperCase();
  UI.totalMatches.textContent = gameState.matchups.length;
  
  log('battle', `🏆 Tournament begins! ${gameState.participants.length} participants`);
  log('battle', `${gameState.matchups.length} matches scheduled`);
}

// ===================================================================
// TOURNAMENT COMPLETION WITH ACCURATE REWARDS
// ===================================================================

async function endTournament() {
  gameState.isComplete = true;
  gameState.battleActive = false;

  const sorted = [...gameState.participants].sort((a, b) => b.wins - a.wins);
  const player = sorted.find(p => p.isPlayer);
  const rank = sorted.indexOf(player) + 1;
  
  // Calculate total player matches
  const totalPlayerMatches = gameState.participants.length - 1;

  // ✅ USE EXISTING calculateRewards() from battle.js
  const rewards = calculateRewards();
  const totalReward = rewards.total;
  
  console.log('💰 Reward Breakdown:', {
    base: rewards.base,
    winBonus: rewards.wins,
    perfectBonus: rewards.perfect,
    total: rewards.total,
    difficulty: gameState.difficulty,
    playerWins: player.wins,
    totalMatches: totalPlayerMatches
  });
  
  console.log(`💰 Calculated reward: ${totalReward} PKCN`);

  UI.resultTitle.textContent = 'Processing Tournament...';
  UI.resultMessage.textContent = 'Submitting results to blockchain...';
  UI.resultScreen.classList.remove('hidden');

  // ✅ FIX: Save tournament summary FIRST (before blockchain operations)
  saveTournamentSummary(rank, totalReward);

  try {
    // ✅ FIX: Validate tournament ID
    if (!gameState.tournamentId) {
      throw new Error('No tournament ID found. Cannot save results to blockchain.');
    }

    // ✅ FIX: Validate wallet connection
    if (!window.wallet || !window.wallet.getAccount || !window.wallet.getAccount()) {
      throw new Error('Wallet not connected. Please connect your wallet to claim rewards.');
    }

    const provider = await window.wallet.getProvider();
    const signer = await window.wallet.getSigner();

    const tournamentContract = new ethers.Contract(
      window.CONTRACTS.TOURNAMENT,
      window.ABIS.TOURNAMENT,
      signer
    );

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

    // Update tournament history
    const history = JSON.parse(localStorage.getItem('battleHistory') || '[]');
    if (!history.includes(gameState.tournamentId)) {
      history.push(gameState.tournamentId);
      localStorage.setItem('battleHistory', JSON.stringify(history));
    }

    localStorage.removeItem('currentTournamentId');
    localStorage.removeItem('currentTournament');

    await updateBalanceDisplay();

    showTournamentResult(rank === 1, rank, totalReward, true, gameState.tournamentId);

  } catch (error) {
    console.error('❌ Failed to claim rewards:', error);
    
    let errorMessage = 'Transaction failed. ';
    let shouldSaveUnclaimed = true;
    
    // ✅ FIX: Better error detection
    if (error.message.includes('user rejected') || error.code === 4001 || error.code === 'ACTION_REJECTED') {
      errorMessage = '⚠️ Transaction rejected. Your progress has been saved. You can claim rewards later from your profile.';
      shouldSaveUnclaimed = true;
    } else if (error.message.includes('already claimed')) {
      errorMessage = 'Rewards already claimed. Check your PKCN balance.';
      shouldSaveUnclaimed = false;
    } else if (error.message.includes('Tournament not complete')) {
      errorMessage = 'Tournament not completed on-chain yet. Your progress has been saved.';
      shouldSaveUnclaimed = true;
    } else if (error.message.includes('No tournament ID')) {
      errorMessage = 'No tournament ID found. Your results are saved locally but not on blockchain.';
      shouldSaveUnclaimed = false;
    } else if (error.message.includes('Wallet not connected')) {
      errorMessage = 'Wallet not connected. Your progress has been saved.';
      shouldSaveUnclaimed = true;
    } else {
      errorMessage += error.message.substring(0, 100);
      shouldSaveUnclaimed = true;
    }
    
    showTournamentResult(rank === 1, rank, totalReward, false, gameState.tournamentId, errorMessage);
    
    // ✅ FIX: Only save as unclaimed if appropriate and with ALL required data
    if (shouldSaveUnclaimed && gameState.tournamentId && !gameState.tournamentId.startsWith('local_')) {
      console.log('💾 Saving as unclaimed reward with details:', {
        tournamentId: gameState.tournamentId,
        totalReward: totalReward,
        playerWins: player.wins,
        totalMatches: totalPlayerMatches,
        difficulty: gameState.difficulty,
        rewardBreakdown: rewards
      });
      
      saveUnclaimedReward(
        gameState.tournamentId, 
        totalReward, 
        player.wins, 
        totalPlayerMatches, 
        gameState.difficulty || 'normal'
      );
    }
  }
}


// async function getContractRewardCalculation(tournamentId) {
//   try {
//     const provider = await window.wallet.getProvider();
//     const signer = await window.wallet.getSigner();
//     const tournamentContract = new ethers.Contract(
//       window.CONTRACTS.TOURNAMENT,
//       window.ABIS.TOURNAMENT,
//       signer
//     );
    
//     // This will now work with the corrected ABI
//     const tournamentData = await tournamentContract.getTournamentData(tournamentId);
//     console.log("Tournament data:", tournamentData);
//     return tournamentData;
//   } catch (error) {
//     console.error("Error fetching tournament data:", error);
//     throw error;
//   }
// }
function showTournamentResult(isVictory, rank, totalReward, success = true, tournamentId = null, errorMessage = null) {
  UI.resultTitle.textContent = isVictory ? 'TOURNAMENT CHAMPION!' : 'TOURNAMENT COMPLETE';
  
  const player = gameState.participants.find(p => p.isPlayer);
  let message = '';
  
  if (success) {
    message = `${isVictory ? 'Perfect performance!' : 'Good effort!'}<br><br>
              Final Rank: #${rank} with ${player.wins} wins<br>
              Earned ${totalReward} PKCN Tokens!`;
    
    if (tournamentId) {
      message += `<br>Tournament ID: ${tournamentId.substring(0, 20)}...`;
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
  
  const returnBtn = document.getElementById('returnBtn');
  if (returnBtn) {
    returnBtn.onclick = () => {
      window.location.href = 'tournament.html';
    };
  }
  
  log('battle', `Tournament ended! Rank: #${rank}, Wins: ${player.wins}/${gameState.participants.length - 1}, Rewards: ${totalReward} PKCN`);
}

async function updateBalanceDisplay() {
  try {
    if (!window.wallet || !window.wallet.updateBalanceDisplayIfNeeded) return;
    
    await window.wallet.updateBalanceDisplayIfNeeded();
    console.log('✅ Balance display updated');
  } catch (error) {
    console.warn('Failed to update balance display:', error);
  }
}

function calculateRewards() {
  const player = gameState.participants.find(p => p.isPlayer);
  const totalPlayerMatches = gameState.participants.length - 1;
  
  // **MATCH SOLIDITY BASE REWARDS EXACTLY**
  const baseRewards = { easy: 5, normal: 15, hard: 25, insane: 35 };
  const base = baseRewards[gameState.difficulty];
  
  // **LOSS CONDITION: Wins < 3 = 0 reward**
  if (player.wins < 3) {
    console.log(`[Rewards] LOSS CONDITION - Wins: ${player.wins} < 3, Reward: 0 PKCN`);
    return {
      base: base,
      wins: 0,
      perfect: 0,
      total: 0
    };
  }
  
  // **MATCH SOLIDITY FORMULA EXACTLY**
  // Integer division in Solidity: base / 2 (floor)
  const baseDiv2 = Math.floor(base / 2); // 25 -> 12, 15 -> 7, etc.
  const winBonus = player.wins * baseDiv2;
  
  const isPerfect = player.wins === totalPlayerMatches;
  const perfectBonus = isPerfect ? base * 2 : 0;
  
  let total = base + winBonus + perfectBonus;
  
  // **HARD CAP AT 250 PKCN**
  const MAX_REWARD = 250;
  if (total > MAX_REWARD) {
    console.log(`[Rewards] CAPPED: ${total} > ${MAX_REWARD}, using ${MAX_REWARD}`);
    total = MAX_REWARD;
  }
  
  console.log(`[Rewards] Difficulty: ${gameState.difficulty}, Base: ${base}, Wins: ${player.wins}/${totalPlayerMatches}, Perfect: ${isPerfect}, Total: ${total} PKCN`);
  
  return {
    base: base,
    wins: winBonus,
    perfect: perfectBonus,
    total: total
  };
}

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
    tokenId: pokemonData.tokenId || 0, // Add tokenId support
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
    id: metadata.id,
    name: metadata.name,
    types: [...metadata.types],
    abilities: [...metadata.abilities],
    ivs: { ...metadata.ivs },
    isPlayer: metadata.isPlayer,
    wins: metadata.wins,
    losses: metadata.losses,
    rarity: metadata.rarity,
    tokenId: metadata.tokenId || 0,
    battleId: `${metadata.id}_${Date.now()}_${Math.random()}`
  };
  
  battleMon.stats = {
    hp: metadata.stats.hp,
    attack: metadata.stats.attack,
    defense: metadata.stats.defense,
    specialAttack: metadata.stats.specialAttack,
    specialDefense: metadata.stats.specialDefense,
    speed: metadata.stats.speed
  };
  
  const multiplier = RARITY_MULTIPLIERS[battleMon.rarity] || 1.0;
  
  battleMon.stats.attack = Math.floor(battleMon.stats.attack * multiplier);
  battleMon.stats.defense = Math.floor(battleMon.stats.defense * multiplier);
  battleMon.stats.specialAttack = Math.floor(battleMon.stats.specialAttack * multiplier);
  battleMon.stats.specialDefense = Math.floor(battleMon.stats.specialDefense * multiplier);
  battleMon.stats.speed = Math.floor(battleMon.stats.speed * multiplier);
  
  const originalHp = battleMon.stats.hp;
  battleMon.maxHp = Math.floor(originalHp * multiplier);
  battleMon.currentHp = battleMon.maxHp;
  
  console.log(`[BattleState] ${battleMon.name} - HP: ${battleMon.currentHp}/${battleMon.maxHp}, Multiplier: ${multiplier}`);
  
  return battleMon;
}

function resetBattlePokemonHp(battleMon) {
  const oldHp = battleMon.currentHp;
  battleMon.currentHp = battleMon.maxHp;
  console.log(`[HP RESET] ${battleMon.name}: ${oldHp} → ${battleMon.currentHp}/${battleMon.maxHp}`);
}

// ✅ NEW: Speed-based turn order function
function determineFirstAttacker(p1, p2) {
  if (p1.stats.speed > p2.stats.speed) {
    log('battle', `⚡ ${p1.name} moves first! (Speed: ${p1.stats.speed})`);
    return 0;
  } else if (p2.stats.speed > p1.stats.speed) {
    log('battle', `⚡ ${p2.name} moves first! (Speed: ${p2.stats.speed})`);
    return 1;
  } else {
    // Speed tie - random decision
    const random = Math.random() < 0.5 ? 0 : 1;
    const first = random === 0 ? p1 : p2;
    log('battle', `⚡ Speed tie! ${first.name} moves first! (Speed: ${p1.stats.speed})`);
    return random;
  }
}

async function startNextMatch() {
  if (gameState.matchIndex >= gameState.matchups.length) {
    endTournament();
    return;
  }
  
  UI.actionSelection.classList.add('hidden');
  
  // INSTANT MATCH TRANSITION - No loading overlay
  const matchup = gameState.matchups[gameState.matchIndex];
  const p1Meta = gameState.participants[matchup.p1Index];
  const p2Meta = gameState.participants[matchup.p2Index];
  
  // CRITICAL FIX: Ensure we have valid participants
  if (!p1Meta || !p2Meta) {
    throw new Error('Invalid matchup data: missing participants');
  }
  
  // Check if this is AI vs AI battle
  const isAIvsAI = !p1Meta.isPlayer && !p2Meta.isPlayer;
  
  gameState.currentBattle = {
    p1: createBattlePokemon(p1Meta),
    p2: createBattlePokemon(p2Meta),
    turn: null, // ✅ MODIFIED: Removed hardcoded "turn: 0" - will be set by speed
    round: 1,
    defending: null,
    actionsThisRound: 0
  };
  
  // CRITICAL FIX: Ensure battle state was created
  if (!gameState.currentBattle || !gameState.currentBattle.p1 || !gameState.currentBattle.p2) {
    throw new Error('Failed to create battle state');
  }
  
  resetBattlePokemonHp(gameState.currentBattle.p1);
  resetBattlePokemonHp(gameState.currentBattle.p2);
  
  gameState.battleActive = true;
  gameState.matchIndex++;
  
  UI.currentMatch.textContent = gameState.matchIndex;
  
  log('battle', `⚔️ Match ${gameState.matchIndex}: ${p1Meta.name} vs ${p2Meta.name}`);
  log('battle', `📊 Round ${gameState.currentBattle.round} begins!`);
  
  // Show AI Battle indicator if AI vs AI
  if (isAIvsAI) {
    UI.aiIndicator.classList.add('active');
  } else {
    UI.aiIndicator.classList.remove('active');
  }
  
  UI.arena.setAttribute('data-round', gameState.currentBattle.round);
  
  // INSTANT RENDER - No delays
  renderBattle();
  updateStandings();
  
  // CRITICAL FIX: Only call executeTurn after everything is set up
  setTimeout(() => {
    if (gameState.currentBattle) {
      executeTurn();
    } else {
      console.error('CRITICAL: currentBattle is null before executeTurn');
    }
  }, 50);
}

function executeTurn() {
  // CRITICAL FIX: Add null check
  if (!gameState.battleActive || !gameState.currentBattle) {
    console.error('executeTurn called without active battle');
    return;
  }
  
  const { p1, p2 } = gameState.currentBattle;
  
  // ✅ MODIFIED: Speed-based turn order at start of each round
  if (gameState.currentBattle.actionsThisRound === 0) {
    gameState.currentBattle.turn = determineFirstAttacker(p1, p2);
    // Reset defense for new round
    gameState.currentBattle.defending = null;
    removeDefendVisuals();
  }
  
  const currentBattler = gameState.currentBattle.turn === 0 ? p1 : p2;
  
  // Check if this is AI vs AI battle
  const isAIvsAI = !p1.isPlayer && !p2.isPlayer;
  
  if (currentBattler.isPlayer) {
    // PLAYER TURN - Normal speed, show HP
    UI.arena.classList.remove('super-fast-mode');
    showHpBars();
    enablePlayerActions(currentBattler);
  } else {
    // AI TURN
    if (isAIvsAI) {
      // AI vs AI - Super fast, hide HP
      hideHpBars();
      setTimeout(() => executeAIActions(currentBattler), 30); // 30ms AI delay
    } else {
      // AI vs Player - Normal speed for player, but AI action is quick
      showHpBars(); // Player needs to see what's happening
      setTimeout(() => executeAIActions(currentBattler), 200); // Slightly slower so player can follow
    }
  }
}

function showHpBars() {
  document.getElementById('enemyHpContainer').classList.remove('hidden');
  document.getElementById('playerHpContainer').classList.remove('hidden');
  
  // Force HP sync when shown
  if (gameState.currentBattle) {
    const { p1, p2 } = gameState.currentBattle;
    const player = p1.isPlayer ? p1 : p2;
    const enemy = p1.isPlayer ? p2 : p1;
    updateHpBar(player);
    updateHpBar(enemy);
  }
}

function hideHpBars() {
  document.getElementById('enemyHpContainer').classList.add('hidden');
  document.getElementById('playerHpContainer').classList.add('hidden');
  UI.arena.classList.add('super-fast-mode');
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
  
  const isAIvsAI = isCurrentBattleAIvsAI();
  
  if (gameState.currentBattle.actionsThisRound >= 2) {
    const { p1, p2 } = gameState.currentBattle;
    
    gameState.currentBattle.actionsThisRound = 0;
    gameState.currentBattle.round++;
    UI.arena.setAttribute('data-round', gameState.currentBattle.round);
    
    setTimeout(() => {
      if (gameState.battleActive && gameState.currentBattle) {
        log('battle', `📊 Round ${gameState.currentBattle.round} begins!`);
        executeTurn();
      }
    }, isAIvsAI ? 100 : 600); // Faster round transition for AI vs AI
  } else {
    setTimeout(() => {
      if (gameState.battleActive && gameState.currentBattle) {
        executeTurn();
      }
    }, isAIvsAI ? 30 : 300); // Faster action transition for AI vs AI
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
    
    // **FIX**: Ensure AI attacks animate properly
    await executeAbility(attacker, ability);
  }
  
  completeAction();
}

// Enhanced attack execution with dynamic direction
async function executeAbility(user, ability) {
  log('ability', `💥 ${user.name} used ${ability.name}!`);
  
  const moveType = getAbilityType(ability.name, user.types);
  const { p1, p2 } = gameState.currentBattle;
  const opponent = user === p1 ? p2 : p1;
  
  // Get dynamic attack direction
  const direction = getAttackDirection(user, opponent);
  
  // Create projectile with dynamic trajectory
  const projectile = createProjectile(moveType, user, direction);
  
  // Animate projectile travel
  await animateProjectile(projectile, direction);
  
  if (!calculateHitChance(user, opponent)) {
    log('effectiveness', '💨 Attack missed!');
    playMissAnimation(opponent);
    projectile.remove();
    return;
  }
  
  const effect = ability.shortEffect.toLowerCase();
  
  if (effect.includes('heal') || effect.includes('recover')) {
    const healAmount = Math.floor(user.maxHp * 0.15 + user.stats.specialAttack * 0.05);
    const actualHeal = Math.min(healAmount, Math.floor(user.maxHp * 0.5));
    
    user.currentHp = Math.min(user.maxHp, ensureNumber(user.currentHp) + actualHeal);
    log('heal', `💚 ${user.name} restored ${actualHeal} HP!`);
    updateHpBar(user);
    
    // Heal animation
    playHealAnimation(user);
    projectile.remove();
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
    UI.arena.classList.add('critical-flash');
    setTimeout(() => UI.arena.classList.remove('critical-flash'), 500);
  }
  
  opponent.currentHp = Math.max(0, ensureNumber(opponent.currentHp) - damage);
  
  // IMPACT SEQUENCE
  await playImpactAnimation(user, opponent, moveType);
  
  log('damage', `💢 Dealt ${damage} damage!`);
  showDamageNumber(opponent, damage);
  updateHpBar(opponent);
  
  projectile.remove();
  
  if (opponent.currentHp === 0) await handleFaint(opponent);
}

// Calculate direction vector between attacker and defender
function getAttackDirection(attacker, defender) {
  const attackerRect = attacker.isPlayer ? UI.player.wrapper.getBoundingClientRect() : UI.enemy.wrapper.getBoundingClientRect();
  const defenderRect = defender.isPlayer ? UI.player.wrapper.getBoundingClientRect() : UI.enemy.wrapper.getBoundingClientRect();
  const arenaRect = UI.arena.getBoundingClientRect();
  
  const attackerX = attackerRect.left + attackerRect.width / 2 - arenaRect.left;
  const attackerY = attackerRect.top + attackerRect.height / 2 - arenaRect.top;
  const defenderX = defenderRect.left + defenderRect.width / 2 - arenaRect.left;
  const defenderY = defenderRect.top + defenderRect.height / 2 - arenaRect.top;
  
  const deltaX = defenderX - attackerX;
  const deltaY = defenderY - attackerY;
  
  return { deltaX, deltaY };
}

// Create projectile with dynamic styling
function createProjectile(moveType, attacker, direction) {
  const projectile = document.createElement('div');
  projectile.className = `projectile projectile-${moveType}`;
  
  const attackerRect = attacker.isPlayer ? UI.player.wrapper.getBoundingClientRect() : UI.enemy.wrapper.getBoundingClientRect();
  const arenaRect = UI.arena.getBoundingClientRect();
  
  // Set starting position at attacker center
  projectile.style.left = `${attackerRect.left + attackerRect.width/2 - arenaRect.left}px`;
  projectile.style.top = `${attackerRect.top + attackerRect.height/2 - arenaRect.top}px`;
  
  // Store direction as CSS variables
  projectile.style.setProperty('--dx', `${direction.deltaX}px`);
  projectile.style.setProperty('--dy', `${direction.deltaY}px`);
  
  UI.arena.appendChild(projectile);
  return projectile;
}

// Animate projectile travel using CSS variables
async function animateProjectile(projectile, direction) {
  return new Promise(resolve => {
    // Trigger animation
    projectile.style.animation = 'projectileTravel 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards';
    
    projectile.addEventListener('animationend', () => resolve(), { once: true });
  });
}

// Updated impact animation
async function playImpactAnimation(attacker, defender, moveType) {
  return new Promise(resolve => {
    const direction = getAttackDirection(attacker, defender);
    const impact = document.createElement('div');
    impact.className = 'impact-effect';
    impact.style.setProperty('--impact-color', getTypeColor(moveType));
    
    const defenderRect = defender.isPlayer ? UI.player.wrapper.getBoundingClientRect() : UI.enemy.wrapper.getBoundingClientRect();
    const arenaRect = UI.arena.getBoundingClientRect();
    
    // Position impact at defender center
    impact.style.left = `${defenderRect.left + defenderRect.width/2 - arenaRect.left}px`;
    impact.style.top = `${defenderRect.top + defenderRect.height/2 - arenaRect.top}px`;
    
    UI.arena.appendChild(impact);
    
    // Hit animation on defender sprite
    playHitAnimation(defender);
    
    // Screen shake
    UI.arena.classList.add('arena-shake');
    
    // Cleanup after animation
    setTimeout(() => {
      impact.remove();
      UI.arena.classList.remove('arena-shake');
      resolve();
    }, 500);
  });
}

// Updated miss animation
function playMissAnimation(defender) {
  const wrapper = defender.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.sprite-container');
  
  sprite.classList.add('dodge');
  
  // Add dust effect
  const dodgeEffect = document.createElement('div');
  dodgeEffect.className = 'dodge-effect';
  wrapper.appendChild(dodgeEffect);
  
  setTimeout(() => {
    sprite.classList.remove('dodge');
    dodgeEffect.remove();
  }, 600);
}

// New: Heal animation effect
function playHealAnimation(pokemon) {
  const wrapper = pokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.pokemon-sprite');
  
  sprite.classList.add('healing');
  setTimeout(() => sprite.classList.remove('healing'), 1000);
}

function getAbilityType(abilityName, pokemonTypes) {
  const name = abilityName.toLowerCase();
  for (const [key, type] of Object.entries(ABILITY_TYPE_MAP)) {
    if (name.includes(key)) return type;
  }
  return pokemonTypes[0];
}

function calculateDamage(movePower, moveType, attacker, defender, damageClass) {
  const level = 50;
  const attackStat = damageClass === 'special' ? attacker.stats.specialAttack : attacker.stats.attack;
  const defenseStat = damageClass === 'special' ? defender.stats.specialDefense : defender.stats.defense;
  
  let damage = Math.floor((((2 * level / 5 + 2) * movePower * attackStat / defenseStat) / 50) + 2);
  
  const hasStab = attacker.types.some(type => type === moveType);
  if (hasStab) {
    damage = Math.floor(damage * 1.5);
  }
  
  const effectiveness = calculateTypeEffectiveness(moveType, defender.types);
  damage = Math.floor(damage * effectiveness);
  
  damage = Math.floor(damage * (0.80 + Math.random() * 0.25));
  
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
  // Save battle before processing faint
  if (gameState.currentBattle) {
    const { p1, p2 } = gameState.currentBattle;
    gameState.currentBattle.winner = faintedPokemon === p1 ? p2 : p1;
    saveBattleHistory(gameState.currentBattle);
  }
  
  gameState.battleActive = false;
  log('faint', `💀 ${faintedPokemon.name} fainted!`);
  
  const wrapper = faintedPokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const spriteContainer = wrapper.querySelector('.sprite-container');
  
  // Apply faint effect
  spriteContainer.classList.add('fainted');
  
  // Wait for animation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  if (isPvPMode()) {
      // PvP mode - use post-battle payment
      await endPvPBattle();
      return; // Don't continue to next match
  }
  
  const { p1, p2 } = gameState.currentBattle;
  const winner = faintedPokemon === p1 ? p2 : p1;
  
  const winnerMeta = gameState.participants.find(p => p.id === winner.id);
  const faintedMeta = gameState.participants.find(p => p.id === faintedPokemon.id);
  
  if (winnerMeta) winnerMeta.wins++;
  if (faintedMeta) faintedMeta.losses++;
  
  log('battle', `🏆 ${winner.name} wins the match!`);
  
  updateStandings();
  
  // Continue to next match
  setTimeout(() => {
    if (gameState.matchIndex < gameState.matchups.length) {
      startNextMatch();
    } else {
      endTournament();
    }
  }, 1500);
}

// Helper to check if current battle is AI vs AI
function isCurrentBattleAIvsAI() {
  if (!gameState.currentBattle) return false;
  const { p1, p2 } = gameState.currentBattle;
  return !p1.isPlayer && !p2.isPlayer;
}

// ===================================================================
// HP BAR UPDATE SYSTEM
// ===================================================================

function validateHpValues(pokemon) {
  try {
    pokemon.maxHp = ensureNumber(pokemon.maxHp, 100);
    pokemon.currentHp = ensureNumber(pokemon.currentHp, pokemon.maxHp);
    pokemon.currentHp = Math.max(0, Math.min(pokemon.currentHp, pokemon.maxHp));
    return true;
  } catch (error) {
    console.error('❌ HP Validation failed:', error, pokemon);
    return false;
  }
}

function forceHpBarUpdate(pokemon) {
  const target = pokemon.isPlayer ? UI.player : UI.enemy;
  const maxHp = pokemon.maxHp;
  const currentHp = pokemon.currentHp;
  const percentage = (currentHp / maxHp) * 100;
  
  target.hpBar.style.transition = 'none';
  target.hpBar.style.width = '0%';
  target.hpBar.offsetHeight;
  target.hpBar.style.width = `${percentage}%`;
  
  setTimeout(() => {
    target.hpBar.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
  }, 50);
}

function flashHpBar(pokemon) {
  const target = pokemon.isPlayer ? UI.player : UI.enemy;
  target.hpBar.classList.add('updating');
  setTimeout(() => target.hpBar.classList.remove('updating'), 300);
}

function updateHpBar(pokemon, isReset = false) {
  try {
    if (!validateHpValues(pokemon)) {
      throw new Error('Invalid HP values');
    }
    
    const target = pokemon.isPlayer ? UI.player : UI.enemy;
    const maxHp = pokemon.maxHp;
    const currentHp = pokemon.currentHp;
    const percentage = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
    
    target.hpBar.parentElement.setAttribute('data-current-hp', currentHp);
    target.hpBar.parentElement.setAttribute('data-max-hp', maxHp);
    
    target.hpText.textContent = `HP: ${currentHp}/${maxHp}`;
    
    if (isReset) {
      forceHpBarUpdate(pokemon);
      target.hpBar.parentElement.classList.add('hp-reset-pulse');
      setTimeout(() => target.hpBar.parentElement.classList.remove('hp-reset-pulse'), 600);
    } else {
      const oldWidth = parseFloat(target.hpBar.style.width) || 0;
      target.hpBar.style.width = `${percentage}%`;
      
      if (Math.abs(oldWidth - percentage) > 20) {
        flashHpBar(pokemon);
      }
    }
    
    if (percentage > 50) {
      target.hpBar.style.background = 'var(--hp-green)';
    } else if (percentage > 25) {
      target.hpBar.style.background = 'var(--hp-yellow)';
    } else {
      target.hpBar.style.background = 'var(--hp-red)';
    }
    
    target.hpBar.offsetHeight;
    
  } catch (error) {
    console.error('❌ updateHpBar error:', error, pokemon);
    const target = pokemon.isPlayer ? UI.player : UI.enemy;
    target.hpText.textContent = 'HP: ERROR';
    target.hpBar.style.width = '0%';
  }
}

function renderBattle() {
  const { p1, p2 } = gameState.currentBattle;
  const player = p1.isPlayer ? p1 : p2;
  const enemy = p1.isPlayer ? p2 : p1;
  
  // Reset faint state for both Pokemon
  UI.player.wrapper.querySelector('.sprite-container').classList.remove('fainted');
  UI.enemy.wrapper.querySelector('.sprite-container').classList.remove('fainted');
  
  // Add reset animation for new match
  UI.player.wrapper.querySelector('.sprite-container').classList.add('reset');
  UI.enemy.wrapper.querySelector('.sprite-container').classList.add('reset');
  setTimeout(() => {
    UI.player.wrapper.querySelector('.sprite-container').classList.remove('reset');
    UI.enemy.wrapper.querySelector('.sprite-container').classList.remove('reset');
  }, 300);
  
  // Set sprites
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

// ENHANCED ATTACK ANIMATION - Projectiles travel further to hit target
function applyAttackAnimation(attacker, moveType) {
  const isPlayer = attacker.isPlayer;
  const wrapper = isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.sprite-container');
  
  sprite.className = 'sprite-container';
  
  // INCREASED projectile travel distance for better hit effect
  const projX = isPlayer ? 180 : -180; // Increased from 120
  const projY = isPlayer ? -80 : 80;  // Increased from 60
  
  setTimeout(() => {
    sprite.style.setProperty('--proj-x', `${projX}px`);
    sprite.style.setProperty('--proj-y', `${projY}px`);
    sprite.classList.add(`attack-${moveType || 'normal'}`, 'attacking');
    
    // Add enhanced hit effect class for better visual
    UI.arena.classList.add('enhanced-hit');
  }, 50);
  
  setTimeout(() => {
    sprite.classList.remove(`attack-${moveType || 'normal'}`, 'attacking');
    sprite.style.removeProperty('--proj-x');
    sprite.style.removeProperty('--proj-y');
    UI.arena.classList.remove('enhanced-hit');
  }, 500);
}

function playHitAnimation(defender) {
  const wrapper = defender.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const sprite = wrapper.querySelector('.pokemon-sprite');
  
  sprite.classList.add('hit-flinch');
  wrapper.classList.add('hit-knockback');
  
  // Add hit flash effect
  const flash = document.createElement('div');
  flash.className = 'hit-flash';
  wrapper.appendChild(flash);
  
  setTimeout(() => {
    sprite.classList.remove('hit-flinch');
    wrapper.classList.remove('hit-knockback');
    flash.remove();
  }, 500);
}

// Updated: Defense animations
function addDefendVisuals(pokemon) {
  const wrapper = pokemon.isPlayer ? UI.player.wrapper : UI.enemy.wrapper;
  const hud = wrapper.querySelector('.pokemon-hud');
  const sprite = wrapper.querySelector('.sprite-container');
  
  hud.classList.add('defending');
  sprite.classList.add('defending');
  
  // Add shield barrier
  const shield = document.createElement('div');
  shield.className = 'shield-barrier';
  wrapper.appendChild(shield);
}

function removeDefendVisuals() {
  document.querySelectorAll('.defending').forEach(el => {
    el.classList.remove('defending');
  });
  document.querySelectorAll('.shield-barrier').forEach(el => {
    el.remove();
  });
}

function getTypeColor(moveType) {
  const colors = {
    fire: '#ff6b00',
    water: '#00c4ff',
    grass: '#6bcf7f',
    electric: '#ffeb3b',
    ice: '#b3e5fc',
    fighting: '#ff5722',
    poison: '#9c27b0',
    ground: '#8d6e63',
    flying: '#b2ebf2',
    psychic: '#e91e63',
    bug: '#cddc39',
    rock: '#bdbdbd',
    ghost: '#7e57c2',
    dragon: '#673ab7',
    dark: '#424242',
    steel: '#c0c0c0',
    fairy: '#fce4ec',
    normal: '#ffffff'
  };
  return colors[moveType] || '#ffffff';
}

// ===================================================================
// ADD THIS TO battle.js - PvP Post-Battle Payment Integration
// ===================================================================

async function endPvPBattle() {
    const pvpParams = getPvPParams();
    if (!pvpParams) return;

    gameState.isComplete = true;
    gameState.battleActive = false;

    const { p1, p2 } = gameState.currentBattle;
    const winner = p1.currentHp > 0 ? p1 : p2;
    const loser = p1.currentHp > 0 ? p2 : p1;
    
    console.log('🏆 PvP Battle ended. Winner:', winner.name);

    // Find winner and loser addresses
    const winnerPlayer = pvpParams.players.find(p => 
        p.pokemon_data.tokenId === winner.tokenId
    );
    const loserPlayer = pvpParams.players.find(p => 
        p.pokemon_data.tokenId === loser.tokenId
    );

    if (!winnerPlayer || !loserPlayer) {
        console.error('❌ Could not find player data');
        return;
    }

    // Show result screen
    UI.resultTitle.textContent = winner.isPlayer ? 'VICTORY!' : 'DEFEAT';
    UI.resultMessage.innerHTML = `
        ${winner.isPlayer ? '🎉 You won the PvP battle!' : '💔 You lost the battle.'}<br><br>
        Bet Amount: ${pvpParams.betAmount} PKCN<br>
        ${winner.isPlayer ? 
            `<span style="color: #00ff9d;">Waiting for opponent to pay...</span>` : 
            `<span style="color: #ff3b3b;">You must pay your debt!</span>`
        }
    `;
    UI.resultScreen.querySelector('.result-content').className = `result-content ${winner.isPlayer ? 'victory' : 'defeat'}`;
    UI.resultScreen.classList.remove('hidden');

    // Update Supabase with battle result
    try {
        const supabaseClient = window.supabase.createClient(
            window.SUPABASE_CONFIG.url,
            window.SUPABASE_CONFIG.anonKey
        );

        await supabaseClient
            .from('pvp_rooms')
            .update({ 
                status: 'payment_pending',
                winner_address: winnerPlayer.player_address,
                loser_address: loserPlayer.player_address,
                battle_completed_at: new Date().toISOString()
            })
            .eq('room_id', pvpParams.roomId);

    } catch (error) {
        console.error('❌ Failed to update battle result:', error);
    }

    // Redirect after 3 seconds
    setTimeout(() => {
        const myAddress = window.wallet.getAccount().toLowerCase();
        
        if (myAddress === loserPlayer.player_address.toLowerCase()) {
            // Loser → Payment page (can't escape!)
            window.location.href = `pvp-payment.html?roomId=${pvpParams.roomId}&amount=${pvpParams.betAmount}`;
        } else {
            // Winner → Waiting page
            window.location.href = `pvp-waiting.html?roomId=${pvpParams.roomId}&amount=${pvpParams.betAmount}`;
        }
    }, 3000);
}

// Add missing CSS
const style = document.createElement('style');
style.textContent = `
  .taking-damage {
    animation: arenaShake 0.3s ease-out;
  }
  
  @keyframes arenaShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  
  .hp-reset-pulse {
    animation: hpPulse 0.6s ease-out;
  }
  
  @keyframes hpPulse {
    0% { box-shadow: 0 0 0 rgba(0, 255, 157, 0.8); }
    50% { box-shadow: 0 0 30px rgba(0, 255, 157, 0.4); }
    100% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6); }
  }

  /* ✅ NEW: Visual indicator for speed advantage */
  .speed-advantage {
    animation: speedGlow 2s infinite;
  }

  @keyframes speedGlow {
    0%, 100% { 
      box-shadow: 0 0 10px rgba(0, 196, 255, 0.5); 
      border-color: var(--info);
    }
    50% { 
      box-shadow: 0 0 25px rgba(0, 196, 255, 0.8); 
      border-color: #00c4ff;
    }
  }
`;
document.head.appendChild(style);

// Ensure HP bars are hidden on initial load
window.addEventListener('DOMContentLoaded', () => {
  hideHpBars();
});
