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

    // ── ÉTAPE 1 : Récupérer les IDs auth AVANT toute suppression ──
    // C'est critique : on récupère les IDs pendant que public.users existe encore
    const { data: usersToDelete } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', school_id)

    const authUserIds: string[] = usersToDelete?.map(u => u.id) ?? []

    // ── ÉTAPE 2 : Supprimer les données métier en cascade ──
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
      // Ignorer les erreurs "table inexistante" (code 42P01)
      if (error && error.code !== '42P01') {
        console.error(`Erreur suppression ${table}:`, error.message)
      }
    }

    // ── ÉTAPE 3 : Supprimer les profils dans public.users ──
    await supabaseAdmin.from('users').delete().eq('school_id', school_id)

    // ── ÉTAPE 4 : Supprimer l'école elle-même ──
    const { error: deleteEcoleErr } = await supabaseAdmin.from('schools').delete().eq('id', school_id)
    if (deleteEcoleErr) return json({ error: 'Erreur suppression école : ' + deleteEcoleErr.message }, 500)

    // ── ÉTAPE 5 : Supprimer les comptes auth.users EN DERNIER ──
    // On fait ça après avoir supprimé public.users pour éviter les conflits de FK
    const authDeleteResults = await Promise.allSettled(
      authUserIds.map(uid => supabaseAdmin.auth.admin.deleteUser(uid))
    )

    // Logger les éventuels échecs sans bloquer la réponse
    authDeleteResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Échec suppression auth user ${authUserIds[i]}:`, result.reason)
      } else if (result.value.error) {
        console.error(`Erreur auth user ${authUserIds[i]}:`, result.value.error.message)
      }
    })

    const deletedCount = authDeleteResults.filter(r => r.status === 'fulfilled' && !r.value.error).length

    return json({
      success: true,
      message: `École "${school.name}" et toutes ses données supprimées.`,
      auth_users_deleted: deletedCount,
      auth_users_total: authUserIds.length,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
