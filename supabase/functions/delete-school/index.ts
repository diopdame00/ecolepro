// ============================================================
// Edge Function : delete-school v2.0
// Supprime une école et TOUS ses utilisateurs auth
// Deploy : supabase functions deploy delete-school
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
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
    // ── Vérifier superadmin ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentification requise' }, 401)

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return json({ error: 'Non authentifié' }, 401)

    const { data: profile } = await supabaseAuth
      .from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'superadmin') return json({ error: 'Accès réservé au Super Admin' }, 403)

    const { school_id } = await req.json()
    if (!school_id) return json({ error: 'school_id manquant' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── ÉTAPE 1 : Récupérer les IDs auth AVANT suppression ───
    // (après suppression de la table users on perd ces IDs)
    const { data: usersToDelete, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .eq('school_id', school_id)

    if (fetchErr) {
      console.error('Erreur récupération users:', fetchErr.message)
    }

    const authUserIds = (usersToDelete || []).map((u: { id: string }) => u.id)
    console.log(`Utilisateurs à supprimer : ${authUserIds.length}`)

    // ── ÉTAPE 2 : Suppression cascade via fonction SQL ───────
    // La FK ON DELETE CASCADE supprime automatiquement :
    // academic_years → classes → enrollments → grades, payments, etc.
    const { data: deleteResult, error: deleteErr } = await supabaseAdmin
      .rpc('delete_school_cascade', { p_school_id: school_id })

    if (deleteErr) {
      return json({ error: `Erreur suppression école : ${deleteErr.message}` }, 500)
    }

    if (deleteResult?.error) {
      return json({ error: deleteResult.error }, 404)
    }

    // ── ÉTAPE 3 : Supprimer les comptes auth.users ───────────
    // APRÈS la suppression de la table users (évite les FK conflicts)
    const authResults: { id: string; success: boolean; error?: string }[] = []

    for (const uid of authUserIds) {
      const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(uid)
      if (delAuthErr) {
        console.error(`Erreur auth.users [${uid}]:`, delAuthErr.message)
        authResults.push({ id: uid, success: false, error: delAuthErr.message })
      } else {
        authResults.push({ id: uid, success: true })
      }
    }

    const failedDeletes = authResults.filter(r => !r.success)

    return json({
      success:      true,
      school_name:  deleteResult.school_name,
      message:      `École "${deleteResult.school_name}" supprimée`,
      stats: {
        users_found:         authUserIds.length,
        auth_deleted:        authResults.filter(r => r.success).length,
        auth_failed:         failedDeletes.length,
        failed_ids:          failedDeletes.map(r => r.id),
      },
    })

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
