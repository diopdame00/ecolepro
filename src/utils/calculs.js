/**
 * Calcule la moyenne d'une matière
 * @param {number[]} devoirs - tableau des notes de devoirs
 * @param {number|null} composition - note de composition
 * @param {number} poidsDevoirs - poids des devoirs en % (ex: 60)
 * @param {number} poidsCompo - poids de la compo en % (ex: 40)
 */
export function calculerMoyenneMatiere(devoirs, composition, poidsDevoirs = 60, poidsCompo = 40) {
  const devoirsValides = devoirs.filter(d => d !== null && d !== undefined && d !== '')
  if (devoirsValides.length === 0 && !composition) return null

  const moyDevoirs = devoirsValides.length > 0
    ? devoirsValides.reduce((a, b) => a + Number(b), 0) / devoirsValides.length
    : 0

  const compo = composition !== null && composition !== undefined && composition !== ''
    ? Number(composition)
    : 0

  if (devoirsValides.length === 0) return compo
  if (!composition && composition !== 0) return moyDevoirs

  return (moyDevoirs * poidsDevoirs / 100) + (compo * poidsCompo / 100)
}

/**
 * Calcule la moyenne générale pondérée
 * @param {Array} matieres - [{moyenne, coefficient}]
 */
export function calculerMoyenneGenerale(matieres) {
  const matieresValides = matieres.filter(m => m.moyenne !== null && m.moyenne !== undefined)
  if (matieresValides.length === 0) return null

  const totalPondere = matieresValides.reduce((acc, m) => acc + (m.moyenne * m.coefficient), 0)
  const totalCoefs = matieresValides.reduce((acc, m) => acc + m.coefficient, 0)

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
  if (moyenne >= 16) return 'T. Bien'
  if (moyenne >= 14) return 'Bien'
  if (moyenne >= 12) return 'A. Bien'
  if (moyenne >= 10) return 'Passable'
  if (moyenne >= 8) return 'Faible'
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
 * Formate un nombre en note sur 20
 */
export function formatNote(note) {
  if (note === null || note === undefined || note === '') return '-'
  return Number(note).toFixed(2)
}
