import jsPDF from 'jspdf'
import { getAppreciation, formatNote } from './calculs'

/**
 * Génère le bulletin PDF d'un élève
 * Modèle sénégalais : IA / IEF / École, 2 devoirs séparés, sans couleur bleue
 */
export async function genererBulletin({ eleve, classe, ecole, notes, matieres, resultats, trimestre, annee }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = 210
  const margin = 15
  const contentW = pageW - margin * 2

  // ── Palette noir & blanc uniquement ──
  const noir      = [0, 0, 0]
  const grisFonce = [60, 60, 60]
  const grisMoyen = [130, 130, 130]
  const grisLight = [240, 240, 240]
  const blanc     = [255, 255, 255]

  let y = 15

  // ── En-tête ──────────────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grisFonce)

  // Colonne gauche : IA → IEF → Nom de l'école
  const startY = y
  if (ecole.ia) {
    doc.text(ecole.ia.toUpperCase(), margin, y)
    y += 5
  }
  if (ecole.ief) {
    doc.text(ecole.ief, margin, y)
    y += 5
  }
  doc.text(ecole.name?.toUpperCase() || 'ÉCOLE', margin, y)

  // Colonne droite : année scolaire + semestre (alignée sur la 1ère ligne de gauche)
  doc.text(`Année Scolaire : ${annee}`, pageW - margin, startY, { align: 'right' })
  doc.text(
    `${trimestre === 1 ? '1er' : trimestre === 2 ? '2ème' : '3ème'} Semestre`,
    pageW - margin,
    startY + 6,
    { align: 'right' }
  )

  // Ligne séparatrice noire
  y += 8
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageW - margin, y)

  // ── Titre ────────────────────────────────────────────────────────────────
  y += 9
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('BULLETIN DE NOTES', pageW / 2, y, { align: 'center' })

  // Ligne sous le titre
  y += 3
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)

  // ── Infos élève ──────────────────────────────────────────────────────────
  y += 8
  doc.setFontSize(9)
  doc.setTextColor(...noir)

  // Ligne 1 : Prénoms / Nom
  doc.setFont('helvetica', 'bold')
  doc.text('Prénoms', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(eleve.prenom || '-', margin + 19, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Nom', 112, y)
  doc.setFont('helvetica', 'normal')
  doc.text((eleve.nom || '-').toUpperCase(), 122, y)

  // Ligne 2 : Né(e) le / Classe
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Né(e) le', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(eleve.date_naissance || '-', margin + 16, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Classe :', 112, y)
  doc.setFont('helvetica', 'normal')
  doc.text(classe.nom || '-', 124, y)

  // Ligne 3 : Matricule / Nbre élèves / Classe redoublée
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Matricule :', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(eleve.unique_code || '-', margin + 19, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Nbre d\'élèves', 112, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(classe.nb_eleves || '-'), 136, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Classe Redoublée', 152, y)
  doc.setFont('helvetica', 'normal')
  doc.text(eleve.redoublant ? '1' : '0', 178, y)

  // ── Tableau des notes ─────────────────────────────────────────────────────
  // Colonnes : Disciplines | Devoir 1 | Devoir 2 | Compo | Moy/20 | Coef | Moy× | T.H | Rang | Appréciations
  y += 10
  const colWidths = [38, 14, 14, 14, 16, 10, 16, 10, 10, 28]
  const headers   = ['DISCIPLINES', 'Devoir', 'Devoir', 'Compo', 'Moy/20', 'Coef', 'Moy×', 'T.H', 'Rang', 'Appréciations']
  const subHeaders = ['', '1', '2', '', '', '', '', '', '', '']
  const rowH = 7

  // ── En-tête tableau (fond noir, texte blanc) ──
  doc.setFillColor(...noir)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setTextColor(...blanc)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  let x = margin
  headers.forEach((h, i) => {
    const cx = x + colWidths[i] / 2
    if (subHeaders[i]) {
      // "Devoir" sur 2 lignes avec numéro
      doc.text(h, cx, y + 3.2, { align: 'center' })
      doc.text(subHeaders[i], cx, y + 5.8, { align: 'center' })
    } else {
      doc.text(h, cx, y + 4.8, { align: 'center' })
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

  let totalCoef = 0
  let totalMoyPonderee = 0

  matieres.forEach((matiere, idx) => {
    const note = notes.find(n => n.matiere_id === matiere.id) || {}
    const bg = idx % 2 === 0 ? blanc : grisLight

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
      if (i < colWidths.length - 1) {
        doc.line(x, y, x, y + rowH)
      }
    })

    // Calcul moyenne : (moy_devoirs + compo×2) / 3
    let moy = note.moyenne_matiere ?? null
    if (moy === null && note.moyenne_devoirs != null && note.composition != null) {
      moy = (note.moyenne_devoirs + note.composition * 2) / 3
      moy = Math.round(moy * 100) / 100
    }
    const moyPond = moy !== null ? moy * matiere.coefficient : null
    if (moyPond !== null) {
      totalCoef += matiere.coefficient
      totalMoyPonderee += moyPond
    }

    // Devoir 1 et Devoir 2 séparément
    const devoir1 = note.devoir_1 != null ? formatNote(note.devoir_1) : '-'
    const devoir2 = note.devoir_2 != null ? formatNote(note.devoir_2) : '-'

    const row = [
      matiere.nom,
      devoir1,
      devoir2,
      formatNote(note.composition),
      formatNote(moy),
      String(matiere.coefficient),
      moyPond !== null ? formatNote(moyPond) : '-',
      'TH',
      note.rang ? String(note.rang) : '-',
      getAppreciation(moy),
    ]

    x = margin
    row.forEach((val, i) => {
      doc.setFontSize(i === 0 ? 7.5 : 7)
      doc.setFont('helvetica', i === 0 ? 'normal' : 'normal')
      // Nom de discipline aligné à gauche avec petit padding
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

  // Position colonne Coef (après Disciplines+D1+D2+Compo+Moy/20)
  const xCoef = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]
  doc.text(String(totalCoef), xCoef + colWidths[5] / 2, y + 4.8, { align: 'center' })

  // Position colonne Moy× (après Coef)
  const xMoyX = xCoef + colWidths[5]
  doc.text(formatNote(totalMoyPonderee), xMoyX + colWidths[6] / 2, y + 4.8, { align: 'center' })
  y += rowH

  // ── Ligne Moyenne / Rang / Retards / Absences ──
  y += 3
  const moyGen = resultats?.moyenne_generale
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)

  // Bordure du bloc
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.5)
  doc.rect(margin, y, contentW, 10, 'S')

  // Séparateurs internes
  const cols4 = [45, 30, 45, 60]
  let xb = margin
  cols4.forEach((w, i) => {
    xb += w
    if (i < cols4.length - 1) doc.line(xb, y, xb, y + 10)
  })

  doc.text('Moyenne', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(`${moyGen ? formatNote(moyGen) : '-'} /20`, margin + 22, y + 4)
  doc.setFont('helvetica', 'bold')

  doc.text('Rang', margin + 48, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(String(resultats?.rang || '-'), margin + 60, y + 4)
  doc.setFont('helvetica', 'bold')

  doc.text('Retards', margin + 80, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(String(resultats?.retards ?? 0), margin + 98, y + 4)
  doc.setFont('helvetica', 'bold')

  doc.text('Absences', margin + 125, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(String(resultats?.absences ?? 0), margin + 148, y + 4)

  y += 14

  // ── Cases appréciations ───────────────────────────────────────────────────
  const boxW = (contentW / 2) - 3
  const appreciationsLeft  = ['Satisfaisant doit continuer', 'Peut Mieux Faire', 'Insuffisant', 'Risque de Redoubler', "Risque l'exclusion"]
  const appreciationsRight = ['Félicitations', 'Encouragement', "Tableau d'honneur", 'Avertissement', 'Blâme']

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...noir)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)

  appreciationsLeft.forEach((label, i) => {
    doc.rect(margin, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + 2, y + i * 7 + 4.5)
    doc.rect(margin + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
  })

  appreciationsRight.forEach((label, i) => {
    doc.rect(margin + boxW + 6, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + boxW + 8, y + i * 7 + 4.5)
    doc.rect(margin + boxW + 6 + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
  })

  y += 37

  // ── Observations + Signature ──────────────────────────────────────────────
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

  // ── Pied de page ─────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(...grisMoyen)
  doc.setFont('helvetica', 'normal')
  doc.text('Généré par EcolePro — ecolepro.site', pageW / 2, 290, { align: 'center' })

  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}
