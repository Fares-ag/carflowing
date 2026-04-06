import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Payment recording webhook.
 * Since CarFlow uses "pay at shop", this endpoint is called by the admin/dealer
 * to record a manual payment after pickup.
 */
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const payload = await req.json()
    const { rentalId, amount, method } = payload as {
      rentalId: string
      amount: number
      method?: string
    }

    if (!rentalId || !amount) {
      return new Response(
        JSON.stringify({ error: 'rentalId and amount are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data: rental, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, customer_id, status')
      .eq('id', rentalId)
      .single()

    if (rentalErr || !rental) {
      return new Response(
        JSON.stringify({ error: 'Rental not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { error: payErr } = await supabase.from('payments').insert({
      rental_id: rentalId,
      customer_id: rental.customer_id,
      amount,
      status: 'completed',
      type: 'rental',
      method: method || 'cash',
    })

    if (payErr) {
      console.error('Payment insert error:', payErr)
      return new Response(
        JSON.stringify({ error: payErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    await supabase
      .from('rentals')
      .update({ status: 'active' })
      .eq('id', rentalId)

    console.log('Payment recorded:', { rentalId, amount, method })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('payments-webhook error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
