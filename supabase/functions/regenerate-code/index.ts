// supabase/functions/regenerate-code/index.ts
// Régénère les codes temporaires d'une école + de son admin
// Deploy : supabase functions deploy regenerate-code

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateTempCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `ECO-${rand(4)}-${rand(4)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentification requise' }, 401)

    // Vérifier que c'est bien un superadmin
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return json({ error: 'Non authentifié' }, 401)

    const { data: profile } = await supabaseAuth.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'superadmin') return json({ error: 'Accès réservé au Super Admin' }, 403)

    const { school_id } = await req.json()
    if (!school_id) return json({ error: 'school_id manquant' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const newSchoolCode = generateTempCode()
    const newAdminCode  = generateTempCode()
    const newExpiry     = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Mettre à jour le code de l'école
    const { error: schoolErr } = await supabaseAdmin
      .from('schools')
      .update({
        temp_code:            newSchoolCode,
        temp_code_expires_at: newExpiry,
        temp_code_used:       false,
        onboarding_completed: false,
      })
      .eq('id', school_id)

    if (schoolErr) return json({ error: 'Erreur mise à jour école : ' + schoolErr.message }, 500)

    // Mettre à jour le code de l'admin lié à cette école
    const { error: adminErr } = await supabaseAdmin
      .from('users')
      .update({
        temp_code:            newAdminCode,
        temp_code_expires_at: newExpiry,
        must_change_password: true,
      })
      .eq('school_id', school_id)
      .eq('role', 'admin')

    if (adminErr) return json({ error: 'Erreur mise à jour admin : ' + adminErr.message }, 500)

    return json({
      success:          true,
      school_temp_code: newSchoolCode,
      admin_temp_code:  newAdminCode,
      expires_at:       newExpiry,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
