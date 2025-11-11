

window.CONTRACTS = {
  PKCN_ADDRESS: "0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce",
  MARKETPLACE_ADDRESS: "0xf846D560F06a2D32fc550c8b5Ce593729B0a055D",
  POKEMON_NFT_ADDRESS: "0x1477704FC8279BAB0a0475d3F78d6Dc624d5f04B"
};

// Minimal ABIs used by marketplace.js (ethers v6 friendly signatures)
window.ABIS = {
  ERC20_MIN: [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
  ],

  MARKETPLACE: [
    "function buyPokemon(string name, string rarity, string imageURI, uint256 price) external",
    "function remainingSupply(string rarity) view returns (uint256)",
    "function listPokemon(uint256 tokenId, uint256 price) returns (uint256)",
    "function buyListedPokemon(uint256 listingId) external",
    "event PokemonPurchased(address indexed buyer, uint256 indexed tokenId, uint256 price)",
    "event PokemonListed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price)",
    "event ListingBought(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, uint256 price)"
  ],

  POKEMON_NFT: [
    "function remainingSupply(string rarity) view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "event PokemonMinted(uint256 indexed tokenId, address indexed to, string name, string rarity, string imageURI)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function transferFrom(address from, address to, uint256 tokenId) external"
  ]
};
