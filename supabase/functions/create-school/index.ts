// ============================================================
// Supabase Edge Function : create-school (v2)
// Génère un code temporaire unique + type établissement
// Déployer avec : supabase functions deploy create-school
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Génère un code temporaire lisible humain : ECO-XXXX-XXXX
function generateTempCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans O/0/I/1 pour lisibilité
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `ECO-${rand(4)}-${rand(4)}`
}

// Génère un mdp provisoire sécurisé
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentification requise' }, 401)

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return json({ error: 'Non authentifié' }, 401)

    const { data: profile } = await supabaseAuth.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'superadmin') return json({ error: 'Accès réservé au Super Admin' }, 403)

    const {
      name, director_name, director_email, phone,
      subscription_plan, max_students,
      ia, ief,
      type_etablissement = 'college',
    } = await req.json()

    if (!name || !director_email || !director_name) {
      return json({ error: 'Champs obligatoires manquants' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Générer les codes
    const schoolTempCode = generateTempCode()
    const tempPassword   = generateTempPassword()
    const codeExpiry     = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

    // 1. Créer l'école avec type + code temporaire
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .insert({
        name,
        ia:   ia   || null,
        ief:  ief  || null,
        director_name,
        director_email,
        phone,
        subscription_plan: subscription_plan || 'starter',
        max_students:       max_students || 100,
        is_active:          true,
        type_etablissement,
        temp_code:          schoolTempCode,
        temp_code_expires_at: codeExpiry,
        temp_code_used:     false,
        onboarding_completed: false,
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (schoolError) return json({ error: `Erreur création école: ${schoolError.message} (code: ${schoolError.code})` }, 500)

    // 2. Créer le compte admin avec mdp temporaire + flag force-change
    const { data: authUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email:             director_email,
      password:          tempPassword,
      email_confirm:     true,
      user_metadata:     { prenom: director_name, role: 'admin' },
    })

    if (authCreateError) {
      await supabaseAdmin.from('schools').delete().eq('id', school.id)
      return json({ error: authCreateError.message }, 500)
    }

    // Générer un code temporaire pour l'admin aussi
    const adminTempCode = generateTempCode()

    // 3. Créer le profil utilisateur admin
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id:         authUser.user.id,
      prenom:     director_name,
      nom:        '',
      email:      director_email,
      role:       'admin',
      school_id:  school.id,
      must_change_password: true,
      temp_code:            adminTempCode,
      temp_code_expires_at: codeExpiry,
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      await supabaseAdmin.from('schools').delete().eq('id', school.id)
      return json({ error: profileError.message }, 500)
    }

    // 4. Pré-configurer les niveaux selon le type établissement
    const { data: presets } = await supabaseAdmin
      .from('niveau_presets')
      .select('nom, ordre')
      .eq('type_etablissement', type_etablissement)
      .order('ordre')

    if (presets && presets.length > 0) {
      const currentYear = new Date().getFullYear()
      const annee = `${currentYear}/${currentYear + 1}`
      
      await supabaseAdmin.from('classes').insert(
        presets.map(p => ({
          nom:           p.nom,
          school_id:     school.id,
          annee_scolaire: annee,
          niveau:        p.nom,
        }))
      )
    }

    return json({
      success: true,
      school_id:          school.id,
      school_temp_code:   schoolTempCode,  // affiché au superadmin
      admin_temp_code:    adminTempCode,   // code temporaire admin
      temp_password:      tempPassword,    // mdp provisoire
      expires_at:         codeExpiry,
      message:            'École créée. Communiquez le code temporaire et le mot de passe à l\'administrateur.',
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
