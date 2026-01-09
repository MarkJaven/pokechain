import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers } from 'https://esm.sh/ethers@6.7.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { playerAddress, tokenId, betAmount, pokemonData } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // 1. Verify NFT ownership on-chain
    const provider = new ethers.JsonRpcProvider(Deno.env.get('RPC_URL'))
    const nftContract = new ethers.Contract(
      Deno.env.get('POKEMON_NFT_ADDRESS'),
      ['function ownerOf(uint256) view returns (address)'],
      provider
    )

    const owner = await nftContract.ownerOf(tokenId)
    if (owner.toLowerCase() !== playerAddress.toLowerCase()) {
      throw new Error('Player does not own this NFT')
    }

    // 2. Check if NFT is already locked in another match
    const { data: existing } = await supabaseClient
      .from('pvp_players')
      .select('room_id')
      .eq('token_id', tokenId)
      .eq('transaction_confirmed', true)

    if (existing && existing.length > 0) {
      throw new Error('NFT is already locked in another match')
    }

    // 3. Check player doesn't have active tournament
    const { data: activeMatches } = await supabaseClient
      .from('pvp_players')
      .select('room_id')
      .eq('player_address', playerAddress)
      .in('transaction_status', ['pending', 'completed'])

    if (activeMatches && activeMatches.length > 0) {
      throw new Error('Player already has an active match')
    }

    // 4. Generate unique room ID
    const roomId = `pvp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 5. Create room
    const { data: room, error: roomError } = await supabaseClient
      .from('pvp_rooms')
      .insert({
        room_id: roomId,
        creator_address: playerAddress,
        bet_amount: betAmount,
        status: 'waiting',
        verified: true
      })
      .select()
      .single()

    if (roomError) throw roomError

    // 6. Add creator as player
    const { error: playerError } = await supabaseClient
      .from('pvp_players')
      .insert({
        room_id: roomId,
        player_address: playerAddress,
        token_id: tokenId,
        pokemon_data: pokemonData,
        is_creator: true,
        transaction_status: 'pending'
      })

    if (playerError) throw playerError

    return new Response(JSON.stringify({ success: true, roomId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})