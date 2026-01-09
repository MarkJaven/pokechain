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
    const { playerAddress, roomId, tokenId, pokemonData } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // 1. Verify NFT ownership
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

    // 2. Check room exists and is waiting
    const { data: room, error: roomError } = await supabaseClient
      .from('pvp_rooms')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'waiting')
      .single()

    if (roomError) throw roomError
    if (!room) throw new Error('Room not available')

    // 3. Check NFT not already locked
    const { data: existing } = await supabaseClient
      .from('pvp_players')
      .select('room_id')
      .eq('token_id', tokenId)
      .eq('transaction_confirmed', true)

    if (existing && existing.length > 0) {
      throw new Error('NFT is already locked in another match')
    }

    // 4. Add player to room (with ON CONFLICT to prevent race conditions)
    const { error: playerError } = await supabaseClient
      .from('pvp_players')
      .insert({
        room_id: roomId,
        player_address: playerAddress,
        token_id: tokenId,
        pokemon_data: pokemonData,
        is_creator: false,
        transaction_status: 'pending'
      })

    if (playerError) {
      if (playerError.code === '23505') { // Unique violation
        throw new Error('Already in this room')
      }
      throw playerError
    }

    // 5. Update room status
    const { error: updateError } = await supabaseClient
      .from('pvp_rooms')
      .update({ status: 'pending' })
      .eq('room_id', roomId)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})