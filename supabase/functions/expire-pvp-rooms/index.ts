import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Find rooms older than 10 minutes that are still waiting/pending
    const { data: expiredRooms, error } = await supabaseClient
      .from('pvp_rooms')
      .select('room_id, status, pvp_players(token_id, player_address)')
      .in('status', ['waiting', 'pending'])
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    if (error) throw error

    // 2. Mark them as expired and unlock NFTs
    for (const room of expiredRooms) {
      await supabaseClient
        .from('pvp_rooms')
        .update({ status: 'expired' })
        .eq('room_id', room.room_id)

      // Unlock NFTs (remove from locked set in your backend)
      console.log(`Expired room: ${room.room_id}`)
    }

    return new Response(JSON.stringify({ expired: expiredRooms.length }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})