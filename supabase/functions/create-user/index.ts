// ============================================================
// Supabase Edge Function : create-user (v2)
// Génère un code temporaire unique pour chaque prof créé
// Déployer avec : supabase functions deploy create-user
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `PROF-${rand(4)}-${rand(4)}`
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !caller) return json({ error: 'Token invalide' }, 401)

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile) return json({ error: 'Profil appelant introuvable' }, 403)

    const body = await req.json()
    const { prenom, nom, email, role } = body

    // ── Action : supprimer un utilisateur ──────────────────
    if (body.action === 'delete_user') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id requis' }, 400)

      // Vérifier que l'appelant a le droit de supprimer cet user
      const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('role, school_id')
        .eq('id', user_id)
        .single()

      if (!targetUser) return json({ error: 'Utilisateur introuvable' }, 404)

      // Admin ne peut supprimer que dans son école
      if (callerProfile.role === 'admin') {
        if (targetUser.school_id !== callerProfile.school_id)
          return json({ error: 'Permission refusée' }, 403)
        if (!['prof', 'secretaire', 'surveillant'].includes(targetUser.role))
          return json({ error: 'Vous ne pouvez pas supprimer cet utilisateur' }, 403)
      }

      // Supprimer les données liées manuellement (si pas de CASCADE)
      await supabaseAdmin.from('prof_classes').delete().eq('prof_id', user_id)
      await supabaseAdmin.from('salary_configs').delete().eq('prof_id', user_id)
      await supabaseAdmin.from('prof_invitations').delete().eq('user_id', user_id)

      // Supprimer le profil DB
      const { error: deleteProfileError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', user_id)

      if (deleteProfileError) return json({ error: deleteProfileError.message }, 500)

      // Supprimer le compte Auth
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (deleteAuthError) return json({ error: deleteAuthError.message }, 500)

      return json({ success: true, message: 'Utilisateur supprimé' })
    }

    // ── Action : régénérer le code d'activation ──────────────
    if (body.action === 'regenerate_code') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id requis' }, 400)

      const newCode     = generateActivationCode()
      const newPassword = generateTempPassword()
      const newExpiry   = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      // Mettre à jour le mot de passe Auth
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: newPassword,
      })
      if (pwError) return json({ error: pwError.message }, 500)

      // Mettre à jour le profil
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          temp_code:            newCode,
          temp_code_expires_at: newExpiry,
          temp_code_used:       false,
          must_change_password: true,
        })
        .eq('id', user_id)
        .select('email')
        .single()

      if (updateError) return json({ error: updateError.message }, 500)

      return json({
        success:         true,
        activation_code: newCode,
        temp_password:   newPassword,
        expires_at:      newExpiry,
        email:           updatedUser.email,
      })
    }

    // Règles d'autorisation
    if (callerProfile.role === 'admin') {
      if (!['prof', 'secretaire', 'surveillant'].includes(role)) {
        return json({ error: 'Un admin peut créer : prof, secretaire, surveillant' }, 403)
      }
    } else if (callerProfile.role === 'superadmin') {
      if (!['admin', 'prof', 'secretaire', 'surveillant'].includes(role)) {
        return json({ error: 'Rôle invalide' }, 400)
      }
    } else {
      return json({ error: 'Permission refusée' }, 403)
    }

    if (!prenom || !nom || !email) {
      return json({ error: 'Prénom, nom et email sont requis' }, 400)
    }

    const targetSchoolId = callerProfile.role === 'superadmin'
      ? (body.school_id || callerProfile.school_id)
      : callerProfile.school_id

    // Générer codes
    const activationCode = generateActivationCode()
    const tempPassword   = generateTempPassword()
    const codeExpiry     = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48h

    // Créer l'utilisateur Supabase Auth
    const { data: { user: newUser }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password:      tempPassword,
      email_confirm: true,
      user_metadata: { prenom, nom, role },
    })

    if (createError) return json({ error: createError.message }, 500)

    // Créer le profil avec code temporaire
    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id:                  newUser.id,
      prenom,
      nom,
      email,
      role,
      school_id:           targetSchoolId,
      must_change_password: true,
      temp_code:           activationCode,
      temp_code_expires_at: codeExpiry,
      temp_code_used:      false,
    })

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id)
      return json({ error: insertError.message }, 500)
    }

    // Créer l'entrée dans prof_invitations si c'est un prof
    if (role === 'prof') {
      await supabaseAdmin.from('prof_invitations').insert({
        school_id:       targetSchoolId,
        prenom,
        nom,
        email,
        activation_code: activationCode,
        code_expires_at: codeExpiry,
        statut:          'en_attente',
        user_id:         newUser.id,
        created_by:      caller.id,
      })
    }

    return json({
      success:          true,
      user_id:          newUser.id,
      activation_code:  activationCode,
      temp_password:    tempPassword,
      expires_at:       codeExpiry,
      message:          `Compte créé. Communiquez le code d'activation et le mot de passe provisoire à ${prenom} ${nom}.`,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})