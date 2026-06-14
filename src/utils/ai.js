import { supabase } from '../lib/supabase'

// ============================================================
// Assistant IA — appelle l'Edge Function "ai-assistant"
// La clé API Gemini n'est JAMAIS exposée côté client.
// ============================================================

/**
 * Envoie une question en langage naturel à l'assistant IA.
 * Le contexte de permissions est géré côté serveur (Edge Function).
 */
export async function askAssistant(prompt) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  if (!token) throw new Error('Non authentifié')

  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { prompt },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return data.response
}

// ============================================================
// Fonctions RPC sécurisées par rôle — pour les requêtes chiffrées
// Chaque fonction vérifie les permissions côté base (SECURITY DEFINER)
// ============================================================

// --- Secrétaire / Admin financier ---

export async function aiElevesImpaye(schoolId, classeId = null, annee = '2025/2026') {
  const { data, error } = await supabase.rpc('ai_eleves_impaye', {
    p_school_id: schoolId,
    p_classe_id: classeId,
    p_annee: annee,
  })
  if (error) throw error
  return data
}

export async function aiEncaissements(schoolId, debut, fin) {
  const { data, error } = await supabase.rpc('ai_encaissements', {
    p_school_id: schoolId,
    p_debut: debut,
    p_fin: fin,
  })
  if (error) throw error
  return data?.[0]
}

// --- Administrateur ---

export async function aiStatsEcole(schoolId) {
  const { data, error } = await supabase.rpc('ai_stats_ecole', { p_school_id: schoolId })
  if (error) throw error
  return data
}

export async function aiClassePlusAbsences(schoolId, trimestre = null) {
  const { data, error } = await supabase.rpc('ai_classe_plus_absences', {
    p_school_id: schoolId,
    p_trimestre: trimestre,
  })
  if (error) throw error
  return data
}

export async function aiProfsHeures(schoolId, mois = null, annee = null) {
  const { data, error } = await supabase.rpc('ai_profs_heures', {
    p_school_id: schoolId,
    p_mois: mois,
    p_annee: annee,
  })
  if (error) throw error
  return data
}

// --- Professeur ---

export async function aiElevesFaibles(profId, seuil = 10, trimestre = 1) {
  const { data, error } = await supabase.rpc('ai_eleves_faibles', {
    p_prof_id: profId,
    p_seuil: seuil,
    p_trimestre: trimestre,
  })
  if (error) throw error
  return data
}

export async function aiProfTimetable(profId, jour = null, anneeSco = '2025/2026') {
  const { data, error } = await supabase.rpc('ai_prof_timetable', {
    p_prof_id: profId,
    p_jour: jour,
    p_annee_sco: anneeSco,
  })
  if (error) throw error
  return data
}

export async function aiProfHours(profId, mois = null, annee = null) {
  const { data, error } = await supabase.rpc('ai_prof_hours', {
    p_prof_id: profId,
    p_mois: mois,
    p_annee: annee,
  })
  if (error) throw error
  return data
}

// --- Surveillant ---

export async function aiAbsencesJour(schoolId, date = null) {
  const { data, error } = await supabase.rpc('ai_absences_jour', {
    p_school_id: schoolId,
    p_date: date || new Date().toISOString().slice(0, 10),
  })
  if (error) throw error
  return data
}

// ============================================================
// Import CSV avec IA — conservé du module existant
// ============================================================

/**
 * Envoie les données CSV à l'IA (via Edge Function) avec une instruction
 * en français et retourne le tableau d'élèves corrigé.
 * Traite les données par lots pour éviter les dépassements de quota/temps
 * de la fonction Edge sur de gros fichiers.
 */
export async function traiterCSVAvecIA(csvData, instruction) {
  const TAILLE_LOT = 25
  const resultats = []

  for (let i = 0; i < csvData.length; i += TAILLE_LOT) {
    const lot = csvData.slice(i, i + TAILLE_LOT)

    const prompt = `
Tu es un assistant de gestion scolaire. Voici un tableau d'élèves importé depuis un fichier CSV.

DONNÉES :
${JSON.stringify(lot, null, 2)}

INSTRUCTION DE L'ADMINISTRATEUR :
"${instruction}"

RÈGLES IMPORTANTES :
- Retourne UNIQUEMENT un JSON valide, sans texte avant ou après
- Le JSON doit être un tableau d'objets avec ces champs : prenom, nom, date_naissance, sexe, classe, contact_parent
- Si un champ est manquant et que l'instruction ne le précise pas, mets null
- Corrige les majuscules/minuscules pour les noms et prénoms (première lettre en majuscule)
- Supprime les doublons (même nom + même prénom)
- Formate les dates en YYYY-MM-DD
- Respecte exactement l'instruction donnée
- Le tableau retourné doit contenir EXACTEMENT ${lot.length} objet(s), un par élève reçu (sauf doublons supprimés)

Réponds uniquement avec le JSON, rien d'autre.
`

    const text = await askAssistant(prompt)
    const clean = text.replace(/```json|```/g, '').trim()

    let lotTraite
    try {
      lotTraite = JSON.parse(clean)
    } catch (err) {
      throw new Error(`Réponse IA invalide sur le lot ${Math.floor(i / TAILLE_LOT) + 1}. Veuillez réessayer ou reformuler votre instruction.`)
    }

    if (!Array.isArray(lotTraite)) {
      throw new Error(`Réponse IA invalide sur le lot ${Math.floor(i / TAILLE_LOT) + 1} (format inattendu).`)
    }

    resultats.push(...lotTraite)
  }

  return resultats
}

/**
 * Parse un fichier CSV en tableau d'objets
 */
/**
 * Normalise un en-tête CSV : minuscules, sans accents, espaces -> underscore.
 * Ex: "Prénom" -> "prenom", "Date de naissance" -> "date_de_naissance"
 */
function normaliserEntete(h) {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les accents
    .replace(/\s+/g, '_')
}

// Table de correspondance entre en-têtes CSV courants et colonnes de la table 'students'
const ALIAS_COLONNES = {
  prenom: 'prenom',
  nom: 'nom',
  date_naissance: 'date_naissance',
  date_de_naissance: 'date_naissance',
  sexe: 'sexe',
  genre: 'sexe',
  classe: 'classe',
  contact_parent: 'contact_parent',
  telephone_parent: 'contact_parent',
  telephone: 'contact_parent',
  contact: 'contact_parent',
}

export function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => {
    const normalized = normaliserEntete(h)
    return ALIAS_COLONNES[normalized] || normalized
  })

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = values[i] || null
    })
    return obj
  }).filter(row => Object.values(row).some(v => v))
}

/**
 * Génère un code unique pour un élève
 * Format: INITIALES-ANNEE-RANDOM4
 */
export function genererCodeUnique(nomEcole, annee) {
  const initiales = nomEcole
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)

  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 4)
  return `${initiales}-${annee}-${random}`
}