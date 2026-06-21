// supabase/functions/start-new-year/index.ts
// Démarre une nouvelle année scolaire :
//   1. Crée les nouvelles classes (même noms, nouvelle annee_scolaire)
//   2. Duplique class_subjects (matières + coefficients)
//   3. Duplique prof_classes (affectations profs)
//   4. Met à jour classe_id de chaque élève selon les décisions de promotion
// Deploy : supabase functions deploy start-new-year

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

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return json({ error: 'Non authentifié' }, 401)

    const { data: profile } = await supabaseAuth
      .from('users').select('role, school_id').eq('id', user.id).single()
    if (profile?.role !== 'admin') return json({ error: "Accès réservé à l'admin" }, 403)

    const school_id = profile.school_id
    const { nouvelle_annee, decisions } = await req.json()
    // decisions : [{ eleve_id, action: 'promo'|'redouble'|'sortant', nouvelle_classe_nom }]

    if (!nouvelle_annee) return json({ error: 'nouvelle_annee manquante' }, 400)
    if (!decisions || !Array.isArray(decisions)) return json({ error: 'decisions manquantes' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Récupérer les classes actuelles ──────────────────────────────
    const { data: anciennesClasses, error: classesErr } = await supabaseAdmin
      .from('classes').select('*').eq('school_id', school_id).order('nom')
    if (classesErr) return json({ error: 'Erreur lecture classes : ' + classesErr.message }, 500)

    // ── 2. Vérifier que la nouvelle année n'existe pas déjà ────────────
    const dejaExiste = anciennesClasses?.some(c => c.annee_scolaire === nouvelle_annee)
    if (dejaExiste) return json({ error: `L'année ${nouvelle_annee} existe déjà` }, 400)

    // ── 3. Créer les nouvelles classes ─────────────────────────────────
    // On déduplique par nom (une seule classe par nom pour la nouvelle année)
    const nomsDejaVus = new Set<string>()
    const nouvellesClassesInsert = (anciennesClasses || [])
      .filter(c => {
        if (nomsDejaVus.has(c.nom)) return false
        nomsDejaVus.add(c.nom)
        return true
      })
      .map(c => ({
        nom:               c.nom,
        school_id:         c.school_id,
        annee_scolaire:    nouvelle_annee,
        niveau:            c.niveau || null,
        frais_inscription: c.frais_inscription || null,
        frais_scolarite:   c.frais_scolarite   || null,
      }))

    const { data: nouvellesClasses, error: insertErr } = await supabaseAdmin
      .from('classes').insert(nouvellesClassesInsert).select()
    if (insertErr) return json({ error: 'Erreur création classes : ' + insertErr.message }, 500)

    // Map nom → nouvelle classe id
    const nouvelleClasseMap: Record<string, string> = {}
    nouvellesClasses?.forEach(c => { nouvelleClasseMap[c.nom] = c.id })

    // Map ancienne classe id → nouvelle classe id (même nom)
    const ancienneVersNouvelle: Record<string, string> = {}
    anciennesClasses?.forEach(ac => {
      const nvId = nouvelleClasseMap[ac.nom]
      if (nvId) ancienneVersNouvelle[ac.id] = nvId
    })

    // ── 4. Dupliquer class_subjects ────────────────────────────────────
    const anciennesClasseIds = (anciennesClasses || []).map(c => c.id)

    const { data: anciensCsData } = await supabaseAdmin
      .from('class_subjects').select('*').in('class_id', anciennesClasseIds)

    if (anciensCsData && anciensCsData.length > 0) {
      // Dédupliquer par (class_id_nouvelle, subject_id)
      const vus = new Set<string>()
      const nouveauxCs = anciensCsData
        .map(cs => ({
          class_id:    ancienneVersNouvelle[cs.class_id],
          subject_id:  cs.subject_id,
          coefficient: cs.coefficient,
        }))
        .filter(cs => {
          if (!cs.class_id) return false
          const key = `${cs.class_id}:${cs.subject_id}`
          if (vus.has(key)) return false
          vus.add(key)
          return true
        })

      if (nouveauxCs.length > 0) {
        const { error: csErr } = await supabaseAdmin.from('class_subjects').insert(nouveauxCs)
        if (csErr) console.error('Erreur duplication class_subjects:', csErr.message)
      }
    }

    // ── 5. Dupliquer prof_classes ──────────────────────────────────────
    const { data: anciensProfClasses } = await supabaseAdmin
      .from('prof_classes').select('*').in('class_id', anciennesClasseIds)

    let profsTransferes = 0
    if (anciensProfClasses && anciensProfClasses.length > 0) {
      const vusPc = new Set<string>()
      const nouveauxProfClasses = anciensProfClasses
        .map(pc => ({
          prof_id:    pc.prof_id,
          class_id:   ancienneVersNouvelle[pc.class_id],
          subject_id: pc.subject_id,
          school_id:  pc.school_id,
        }))
        .filter(pc => {
          if (!pc.class_id) return false
          const key = `${pc.prof_id}:${pc.class_id}:${pc.subject_id}`
          if (vusPc.has(key)) return false
          vusPc.add(key)
          return true
        })

      if (nouveauxProfClasses.length > 0) {
        const { error: pcErr } = await supabaseAdmin.from('prof_classes').insert(nouveauxProfClasses)
        if (pcErr) console.error('Erreur duplication prof_classes:', pcErr.message)
        else profsTransferes = nouveauxProfClasses.length
      }
    }

    // ── 6. Appliquer les décisions de promotion ────────────────────────
    let promus     = 0
    let redoublants = 0
    let sortants   = 0
    const erreurs: string[] = []

    for (const decision of decisions) {
      const { eleve_id, action, nouvelle_classe_nom } = decision

      if (action === 'sortant') {
        const { error } = await supabaseAdmin
          .from('students')
          .update({ classe_id: null, statut: 'sorti' })
          .eq('id', eleve_id)
        if (error) erreurs.push(`Élève ${eleve_id} : ${error.message}`)
        else sortants++

      } else if (action === 'redouble') {
        const nouvelleClasseId = nouvelleClasseMap[nouvelle_classe_nom]
        if (!nouvelleClasseId) {
          erreurs.push(`Classe introuvable pour redoublant : ${nouvelle_classe_nom}`)
          continue
        }
        const { error } = await supabaseAdmin
          .from('students').update({ classe_id: nouvelleClasseId }).eq('id', eleve_id)
        if (error) erreurs.push(`Élève ${eleve_id} : ${error.message}`)
        else redoublants++

      } else if (action === 'promo') {
        const nouvelleClasseId = nouvelleClasseMap[nouvelle_classe_nom]
        if (!nouvelleClasseId) {
          erreurs.push(`Classe supérieure introuvable : ${nouvelle_classe_nom}`)
          continue
        }
        const { error } = await supabaseAdmin
          .from('students').update({ classe_id: nouvelleClasseId }).eq('id', eleve_id)
        if (error) erreurs.push(`Élève ${eleve_id} : ${error.message}`)
        else promus++
      }
    }

    return json({
      success:          true,
      nouvelle_annee,
      classes_creees:   nouvellesClasses?.length || 0,
      profs_transferes: profsTransferes,
      eleves:           { promus, redoublants, sortants },
      erreurs:          erreurs.length > 0 ? erreurs : undefined,
    })

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
