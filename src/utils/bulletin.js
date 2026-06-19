import jsPDF from 'jspdf'
import { getAppreciation, formatNote } from './calculs'

function moyenneDevoirs(note) {
  const vals = [note.devoir_1, note.devoir_2, note.devoir_3]
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function calculerMoy20(note) {
  const mDev  = moyenneDevoirs(note)
  const compo = (note.composition !== null && note.composition !== undefined && note.composition !== '')
                ? Number(note.composition) : null
  if (mDev === null && compo === null) return null
  if (mDev === null) return compo
  if (compo === null) return mDev
  return (mDev + compo) / 2
}

function formatRang(rang) {
  if (rang === null || rang === undefined) return '-'
  return rang === 1 ? '1er' : `${rang}ème`
}

// ── Fonction interne : dessine un bulletin dans un doc jsPDF ──
// offsetY : décalage vertical (0 pour le 1er bulletin, ~148.5 pour le 2ème sur A4)
function dessinerBulletin(doc, { eleve, classe, ecole, notes, matieres, resultats, trimestre, annee }, offsetY = 0, pageW = 210, pageH = 297) {

  const margin   = 12
  const contentW = pageW - margin * 2

  const noir      = [0, 0, 0]
  const grisFonce = [60, 60, 60]
  const grisMoyen = [130, 130, 130]
  const grisLight = [240, 240, 240]
  const blanc     = [255, 255, 255]

  const semestreLabel =
    trimestre === 1 ? '1er Semestre' :
    trimestre === 2 ? '2ème Semestre' :
                     '3ème Semestre'

  let y = offsetY + 10

  // ── EN-TÊTE ──────────────────────────────────────────────────────────
  const startY = y
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...grisFonce)
  doc.text('RÉPUBLIQUE DU SÉNÉGAL', margin, y)
  y += 4.5

  doc.setFont('helvetica', 'normal')
  if (ecole.ia)  { doc.text(`IA : ${ecole.ia}`,   margin, y); y += 4.5 }
  if (ecole.ief) { doc.text(`IEF : ${ecole.ief}`, margin, y); y += 4.5 }
  doc.setFont('helvetica', 'bold')
  doc.text((ecole.name || 'ÉCOLE').toUpperCase(), margin, y)

  doc.setFont('helvetica', 'normal')
  doc.text(`Année Scolaire : ${annee}`, pageW - margin, startY, { align: 'right' })
  doc.text(semestreLabel, pageW - margin, startY + 5.5, { align: 'right' })

  y += 6
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageW - margin, y)

  // ── TITRE ────────────────────────────────────────────────────────────
  y += 6
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('BULLETIN DE NOTES', pageW / 2, y, { align: 'center' })
  y += 2.5
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)

  // ── INFOS ÉLÈVE ──────────────────────────────────────────────────────
  y += 5.5
  doc.setFontSize(8)
  doc.setTextColor(...noir)

  const dateNaissance = eleve.date_naissance
    ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  doc.setFont('helvetica', 'bold');   doc.text('Prénoms', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.prenom || '-', margin + 17, y)
  doc.setFont('helvetica', 'bold');   doc.text('Nom', pageW / 2 + 5, y)
  doc.setFont('helvetica', 'normal'); doc.text((eleve.nom || '-').toUpperCase(), pageW / 2 + 14, y)

  y += 5
  doc.setFont('helvetica', 'bold');   doc.text('Né(e) le', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(dateNaissance, margin + 15, y)
  doc.setFont('helvetica', 'bold');   doc.text('Classe :', pageW / 2 + 5, y)
  doc.setFont('helvetica', 'normal'); doc.text(classe.nom || '-', pageW / 2 + 18, y)

  y += 5
  doc.setFont('helvetica', 'bold');   doc.text('Matricule :', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.unique_code || '-', margin + 18, y)
  doc.setFont('helvetica', 'bold');   doc.text("Nbre d'élèves", pageW / 2 + 5, y)
  doc.setFont('helvetica', 'normal'); doc.text(String(classe.nb_eleves || '-'), pageW / 2 + 24, y)
  doc.setFont('helvetica', 'bold');   doc.text('Redoublant', pageW / 2 + 34, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.redoublant ? 'Oui' : 'Non', pageW / 2 + 47, y)

  // ── TABLEAU DES NOTES ────────────────────────────────────────────────
  y += 7
  const colWidths = [40, 16, 16, 16, 11, 16, 11, 34]
  const headers   = ['DISCIPLINES', 'DEVOIR\n(moy)', 'COMPO', 'MOY/20', 'COEF', 'MOY X', 'RANG', 'APPRÉCIATION']
  const rowH = 6.5

  // En-tête tableau
  doc.setFillColor(...noir)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setTextColor(...blanc)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')

  let x = margin
  headers.forEach((h, i) => {
    const cx    = x + colWidths[i] / 2
    const lines = h.split('\n')
    if (lines.length > 1) {
      doc.text(lines[0], cx, y + 2.5, { align: 'center' })
      doc.text(lines[1], cx, y + 5,   { align: 'center' })
    } else {
      doc.text(h, cx, y + 4, { align: 'center' })
    }
    x += colWidths[i]
  })

  doc.setDrawColor(...blanc)
  doc.setLineWidth(0.15)
  x = margin
  colWidths.forEach((w, i) => {
    x += w
    if (i < colWidths.length - 1) doc.line(x, y, x, y + rowH)
  })

  // ── Lignes matières ──
  y += rowH
  doc.setTextColor(...noir)
  doc.setFont('helvetica', 'normal')

  let totalCoef    = 0
  let totalMoyPond = 0

  matieres.forEach((matiere, idx) => {
    const noteDirecte = notes.find(n => n.matiere_id === matiere.id)
    const note = noteDirecte || notes.find(n => n.subjects?.id === matiere.id) || {}

    const coef = Number(matiere.coefficient ?? note.subjects?.coefficient ?? 1)
    const bg   = idx % 2 === 0 ? blanc : grisLight

    doc.setFillColor(...bg)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.15)
    doc.rect(margin, y, contentW, rowH, 'S')

    x = margin
    colWidths.forEach((w, i) => {
      x += w
      if (i < colWidths.length - 1) doc.line(x, y, x, y + rowH)
    })

    const mDev  = moyenneDevoirs(note)
    const moy20 = calculerMoy20(note)
    const moyX  = moy20 !== null ? moy20 * coef : null

    if (moyX !== null) {
      totalCoef    += coef
      totalMoyPond += moyX
    }

    const rangMatiere = noteDirecte?.rang_matiere ?? note.rang_matiere ?? null

    const row = [
      matiere.nom || '-',
      formatNote(mDev),
      formatNote(note.composition),
      formatNote(moy20),
      String(coef),
      moyX !== null ? formatNote(moyX) : '-',
      formatRang(rangMatiere),
      getAppreciation(moy20),
    ]

    x = margin
    row.forEach((val, i) => {
      doc.setFontSize(i === 0 ? 7 : 6.5)
      if (i === 0) {
        doc.text(val, x + 2, y + 4.3)
      } else {
        doc.text(val, x + colWidths[i] / 2, y + 4.3, { align: 'center' })
      }
      x += colWidths[i]
    })

    y += rowH
  })

  // ── Ligne TOTAL ──
  const moyenneGenerale = totalCoef > 0 ? totalMoyPond / totalCoef : null

  doc.setFillColor(...grisLight)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.25)
  doc.rect(margin, y, contentW, rowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...noir)
  doc.text('TOTAL', margin + 2, y + 4.3)

  const xCoef = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]
  doc.text(String(totalCoef), xCoef + colWidths[4] / 2, y + 4.3, { align: 'center' })
  const xMoyX = xCoef + colWidths[4]
  doc.text(
    totalMoyPond > 0 ? formatNote(totalMoyPond) : '-',
    xMoyX + colWidths[5] / 2, y + 4.3, { align: 'center' }
  )
  y += rowH

  // ── Ligne Moyenne / Rang / Retards / Absences ──
  const moyAffichee = moyenneGenerale ?? resultats?.moyenne_generale ?? null

  y += 2.5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.4)
  doc.rect(margin, y, contentW, 9, 'S')

  const seg = [42, 28, 42, contentW - 112]
  let xb = margin
  seg.forEach((w, i) => { xb += w; if (i < seg.length - 1) doc.line(xb, y, xb, y + 9) })

  doc.text('Moyenne', margin + 2, y + 3.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`${moyAffichee !== null ? formatNote(moyAffichee) : '-'} /20`, margin + 20, y + 3.5)

  doc.setFont('helvetica', 'bold');   doc.text('Rang',     margin + 45,  y + 3.5)
  doc.setFont('helvetica', 'normal'); doc.text(resultats?.rang ? formatRang(resultats.rang) : '-', margin + 55, y + 3.5)

  doc.setFont('helvetica', 'bold');   doc.text('Retards',  margin + 74,  y + 3.5)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.retards  ?? 0), margin + 90,  y + 3.5)

  doc.setFont('helvetica', 'bold');   doc.text('Absences', margin + 115, y + 3.5)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.absences ?? 0), margin + 133, y + 3.5)

  y += 12

  // ── CASES À COCHER ───────────────────────────────────────────────────
  const boxW       = (contentW / 2) - 3
  const apprGauche = ['Satisfaisant doit continuer', 'Peut Mieux Faire', 'Insuffisant', 'Risque de Redoubler', "Risque l'exclusion"]
  const apprDroite = ['Félicitations', 'Encouragement', "Tableau d'honneur", 'Avertissement', 'Blâme']

  const moy = moyAffichee !== null ? moyAffichee : 0
  const cocheGauche = moy >= 14 ? 0 : moy >= 10 ? 1 : moy >= 8 ? 2 : moy >= 5 ? 3 : 4
  const cocheDroite = moy >= 16 ? 0 : moy >= 14 ? 1 : moy >= 12 ? 2 : moy >= 8 ? 3 : 4

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...noir)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)

  apprGauche.forEach((label, i) => {
    doc.rect(margin, y + i * 6.5, boxW, 6.5, 'S')
    doc.text(label, margin + 2, y + i * 6.5 + 4.3)
    // Case à cocher
    const cbx = margin + boxW - 8
    const cby = y + i * 6.5 + 1.5
    doc.rect(cbx, cby, 5, 4, 'S')
    if (i === cocheGauche) {
      // Croix × dessinée
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.8)
      doc.line(cbx + 0.8, cby + 0.7, cbx + 4.2, cby + 3.3)
      doc.line(cbx + 4.2, cby + 0.7, cbx + 0.8, cby + 3.3)
      doc.setLineWidth(0.2)
      doc.setDrawColor(150, 150, 150)
    }
  })

  apprDroite.forEach((label, i) => {
    doc.rect(margin + boxW + 6, y + i * 6.5, boxW, 6.5, 'S')
    doc.text(label, margin + boxW + 8, y + i * 6.5 + 4.3)
    const cbx = margin + boxW + 6 + boxW - 8
    const cby = y + i * 6.5 + 1.5
    doc.rect(cbx, cby, 5, 4, 'S')
    if (i === cocheDroite) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.8)
      doc.line(cbx + 0.8, cby + 0.7, cbx + 4.2, cby + 3.3)
      doc.line(cbx + 4.2, cby + 0.7, cbx + 0.8, cby + 3.3)
      doc.setLineWidth(0.2)
      doc.setDrawColor(150, 150, 150)
    }
  })

  y += 34

  // ── OBSERVATIONS + SIGNATURE ─────────────────────────────────────────
  y += 4
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('Observations du conseil des professeurs', margin, y)
  doc.text("Le Chef d'Établissement", margin + boxW + 6, y)

  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.25)
  doc.rect(margin, y + 3, boxW, 20, 'S')
  doc.rect(margin + boxW + 6, y + 3, boxW, 20, 'S')

  // ── PIED DE PAGE ─────────────────────────────────────────────────────
  doc.setFontSize(6.5)
  doc.setTextColor(...grisMoyen)
  doc.setFont('helvetica', 'normal')
  const piedY = offsetY + pageH - 3
  doc.text('Généré par EcolePro — ecolepro.site', pageW / 2, piedY, { align: 'center' })
}

// ══════════════════════════════════════════════════════════════════
// generateSinglePDF : bulletin A5 pour un seul élève
// ══════════════════════════════════════════════════════════════════
export async function generateSinglePDF(params) {
  const { eleve, trimestre } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  dessinerBulletin(doc, params, 0, 148, 210)
  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}

// ══════════════════════════════════════════════════════════════════
// generateBulkPDF : 2 bulletins par page A4 (impression paire)
// ══════════════════════════════════════════════════════════════════
export async function generateBulkPDF(bulletinsList) {
  if (!bulletinsList || bulletinsList.length === 0) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageH   = 297
  const halfH   = pageH / 2   // 148.5mm par bulletin
  const pageW   = 210

  bulletinsList.forEach((params, idx) => {
    const isFirst = idx === 0
    const isEven  = idx % 2 === 0  // 0=haut, 1=bas

    // Nouvelle page pour chaque paire (sauf la toute première)
    if (!isFirst && isEven) {
      doc.addPage()
    }

    const offsetY = isEven ? 0 : halfH

    // Ligne de séparation entre les deux bulletins
    if (!isEven) {
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.setLineDash([2, 2])
      doc.line(10, halfH, pageW - 10, halfH)
      doc.setLineDash([])
    }

    dessinerBulletin(doc, params, offsetY, pageW, halfH)
  })

  doc.save(`bulletins_classe_T${bulletinsList[0]?.trimestre || 1}.pdf`)
}

// ══════════════════════════════════════════════════════════════════
// genererBulletin : alias A4 pleine page (compatibilité existante)
// ══════════════════════════════════════════════════════════════════
export async function genererBulletin(params) {
  const { eleve, trimestre } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  dessinerBulletin(doc, params, 0, 210, 297)
  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}
