/* tournament.js */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // DOM Elements
  const pokemonSelector = document.getElementById('pokemonSelector');
  const startTournamentBtn = document.getElementById('startTournamentBtn');
  const tournamentSetup = document.getElementById('tournamentSetup');
  const battleArena = document.getElementById('battleArena');
  const resultsScreen = document.getElementById('resultsScreen');

  // Battle Elements
  const currentRoundEl = document.getElementById('currentRound');
  const totalRoundsEl = document.getElementById('totalRounds');
  const winsEl = document.getElementById('wins');
  const lossesEl = document.getElementById('losses');

  const playerSpriteEl = document.getElementById('playerSprite');
  const playerNameEl = document.getElementById('playerName');
  const playerHpEl = document.getElementById('playerHp');
  const playerMaxHpEl = document.getElementById('playerMaxHp');
  const playerHpBarEl = document.getElementById('playerHpBar');

  const enemySpriteEl = document.getElementById('enemySprite');
  const enemyNameEl = document.getElementById('enemyName');
  const enemyHpEl = document.getElementById('enemyHp');
  const enemyMaxHpEl = document.getElementById('enemyMaxHp');
  const enemyHpBarEl = document.getElementById('enemyHpBar');

  const battleLog = document.getElementById('battleLog');
  const attackBtn = document.getElementById('attackBtn');
  const nextRoundBtn = document.getElementById('nextRoundBtn');

  // Results Elements
  const resultsTitle = document.getElementById('resultsTitle');
  const resultsMessage = document.getElementById('resultsMessage');
  const finalRoundsEl = document.getElementById('finalRounds');
  const finalWinsEl = document.getElementById('finalWins');
  const finalLossesEl = document.getElementById('finalLosses');
  const rewardAmountEl = document.getElementById('rewardAmount');
  const playAgainBtn = document.getElementById('playAgainBtn');

  // Game State
  let selectedPokemon = null;
  let playerPokemon = null;
  let enemyPokemon = null;
  let currentRound = 1;
  let totalRounds = 3;
  let wins = 0;
  let losses = 0;

  // AI Enemy Pool (random pokemon IDs)
  const ENEMY_POOL = [25, 6, 9, 94, 130, 65, 68, 76, 143, 115];

  // Get player's collection
  function getPlayerCollection() {
    const starters = JSON.parse(localStorage.getItem('claimed_starters') || '[]');
    const listings = JSON.parse(localStorage.getItem('pokemarket_listings') || '[]');
    const purchased = listings.filter(l => l.sold && l.buyer === 'demo-buyer').map(l => l.pokemonId);
    return [...starters, ...purchased];
  }

  // Fetch Pokemon
  async function fetchPokemon(id) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch pokemon:', error);
      return null;
    }
  }

  // Load Player Collection
  async function loadPlayerCollection() {
    const collection = getPlayerCollection();
    
    if (collection.length === 0) {
      pokemonSelector.innerHTML = '<p style="color: rgba(255,255,255,0.5); padding: 40px;">No Pokémon in your collection. Visit the Collection page to claim starters!</p>';
      return;
    }

    for (const id of collection) {
      const pokemon = await fetchPokemon(id);
      if (pokemon) {
        const card = createSelectorCard(pokemon);
        pokemonSelector.appendChild(card);
      }
    }
  }

  // Create Selector Card
  function createSelectorCard(pokemon) {
    const card = document.createElement('div');
    card.className = 'selector-card';
    card.dataset.pokemonId = pokemon.id;

    const img = document.createElement('img');
    img.src = pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default;
    img.alt = pokemon.name;

    const name = document.createElement('div');
    name.className = 'selector-name';
    name.textContent = pokemon.name;

    card.appendChild(img);
    card.appendChild(name);

    card.onclick = () => selectPokemon(card, pokemon);

    return card;
  }

  // Select Pokemon
  function selectPokemon(card, pokemon) {
    document.querySelectorAll('.selector-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPokemon = pokemon;
    startTournamentBtn.disabled = false;
  }

  // Start Tournament
  startTournamentBtn.onclick = async () => {
    if (!selectedPokemon) return;

    playerPokemon = {
      data: selectedPokemon,
      hp: selectedPokemon.stats.find(s => s.stat.name === 'hp').base_stat,
      maxHp: selectedPokemon.stats.find(s => s.stat.name === 'hp').base_stat,
      attack: selectedPokemon.stats.find(s => s.stat.name === 'attack').base_stat
    };

    currentRound = 1;
    wins = 0;
    losses = 0;

    tournamentSetup.style.display = 'none';
    battleArena.style.display = 'block';

    await startNewRound();
  };

  // Start New Round
  async function startNewRound() {
    // Get random enemy
    const enemyId = ENEMY_POOL[Math.floor(Math.random() * ENEMY_POOL.length)];
    const enemyData = await fetchPokemon(enemyId);

    enemyPokemon = {
      data: enemyData,
      hp: enemyData.stats.find(s => s.stat.name === 'hp').base_stat,
      maxHp: enemyData.stats.find(s => s.stat.name === 'hp').base_stat,
      attack: enemyData.stats.find(s => s.stat.name === 'attack').base_stat
    };

    // Reset player HP
    playerPokemon.hp = playerPokemon.maxHp;

    // Update UI
    currentRoundEl.textContent = currentRound;
    totalRoundsEl.textContent = totalRounds;
    winsEl.textContent = wins;
    lossesEl.textContent = losses;

    playerSpriteEl.src = playerPokemon.data.sprites?.other?.['official-artwork']?.front_default;
    playerNameEl.textContent = playerPokemon.data.name;
    playerHpEl.textContent = playerPokemon.hp;
    playerMaxHpEl.textContent = playerPokemon.maxHp;
    playerHpBarEl.style.width = '100%';

    enemySpriteEl.src = enemyPokemon.data.sprites?.other?.['official-artwork']?.front_default;
    enemyNameEl.textContent = enemyPokemon.data.name;
    enemyHpEl.textContent = enemyPokemon.hp;
    enemyMaxHpEl.textContent = enemyPokemon.maxHp;
    enemyHpBarEl.style.width = '100%';

    battleLog.innerHTML = '<div class="log-entry">Battle Start! Good luck!</div>';

    attackBtn.style.display = 'block';
    nextRoundBtn.style.display = 'none';
    attackBtn.disabled = false;
  };

  // Attack
  attackBtn.onclick = () => {
    attackBtn.disabled = true;

    // Player attacks
    const playerDamage = Math.floor(playerPokemon.attack * (0.8 + Math.random() * 0.4));
    enemyPokemon.hp = Math.max(0, enemyPokemon.hp - playerDamage);
    updateHP('enemy');
    addLog(`${playerPokemon.data.name} attacks! <span class="log-damage">-${playerDamage} damage</span>`);

    setTimeout(() => {
      if (enemyPokemon.hp <= 0) {
        roundWin();
        return;
      }

      // Enemy attacks
      const enemyDamage = Math.floor(enemyPokemon.attack * (0.8 + Math.random() * 0.4));
      playerPokemon.hp = Math.max(0, playerPokemon.hp - enemyDamage);
      updateHP('player');
      addLog(`${enemyPokemon.data.name} attacks! <span class="log-damage">-${enemyDamage} damage</span>`);

      if (playerPokemon.hp <= 0) {
        roundLoss();
      } else {
        attackBtn.disabled = false;
      }
    }, 1000);
  };

  // Update HP
  function updateHP(side) {
    if (side === 'player') {
      playerHpEl.textContent = playerPokemon.hp;
      const percent = (playerPokemon.hp / playerPokemon.maxHp) * 100;
      playerHpBarEl.style.width = percent + '%';
    } else {
      enemyHpEl.textContent = enemyPokemon.hp;
      const percent = (enemyPokemon.hp / enemyPokemon.maxHp) * 100;
      enemyHpBarEl.style.width = percent + '%';
    }
  }

  // Add Log Entry
  function addLog(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = message;
    battleLog.appendChild(entry);
    battleLog.scrollTop = battleLog.scrollHeight;
  }

  // Round Win
  function roundWin() {
    wins++;
    winsEl.textContent = wins;
    addLog(`<span class="log-heal">Victory! ${playerPokemon.data.name} wins!</span>`);
    attackBtn.style.display = 'none';

    if (currentRound < totalRounds) {
      nextRoundBtn.style.display = 'block';
    } else {
      setTimeout(showResults, 2000);
    }
  }

  // Round Loss
  function roundLoss() {
    losses++;
    lossesEl.textContent = losses;
    addLog(`<span class="log-damage">Defeat! ${enemyPokemon.data.name} wins!</span>`);
    attackBtn.style.display = 'none';

    if (currentRound < totalRounds) {
      nextRoundBtn.style.display = 'block';
    } else {
      setTimeout(showResults, 2000);
    }
  }

  // Next Round
  nextRoundBtn.onclick = () => {
    currentRound++;
    startNewRound();
  };

  // Show Results
  function showResults() {
    battleArena.style.display = 'none';
    resultsScreen.style.display = 'block';

    const winRate = wins / totalRounds;
    let reward = 0;

    if (winRate >= 0.67) {
      resultsTitle.textContent = '🏆 Champion!';
      resultsMessage.textContent = 'Outstanding performance! You dominated the tournament!';
      reward = 100;
    } else if (winRate >= 0.34) {
      resultsTitle.textContent = '⭐ Good Fight!';
      resultsMessage.textContent = 'Well played! You showed great skill!';
      reward = 50;
    } else {
      resultsTitle.textContent = '💪 Keep Training!';
      resultsMessage.textContent = 'Better luck next time! Keep training your Pokémon!';
      reward = 10;
    }

    finalRoundsEl.textContent = totalRounds;
    finalWinsEl.textContent = wins;
    finalLossesEl.textContent = losses;
    rewardAmountEl.textContent = `${reward} $PCT`;
  }

  // Play Again
  playAgainBtn.onclick = () => {
    resultsScreen.style.display = 'none';
    tournamentSetup.style.display = 'block';
    selectedPokemon = null;
    startTournamentBtn.disabled = true;
    document.querySelectorAll('.selector-card').forEach(c => c.classList.remove('selected'));
  };

  // Initialize
  loadPlayerCollection();
});