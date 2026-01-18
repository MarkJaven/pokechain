// ===================================================================
// PROFILE PAGE - REWARD CLAIMING MANAGEMENT
// ===================================================================

let tournamentContract = null;

// ===================================================================
// INITIALIZATION
// ===================================================================

window.addEventListener('DOMContentLoaded', async () => {
    console.log('👤 Profile page loading...');
    await initializeProfileContract();
    await checkUnclaimedRewards();
    await displayTournamentHistory();
});

async function initializeProfileContract() {
    try {
        if (!window.CONTRACTS?.TOURNAMENT || !window.ABIS?.TOURNAMENT) {
            console.error('❌ Tournament contract not configured');
            return null;
        }
        
        const provider = await safeGetProvider();
        if (!provider) return null;
        
        const signer = await provider.getSigner();
        tournamentContract = new ethers.Contract(
            window.CONTRACTS.TOURNAMENT,
            window.ABIS.TOURNAMENT,
            signer
        );
        
        console.log('✅ Profile tournament contract initialized');
        return tournamentContract;
    } catch (error) {
        console.error('Failed to initialize profile contract:', error);
        return null;
    }
}

// ===================================================================
// UNCLAIMED REWARDS CHECKER
// ===================================================================

async function checkUnclaimedRewards() {
    try {
        if (!window.wallet?.getAccount?.() || !tournamentContract) return;
        
        const account = window.wallet.getAccount();
        console.log('🔍 Checking unclaimed rewards for:', account);
        
        const [tournamentIds, rewards] = await tournamentContract.getUnclaimedRewards(account);
        
        if (tournamentIds.length === 0) {
            console.log('✅ No unclaimed rewards');
            document.getElementById('claimSection').style.display = 'none';
            return;
        }
        
        console.log(`📦 Found ${tournamentIds.length} unclaimed rewards`);
        
        const claimSection = document.getElementById('claimSection');
        if (claimSection) {
            claimSection.style.display = 'block';
            const listContainer = document.getElementById('unclaimedList');
            
            let totalRewards = 0;
            listContainer.innerHTML = '';
            
            for (let i = 0; i < tournamentIds.length; i++) {
                const tournamentId = tournamentIds[i];
                const reward = rewards[i];
                totalRewards += parseInt(reward.toString());
                
                const item = document.createElement('div');
                item.className = 'reward-item';
                item.innerHTML = `
                    <div class="reward-details">
                        <span class="tournament-id">ID: ${tournamentId.substring(0, 30)}...</span>
                        <span class="reward-amount">${reward.toString()} PKCN</span>
                    </div>
                    <button class="btn-claim" onclick="claimReward('${tournamentId}')">
                        Claim
                    </button>
                `;
                listContainer.appendChild(item);
            }
            
            document.getElementById('totalUnclaimed').textContent = `${totalRewards} PKCN`;
            
            if (tournamentIds.length > 1) {
                const claimAllBtn = document.getElementById('claimAllBtn');
                if (claimAllBtn) {
                    claimAllBtn.style.display = 'inline-block';
                    claimAllBtn.onclick = () => claimAllRewards(tournamentIds);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to check unclaimed rewards:', error);
    }
}

// ===================================================================
// REWARD CLAIMING
// ===================================================================

async function claimReward(tournamentId) {
    if (!tournamentContract) {
        alert('Contract not initialized. Please refresh.');
        return;
    }
    
    try {
        console.log('🎁 Claiming reward for:', tournamentId);
        
        const tx = await tournamentContract.claimReward(tournamentId);
        console.log('⏳ Claim transaction pending...');
        
        await tx.wait();
        console.log('✅ Reward claimed successfully!');
        
        alert(`🎉 Reward claimed! Check your PKCN balance.`);
        
        await checkUnclaimedRewards();
        await displayTournamentHistory();
        
    } catch (error) {
        console.error('❌ Failed to claim reward:', error);
        
        let message = 'Claim failed.';
        if (error.message.includes('Tournament not complete')) message = 'Tournament not completed.';
        if (error.message.includes('Reward already claimed')) message = 'Already claimed.';
        if (error.message.includes('Not tournament owner')) message = 'Not your tournament.';
        
        alert(message);
    }
}

async function claimAllRewards(tournamentIds) {
    const confirmed = confirm(`Claim all ${tournamentIds.length} rewards?`);
    if (!confirmed) return;
    
    for (const id of tournamentIds) {
        try {
            await claimReward(id);
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error('Failed to claim:', id, e);
        }
    }
}

// ===================================================================
// TOURNAMENT HISTORY DISPLAY
// ===================================================================

async function displayTournamentHistory() {
    try {
        const account = window.wallet?.getAccount?.();
        if (!account || !tournamentContract) return;
        
        const historyContainer = document.getElementById('historyList');
        if (!historyContainer) return;
        
        const tournamentHistoryKey = window.getUserStorageKey ? window.getUserStorageKey('tournamentHistory') : 'tournamentHistory';
        const history = JSON.parse(localStorage.getItem(tournamentHistoryKey) || '[]');
        historyContainer.innerHTML = '';
        
        for (const tournamentId of history) {
            try {
                const data = await tournamentContract.getTournamentData(tournamentId);
                
                if (data.player.toLowerCase() !== account.toLowerCase()) continue;
                
                const item = document.createElement('div');
                item.className = 'history-item';
                
                const status = data.rewardClaimed ? '✅ Claimed' : 
                               data.isComplete ? '⚠️ Unclaimed' : '⏳ Incomplete';
                
                item.innerHTML = `
                    <div class="history-details">
                        <span class="history-id">${tournamentId.substring(0, 25)}...</span>
                        <span class="history-difficulty">${data.difficulty}</span>
                        <span class="history-wins">${data.wins}/${data.opponentCount}</span>
                        <span class="history-reward">${data.finalReward.toString()} PKCN</span>
                        <span class="history-status">${status}</span>
                    </div>
                    ${!data.rewardClaimed && data.isComplete ? 
                        `<button class="btn-claim-small" onclick="claimReward('${tournamentId}')">Claim</button>` : 
                        ''}
                `;
                
                historyContainer.appendChild(item);
            } catch (e) {
                console.warn('Skipping tournament:', e.message);
            }
        }
        
    } catch (error) {
        console.error('Failed to display history:', error);
    }
}

// ===================================================================
// PROVIDER HELPER
// ===================================================================

async function safeGetProvider() {
    try {
        if (window.ethereum) {
            return new ethers.BrowserProvider(window.ethereum);
        }
        return null;
    } catch (e) {
        console.error('Failed to get provider:', e);
        return null;
    }
}