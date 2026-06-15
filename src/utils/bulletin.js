import jsPDF from 'jspdf'
import { getAppreciation, formatNote } from './calculs'

/**
 * Calcule la moyenne des devoirs bruts (devoir_1, devoir_2, devoir_3)
 * en ignorant les valeurs nulles/undefined
 */
function moyenneDevoirs(note) {
  const vals = [note.devoir_1, note.devoir_2, note.devoir_3]
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * Calcule MOY/20 selon la norme sénégalaise :
 *   MOY/20 = (Moyenne_Devoirs + Compo) / 2
 * Si une seule valeur est disponible, on l'utilise seule.
 */
function calculerMoy20(note) {
  const mDev  = moyenneDevoirs(note)
  const compo = (note.composition !== null && note.composition !== undefined && note.composition !== '')
                ? Number(note.composition) : null

  if (mDev === null && compo === null) return null
  if (mDev === null) return compo
  if (compo === null) return mDev
  return (mDev + compo) / 2
}

/**
 * Génère le bulletin PDF d'un élève — norme académique sénégalaise
 */
export async function genererBulletin({ eleve, classe, ecole, notes, matieres, resultats, trimestre, annee }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW    = 210
  const margin   = 15
  const contentW = pageW - margin * 2

  // Palette noir & blanc
  const noir      = [0, 0, 0]
  const grisFonce = [60, 60, 60]
  const grisMoyen = [130, 130, 130]
  const grisLight = [240, 240, 240]
  const blanc     = [255, 255, 255]

  let y = 14

  // ── EN-TÊTE ────────────────────────────────────────────────────────────
  // Colonne gauche : République → IA → IEF → Nom école
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grisFonce)

  const startY = y
  doc.setFont('helvetica', 'bold')
  doc.text('RÉPUBLIQUE DU SÉNÉGAL', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  if (ecole.ia) {
    doc.text(ecole.ia, margin, y)
    y += 5
  }
  if (ecole.ief) {
    doc.text(ecole.ief, margin, y)
    y += 5
  }
  doc.setFont('helvetica', 'bold')
  doc.text((ecole.name || 'ÉCOLE').toUpperCase(), margin, y)

  // Colonne droite : Année scolaire + Semestre
  doc.setFont('helvetica', 'normal')
  doc.text(`Année Scolaire : ${annee}`, pageW - margin, startY, { align: 'right' })
  doc.text(
    trimestre === 1 ? '1er Semestre' : trimestre === 2 ? '2ème Semestre' : '3ème Semestre',
    pageW - margin, startY + 6, { align: 'right' }
  )

  // Ligne séparatrice
  y += 7
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageW - margin, y)

  // ── TITRE ──────────────────────────────────────────────────────────────
  y += 8
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('BULLETIN DE NOTES', pageW / 2, y, { align: 'center' })

  y += 3
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)

  // ── INFOS ÉLÈVE ────────────────────────────────────────────────────────
  y += 7
  doc.setFontSize(9)
  doc.setTextColor(...noir)

  // Ligne 1
  doc.setFont('helvetica', 'bold');  doc.text('Prénoms', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.prenom || '-', margin + 19, y)
  doc.setFont('helvetica', 'bold');  doc.text('Nom', 112, y)
  doc.setFont('helvetica', 'normal'); doc.text((eleve.nom || '-').toUpperCase(), 122, y)

  // Ligne 2
  y += 6
  doc.setFont('helvetica', 'bold');  doc.text('Né(e) le', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.date_naissance || '-', margin + 16, y)
  doc.setFont('helvetica', 'bold');  doc.text('Classe :', 112, y)
  doc.setFont('helvetica', 'normal'); doc.text(classe.nom || '-', 124, y)

  // Ligne 3
  y += 6
  doc.setFont('helvetica', 'bold');  doc.text('Matricule :', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.unique_code || '-', margin + 19, y)
  doc.setFont('helvetica', 'bold');  doc.text("Nbre d'élèves", 112, y)
  doc.setFont('helvetica', 'normal'); doc.text(String(classe.nb_eleves || '-'), 136, y)
  doc.setFont('helvetica', 'bold');  doc.text('Classe Redoublée', 152, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.redoublant ? '1' : '0', 178, y)

  // ── TABLEAU DES NOTES ──────────────────────────────────────────────────
  // Colonnes : DISCIPLINES | DEVOIR (moy) | COMPO | MOY/20 | COEF | MOY X | RANG | APPRÉCIATION
  y += 10
  const colWidths = [45, 18, 18, 18, 12, 18, 12, 39]
  const headers   = ['DISCIPLINES', 'DEVOIR\n(moy)', 'COMPO', 'MOY/20', 'COEF', 'MOY X', 'RANG', 'APPRÉCIATION']
  const rowH = 7

  // En-tête tableau (fond noir, texte blanc)
  doc.setFillColor(...noir)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setTextColor(...blanc)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  let x = margin
  headers.forEach((h, i) => {
    const cx = x + colWidths[i] / 2
    const lines = h.split('\n')
    if (lines.length > 1) {
      doc.text(lines[0], cx, y + 3, { align: 'center' })
      doc.text(lines[1], cx, y + 5.8, { align: 'center' })
    } else {
      doc.text(h, cx, y + 4.5, { align: 'center' })
    }
    x += colWidths[i]
  })

  // Séparateurs verticaux dans l'en-tête
  doc.setDrawColor(...blanc)
  doc.setLineWidth(0.2)
  x = margin
  colWidths.forEach((w, i) => {
    x += w
    if (i < colWidths.length - 1) doc.line(x, y, x, y + rowH)
  })

  // ── Lignes matières ──
  y += rowH
  doc.setTextColor(...noir)
  doc.setFont('helvetica', 'normal')

  let totalCoef       = 0
  let totalMoyPond    = 0

  matieres.forEach((matiere, idx) => {
    const note = notes.find(n => n.matiere_id === matiere.id) || {}
    const bg   = idx % 2 === 0 ? blanc : grisLight

    doc.setFillColor(...bg)
    doc.rect(margin, y, contentW, rowH, 'F')

    // Bordures
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.rect(margin, y, contentW, rowH, 'S')

    // Séparateurs verticaux
    x = margin
    colWidths.forEach((w, i) => {
      x += w
      if (i < colWidths.length - 1) doc.line(x, y, x, y + rowH)
    })

    // Calculs
    const mDev   = moyenneDevoirs(note)                         // moyenne des devoirs
    const moy20  = calculerMoy20(note)                          // MOY/20
    const moyX   = moy20 !== null ? moy20 * matiere.coefficient : null  // MOY X

    if (moyX !== null) {
      totalCoef    += matiere.coefficient
      totalMoyPond += moyX
    }

    const row = [
      matiere.nom,
      formatNote(mDev),
      formatNote(note.composition),
      formatNote(moy20),
      String(matiere.coefficient),
      moyX !== null ? formatNote(moyX) : '-',
      note.rang ? String(note.rang) : '-',
      getAppreciation(moy20),
    ]

    x = margin
    row.forEach((val, i) => {
      doc.setFontSize(i === 0 ? 7.5 : 7)
      if (i === 0) {
        doc.text(val, x + 2, y + 4.8)
      } else {
        doc.text(val, x + colWidths[i] / 2, y + 4.8, { align: 'center' })
      }
      x += colWidths[i]
    })

    y += rowH
  })

  // ── Ligne TOTAL ──
  doc.setFillColor(...grisLight)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, contentW, rowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...noir)
  doc.text('TOTAL', margin + 3, y + 4.8)

  // Position colonne COEF
  const xCoef = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]
  doc.text(String(totalCoef), xCoef + colWidths[4] / 2, y + 4.8, { align: 'center' })

  // Position colonne MOY X
  const xMoyX = xCoef + colWidths[4]
  doc.text(formatNote(totalMoyPond), xMoyX + colWidths[5] / 2, y + 4.8, { align: 'center' })
  y += rowH

  // ── Ligne Moyenne / Rang / Retards / Absences ──
  y += 3
  const moyGen = resultats?.moyenne_generale
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.5)
  doc.rect(margin, y, contentW, 10, 'S')

  // Séparateurs internes
  const seg = [45, 30, 45, 60]
  let xb = margin
  seg.forEach((w, i) => { xb += w; if (i < seg.length - 1) doc.line(xb, y, xb, y + 10) })

  doc.text('Moyenne', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(`${moyGen ? formatNote(moyGen) : '-'} /20`, margin + 22, y + 4)

  doc.setFont('helvetica', 'bold'); doc.text('Rang', margin + 48, y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.rang || '-'), margin + 60, y + 4)

  doc.setFont('helvetica', 'bold'); doc.text('Retards', margin + 80, y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.retards ?? 0), margin + 98, y + 4)

  doc.setFont('helvetica', 'bold'); doc.text('Absences', margin + 125, y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.absences ?? 0), margin + 148, y + 4)

  y += 14

  // ── APPRÉCIATIONS ──────────────────────────────────────────────────────
  const boxW = (contentW / 2) - 3
  const apprGauche = ['Satisfaisant doit continuer', 'Peut Mieux Faire', 'Insuffisant', 'Risque de Redoubler', "Risque l'exclusion"]
  const apprDroite = ['Félicitations', 'Encouragement', "Tableau d'honneur", 'Avertissement', 'Blâme']

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...noir)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)

  apprGauche.forEach((label, i) => {
    doc.rect(margin, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + 2, y + i * 7 + 4.5)
    doc.rect(margin + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
  })
  apprDroite.forEach((label, i) => {
    doc.rect(margin + boxW + 6, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + boxW + 8, y + i * 7 + 4.5)
    doc.rect(margin + boxW + 6 + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
  })

  y += 37

  // ── OBSERVATIONS + SIGNATURE ───────────────────────────────────────────
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('Observations du conseil des professeurs', margin, y)
  doc.text("Le Chef d'Établissement", margin + boxW + 6, y)

  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.3)
  doc.rect(margin, y + 3, boxW, 25, 'S')
  doc.rect(margin + boxW + 6, y + 3, boxW, 25, 'S')

  // ── PIED DE PAGE ───────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(...grisMoyen)
  doc.setFont('helvetica', 'normal')
  doc.text('Généré par EcolePro — ecolepro.site', pageW / 2, 290, { align: 'center' })

  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}
