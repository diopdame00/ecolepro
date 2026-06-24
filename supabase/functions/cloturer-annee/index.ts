// ============================================================
// Edge Function : cloturer-annee v2.0
// Clôture l'année active et crée automatiquement la suivante
// Deploy : supabase functions deploy cloturer-annee
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
    // ── Vérifier admin ou superadmin ─────────────────────────
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
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ error: 'Accès réservé à l\'administrateur' }, 403)
    }

    const body = await req.json()
    // Superadmin peut passer un school_id, admin utilise le sien
    const school_id = profile.role === 'superadmin'
      ? (body.school_id || profile.school_id)
      : profile.school_id

    if (!school_id) return json({ error: 'school_id manquant' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Appeler la fonction SQL de clôture ───────────────────
    const { data: result, error: clotureErr } = await supabaseAdmin
      .rpc('cloturer_annee', { p_school_id: school_id })

    if (clotureErr) {
      return json({ error: `Erreur clôture : ${clotureErr.message}` }, 500)
    }

    if (result?.error) {
      return json({ error: result.error }, 400)
    }

    return json({
      success:          true,
      annee_cloturee:   result.annee_cloturee,
      nouvelle_annee:   result.nouvelle_annee,
      new_year_id:      result.new_year_id,
      classes_creees:   result.classes_creees,
      message:          `Année ${result.annee_cloturee} clôturée. Nouvelle année ${result.nouvelle_annee} créée avec ${result.classes_creees} classe(s).`,
    })

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
