window.CONTRACTS = {
  PKCN_ADDRESS: "0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce",
  MARKETPLACE_ADDRESS: "0xf846D560F06a2D32fc550c8b5Ce593729B0a055D",
  POKEMON_NFT_ADDRESS: "0x1477704FC8279BAB0a0475d3F78d6Dc624d5f04B"
};

window.ABIS = {
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
  
  MARKETPLACE: [
  "function buyPokemon(string memory name, string memory rarity, string memory imageURI, uint256 price) public returns (uint256)",
  "function listPokemon(uint256 tokenId, uint256 price) public returns (uint256)", // Note: returns uint256
  "function buyListedPokemon(uint256 listingId) public",
  "function cancelListing(uint256 listingId) public", 
  "function remainingSupply(string calldata rarity) external view returns (uint256)",
  
  
  "event PokeListed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event ListingBought(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, uint256 price)",
  "event PokeDelisted(uint256 indexed listingId, uint256 indexed tokenId)",
  "event PokePurchased(address indexed buyer, uint256 indexed tokenId, uint256 price)"
],
  
  ERC20_MIN: [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
  ]
};