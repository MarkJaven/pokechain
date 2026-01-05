// ===================================================================
// PVP BATTLE ENGINE - pvp.js
// ===================================================================

const PvPBattle = {
  currentBattle: null,
  playerAddress: null,
  opponentAddress: null,
  matchId: null,
  battleSeed: null,
  isPlayer1: true,
  supabaseClient: null,
  rngState: 0,
  
  // Same type chart as battle.js
  TYPE_CHART: {
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
  },
  
  RARITY_MULTIPLIERS: {
    common: 1.00,
    uncommon: 1.05,
    rare: 1.10,
    epic: 1.18,
    legendary: 1.30
  },
  
  // Initialize battle
  init(matchData, playerAddr, supabase) {
    this.matchId = matchData.match_id;
    this.playerAddress = playerAddr;
    this.isPlayer1 = matchData.player1_address === playerAddr;
    this.opponentAddress = this.isPlayer1 ? matchData.player2_address : matchData.player1_address;
    this.battleSeed = matchData.battle_seed;
    this.supabaseClient = supabase;
    
    // Initialize seeded RNG
    this.rngState = this.seedRNG(this.battleSeed);
    
    // Create battle Pokémon
    const playerData = this.isPlayer1 ? matchData.player1_pokemon : matchData.player2_pokemon;
    const opponentData = this.isPlayer1 ? matchData.player2_pokemon : matchData.player1_pokemon;
    
    this.currentBattle = {
      player: this.createBattlePokemon(playerData, true),
      opponent: this.createBattlePokemon(opponentData, false),
      round: 1,
      actionsThisRound: 0,
      defending: null,
      battleLog: []
    };
    
    // Determine turn order by speed
    this.currentBattle.turn = this.determineFirstAttacker();
    
    console.log('✅ PvP Battle initialized:', this.currentBattle);
  },
  
  // Seeded random number generator
  seedRNG(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  },
  
  seededRandom() {
    this.rngState = (this.rngState * 9301 + 49297) % 233280;
    return this.rngState / 233280;
  },
  
  // Create battle Pokémon with stats
  createBattlePokemon(metadata, isPlayer) {
    const multiplier = this.RARITY_MULTIPLIERS[metadata.rarity] || 1.0;
    
    const stats = {
      hp: metadata.stats.hp,
      attack: Math.floor(metadata.stats.attack * multiplier),
      defense: Math.floor(metadata.stats.defense * multiplier),
      specialAttack: Math.floor(metadata.stats.specialAttack * multiplier),
      specialDefense: Math.floor(metadata.stats.specialDefense * multiplier),
      speed: Math.floor(metadata.stats.speed * multiplier)
    };
    
    const maxHp = Math.floor(stats.hp * multiplier);
    
    return {
      ...metadata,
      stats,
      maxHp,
      currentHp: maxHp,
      isPlayer,
      address: isPlayer ? this.playerAddress : this.opponentAddress
    };
  },
  
  // Determine who goes first based on speed
  determineFirstAttacker() {
    const { player, opponent } = this.currentBattle;
    if (player.stats.speed > opponent.stats.speed) return 0;
    if (opponent.stats.speed > player.stats.speed) return 1;
    return this.seededRandom() < 0.5 ? 0 : 1;
  },
  
  // Execute a turn
  async executeTurn(action) {
    const attacker = this.currentBattle.turn === 0 ? this.currentBattle.player : this.currentBattle.opponent;
    const defender = this.currentBattle.turn === 0 ? this.currentBattle.opponent : this.currentBattle.player;
    
    if (action.type === 'ability') {
      await this.executeAbility(attacker, defender, action.ability);
    } else if (action.type === 'defend') {
      this.currentBattle.defending = attacker;
      this.log('defend', `${attacker.name} defends!`);
    }
    
    // Switch turns
    this.currentBattle.turn = 1 - this.currentBattle.turn;
    this.currentBattle.actionsThisRound++;
    
    // End of round
    if (this.currentBattle.actionsThisRound >= 2) {
      this.currentBattle.actionsThisRound = 0;
      this.currentBattle.round++;
      this.currentBattle.defending = null;
      this.currentBattle.turn = this.determineFirstAttacker();
    }
    
    // Check for winner
    if (this.currentBattle.player.currentHp <= 0 || this.currentBattle.opponent.currentHp <= 0) {
      return this.finalizeBattle();
    }
    
    return null;
  },
  
  // Execute ability attack
  async executeAbility(attacker, defender, ability) {
    const moveType = this.getAbilityType(ability.name, attacker.types);
    
    // Hit chance
    if (!this.calculateHitChance(attacker, defender)) {
      this.log('effectiveness', `${attacker.name}'s attack missed!`);
      return;
    }
    
    // Heal moves
    if (ability.shortEffect?.toLowerCase().includes('heal')) {
      const healAmount = Math.floor(attacker.maxHp * 0.15);
      attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
      this.log('heal', `${attacker.name} restored ${healAmount} HP!`);
      return;
    }
    
    // Damage calculation
    let power = 60;
    if (ability.shortEffect?.toLowerCase().includes('powerful')) power = 90;
    else if (ability.shortEffect?.toLowerCase().includes('strong')) power = 75;
    
    let damage = this.calculateDamage(power, moveType, attacker, defender);
    
    // Defense reduction
    if (this.currentBattle.defending === defender) {
      const rand = this.seededRandom();
      if (rand < 0.1) damage = 0; // Parry
      else if (rand < 0.3) damage = Math.floor(damage * 0.5); // Block
      else damage = Math.floor(damage * 0.7); // Defend
    }
    
    // Critical hit
    if (this.isCriticalHit()) {
      damage = Math.floor(damage * 1.5);
      this.log('effectiveness', 'CRITICAL HIT!');
    }
    
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    this.log('damage', `${attacker.name} dealt ${damage} damage!`);
  },
  
  // Damage calculation (same as battle.js)
  calculateDamage(power, moveType, attacker, defender) {
    const level = 50;
    const attackStat = attacker.stats.attack;
    const defenseStat = defender.stats.defense;
    
    let damage = Math.floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2);
    
    // STAB bonus
    if (attacker.types.includes(moveType)) {
      damage = Math.floor(damage * 1.5);
    }
    
    // Type effectiveness
    const effectiveness = this.calculateTypeEffectiveness(moveType, defender.types);
    damage = Math.floor(damage * effectiveness);
    
    // Random factor
    damage = Math.floor(damage * (0.85 + this.seededRandom() * 0.15));
    
    return Math.max(1, damage);
  },
  
  calculateTypeEffectiveness(moveType, defenderTypes) {
    let multiplier = 1;
    defenderTypes.forEach(type => {
      if (this.TYPE_CHART[moveType]?.[type]) {
        multiplier *= this.TYPE_CHART[moveType][type];
      }
    });
    
    if (multiplier > 1.25) this.log('effectiveness', "Super effective!");
    else if (multiplier < 1 && multiplier > 0) this.log('effectiveness', "Not very effective...");
    
    return multiplier;
  },
  
  calculateHitChance(attacker, defender) {
    const speedDiff = attacker.stats.speed - defender.stats.speed;
    const hitRate = Math.min(0.95, 0.9 + (speedDiff * 0.002));
    return this.seededRandom() < hitRate;
  },
  
  isCriticalHit() {
    return this.seededRandom() < 0.06;
  },
  
  getAbilityType(abilityName, pokemonTypes) {
    const name = abilityName.toLowerCase();
    if (name.includes('fire') || name.includes('flame')) return 'fire';
    if (name.includes('water') || name.includes('surf')) return 'water';
    if (name.includes('thunder') || name.includes('bolt')) return 'electric';
    if (name.includes('solar') || name.includes('leaf')) return 'grass';
    if (name.includes('ice') || name.includes('blizzard')) return 'ice';
    return pokemonTypes[0];
  },
  
  // Finalize battle and return result
  finalizeBattle() {
    const winner = this.currentBattle.player.currentHp > 0 
      ? this.currentBattle.player 
      : this.currentBattle.opponent;
    
    const battleHash = this.generateBattleHash();
    
    return {
      winner: winner.address,
      rounds: this.currentBattle.round,
      battleHash,
      finalStates: {
        player1: {
          currentHp: this.isPlayer1 ? this.currentBattle.player.currentHp : this.currentBattle.opponent.currentHp,
          maxHp: this.isPlayer1 ? this.currentBattle.player.maxHp : this.currentBattle.opponent.maxHp
        },
        player2: {
          currentHp: this.isPlayer1 ? this.currentBattle.opponent.currentHp : this.currentBattle.player.currentHp,
          maxHp: this.isPlayer1 ? this.currentBattle.opponent.maxHp : this.currentBattle.player.maxHp
        }
      }
    };
  },
  
  generateBattleHash() {
    const logString = this.currentBattle.battleLog.join('|');
    let hash = 0;
    for (let i = 0; i < logString.length; i++) {
      hash = ((hash << 5) - hash) + logString.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  },
  
  log(type, message) {
    this.currentBattle.battleLog.push(`${type}:${message}`);
  },
  
  // Send move to Supabase
  async sendMove(action) {
    await this.supabaseClient
      .from('match_moves')
      .insert({
        match_id: this.matchId,
        player_address: this.playerAddress,
        round: this.currentBattle.round,
        action: action
      });
  },
  
  // Wait for opponent move
  async waitForOpponentMove() {
    return new Promise((resolve) => {
      const subscription = this.supabaseClient
        .channel(`match_${this.matchId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'match_moves',
          filter: `match_id=eq.${this.matchId}`
        }, (payload) => {
          if (payload.new.player_address !== this.playerAddress) {
            subscription.unsubscribe();
            resolve(payload.new.action);
          }
        })
        .subscribe();
    });
  }
};

// Export
window.PvPBattle = PvPBattle;