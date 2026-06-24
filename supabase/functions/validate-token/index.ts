// ============================================================
// Edge Function : validate-token v2.0
// Connexion parent via QR code — retourne les données élève
// Deploy : supabase functions deploy validate-token
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
    const { token } = await req.json()
    if (!token) return json({ error: 'Token manquant' }, 400)

    // Pas besoin d'authentification — accès public via token QR
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Valider le token et récupérer les données élève ──────
    const { data, error } = await supabaseAdmin.rpc('validate_parent_token', {
      p_token: token,
    })

    if (error) {
      console.error('validate_parent_token error:', error)
      return json({ error: 'Erreur serveur' }, 500)
    }

    if (data?.error) {
      return json({ error: data.error }, 401)
    }

    // ── Récupérer toutes les années d'inscription de l'élève ─
    const { data: years } = await supabaseAdmin.rpc('get_student_years_by_token', {
      p_token: token,
    })

    return json({
      success:  true,
      student:  data.student,
      years:    years || [],
    })

  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
