/**
 * Calcule la moyenne d'une matière selon la norme sénégalaise :
 *   1. Moyenne des devoirs = Somme(devoirs) / Nombre(devoirs renseignés)
 *   2. MOY/20 = (Moyenne_Devoirs + Compo) / 2
 *   Si un seul des deux est présent, on utilise uniquement celui-là.
 *
 * @param {number[]} devoirs - tableau brut des notes de devoirs (peut contenir null/undefined)
 * @param {number|null} composition - note de composition
 */
export function calculerMoyenneMatiere(devoirs, composition) {
  const devoirsValides = devoirs.filter(d => d !== null && d !== undefined && d !== '')
  const hasMoyDevoirs  = devoirsValides.length > 0
  const hasCompo       = composition !== null && composition !== undefined && composition !== ''

  if (!hasMoyDevoirs && !hasCompo) return null

  const moyDevoirs = hasMoyDevoirs
    ? devoirsValides.reduce((a, b) => a + Number(b), 0) / devoirsValides.length
    : null

  const compo = hasCompo ? Number(composition) : null

  // Si l'un des deux manque, on retourne celui qui est disponible
  if (moyDevoirs === null) return compo
  if (compo === null)      return moyDevoirs

  // Les deux sont présents : formule sénégalaise
  return (moyDevoirs + compo) / 2
}

/**
 * Calcule la moyenne générale pondérée du bulletin
 * Formule : Somme(MOY/20 × Coef) / Somme(Coefficients)
 * @param {Array} matieres - [{moyenne, coefficient}]
 */
export function calculerMoyenneGenerale(matieres) {
  const matieresValides = matieres.filter(m => m.moyenne !== null && m.moyenne !== undefined)
  if (matieresValides.length === 0) return null

  const totalPondere = matieresValides.reduce((acc, m) => acc + (m.moyenne * m.coefficient), 0)
  const totalCoefs   = matieresValides.reduce((acc, m) => acc + m.coefficient, 0)

  return totalCoefs > 0 ? totalPondere / totalCoefs : null
}

/**
 * Détermine la mention selon la moyenne
 */
export function getMention(moyenne) {
  if (moyenne === null || moyenne === undefined) return '-'
  if (moyenne >= 16) return 'Très Bien'
  if (moyenne >= 14) return 'Bien'
  if (moyenne >= 12) return 'Assez Bien'
  if (moyenne >= 10) return 'Passable'
  return 'Insuffisant'
}

/**
 * Détermine l'appréciation par matière
 */
export function getAppreciation(moyenne) {
  if (moyenne === null || moyenne === undefined) return '-'
  if (moyenne >= 16) return 'Excellent travail'
  if (moyenne >= 14) return 'Très bon travail'
  if (moyenne >= 12) return 'Assez bien'
  if (moyenne >= 10) return 'Passable'
  if (moyenne >= 8)  return 'Faible'
  return 'Insuffisant'
}

/**
 * Calcule les rangs d'une classe
 * @param {Array} eleves - [{id, moyenne}]
 * @returns {Object} - {id: rang}
 */
export function calculerRangs(eleves) {
  const sorted = [...eleves]
    .filter(e => e.moyenne !== null)
    .sort((a, b) => b.moyenne - a.moyenne)

  const rangs = {}
  sorted.forEach((eleve, index) => {
    rangs[eleve.id] = index + 1
  })
  return rangs
}

/**
 * Calcule la moyenne annuelle (T1 + T2 + T3) / 3
 */
export function calculerMoyenneAnnuelle(moyT1, moyT2, moyT3) {
  const valides = [moyT1, moyT2, moyT3].filter(m => m !== null && m !== undefined)
  if (valides.length === 0) return null
  return valides.reduce((a, b) => a + b, 0) / valides.length
}

/**
 * Détermine le statut de passage d'un élève
 */
export function getStatutPassage(moyenne, seuilAdmis = 10, seuilBorderline = 8) {
  if (moyenne === null) return 'en_attente'
  if (moyenne >= seuilAdmis) return 'admis'
  if (moyenne >= seuilBorderline) return 'borderline'
  return 'redoublant'
}

/**
 * Formate un nombre en note (2 décimales), retourne '-' si absent
 */
export function formatNote(note) {
  if (note === null || note === undefined || note === '') return '-'
  const n = Number(note)
  if (isNaN(n)) return '-'
  return n.toFixed(2)
}
