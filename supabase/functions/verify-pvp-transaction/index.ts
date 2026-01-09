import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers } from 'https://esm.sh/ethers@6.7.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { roomId, playerAddress, transactionHash } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // 1. Verify transaction on-chain
    const provider = new ethers.JsonRpcProvider(Deno.env.get('RPC_URL'))
    const receipt = await provider.getTransactionReceipt(transactionHash)

    if (!receipt) throw new Error('Transaction not found')
    if (receipt.status !== 1) throw new Error('Transaction failed')

    // 2. Decode transaction to verify it's the correct createPvPMatch call
    const tournamentContract = new ethers.Contract(
      Deno.env.get('TOURNAMENT_ADDRESS'),
      [
        'event PvPMatchCreated(string indexed matchId, address player1, address player2, uint256 totalStake)'
      ],
      provider
    )

    const events = await tournamentContract.queryFilter(
      tournamentContract.filters.PvPMatchCreated(),
      receipt.blockNumber,
      receipt.blockNumber
    )

    const matchEvent = events.find(e => e.args.matchId === roomId)
    if (!matchEvent) throw new Error('Invalid transaction - wrong match ID')

    // 3. Update player as confirmed
    const { error } = await supabaseClient
      .from('pvp_players')
      .update({
        transaction_hash: transactionHash,
        transaction_confirmed: true,
        transaction_status: 'completed'
      })
      .eq('room_id', roomId)
      .eq('player_address', playerAddress)

    if (error) throw error

    // 4. Check if both players have confirmed
    const { data: players } = await supabaseClient
      .from('pvp_players')
      .select('transaction_confirmed')
      .eq('room_id', roomId)

    const allConfirmed = players.every(p => p.transaction_confirmed)

    if (allConfirmed) {
      // Update room to in_progress
      await supabaseClient
        .from('pvp_rooms')
        .update({ status: 'in_progress' })
        .eq('room_id', roomId)
    }

    return new Response(JSON.stringify({ success: true, allConfirmed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})