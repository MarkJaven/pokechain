// Profile Modal Functionality
// This works alongside tournament.js

let profileTournamentContract;
let profilePkcnContract;
let profileCurrentAccount = null;
let isProfileInitialized = false;

// Configuration
const PROFILE_CONFIG = {
    TOURNAMENT_CONTRACT: window.CONTRACTS ? window.CONTRACTS.TOURNAMENT : "0xE1B32A36cfEf94145fAC1bEDDAD5B01D5eCd2457",
    PKCN_CONTRACT: window.CONTRACTS ? window.CONTRACTS.PKCN : "0x8D38B8F5C1b7ed7f13BF5c46be31272ffD2AE6Ce"
};

// Open profile modal and initialize
async function openProfileModal() {
    console.log("Opening profile modal...");
    
    // Show loading state
    showProfileLoading(true, "Loading profile...");
    
    try {
        // Initialize if needed
        if (!window.currentAccount) {
            await connectWallet();
        }
        
        if (window.currentAccount) {
            profileCurrentAccount = window.currentAccount;
            
            // Display wallet info
            const displayAddress = profileCurrentAccount.substring(0, 8) + '...' + profileCurrentAccount.substring(36);
            document.getElementById('profileWalletAddress').textContent = displayAddress;
            
            // Display tournament contract
            document.getElementById('profileTournamentContract').textContent = 
                PROFILE_CONFIG.TOURNAMENT_CONTRACT.substring(0, 10) + '...' + PROFILE_CONFIG.TOURNAMENT_CONTRACT.substring(34);
            
            // Initialize contracts
            await initializeProfileContracts();
            
            // Load profile data
            await loadProfileData();
            
            // Hide connection error
            document.getElementById('profileConnectionStatus').style.display = 'none';
            
            showProfileToast("Profile loaded successfully", "success");
        } else {
            // Show connection error
            document.getElementById('profileConnectionStatus').style.display = 'block';
            document.getElementById('profileConnectionMessage').textContent = 'Please connect your wallet first';
        }
    } catch (error) {
        console.error("Error opening profile modal:", error);
        showProfileToast(`Error: ${error.message}`, "error");
    } finally {
        showProfileLoading(false);
    }
}

// Initialize profile contracts
async function initializeProfileContracts() {
    try {
        // Use ABI from config.js
        const tournamentABI = window.ABIS && window.ABIS.TOURNAMENT 
            ? window.ABIS.TOURNAMENT 
            : [
                "function claimReward(string tournamentId) external",
                "function getActiveTournament(address) external view returns (string, bool, bool)",
                "function getUnclaimedRewards(address) external view returns (string[], uint256[])",
                "function expireTournament(string) external",
                "function getTournamentData(string) external view returns (address, uint256, string, uint256, uint256, bool, bool, uint256, uint256, uint256)"
            ];

        const pkcnABI = window.ABIS && window.ABIS.PKCN 
            ? window.ABIS.PKCN 
            : [
                "function balanceOf(address account) external view returns (uint256)",
                "function allowance(address owner, address spender) external view returns (uint256)",
                "function decimals() external view returns (uint8)",
                "function approve(address spender, uint256 amount) external returns (bool)"
            ];

        // Use existing provider/signer from wallet.js
        if (!window.provider || !window.signer) {
            throw new Error("Wallet not connected");
        }

        profileTournamentContract = new ethers.Contract(
            PROFILE_CONFIG.TOURNAMENT_CONTRACT,
            tournamentABI,
            window.signer
        );

        profilePkcnContract = new ethers.Contract(
            PROFILE_CONFIG.PKCN_CONTRACT,
            pkcnABI,
            window.signer
        );

        isProfileInitialized = true;
        console.log("Profile contracts initialized");

    } catch (error) {
        console.error('Profile contract initialization error:', error);
        showProfileToast(`Contract initialization failed: ${error.message}`, "error");
    }
}

// Load all profile data
async function loadProfileData() {
    if (!isProfileInitialized) return;
    
    try {
        // Update balance
        await updateProfileBalance();
        
        // Check allowance
        await checkProfileAllowance();
        
        // Load active tournament
        await getProfileActiveTournamentInfo();
        
        // Load unclaimed rewards
        await getProfileUnclaimedRewardsInfo();
        
    } catch (error) {
        console.error('Error loading profile data:', error);
        showProfileToast(`Error loading data: ${error.message}`, "error");
    }
}

// Refresh profile data
async function refreshProfileData() {
    showProfileToast("Refreshing profile data...", "info");
    await loadProfileData();
    showProfileToast("Profile data refreshed", "success");
}

// Update PKCN balance
async function updateProfileBalance() {
    if (!profileCurrentAccount || !profilePkcnContract) return;

    try {
        const balance = await profilePkcnContract.balanceOf(profileCurrentAccount);
        document.getElementById('profilePkcnBalance').textContent = `${balance.toString()} PKCN`;
    } catch (error) {
        console.error('Failed to load balance:', error);
        document.getElementById('profilePkcnBalance').textContent = "Error loading balance";
    }
}

// Check PKCN allowance
async function checkProfileAllowance() {
    if (!profilePkcnContract || !profileCurrentAccount) {
        showProfileToast("Wallet not connected or PKCN contract not available", "error");
        return;
    }

    try {
        const allowance = await profilePkcnContract.allowance(
            profileCurrentAccount,
            PROFILE_CONFIG.TOURNAMENT_CONTRACT
        );

        document.getElementById('profileCurrentAllowance').textContent = allowance.toString();

        const approveBtn = document.getElementById('profileApproveBtn');
        const revokeBtn = document.getElementById('profileRevokeBtn');

        if (allowance > 0n) {
            approveBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Increase';
            approveBtn.className = 'btn btn-sm btn-warning';
            revokeBtn.style.display = 'inline-block';
        } else {
            approveBtn.innerHTML = '<i class="bi bi-check-circle"></i> Approve';
            approveBtn.className = 'btn btn-sm btn-success';
            revokeBtn.style.display = 'none';
        }

    } catch (error) {
        console.error('Error checking allowance:', error);
        showProfileToast(`Failed to check allowance: ${error.message}`, "error");
    }
}

// Approve PKCN
async function approveProfilePKCN() {
    if (!profilePkcnContract) {
        showProfileToast("PKCN contract not available", "error");
        return;
    }

    try {
        showProfileLoading(true, "Approving PKCN...");

        const currentAllowance = await profilePkcnContract.allowance(
            profileCurrentAccount,
            PROFILE_CONFIG.TOURNAMENT_CONTRACT
        );

        const currentAllowanceFormatted = currentAllowance.toString();

        const amount = prompt(
            `Current allowance: ${currentAllowanceFormatted} PKCN\n\n` +
            `Enter amount to approve (or "max" for unlimited):`,
            "10000"
        );

        if (amount === null) {
            showProfileLoading(false);
            return;
        }

        let approveAmount;
        if (amount.toLowerCase() === "max") {
            approveAmount = ethers.MaxUint256;
        } else {
            approveAmount = ethers.parseUnits(amount, 0); // Assuming 0 decimals
        }

        const tx = await profilePkcnContract.approve(PROFILE_CONFIG.TOURNAMENT_CONTRACT, approveAmount);
        showProfileToast("Approval transaction sent...", "info");

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showProfileToast("✅ PKCN approved successfully!", "success");
            await checkProfileAllowance();
        } else {
            showProfileToast("Approval transaction failed", "error");
        }

    } catch (error) {
        console.error('Approval error:', error);
        showProfileToast(`Approval failed: ${error.message}`, "error");
    } finally {
        showProfileLoading(false);
    }
}

// Revoke PKCN approval
async function revokeProfilePKCN() {
    if (!profilePkcnContract) {
        showProfileToast("PKCN contract not available", "error");
        return;
    }

    try {
        const confirm = window.confirm("Are you sure you want to revoke PKCN approval? You won't be able to claim rewards until you approve again.");
        if (!confirm) return;

        showProfileLoading(true, "Revoking approval...");

        const tx = await profilePkcnContract.approve(PROFILE_CONFIG.TOURNAMENT_CONTRACT, 0);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showProfileToast("✅ PKCN approval revoked!", "success");
            await checkProfileAllowance();
        } else {
            showProfileToast("Revoke transaction failed", "error");
        }

    } catch (error) {
        console.error('Revoke error:', error);
        showProfileToast(`Revoke failed: ${error.message}`, "error");
    } finally {
        showProfileLoading(false);
    }
}

// Get active tournament info
async function getProfileActiveTournamentInfo() {
    try {
        if (!profileTournamentContract) return;

        const result = await profileTournamentContract.getActiveTournament(profileCurrentAccount);
        const [tournamentId, exists, isExpired] = result;

        const alertDiv = document.getElementById('profileActiveTournamentAlert');
        
        if (exists && tournamentId) {
            alertDiv.style.display = 'block';
            document.getElementById('profileActiveTournamentId').textContent = 
                tournamentId.substring(0, 12) + '...';
            
            const claimBtn = document.getElementById('profileClaimActiveTournamentBtn');
            claimBtn.onclick = function() { 
                if (isExpired) {
                    expireProfileTournament(tournamentId);
                } else {
                    claimSingleProfileReward(tournamentId);
                }
            };
            
            if (isExpired) {
                claimBtn.innerHTML = '<i class="bi bi-clock-history"></i> Expire Tournament';
                claimBtn.className = 'btn btn-sm btn-danger';
                document.querySelector('#profileActiveTournamentAlert p').textContent = 
                    'You have an expired tournament that needs to be cleared.';
            } else {
                claimBtn.innerHTML = '<i class="bi bi-cash"></i> Claim Reward';
                claimBtn.className = 'btn btn-sm btn-success';
            }
        } else {
            alertDiv.style.display = 'none';
        }

    } catch (error) {
        console.error("Error getting active tournament:", error);
    }
}

// Get unclaimed rewards
async function getProfileUnclaimedRewardsInfo() {
    try {
        if (!profileTournamentContract || !profileCurrentAccount) return;

        const result = await profileTournamentContract.getUnclaimedRewards(profileCurrentAccount);
        const [tournamentIds, rewards] = result;

        const unclaimedList = document.getElementById('profileUnclaimedList');
        const claimAllBtn = document.getElementById('profileClaimAllBtn');
        const totalUnclaimedElement = document.getElementById('profileTotalUnclaimed');

        if (tournamentIds && tournamentIds.length > 0) {
            let totalUnclaimed = 0n;
            unclaimedList.innerHTML = '';

            for (let i = 0; i < tournamentIds.length; i++) {
                const tournamentId = tournamentIds[i];
                const reward = rewards[i];

                if (tournamentId && tournamentId.length > 0) {
                    const rewardBigInt = BigInt(reward);
                    totalUnclaimed += rewardBigInt;

                    const rewardItem = document.createElement('div');
                    rewardItem.className = 'reward-item unclaimed';
                    rewardItem.innerHTML = `
                        <div class="reward-details">
                            <span class="tournament-id">${tournamentId.substring(0, 20)}...</span>
                            <div class="tournament-info">
                                <span class="tournament-badge">Unclaimed</span>
                            </div>
                            <div class="reward-amount mt-1">${rewardBigInt.toString()} PKCN</div>
                        </div>
                        <button class="btn-claim" onclick="claimSingleProfileReward('${tournamentId}')">
                            <i class="bi bi-cash"></i> Claim
                        </button>
                    `;
                    unclaimedList.appendChild(rewardItem);
                }
            }

            totalUnclaimedElement.textContent = `${totalUnclaimed.toString()} PKCN`;
            claimAllBtn.style.display = 'block';
            claimAllBtn.onclick = async function() {
                if (confirm(`Claim all ${tournamentIds.length} rewards?`)) {
                    await claimAllProfileRewards(tournamentIds);
                }
            };
        } else {
            unclaimedList.innerHTML = '<div class="no-data">No unclaimed rewards found</div>';
            claimAllBtn.style.display = 'none';
            totalUnclaimedElement.textContent = '0 PKCN';
        }

    } catch (error) {
        console.error("Error in getUnclaimedRewardsInfo:", error);
        document.getElementById('profileUnclaimedList').innerHTML = 
            '<div class="no-data">Error loading unclaimed rewards</div>';
    }
}

// Claim single reward
async function claimSingleProfileReward(tournamentId) {
    console.log("Claiming tournament:", tournamentId);

    if (!profileTournamentContract) {
        showProfileToast("Tournament contract not available", "error");
        return;
    }

    try {
        showProfileLoading(true, "Claiming reward...");

        // Try to claim
        const tx = await profileTournamentContract.claimReward(tournamentId);
        showProfileToast("Transaction sent...", "info");

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showProfileToast("✅ Reward claimed successfully!", "success");
            await updateProfileBalance();
            await checkProfileAllowance();
            await loadProfileData(); // Refresh all data
        } else {
            showProfileToast("Claim transaction failed", "error");
        }

    } catch (error) {
        console.error('Error claiming reward:', error);
        
        if (error.message.includes("PKCN: not authorized") || 
            error.message.includes("not minter") ||
            error.message.includes("mint")) {
            
            showProfileToast("❌ Tournament cannot mint PKCN! Check minter status.", "error");
            
        } else if (error.message.includes("user rejected")) {
            showProfileToast("Transaction rejected by user", "error");
        } else if (error.message.includes("insufficient funds")) {
            showProfileToast("Insufficient funds for gas", "error");
        } else if (error.message.includes("execution reverted")) {
            showProfileToast("Transaction reverted. Tournament may not be claimable.", "error");
        } else {
            showProfileToast(`Claim failed: ${error.message}`, "error");
        }
    } finally {
        showProfileLoading(false);
    }
}

// Claim all rewards
async function claimAllProfileRewards(tournamentIds) {
    if (!tournamentIds || tournamentIds.length === 0) {
        showProfileToast("No tournaments to claim", "error");
        return;
    }

    try {
        showProfileLoading(true, `Claiming ${tournamentIds.length} rewards...`);

        for (const tournamentId of tournamentIds) {
            try {
                const tx = await profileTournamentContract.claimReward(tournamentId);
                await tx.wait();
                showProfileToast(`Claimed: ${tournamentId.substring(0, 12)}...`, "success");
                
                // Delay between transactions
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Failed to claim ${tournamentId}:`, error.message);
            }
        }

        showProfileToast(`✅ Claimed ${tournamentIds.length} rewards!`, "success");
        await loadProfileData();

    } catch (error) {
        showProfileToast(`Failed to claim all: ${error.message}`, "error");
    } finally {
        showProfileLoading(false);
    }
}

// Expire tournament
async function expireProfileTournament(tournamentId) {
    try {
        showProfileLoading(true, "Expiring tournament...");
        const tx = await profileTournamentContract.expireTournament(tournamentId);
        await tx.wait();
        showProfileToast("✅ Tournament expired and NFT unlocked!", "success");
        await loadProfileData();
    } catch (error) {
        showProfileToast(`Failed to expire: ${error.message}`, "error");
    } finally {
        showProfileLoading(false);
    }
}

// Debug functions
async function debugProfileAllowance() {
    try {
        const allowance = await profilePkcnContract.allowance(
            profileCurrentAccount,
            PROFILE_CONFIG.TOURNAMENT_CONTRACT
        );
        
        const balance = await profilePkcnContract.balanceOf(profileCurrentAccount);
        
        alert(`PKCN Status:\n\nBalance: ${balance.toString()}\nAllowance: ${allowance.toString()}\n\nTournament: ${PROFILE_CONFIG.TOURNAMENT_CONTRACT}`);
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function testAllProfileFunctions() {
    try {
        const tests = [];
        
        // Test 1: getActiveTournament
        try {
            const [id, exists, expired] = await profileTournamentContract.getActiveTournament(profileCurrentAccount);
            tests.push(`✓ getActiveTournament: ID=${id}, exists=${exists}, expired=${expired}`);
        } catch (e) {
            tests.push(`✗ getActiveTournament: ${e.message}`);
        }
        
        // Test 2: getUnclaimedRewards
        try {
            const [ids, rewards] = await profileTournamentContract.getUnclaimedRewards(profileCurrentAccount);
            tests.push(`✓ getUnclaimedRewards: Found ${ids.length} unclaimed tournaments`);
        } catch (e) {
            tests.push(`✗ getUnclaimedRewards: ${e.message}`);
        }
        
        alert("Profile Tests:\n\n" + tests.join("\n"));
        
    } catch (error) {
        alert(`Test failed: ${error.message}`);
    }
}

// UI Helpers
function showProfileLoading(show, message = "Processing...") {
    const spinner = document.getElementById('profileLoadingSpinner');
    const messageElement = document.getElementById('profileLoadingMessage');
    
    if (spinner && messageElement) {
        spinner.style.display = show ? 'block' : 'none';
        messageElement.textContent = message;
    }
}

function showProfileToast(message, type = "success") {
    const toast = document.getElementById('profileToastNotification');
    const toastMessage = document.getElementById('profileToastMessage');
    
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    
    if (type === "error") {
        toast.style.borderColor = "#ff4444";
        toastMessage.style.color = "#ff4444";
    } else if (type === "info") {
        toast.style.borderColor = "#00a8ff";
        toastMessage.style.color = "#00a8ff";
    } else if (type === "warning") {
        toast.style.borderColor = "#ffaa00";
        toastMessage.style.color = "#ffaa00";
    } else {
        toast.style.borderColor = "#00ff9d";
        toastMessage.style.color = "#00ff9d";
    }
    
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Expose functions to global scope
window.openProfileModal = openProfileModal;
window.refreshProfileData = refreshProfileData;
window.checkProfileAllowance = checkProfileAllowance;
window.approveProfilePKCN = approveProfilePKCN;
window.revokeProfilePKCN = revokeProfilePKCN;
window.claimSingleProfileReward = claimSingleProfileReward;
window.getProfileActiveTournamentInfo = getProfileActiveTournamentInfo;
window.getProfileUnclaimedRewardsInfo = getProfileUnclaimedRewardsInfo;
window.debugProfileAllowance = debugProfileAllowance;
window.testAllProfileFunctions = testAllProfileFunctions;

// Listen for account changes
if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            profileCurrentAccount = accounts[0];
            // Update display if modal is open
            if (document.getElementById('profileModal').classList.contains('show')) {
                const displayAddress = profileCurrentAccount.substring(0, 8) + '...' + profileCurrentAccount.substring(36);
                document.getElementById('profileWalletAddress').textContent = displayAddress;
                await loadProfileData();
            }
        } else {
            // Reset if modal is open
            if (document.getElementById('profileModal').classList.contains('show')) {
                document.getElementById('profileConnectionStatus').style.display = 'block';
                document.getElementById('profileConnectionMessage').textContent = 'Wallet disconnected';
            }
        }
    });
}