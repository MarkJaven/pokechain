// Battle Arena State
const battleState = {
  playerPokemon: null,
  difficulty: 'normal',
  opponentCount: 7,
  enemyPokemon: []
};

// Global rarity distribution based on difficulty
const rarityDistribution = {
  easy: {
    common: 0.60,    // 60% common
    uncommon: 0.30,  // 30% uncommon
    rare: 0.10,      // 10% rare
    epic: 0.00,
    legendary: 0.00
  },
  normal: {
    common: 0.30,
    uncommon: 0.35,
    rare: 0.25,
    epic: 0.10,
    legendary: 0.00
  },
  hard: {
    common: 0.10,
    uncommon: 0.20,
    rare: 0.35,
    epic: 0.30,
    legendary: 0.05
  },
  insane: {
    common: 0.00,
    uncommon: 0.10,
    rare: 0.25,
    epic: 0.40,
    legendary: 0.25
  }
};

// DOM Elements
const elements = {
  transitionOverlay: document.getElementById('transitionOverlay'),
  battleLoadingScreen: document.getElementById('battleLoadingScreen'),
  difficultyDisplay: document.getElementById('difficultyDisplay'),
  participantsGrid: document.getElementById('participantsGrid')
};

// Gen 1 & Gen 2 Pokemon (ID 1-251) with rarities based on difficulty
const gen1and2Pokemon = {
  common: [
    { id: 1, name: 'Bulbasaur', types: ['grass', 'poison'] },
    { id: 4, name: 'Charmander', types: ['fire'] },
    { id: 7, name: 'Squirtle', types: ['water'] },
    { id: 10, name: 'Caterpie', types: ['bug'] },
    { id: 13, name: 'Weedle', types: ['bug', 'poison'] },
    { id: 16, name: 'Pidgey', types: ['normal', 'flying'] },
    { id: 19, name: 'Rattata', types: ['normal'] },
    { id: 21, name: 'Spearow', types: ['normal', 'flying'] },
    { id: 23, name: 'Ekans', types: ['poison'] },
    { id: 27, name: 'Sandshrew', types: ['ground'] },
    { id: 29, name: 'Nidoran-f', types: ['poison'] },
    { id: 32, name: 'Nidoran-m', types: ['poison'] },
    { id: 152, name: 'Chikorita', types: ['grass'] },
    { id: 155, name: 'Cyndaquil', types: ['fire'] },
    { id: 158, name: 'Totodile', types: ['water'] },
    { id: 161, name: 'Sentret', types: ['normal'] },
    { id: 163, name: 'Hoothoot', types: ['normal', 'flying'] }
  ],
  uncommon: [
    { id: 25, name: 'Pikachu', types: ['electric'] },
    { id: 39, name: 'Jigglypuff', types: ['normal', 'fairy'] },
    { id: 43, name: 'Oddish', types: ['grass', 'poison'] },
    { id: 54, name: 'Psyduck', types: ['water'] },
    { id: 58, name: 'Growlithe', types: ['fire'] },
    { id: 60, name: 'Poliwag', types: ['water'] },
    { id: 66, name: 'Machop', types: ['fighting'] },
    { id: 69, name: 'Bellsprout', types: ['grass', 'poison'] },
    { id: 77, name: 'Ponyta', types: ['fire'] },
    { id: 79, name: 'Slowpoke', types: ['water', 'psychic'] },
    { id: 92, name: 'Gastly', types: ['ghost', 'poison'] },
    { id: 172, name: 'Pichu', types: ['electric'] },
    { id: 175, name: 'Togepi', types: ['fairy'] },
    { id: 179, name: 'Mareep', types: ['electric'] }
  ],
  rare: [
    { id: 2, name: 'Ivysaur', types: ['grass', 'poison'] },
    { id: 5, name: 'Charmeleon', types: ['fire'] },
    { id: 8, name: 'Wartortle', types: ['water'] },
    { id: 26, name: 'Raichu', types: ['electric'] },
    { id: 59, name: 'Arcanine', types: ['fire'] },
    { id: 68, name: 'Machamp', types: ['fighting'] },
    { id: 80, name: 'Slowbro', types: ['water', 'psychic'] },
    { id: 94, name: 'Gengar', types: ['ghost', 'poison'] },
    { id: 131, name: 'Lapras', types: ['water', 'ice'] },
    { id: 143, name: 'Snorlax', types: ['normal'] },
    { id: 153, name: 'Bayleef', types: ['grass'] },
    { id: 156, name: 'Quilava', types: ['fire'] },
    { id: 159, name: 'Croconaw', types: ['water'] },
    { id: 181, name: 'Ampharos', types: ['electric'] }
  ],
  epic: [
    { id: 3, name: 'Venusaur', types: ['grass', 'poison'] },
    { id: 6, name: 'Charizard', types: ['fire', 'flying'] },
    { id: 9, name: 'Blastoise', types: ['water'] },
    { id: 65, name: 'Alakazam', types: ['psychic'] },
    { id: 76, name: 'Golem', types: ['rock', 'ground'] },
    { id: 130, name: 'Gyarados', types: ['water', 'flying'] },
    { id: 142, name: 'Aerodactyl', types: ['rock', 'flying'] },
    { id: 149, name: 'Dragonite', types: ['dragon', 'flying'] },
    { id: 154, name: 'Meganium', types: ['grass'] },
    { id: 157, name: 'Typhlosion', types: ['fire'] },
    { id: 160, name: 'Feraligatr', types: ['water'] },
    { id: 208, name: 'Steelix', types: ['steel', 'ground'] },
    { id: 212, name: 'Scizor', types: ['bug', 'steel'] },
    { id: 248, name: 'Tyranitar', types: ['rock', 'dark'] }
  ],
  legendary: [
    { id: 144, name: 'Articuno', types: ['ice', 'flying'] },
    { id: 145, name: 'Zapdos', types: ['electric', 'flying'] },
    { id: 146, name: 'Moltres', types: ['fire', 'flying'] },
    { id: 150, name: 'Mewtwo', types: ['psychic'] },
    { id: 151, name: 'Mew', types: ['psychic'] },
    { id: 243, name: 'Raikou', types: ['electric'] },
    { id: 244, name: 'Entei', types: ['fire'] },
    { id: 245, name: 'Suicune', types: ['water'] },
    { id: 249, name: 'Lugia', types: ['psychic', 'flying'] },
    { id: 250, name: 'Ho-oh', types: ['fire', 'flying'] }
  ]
};

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🎮 Battle Arena Loading...');
  await parseTournamentParams();
  setTimeout(() => hideTransition(), 1000);
});

// Parse URL parameters
async function parseTournamentParams() {
  const params = new URLSearchParams(window.location.search);
  const pokemonParam = params.get('pokemon');
  
  if (pokemonParam) {
    try {
      battleState.playerPokemon = JSON.parse(decodeURIComponent(pokemonParam));
      battleState.opponentCount = Math.min(parseInt(params.get('opponents')) || 7, 10);
      battleState.difficulty = params.get('difficulty') || 'normal';
      
      elements.difficultyDisplay.textContent = battleState.difficulty.toUpperCase();
      
      console.log('✅ Tournament data parsed:', battleState);
    } catch (e) {
      console.error('❌ Failed to parse tournament data:', e);
    }
  }
  
  // Generate mock data if no params (for testing)
  if (!battleState.playerPokemon) {
    battleState.playerPokemon = {
      tokenId: '001',
      pokemonId: 25,
      name: 'Pikachu',
      types: ['electric'],
      rarity: 'rare',
      abilities: [
        { name: 'static' },
        { name: 'lightning-rod' }
      ],
      image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
      description: 'When several of these Pokémon gather, their electricity could build and cause lightning storms.'
    };
  }
  
  // Ensure player has a rarity
  if (!battleState.playerPokemon.rarity) {
    battleState.playerPokemon.rarity = 'common';
  }
  
  await generateEnemyTeam();
}

// Hide transition
async function hideTransition() {
  elements.transitionOverlay.classList.add('hidden');
  setTimeout(async () => {
    elements.transitionOverlay.style.display = 'none';
    elements.battleLoadingScreen.classList.add('visible');
    await loadAllParticipants();
    
    // Auto-start battle after 8 seconds
    setTimeout(() => {
      startBattle();
    }, 8000);
  }, 800);
}

// Generate enemy team with duplicate prevention and rarity validation
async function generateEnemyTeam() {
  battleState.enemyPokemon = [];
  
  const distribution = rarityDistribution[battleState.difficulty] || rarityDistribution.normal;
  
  // Track all used Pokemon IDs (player's + enemies) to prevent duplicates
  const usedPokemonIds = new Set();
  if (battleState.playerPokemon?.pokemonId) {
    usedPokemonIds.add(parseInt(battleState.playerPokemon.pokemonId));
  }
  
  // Generate each opponent sequentially for better control
  for (let i = 0; i < battleState.opponentCount; i++) {
    const pokemon = await generateUniqueEnemy(distribution, usedPokemonIds, i);
    battleState.enemyPokemon.push(pokemon);
  }
  
  // Log final distribution for verification
  const rarityCounts = battleState.enemyPokemon.reduce((acc, p) => {
    acc[p.rarity] = (acc[p.rarity] || 0) + 1;
    return acc;
  }, {});
  console.log('📊 Final Enemy Rarity Distribution:', rarityCounts);
  console.log(`✅ Generated ${battleState.enemyPokemon.length} unique opponents`);
}

// Helper: Generate a single unique enemy with retry logic
async function generateUniqueEnemy(distribution, usedPokemonIds, index) {
  const maxAttempts = 100; // Prevent infinite loops
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rarity = selectRarityByDistribution(distribution);
    const pokemonPool = gen1and2Pokemon[rarity];
    
    // Filter out already-used Pokemon
    const availablePokemon = pokemonPool.filter(p => !usedPokemonIds.has(p.id));
    
    if (availablePokemon.length === 0) {
      console.warn(`All Pokemon in ${rarity} tier used, trying again...`);
      continue;
    }
    
    // Select from available pool
    const template = availablePokemon[Math.floor(Math.random() * availablePokemon.length)];
    
    try {
      const data = await fetchPokemonData(template.name, template.id);
      
      // Create enemy data with EXPLICIT rarity from distribution
      const enemyData = {
        tokenId: `${template.name}-AI-${index}`,
        pokemonId: template.id,
        name: template.name,
        types: template.types,
        rarity: rarity, // This ensures accuracy
        abilities: data.abilities,
        image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${template.id}.png`,
        description: data.description
      };
      
      usedPokemonIds.add(template.id);
      return enemyData;
      
    } catch (error) {
      console.warn(`Fetch failed for ${template.name}, retrying...`);
    }
  }
  
  // Ultimate fallback (should rarely happen)
  console.error(`Failed to generate unique enemy after ${maxAttempts} attempts`);
  const fallback = gen1and2Pokemon.common.find(p => !usedPokemonIds.has(p.id)) || gen1and2Pokemon.common[0];
  return {
    tokenId: `FALLBACK-${index}`,
    pokemonId: fallback.id,
    name: fallback.name,
    types: fallback.types,
    rarity: 'common',
    abilities: [{ name: 'fallback' }],
    image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${fallback.id}.png`,
    description: 'Emergency fallback Pokemon.'
  };
}

// Fetch Pokemon data from PokeAPI (abilities and description)
async function fetchPokemonData(name, id) {
  try {
    // Fetch abilities
    const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    let abilities = [
      { name: 'battle-ai' },
      { name: 'competitive' }
    ];
    
    if (pokemonRes.ok) {
      const pokemonData = await pokemonRes.json();
      abilities = pokemonData.abilities?.map(ab => ({
        name: ab.ability.name,
        isHidden: ab.is_hidden
      })) || abilities;
    }
    
    // Fetch description
    const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    let description = 'An AI-controlled opponent ready to challenge you in battle.';
    
    if (speciesRes.ok) {
      const speciesData = await speciesRes.json();
      const flavorText = speciesData.flavor_text_entries?.find(
        entry => entry.language.name === 'en'
      );
      
      if (flavorText) {
        description = flavorText.flavor_text.replace(/\n|\f/g, ' ');
      }
    }
    
    return { abilities, description };
  } catch (error) {
    console.warn(`Failed to fetch data for ${name}:`, error);
    return {
      abilities: [
        { name: 'battle-ai' },
        { name: 'competitive' }
      ],
      description: 'An AI-controlled opponent ready to challenge you in battle.'
    };
  }
}

// Select rarity based on probability distribution
function selectRarityByDistribution(distribution) {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [rarity, probability] of Object.entries(distribution)) {
    cumulative += probability;
    if (rand <= cumulative) {
      return rarity;
    }
  }
  
  return 'common'; // fallback
}

// Force perfect equal height after images load
function equalizeCardHeights() {
  const cards = document.querySelectorAll('.tournament-card');
  cards.forEach(c => c.style.height = '');
  const heights = [...cards].map(c => c.offsetHeight);
  const max = Math.max(...heights);
  cards.forEach(c => c.style.height = max + 'px');
}

// Load all participants (player + enemies) in one grid
function loadAllParticipants() {
  elements.participantsGrid.innerHTML = '';
  
  // Add player card first
  const playerCard = createTournamentCard(battleState.playerPokemon, true);
  elements.participantsGrid.appendChild(playerCard);
  
  // Add all enemy cards
  battleState.enemyPokemon.forEach(pokemon => {
    const enemyCard = createTournamentCard(pokemon, false);
    elements.participantsGrid.appendChild(enemyCard);
  });

  setTimeout(() => {
    equalizeCardHeights();
    window.addEventListener('resize', equalizeCardHeights);
  }, 500);
}

// Create tournament-style card
function createTournamentCard(pokemon, isPlayer) {
  const card = document.createElement('div');
  card.className = `tournament-card ${(pokemon.rarity || 'common').toLowerCase()} ${isPlayer ? 'player' : ''}`;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // Token Badge
  const tokenBadge = document.createElement('div');
  tokenBadge.className = `token-badge ${isPlayer ? '' : 'ai'}`;
  tokenBadge.textContent = pokemon.tokenId;

  // Player Indicator (only for player)
  if (isPlayer) {
    const playerIndicator = document.createElement('div');
    playerIndicator.className = 'player-indicator';
    playerIndicator.textContent = 'YOU';
    card.appendChild(playerIndicator);
  }

  // Pokemon Image
  const artDiv = document.createElement('div');
  artDiv.className = 'pokemon-image';
  const img = document.createElement('img');
  img.src = pokemon.image || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
  img.alt = pokemon.name || '';
  img.onerror = () => { 
    img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
  };
  artDiv.appendChild(img);

  // Pokemon Info
  const infoDiv = document.createElement('div');
  infoDiv.className = 'pokemon-info';

  // Name with ID
  const nameDiv = document.createElement('div');
  nameDiv.className = 'pokemon-name';
  nameDiv.textContent = `#${pokemon.pokemonId} ${pokemon.name}`;

  // Types
  const typesDiv = document.createElement('div');
  typesDiv.className = 'pokemon-types';
  if (pokemon.types && pokemon.types.length > 0) {
    pokemon.types.forEach(type => {
      const badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = type.toUpperCase();
      typesDiv.appendChild(badge);
    });
  }

  // Abilities
  const abilitiesDiv = document.createElement('div');
  abilitiesDiv.className = 'pokemon-abilities';
  if (pokemon.abilities && pokemon.abilities.length > 0) {
    const abilityNames = pokemon.abilities.slice(0, 3)
      .map(ab => ab.name.replace(/-/g, ' '))
      .join(', ');
    abilitiesDiv.textContent = `Abilities: ${abilityNames}`;
  } else {
    abilitiesDiv.textContent = 'Abilities: Unknown';
  }

  // Description
  const descriptionDiv = document.createElement('div');
  descriptionDiv.className = 'pokemon-description';
  descriptionDiv.textContent = pokemon.description || "A mysterious Pokémon ready for battle.";

  // Assemble
  infoDiv.appendChild(nameDiv);
  infoDiv.appendChild(typesDiv);
  infoDiv.appendChild(abilitiesDiv);
  infoDiv.appendChild(descriptionDiv);

  inner.appendChild(artDiv);
  inner.appendChild(infoDiv);
  card.appendChild(tokenBadge);
  card.appendChild(inner);

  return card;
}

// Start battle
function startBattle() {
  console.log('⚔️ Battle Starting!');
  // TODO: Implement actual battle logic or navigation
  alert(`⚔️ Round Robin Battle begins! ${battleState.playerPokemon.name} vs ${battleState.opponentCount} opponents on ${battleState.difficulty} difficulty!`);
}