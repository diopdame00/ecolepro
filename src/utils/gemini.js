const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

/**
 * Envoie les données CSV à Gemini avec une instruction en français
 * et retourne le tableau d'élèves corrigé
 */
export async function traiterCSVAvecIA(csvData, instruction) {
  const prompt = `
Tu es un assistant de gestion scolaire. Voici un tableau d'élèves importé depuis un fichier CSV.

DONNÉES :
${JSON.stringify(csvData, null, 2)}

INSTRUCTION DE L'ADMINISTRATEUR :
"${instruction}"

RÈGLES IMPORTANTES :
- Retourne UNIQUEMENT un JSON valide, sans texte avant ou après
- Le JSON doit être un tableau d'objets avec ces champs : prenom, nom, date_naissance, sexe, classe, contact_parent
- Si un champ est manquant et que l'instruction ne le précise pas, mets null
- Corrige les majuscules/minuscules pour les noms et prénoms (première lettre en majuscule)
- Supprime les doublons (même nom + même prénom)
- Formate les dates en DD/MM/YYYY si possible
- Respecte exactement l'instruction donnée

Réponds uniquement avec le JSON, rien d'autre.
`

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Erreur Gemini: ${response.statusText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Nettoyer la réponse et parser le JSON
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

/**
 * Parse un fichier CSV en tableau d'objets
 */
export function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))

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

  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${initiales}-${annee}-${random}`
}
