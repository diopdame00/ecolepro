// supabase/functions/regenerate-code/index.ts
// Régénère les codes temporaires d'une école + de son admin + nouveau mot de passe
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

// Mot de passe provisoire lisible : EP-XXXX-XXXX
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `EP-${rand(4)}-${rand(4)}`
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

    const newPassword = generateTempPassword()
    const newExpiry   = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Récupérer l'admin lié à cette école
    const { data: adminUser, error: adminFetchErr } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('school_id', school_id)
      .eq('role', 'admin')
      .single()

    if (adminFetchErr || !adminUser) {
      return json({ error: 'Admin introuvable pour cette école' }, 404)
    }

    // Mettre à jour le mot de passe dans auth.users
    const { error: authPwdErr } = await supabaseAdmin.auth.admin.updateUserById(
      adminUser.id,
      { password: newPassword }
    )
    if (authPwdErr) {
      return json({ error: 'Erreur mise à jour mot de passe : ' + authPwdErr.message }, 500)
    }

    // Remettre must_change_password à true dans public.users
    const { error: adminErr } = await supabaseAdmin
      .from('users')
      .update({ must_change_password: true })
      .eq('id', adminUser.id)

    if (adminErr) return json({ error: 'Erreur mise à jour admin : ' + adminErr.message }, 500)

    return json({
      success:       true,
      temp_password: newPassword,
      admin_email:   adminUser.email,
      expires_at:    newExpiry,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
