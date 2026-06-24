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

    // ── 1. Récupérer toutes les classes de l'école ─────────────────────
    const { data: toutesClasses, error: classesErr } = await supabaseAdmin
      .from('classes').select('*').eq('school_id', school_id).order('nom')
    if (classesErr) return json({ error: 'Erreur lecture classes : ' + classesErr.message }, 500)

    // Déterminer l'année active = la plus récente en base
    const anneesExistantes = [...new Set((toutesClasses || [])
      .map(c => c.annee_scolaire).filter(Boolean))].sort().reverse()
    const anneeActive = anneesExistantes[0] || null

    // Garder uniquement les classes de l'année active pour la duplication
    const anciennesClasses = (toutesClasses || [])
      .filter(c => c.annee_scolaire === anneeActive)

    // ── 2. Vérifier que la nouvelle année n'existe pas déjà ────────────
    const dejaExiste = (toutesClasses || []).some(c => c.annee_scolaire === nouvelle_annee)
    if (dejaExiste) return json({ error: `L'année ${nouvelle_annee} existe déjà` }, 400)

    // ── 3. Créer les nouvelles classes ─────────────────────────────────
    // On déduplique par nom. On part des classes de l'année active.
    // On ajoute aussi les noms de classes cibles des décisions qui n'existent pas encore
    // (ex: "Tle L2 A" si elle n'était pas dans les classes actives)
    const nomsACreer = new Set<string>()
    anciennesClasses.forEach(c => nomsACreer.add(c.nom))

    // Ajouter les classes cibles des promotions (niveaux supérieurs)
    ;(decisions || []).forEach((d: any) => {
      if (d.action !== 'sortant' && d.nouvelle_classe_nom) {
        nomsACreer.add(d.nouvelle_classe_nom)
      }
    })

    // Construire une map nom → config depuis les classes existantes (pour frais etc.)
    const configParNom: Record<string, any> = {}
    anciennesClasses.forEach(c => { configParNom[c.nom] = c })

    const nouvellesClassesInsert = [...nomsACreer].map(nom => {
      const ref = configParNom[nom] || anciennesClasses[0] // fallback sur première classe
      return {
        nom,
        school_id:         school_id,
        annee_scolaire:    nouvelle_annee,
        niveau:            ref?.niveau            || null,
        frais_inscription: ref?.frais_inscription || null,
        frais_scolarite:   ref?.frais_scolarite   || null,
      }
    })

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

    // ── 4. Dupliquer class_subjects depuis l'année active uniquement ───
    const anciennesClasseIds = anciennesClasses.map(c => c.id)

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
