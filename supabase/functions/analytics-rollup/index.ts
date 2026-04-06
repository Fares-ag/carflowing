import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const [rentalsRes, paymentsRes, vehiclesRes, usersRes] = await Promise.all([
      supabase.from('rentals').select('id, status', { count: 'exact', head: true }),
      supabase.from('payments').select('amount, status').eq('status', 'completed'),
      supabase.from('vehicles').select('id, status', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    ])

    const totalRentals = rentalsRes.count ?? 0
    const totalVehicles = vehiclesRes.count ?? 0
    const totalCustomers = usersRes.count ?? 0
    const totalRevenue = (paymentsRes.data ?? []).reduce(
      (sum: number, p: { amount: number }) => sum + Number(p.amount),
      0
    )

    const [todayRentalsRes] = await Promise.all([
      supabase.from('rentals').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
    ])
    const todayRentals = todayRentalsRes.count ?? 0

    const summary = {
      date: startOfDay,
      totalRentals,
      totalVehicles,
      totalCustomers,
      totalRevenue,
      todayRentals,
      generatedAt: now.toISOString(),
    }

    console.log('Analytics rollup:', summary)

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('analytics-rollup error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
