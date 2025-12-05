// =========================================
// CONTRACT ADDRESSES - WORKS FOR ALL PAGES
// =========================================
window.CONTRACTS = {
  // Tournament.js expects these (no suffix)
  PKCN: "0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce",
  MARKETPLACE: "0xf846D560F06a2D32fc550c8b5Ce593729B0a055D",
  POKEMON_NFT: "0x1477704FC8279BAB0a0475d3F78d6Dc624d5f04B",
  TOURNAMENT: "0xE1B32A36cfEf94145fAC1bEDDAD5B01D5eCd2457",
  NFT_LOCK_GUARD: "0xe1C2ea707fBE1F1b59E5f4C045c81D2c53C8d43D",
  
  // Collection/Marketplace expect these (with suffix)
  PKCN_ADDRESS: "0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce",
  MARKETPLACE_ADDRESS: "0xf846D560F06a2D32fc550c8b5Ce593729B0a055D",
  POKEMON_NFT_ADDRESS: "0x1477704FC8279BAB0a0475d3F78d6Dc624d5f04B",
  TOURNAMENT_ADDRESS: "0xE1B32A36cfEf94145fAC1bEDDAD5B01D5eCd2457",
  NFT_LOCK_GUARD_ADDRESS: "0xe1C2ea707fBE1F1b59E5f4C045c81D2c53C8d43D" 
};

// =========================================
// CONTRACT ABIS - COMPLETE FOR ALL PAGES
// =========================================
window.ABIS = {
  // PKCN ABI (full version for tournament.js)
  PKCN: [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount) external",
    "function setMinter(address m) external",
    "function minter() view returns (address)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event MinterUpdated(address indexed newMinter)"
  ],
  
  // MARKETPLACE ABI (unchanged)
  MARKETPLACE: [
    "function buyPokemon(string memory name, string memory rarity, string memory imageURI, uint256 price) public returns (uint256)",
    "function listPokemon(uint256 tokenId, uint256 price) public returns (uint256)",
    "function buyListedPokemon(uint256 listingId) public",
    "function cancelListing(uint256 listingId) public",
    "function remainingSupply(string calldata rarity) external view returns (uint256)",
    "event PokeListed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price)",
    "event ListingBought(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, uint256 price)",
    "event PokeDelisted(uint256 indexed listingId, uint256 indexed tokenId)",
    "event PokePurchased(address indexed buyer, uint256 indexed tokenId, uint256 price)"
  ],
  
  // POKEMON_NFT ABI (unchanged)
  POKEMON_NFT: [
    "function mint(address to, string memory name, string memory rarity, string memory imageURI) public returns (uint256)",
    "function tokenURI(uint256 tokenId) public view returns (string memory)",
    "function ownerOf(uint256 tokenId) public view returns (address)",
    "function balanceOf(address owner) public view returns (uint256)",
    "function remainingSupply(string memory rarity) public view returns (uint256)",
    "function approve(address to, uint256 tokenId) public",
    "function setApprovalForAll(address operator, bool approved) public",
    "function isApprovedForAll(address owner, address operator) public view returns (bool)",
    "function getApproved(uint256 tokenId) public view returns (address)",
    "function transferFrom(address from, address to, uint256 tokenId) public",
    "function safeTransferFrom(address from, address to, uint256 tokenId) public",
    "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
    "event PokemonMinted(uint256 indexed tokenId, address indexed owner, string name, string rarity)"
  ],
  
  // TOURNAMENT ABI (unchanged)
   // TOURNAMENT ABI - COMPLETE VERSION
  TOURNAMENT: [
    // Core functions
    "function ENTRY_FEE() view returns (uint256)",
    "function startTournament(string tournamentId, uint256 tokenId, string difficulty, uint256 opponentCount) external",
    "function completeTournament(string tournamentId, uint256 wins, bool isPerfect) external",
    "function claimReward(string tournamentId) external",
    "function calculateReward(string difficulty, uint256 wins, bool isPerfect) view returns (uint256)",
    "function getEstimatedRewards(string difficulty, uint256 opponentCount) view returns (uint256 minReward, uint256 maxReward)",
    
    // Query functions - THESE WERE MISSING!
    "function getActiveTournament(address) external view returns (string, bool, bool)",
    "function getUnclaimedRewards(address) external view returns (string[], uint256[])",
    "function getTournamentData(string) external view returns (address, uint256, string, uint256, uint256, bool, bool, uint256, uint256, uint256)",
    "function getLockStatus(uint256) external view returns (bool, string)",
    "function canStartTournament(address, uint256) external view returns (bool, string)",
    "function expireTournament(string) external",
    
    // Events
    "event TournamentStarted(string indexed tournamentId, address indexed player, uint256 tokenId, string difficulty, uint256 opponentCount, uint256 entryFee)",
    "event TournamentCompleted(string indexed tournamentId, uint256 wins, uint256 totalReward)",
    "event RewardClaimed(string indexed tournamentId, address indexed player, uint256 reward)",
    "event TournamentExpired(string indexed tournamentId, address indexed player)",
    "event NFTUnlocked(uint256 indexed tokenId, address indexed player)",
    "event PlayerCleared(address indexed player)"
  ],
   NFT_LOCK_GUARD: [
    "function tournament() view returns (address)",
    "function pokeNFT() view returns (address)",
    "function transferFrom(address from, address to, uint256 tokenId) external",
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external",
    "function canTransfer(uint256 tokenId) view returns (bool)",
    "event GuardedTransfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event GuardedSafeTransfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "error NFTLockedInTournament(uint256 tokenId)"
  ]


};
// Add to config.js (at the end):
window.checkMinter = async function() {
    try {
        if (!window.ethereum) {
            alert("Please install MetaMask");
            return;
        }
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const pkcnAddress = window.CONTRACTS.PKCN;
        const tournamentAddress = window.CONTRACTS.TOURNAMENT;
        
        // Minimal ABI to check minter
        const minterABI = [
            "function minter() view returns (address)",
            "function setMinter(address) external"
        ];
        
        const pkcnContract = new ethers.Contract(pkcnAddress, minterABI, await provider.getSigner());
        
        const currentMinter = await pkcnContract.minter();
        console.log("Current PKCN Minter:", currentMinter);
        console.log("Tournament Address:", tournamentAddress);
        
        alert(`PKCN Minter Status:\n\nCurrent Minter: ${currentMinter}\nTournament: ${tournamentAddress}\n\nMatch? ${currentMinter.toLowerCase() === tournamentAddress.toLowerCase() ? '✅ YES' : '❌ NO'}`);
        
        if (currentMinter.toLowerCase() !== tournamentAddress.toLowerCase()) {
            const confirmSet = confirm("Tournament contract is NOT set as PKCN minter! This is why rewards can't be claimed.\n\nDo you want to try setting it? (You need admin/owner access)");
            if (confirmSet) {
                const owner = prompt("Enter admin/owner wallet address:");
                if (owner) {
                    // You'll need owner's private key or wallet connection
                    alert("Please connect as owner wallet and use tournament control panel to set minter.");
                }
            }
        }
    } catch (error) {
        console.error("Minter check error:", error);
        alert(`Error: ${error.message}`);
    }
};