// ============================================================
// Edge Function : create-school v2.0
// Crée une école + année académique + admin + classes pré-config
// Deploy : supabase functions deploy create-school
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

    // ── Paramètres ───────────────────────────────────────────
    const {
      name,
      director_name,
      director_email,
      phone,
      ia,
      ief,
      type_etablissement = 'college',
      subscription_plan  = 'starter',
      max_students       = 100,
    } = await req.json()

    if (!name || !director_email || !director_name) {
      return json({ error: 'Champs obligatoires : name, director_name, director_email' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Générer le code temporaire ───────────────────────────
    // adminTempCode = MOT DE PASSE provisoire dans auth.users
    // = même valeur dans users.temp_code pour cohérence totale
    const adminTempCode = generateTempCode()
    const codeExpiry    = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // ── 1. Créer école + année académique + classes via SQL ──
    const { data: schoolData, error: schoolErr } = await supabaseAdmin.rpc(
      'create_school_with_year',
      {
        p_name:           name,
        p_director_name:  director_name,
        p_director_email: director_email,
        p_phone:          phone || null,
        p_ia:             ia    || null,
        p_ief:            ief   || null,
        p_type:           type_etablissement,
        p_plan:           subscription_plan,
        p_max_students:   max_students,
      }
    )

    if (schoolErr) {
      return json({ error: `Erreur création école : ${schoolErr.message}` }, 500)
    }

    const schoolId = schoolData.school_id
    const yearId   = schoolData.year_id
    const annee    = schoolData.annee

    // ── 2. Mettre à jour codes temporaires sur l'école ──────
    await supabaseAdmin.from('schools').update({
      temp_code:               adminTempCode,
      temp_code_expires_at:    codeExpiry,
      temp_code_used:          false,
      onboarding_completed:    false,
      subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', schoolId)

    // ── 3. Créer le compte auth admin ────────────────────────
    const { data: authUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email:         director_email,
      password:      adminTempCode,  // code = mot de passe provisoire
      email_confirm: true,
      user_metadata: { prenom: director_name, role: 'admin' },
    })

    if (authCreateError) {
      await supabaseAdmin.from('schools').delete().eq('id', schoolId)
      return json({ error: `Erreur création compte : ${authCreateError.message}` }, 500)
    }

    // ── 4. Créer le profil utilisateur admin ─────────────────
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id:                   authUser.user.id,
      prenom:               director_name,
      nom:                  '',
      email:                director_email,
      role:                 'admin',
      school_id:            schoolId,
      must_change_password: true,
      temp_code:            adminTempCode,
      temp_code_expires_at: codeExpiry,
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      await supabaseAdmin.from('schools').delete().eq('id', schoolId)
      return json({ error: `Erreur profil admin : ${profileError.message}` }, 500)
    }

    return json({
      success:         true,
      school_id:       schoolId,
      year_id:         yearId,
      annee_scolaire:  annee,
      admin_temp_code: adminTempCode,
      expires_at:      codeExpiry,
      message:         `École créée. Admin : ${director_email} / Code : ${adminTempCode}`,
    })

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
