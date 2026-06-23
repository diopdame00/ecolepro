// ============================================================
// Edge Function : regenerate-code v2.0
// Régénère le code temporaire d'un admin ET met à jour
// son mot de passe dans auth.users (même valeur)
// Deploy : supabase functions deploy regenerate-code
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

function generateTempCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand  = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `ECO-${rand(4)}-${rand(4)}`
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

    // ── Générer nouveau code ─────────────────────────────────
    const newCode   = generateTempCode()
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // ── 1. Mettre à jour le code sur l'école ─────────────────
    const { error: schoolErr } = await supabaseAdmin
      .from('schools')
      .update({
        temp_code:            newCode,
        temp_code_expires_at: newExpiry,
        temp_code_used:       false,
        onboarding_completed: false,
      })
      .eq('id', school_id)

    if (schoolErr) {
      return json({ error: `Erreur mise à jour école : ${schoolErr.message}` }, 500)
    }

    // ── 2. Récupérer l'admin de cette école ──────────────────
    const { data: adminUser, error: fetchAdminErr } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('school_id', school_id)
      .eq('role', 'admin')
      .single()

    if (fetchAdminErr || !adminUser) {
      return json({ error: 'Admin introuvable pour cette école' }, 404)
    }

    // ── 3. Mettre à jour le MOT DE PASSE dans auth.users ─────
    // CRITIQUE : sans ça, l'admin ne peut pas se connecter avec le nouveau code
    const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(
      adminUser.id,
      { password: newCode }
    )

    if (authUpdateErr) {
      return json({ error: `Erreur mise à jour mot de passe : ${authUpdateErr.message}` }, 500)
    }

    // ── 4. Mettre à jour le profil admin dans users ──────────
    const { error: profileErr } = await supabaseAdmin
      .from('users')
      .update({
        temp_code:            newCode,
        temp_code_expires_at: newExpiry,
        must_change_password: true,
      })
      .eq('id', adminUser.id)

    if (profileErr) {
      return json({ error: `Erreur mise à jour profil : ${profileErr.message}` }, 500)
    }

    return json({
      success:         true,
      admin_temp_code: newCode,   // affiché au superadmin, utilisé comme mot de passe
      expires_at:      newExpiry,
      admin_email:     adminUser.email,
      message:         `L'admin se connecte avec : ${adminUser.email} / ${newCode}`,
    })

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
