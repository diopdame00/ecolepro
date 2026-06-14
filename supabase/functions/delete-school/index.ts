// supabase/functions/delete-school/index.ts
// Supprime une école et TOUTES ses données en cascade
// Deploy : supabase functions deploy delete-school

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentification requise' }, 401)

    // Vérifier superadmin
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

    // Vérifier que l'école existe
    const { data: school, error: schoolFetchErr } = await supabaseAdmin
      .from('schools').select('id, name').eq('id', school_id).single()
    if (schoolFetchErr || !school) return json({ error: 'École introuvable' }, 404)

    // ── Suppression en cascade (ordre : enfants → parents) ──
    // Les tables qui ont school_id comme FK
    const tables = [
      'grades',
      'paiements',
      'depenses',
      'cours_effectues',
      'emploi_du_temps',
      'prof_classes',
      'class_subjects',
      'students',
      'classes',
      'salaires',
    ]

    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table).delete().eq('school_id', school_id)
      // On ignore les erreurs "table inexistante" (code 42P01) — on continue
      if (error && error.code !== '42P01') {
        console.error(`Erreur suppression ${table}:`, error.message)
      }
    }

    // Récupérer les utilisateurs liés à cette école pour les supprimer de auth.users
    const { data: users } = await supabaseAdmin
      .from('users').select('id').eq('school_id', school_id)

    if (users && users.length > 0) {
      for (const u of users) {
        await supabaseAdmin.auth.admin.deleteUser(u.id)
      }
    }

    // Supprimer les profils users (au cas où la FK cascade n'est pas configurée)
    await supabaseAdmin.from('users').delete().eq('school_id', school_id)

    // Supprimer l'école elle-même
    const { error: deleteErr } = await supabaseAdmin.from('schools').delete().eq('id', school_id)
    if (deleteErr) return json({ error: 'Erreur suppression école : ' + deleteErr.message }, 500)

    return json({
      success: true,
      message: `École "${school.name}" et toutes ses données supprimées.`,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
