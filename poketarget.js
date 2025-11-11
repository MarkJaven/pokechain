/* Polished Poké Target Trainer
   - One target at a time (strict)
   - Next target spawns immediately after hit or timeout (miss)
   - Preloads sprites from PokeAPI (fallback provided)
   - One attempt counted per mousedown
   - Final overlay shows hits, accuracy, base points, accuracy contribution, rank multiplier, final reward
*/

const ROUND_SECONDS = 30;
const TARGET_SIZE_MIN = 50;
const TARGET_SIZE_MAX = 80;
const VISIBLE_MIN = 600;
const VISIBLE_MAX = 800;
const PRELOAD_COUNT = 18;
const MAX_POKE_ID = 898;
const BASE_PER_HIT = 10; // base points per hit

/* DOM refs */
const arena = document.getElementById('arena');
const timerEl = document.getElementById('timer');
const hitsEl = document.getElementById('hits');
const accuracyEl = document.getElementById('accuracy');
const overlay = document.getElementById('resultsOverlay');
const finalHitsEl = document.getElementById('finalHits');
const finalAccEl = document.getElementById('finalAcc');
const finalRankEl = document.getElementById('finalRank');
const playAgainBtn = document.getElementById('playAgainBtn');
const basePointsEl = document.getElementById('basePoints');
const accContributionEl = document.getElementById('accContribution');
const rankMultiplierTextEl = document.getElementById('rankMultiplierText');
const finalRewardEl = document.getElementById('finalReward');
const cursor = document.getElementById('cursor');

/* state */
let timeLeft = ROUND_SECONDS;
let hits = 0;
let totalAttempts = 0;
let gameRunning = false;
let gameInterval = null;
let targetTimeout = null;
let activeTarget = null;

/* sprite pool */
let spritePool = [];
let preloadCompleted = false;
const FALLBACK_SPRITES = [
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png'
];

const randInt = (a,b) => Math.floor(Math.random() * (b - a + 1)) + a;
const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* cursor follow + shake */
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});
function triggerCursorShake(){
  cursor.classList.add('shake');
  setTimeout(()=> cursor.classList.remove('shake'), 300);
}

/* HUD */
function updateHUD(){
  hitsEl.textContent = hits;
  const acc = totalAttempts > 0 ? Math.round((hits / totalAttempts) * 100) : 0;
  accuracyEl.textContent = acc + '%';
}

/* preload sprites (client-side, non-blocking) */
async function preloadSprites(){
  spritePool = [];
  const ids = new Set();
  while (ids.size < PRELOAD_COUNT) ids.add(randInt(1, MAX_POKE_ID));
  const promises = Array.from(ids).map(async id => {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      const sprite = json.sprites?.other?.['official-artwork']?.front_default || json.sprites?.front_default;
      if (sprite){
        const img = new Image();
        img.src = sprite;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        return sprite;
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  const results = await Promise.all(promises);
  results.forEach(r => { if (r) spritePool.push(r); });
  if (spritePool.length === 0) spritePool = FALLBACK_SPRITES.slice();
  preloadCompleted = true;
}

/* spawn a single target — strict single-target: only spawn if none active */
function spawnTarget(){
  if (!gameRunning) return;
  if (activeTarget) return; // enforce single-target

  if (!preloadCompleted || spritePool.length === 0){
    spritePool = FALLBACK_SPRITES.slice();
    preloadCompleted = true;
  }

  const size = randInt(TARGET_SIZE_MIN, TARGET_SIZE_MAX);
  const rect = arena.getBoundingClientRect();
  const left = randInt(6, Math.max(6, Math.floor(rect.width - size - 6)));
  const top = randInt(6, Math.max(6, Math.floor(rect.height - size - 6)));
  const url = randChoice(spritePool);

  const wrapper = document.createElement('div');
  wrapper.className = 'target pop-in';
  wrapper.style.width = size + 'px';
  wrapper.style.height = size + 'px';
  wrapper.style.left = left + 'px';
  wrapper.style.top = top + 'px';
  wrapper.style.pointerEvents = 'auto';

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Pokémon';
  img.draggable = false;
  wrapper.appendChild(img);

  // hit handler: increment hits (attempt already counted on mousedown), remove and spawn next immediately
  wrapper.addEventListener('click', (e) => {
    if (!gameRunning) return;
    hits++;
    // clear any existing timeout for this target
    if (targetTimeout){ clearTimeout(targetTimeout); targetTimeout = null; }
    // remove element immediately (no overlap)
    if (wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
    activeTarget = null;
    updateHUD();
    // spawn next immediately
    spawnTarget();
  });

  arena.appendChild(wrapper);
  activeTarget = wrapper;

  // schedule auto-remove (miss). When it times out we remove and spawn next immediately.
  const visibleFor = randInt(VISIBLE_MIN, VISIBLE_MAX);
  targetTimeout = setTimeout(()=> {
    if (!gameRunning) return;
    if (activeTarget){
      if (activeTarget.parentElement) activeTarget.parentElement.removeChild(activeTarget);
      activeTarget = null;
      targetTimeout = null;
      updateHUD();
      // spawn next immediately
      spawnTarget();
    }
  }, visibleFor);
}

/* Count one attempt per mousedown while game is running */
document.addEventListener('mousedown', (e)=>{
  if (!gameRunning) return;
  if (e.target.closest('#playAgainBtn')) return;
  totalAttempts++;
  updateHUD();
  triggerCursorShake();
});

/* game control */
function startGame(){
  // reset
  timeLeft = ROUND_SECONDS;
  hits = 0;
  totalAttempts = 0;
  gameRunning = true;
  overlay.style.display = 'none';
  updateHUD();
  timerEl.textContent = timeLeft;

  // preload sprites once (non-blocking)
  if (!preloadCompleted) {
    preloadSprites().then(()=> {
      if (gameRunning) spawnTarget();
    });
  } else {
    spawnTarget();
  }

  if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(()=> {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(gameInterval);
      endGame();
    }
  }, 1000);
}

/* reward computation and end */
function computeReward(hitsCount, attemptsCount){
  const acc = attemptsCount > 0 ? Math.round((hitsCount / attemptsCount) * 100) : 0;
  const base = hitsCount * BASE_PER_HIT;
  const accContribution = Math.round(base * (acc / 100));
  let rank = 'C', multiplier = 0.7;
  if (acc >= 90) { rank = 'S'; multiplier = 1.5; }
  else if (acc >= 75) { rank = 'A'; multiplier = 1.25; }
  else if (acc >= 50) { rank = 'B'; multiplier = 1.0; }
  const final = Math.round(accContribution * multiplier);
  return { base, accContribution, multiplier, rank, final, acc };
}

function endGame(){
  gameRunning = false;
  if (gameInterval) { clearInterval(gameInterval); gameInterval = null; }
  if (targetTimeout) { clearTimeout(targetTimeout); targetTimeout = null; }
  if (activeTarget){ if (activeTarget.parentElement) activeTarget.parentElement.removeChild(activeTarget); activeTarget = null; }

  const { base, accContribution, multiplier, rank, final, acc } = computeReward(hits, totalAttempts);

  finalHitsEl.textContent = hits + ' Hits';
  finalAccEl.textContent = acc + '%';
  finalRankEl.textContent = `${rank} Rank`;

  basePointsEl.textContent = base;
  accContributionEl.textContent = accContribution;
  rankMultiplierTextEl.textContent = '×' + multiplier.toFixed(2);
  finalRewardEl.textContent = final;

  overlay.style.display = 'flex';
  updateHUD();
}

/* Play again */
playAgainBtn.addEventListener('click', ()=>{
  startGame();
});

/* auto-start on load (like before) */
window.addEventListener('load', ()=> {
  setTimeout(()=> startGame(), 650);
});
