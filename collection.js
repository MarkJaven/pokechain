console.log('collection.js unified grid loaded');

async function safeGetProvider() {
  if (!window.wallet || !window.wallet.getProvider) return null;
  try { return await window.wallet.getProvider(); } catch { return null; }
}

function decodeBase64Json(dataUri) {
  try {
    const b64 = dataUri.split(',')[1];
    return JSON.parse(atob(b64));
  } catch { return null; }
}

function ipfsToHttp(uri) {
  return uri?.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + uri.slice(7) : uri;
}

async function fetchJson(uri) {
  try {
    if (uri.startsWith('data:application/json;base64,')) return decodeBase64Json(uri);
    if (uri.startsWith('ipfs://')) uri = ipfsToHttp(uri);
    const res = await fetch(uri);
    return await res.json();
  } catch { return null; }
}

async function resolveMetadata(nft, id) {
  try {
    const uri = await nft.tokenURI(id);
    if (uri.startsWith('data:')) return decodeBase64Json(uri);
    return await fetchJson(uri);
  } catch { return null; }
}

function makeCard({ uniqueId, pokemonId, name, image, rarity, types, abilities }) {
  const card = document.createElement('div');
  card.className = `market-card ${(rarity || 'common').toLowerCase()}`;
  
  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // Unique ID Badge (absolute positioned on card, not inner)
  const uniqueIdBadge = document.createElement('div');
  uniqueIdBadge.className = 'unique-id-badge';
  uniqueIdBadge.textContent = `#${uniqueId}`;

  // Art section
  const art = document.createElement('div');
  art.className = 'art';
  const img = document.createElement('img');
  img.src = image || '';
  img.alt = name || '';
  art.appendChild(img);

  // Pokemon name with PokeAPI ID
  const h4 = document.createElement('h4');
  h4.className = 'name';
  h4.textContent = `#${pokemonId} ${name || ''}`;

  // Types section
  const typesDiv = document.createElement('div');
  typesDiv.className = 'types';
  if (types && types.length > 0) {
    types.forEach(type => {
      const badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = type.toUpperCase();
      typesDiv.appendChild(badge);
    });
  }

  // Abilities section
  const abilitiesDiv = document.createElement('div');
  abilitiesDiv.className = 'abilities';
  abilitiesDiv.textContent = abilities || '';

  // Owned badge
  const ownedBadge = document.createElement('div');
  ownedBadge.className = 'owned-badge';
  ownedBadge.textContent = 'Owned';

  // Actions wrapper with sell button
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  const sellBtn = document.createElement('button');
  sellBtn.className = 'btn-primary-action btn-sell';
  sellBtn.textContent = 'Sell';
  sellBtn.onclick = () => handleSell(uniqueId, name, pokemonId);
  actionsDiv.appendChild(sellBtn);

  // Build the card structure
  inner.appendChild(art);
  inner.appendChild(h4);
  inner.appendChild(typesDiv);
  inner.appendChild(abilitiesDiv);
  inner.appendChild(ownedBadge);
  inner.appendChild(actionsDiv);
  
  card.appendChild(uniqueIdBadge);
  card.appendChild(inner);
  
  return card;
}

function handleSell(uniqueId, name, pokemonId) {
  console.log(`Selling token ${uniqueId} - #${pokemonId} ${name}`);
  alert(`Sell functionality for #${pokemonId} ${name} (Token #${uniqueId}) coming soon!`);
}

async function fetchOwnedTokens(provider, nft, addr) {
  const iface = new ethers.Interface([
    "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)"
  ]);
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await provider.getBlockNumber();
  let logs = [];
  try {
    logs = await provider.getLogs({
      address: nft.target,
      fromBlock: Math.max(0, latest - 50000),
      toBlock: 'latest',
      topics: [topic]
    });
  } catch (e) { console.warn('getLogs failed', e); }

  const owned = new Set();
  for (const l of logs) {
    try {
      const { args } = iface.parseLog(l);
      const from = args.from.toLowerCase(), to = args.to.toLowerCase();
      const tid = args.tokenId.toString();
      if (to === addr) owned.add(tid);
      if (from === addr) owned.delete(tid);
    } catch {}
  }
  return [...owned].map(Number);
}

async function renderCollection() {
  const grid = document.getElementById('allCollectionGrid');
  const totalEl = document.getElementById('totalPokemon');
  const rareEl = document.getElementById('rarePokemon');
  const emptyState = document.getElementById('emptyState');

  grid.innerHTML = '';
  const provider = await safeGetProvider();
  if (!provider) return console.error('no provider');

  let acc = window.wallet?.getAccount?.();
  if (!acc) {
    await window.wallet?.connectWallet?.();
    acc = window.wallet?.getAccount?.();
  }
  if (!acc) return alert('Please connect your wallet first.');

  const addr = acc.toLowerCase();
  const nftAddr = window.CONTRACTS?.POKEMON_NFT_ADDRESS;
  const abi = window.ABIS?.POKEMON_NFT;
  const nft = new ethers.Contract(nftAddr, abi, provider);

  const ids = await fetchOwnedTokens(provider, nft, addr);
  let total = 0, rareCount = 0;

  for (const uniqueId of ids) {
    const meta = await resolveMetadata(nft, uniqueId);
    if (!meta) continue;
    
    let name = meta.name || `Token ${uniqueId}`;
    const nameMatch = name.match(/Pokemon #\d+:\s*(.+)/i);
    if (nameMatch) {
      name = nameMatch[1];
    }
    
    let image = meta.image ? ipfsToHttp(meta.image) : '';
    let rarity = 'Common';
    let types = [];
    let abilities = '';
    let pokemonId = 1;
    
    if (meta.attributes) {
      const r = meta.attributes.find(a => a.trait_type?.toLowerCase() === 'rarity');
      if (r) rarity = r.value;
      
      const t = meta.attributes.find(a => a.trait_type?.toLowerCase() === 'type');
      if (t && t.value) {
        types = t.value.split(',').map(s => s.trim());
      }
      
      const a = meta.attributes.find(a => a.trait_type?.toLowerCase() === 'abilities');
      if (a && a.value) abilities = `Abilities: ${a.value}`;
      
      const pid = meta.attributes.find(a => 
        a.trait_type?.toLowerCase() === 'pokemon id' || 
        a.trait_type?.toLowerCase() === 'pokemonid' ||
        a.trait_type?.toLowerCase() === 'id'
      );
      if (pid) pokemonId = pid.value;
    }
    
    const card = makeCard({ uniqueId, pokemonId, name, image, rarity, types, abilities });
    grid.appendChild(card);
    total++;
    if (['rare','epic','legendary'].includes(rarity.toLowerCase())) rareCount++;
  }

  totalEl.textContent = total;
  rareEl.textContent = rareCount;
  emptyState.style.display = total ? 'none' : 'block';
}

window.addEventListener('load', renderCollection);