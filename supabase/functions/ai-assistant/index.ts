// ============================================================
// Supabase Edge Function : ai-assistant
// Proxy sécurisé vers Gemini — la clé API reste côté serveur
// Déployer avec : supabase functions deploy ai-assistant
// Variable d'environnement à définir : GEMINI_API_KEY (secret, PAS VITE_*)
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

// SUPABASE_ANON_KEY est marqué "deprecated" sur les nouveaux projets ;
// SUPABASE_PUBLISHABLE_KEY (ou la valeur dans SUPABASE_PUBLISHABLE_KEYS)
// est le remplaçant. On essaie les deux pour rester compatible.
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 0. Vérifications de configuration — renvoyer une erreur explicite
    //    plutôt qu'un crash silencieux (502 générique) si une variable
    //    d'environnement attendue est absente.
    const missing = []
    if (!GEMINI_API_KEY) missing.push('GEMINI_API_KEY')
    if (!Deno.env.get('SUPABASE_URL')) missing.push('SUPABASE_URL')
    if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY')

    if (missing.length > 0) {
      console.error('Variables manquantes:', missing.join(', '))
      return json({ error: `Configuration serveur incomplète (variables manquantes : ${missing.join(', ')})` }, 500)
    }

    // 1. Authentifier l'utilisateur via son JWT Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Authentification requise' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Utilisateur non authentifié' }, 401)
    }

    // 2. Récupérer le profil (rôle + école) — RLS s'applique
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, school_id, prenom, nom')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return json({ error: 'Profil introuvable' }, 403)
    }

    // 3. Le superadmin n'a accès à aucune fonction IA pédagogique/financière
    if (profile.role === 'superadmin') {
      return json({ error: 'Assistant IA non disponible pour ce rôle' }, 403)
    }

    const { prompt, action, params } = await req.json()

    // 4. Construire le contexte système selon le rôle — JAMAIS de données brutes
    //    L'IA ne peut interroger la base que via les fonctions RPC sécurisées
    //    (ai_*) qui appliquent déjà les permissions via RLS / SECURITY DEFINER.
    const systemContext = buildSystemContext(profile)

    const fullPrompt = `${systemContext}\n\nQUESTION DE L'UTILISATEUR :\n"${prompt}"\n\nRéponds de manière concise et professionnelle en français.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    let response
    try {
      response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        return json({ error: 'Erreur IA: délai dépassé, réessayez avec un fichier plus petit ou une instruction plus simple.' }, 504)
      }
      throw fetchErr
    }
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      return json({ error: `Erreur IA: ${errText}` }, 502)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    return json({ response: text })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function buildSystemContext(profile) {
  const base = `Tu es l'assistant IA d'EcolePro, un logiciel de gestion scolaire pour écoles privées sénégalaises.
Utilisateur connecté : ${profile.prenom} ${profile.nom}, rôle : ${profile.role}.
RÈGLE ABSOLUE : tu ne dois JAMAIS révéler d'informations sur d'autres écoles que celle de l'utilisateur (school_id: ${profile.school_id}).
Tu ne dois JAMAIS révéler d'informations auxquelles le rôle "${profile.role}" n'a normalement pas accès.`

  const roleContexts = {
    admin: `Tu peux aider l'administrateur avec : statistiques générales, absences par classe, revenus, heures des professeurs.
Pour les questions chiffrées, indique-lui d'utiliser les fonctions RPC : ai_stats_ecole, ai_classe_plus_absences, ai_profs_heures.`,
    secretaire: `Tu peux aider le secrétaire/comptable avec : élèves en impayé, encaissements du jour/mois, suivi financier.
Pour les questions chiffrées, indique-lui d'utiliser les fonctions RPC : ai_eleves_impaye, ai_encaissements.
Tu n'as accès à AUCUNE information sur les notes ou présences des élèves.`,
    prof: `Tu peux aider le professeur avec : ses élèves en difficulté, son emploi du temps, ses heures effectuées, génération de devoirs/exercices/contrôles.
Pour les questions chiffrées, indique-lui d'utiliser les fonctions RPC : ai_eleves_faibles, ai_prof_timetable, ai_prof_hours.
Tu n'as accès qu'aux classes et matières de ce professeur, jamais aux autres.`,
    parent: `Tu aides le parent/élève avec : sa moyenne, ses absences, ses paiements restants, des conseils pour améliorer ses résultats.
Tu n'as accès qu'aux données de CET élève, jamais aux autres élèves de l'école.`,
    surveillant: `Tu peux aider le surveillant avec : les absences et retards du jour, les incidents disciplinaires.
Tu n'as accès à AUCUNE information sur les notes ou les paiements des élèves.`,
  }

  return base + '\n\n' + (roleContexts[profile.role] || '')
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}