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

// ── Fonction interne : dessine un bulletin ────────────────────────────────
function dessinerBulletin(doc, { eleve, classe, ecole, notes, matieres, resultats, trimestre, annee }, offsetY, pageW, halfH) {

  const margin   = 12
  const contentW = pageW - margin * 2

  // ── Colonnes proportionnelles selon contentW ──────────────────
  // A4 contentW=186 : [53,16,16,16,11,16,11,47]
  // A5 contentW=124 : [35,11,11,11, 7,11, 8,30]
  const scale    = contentW / 186
  const colWidths = [
    Math.round(53 * scale),
    Math.round(16 * scale),
    Math.round(16 * scale),
    Math.round(16 * scale),
    Math.round(11 * scale),
    Math.round(16 * scale),
    Math.round(11 * scale),
    0,  // dernière colonne prend le reste
  ]
  // Dernière colonne = ce qui reste exactement
  colWidths[7] = contentW - colWidths.slice(0, 7).reduce((a, b) => a + b, 0)

  const noir      = [0, 0, 0]
  const grisFonce = [60, 60, 60]
  const grisMoyen = [130, 130, 130]
  const grisLight = [240, 240, 240]
  const blanc     = [255, 255, 255]

  const fontSize  = contentW >= 180 ? 8 : 7      // plus petit en A5
  const rowH      = contentW >= 180 ? 6.5 : 5.5  // lignes plus petites en A5

  const semestreLabel =
    trimestre === 1 ? '1er Semestre' :
    trimestre === 2 ? '2ème Semestre' :
                     '3ème Semestre'

  let y = offsetY + 10

  // ── EN-TÊTE ──────────────────────────────────────────────────────────
  const startY = y
  doc.setFontSize(fontSize - 0.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...grisFonce)
  doc.text('RÉPUBLIQUE DU SÉNÉGAL', margin, y)
  y += 4

  doc.setFont('helvetica', 'normal')
  if (ecole.ia)  { doc.text(`IA : ${ecole.ia}`,   margin, y); y += 4 }
  if (ecole.ief) { doc.text(`IEF : ${ecole.ief}`, margin, y); y += 4 }
  doc.setFont('helvetica', 'bold')
  doc.text((ecole.name || 'ÉCOLE').toUpperCase(), margin, y)

  doc.setFont('helvetica', 'normal')
  doc.text(`Année Scolaire : ${annee}`, pageW - margin, startY, { align: 'right' })
  doc.text(semestreLabel, pageW - margin, startY + 5, { align: 'right' })

  y += 5
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageW - margin, y)

  // ── TITRE ────────────────────────────────────────────────────────────
  y += 5
  doc.setFontSize(fontSize + 2)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('BULLETIN DE NOTES', pageW / 2, y, { align: 'center' })
  y += 2
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)

  // ── INFOS ÉLÈVE ──────────────────────────────────────────────────────
  y += 5
  doc.setFontSize(fontSize)
  doc.setTextColor(...noir)

  const dateNaissance = eleve.date_naissance
    ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  const midX = margin + contentW / 2 + 3

  doc.setFont('helvetica', 'bold');   doc.text('Prénoms', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.prenom || '-', margin + 16, y)
  doc.setFont('helvetica', 'bold');   doc.text('Nom', midX, y)
  doc.setFont('helvetica', 'normal'); doc.text((eleve.nom || '-').toUpperCase(), midX + 10, y)

  y += 5
  doc.setFont('helvetica', 'bold');   doc.text('Né(e) le', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(dateNaissance, margin + 15, y)
  doc.setFont('helvetica', 'bold');   doc.text('Classe :', midX, y)
  doc.setFont('helvetica', 'normal'); doc.text(classe.nom || '-', midX + 14, y)

  y += 5
  doc.setFont('helvetica', 'bold');   doc.text('Matricule :', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.unique_code || '-', margin + 18, y)
  doc.setFont('helvetica', 'bold');   doc.text("Nbre d'élèves", midX, y)
  doc.setFont('helvetica', 'normal'); doc.text(String(classe.nb_eleves || '-'), midX + 22, y)
  doc.setFont('helvetica', 'bold');   doc.text('Redoublant', midX + 30, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.redoublant ? 'Oui' : 'Non', midX + 44, y)

  // ── TABLEAU DES NOTES ────────────────────────────────────────────────
  y += 7
  const headers = ['DISCIPLINES', 'DEVOIR\n(moy)', 'COMPO', 'MOY/20', 'COEF', 'MOY X', 'RANG', 'APPRÉCIATION']

  // En-tête tableau
  doc.setFillColor(...noir)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setTextColor(...blanc)
  doc.setFontSize(fontSize - 1.5)
  doc.setFont('helvetica', 'bold')

  let x = margin
  headers.forEach((h, i) => {
    const cx    = x + colWidths[i] / 2
    const lines = h.split('\n')
    if (lines.length > 1) {
      doc.text(lines[0], cx, y + rowH * 0.38, { align: 'center' })
      doc.text(lines[1], cx, y + rowH * 0.75, { align: 'center' })
    } else {
      doc.text(h, cx, y + rowH * 0.62, { align: 'center' })
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
      doc.setFontSize(i === 0 ? fontSize - 0.5 : fontSize - 1)
      if (i === 0) {
        doc.text(val, x + 2, y + rowH * 0.68)
      } else {
        doc.text(val, x + colWidths[i] / 2, y + rowH * 0.68, { align: 'center' })
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
  doc.setFontSize(fontSize - 0.5)
  doc.setTextColor(...noir)
  doc.text('TOTAL', margin + 2, y + rowH * 0.68)

  const xCoef = margin + colWidths.slice(0, 4).reduce((a, b) => a + b, 0)
  doc.text(String(totalCoef), xCoef + colWidths[4] / 2, y + rowH * 0.68, { align: 'center' })
  const xMoyX = xCoef + colWidths[4]
  doc.text(
    totalMoyPond > 0 ? formatNote(totalMoyPond) : '-',
    xMoyX + colWidths[5] / 2, y + rowH * 0.68, { align: 'center' }
  )
  y += rowH

  // ── Ligne Moyenne / Rang / Retards / Absences ──
  const moyAffichee = moyenneGenerale ?? resultats?.moyenne_generale ?? null

  y += 2
  const bandeH = 8
  doc.setFontSize(fontSize - 0.5)
  doc.setFont('helvetica', 'bold')
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.4)
  doc.rect(margin, y, contentW, bandeH, 'S')

  const seg = [contentW * 0.28, contentW * 0.20, contentW * 0.28, contentW * 0.24]
  let xb = margin
  seg.forEach((w, i) => { xb += w; if (i < seg.length - 1) doc.line(xb, y, xb, y + bandeH) })

  const pad = 2
  doc.text('Moyenne', margin + pad, y + bandeH * 0.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`${moyAffichee !== null ? formatNote(moyAffichee) : '-'} /20`, margin + pad + 17, y + bandeH * 0.5)

  doc.setFont('helvetica', 'bold')
  doc.text('Rang', margin + seg[0] + pad, y + bandeH * 0.5)
  doc.setFont('helvetica', 'normal')
  doc.text(resultats?.rang ? formatRang(resultats.rang) : '-', margin + seg[0] + pad + 12, y + bandeH * 0.5)

  doc.setFont('helvetica', 'bold')
  doc.text('Retards', margin + seg[0] + seg[1] + pad, y + bandeH * 0.5)
  doc.setFont('helvetica', 'normal')
  doc.text(String(resultats?.retards ?? 0), margin + seg[0] + seg[1] + pad + 16, y + bandeH * 0.5)

  doc.setFont('helvetica', 'bold')
  doc.text('Absences', margin + seg[0] + seg[1] + seg[2] + pad, y + bandeH * 0.5)
  doc.setFont('helvetica', 'normal')
  doc.text(String(resultats?.absences ?? 0), margin + seg[0] + seg[1] + seg[2] + pad + 18, y + bandeH * 0.5)

  y += bandeH + 8

  // ── CASES À COCHER ───────────────────────────────────────────────────
  const boxW       = (contentW / 2) - 3
  const lineH      = 6
  const apprGauche = ['Satisfaisant doit continuer', 'Peut Mieux Faire', 'Insuffisant', 'Risque de Redoubler', "Risque l'exclusion"]
  const apprDroite = ['Félicitations', 'Encouragement', "Tableau d'honneur", 'Avertissement', 'Blâme']

  const moy = moyAffichee !== null ? moyAffichee : 0
  const cocheGauche = moy >= 14 ? 0 : moy >= 10 ? 1 : moy >= 8 ? 2 : moy >= 5 ? 3 : 4
  const cocheDroite = moy >= 16 ? 0 : moy >= 14 ? 1 : moy >= 12 ? 2 : moy >= 8 ? 3 : 4

  doc.setFontSize(fontSize - 1)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...noir)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)

  const cbSize = 4  // taille de la case à cocher

  apprGauche.forEach((label, i) => {
    doc.rect(margin, y + i * lineH, boxW, lineH, 'S')
    doc.text(label, margin + 2, y + i * lineH + lineH * 0.68)
    const cbx = margin + boxW - cbSize - 1.5
    const cby = y + i * lineH + (lineH - cbSize) / 2
    doc.rect(cbx, cby, cbSize, cbSize, 'S')
    if (i === cocheGauche) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.8)
      doc.line(cbx + 0.6, cby + cbSize * 0.5, cbx + cbSize * 0.4, cby + cbSize * 0.85)
      doc.line(cbx + cbSize * 0.4, cby + cbSize * 0.85, cbx + cbSize - 0.5, cby + cbSize * 0.15)
      doc.setLineWidth(0.2)
      doc.setDrawColor(150, 150, 150)
    }
  })

  apprDroite.forEach((label, i) => {
    doc.rect(margin + boxW + 6, y + i * lineH, boxW, lineH, 'S')
    doc.text(label, margin + boxW + 8, y + i * lineH + lineH * 0.68)
    const cbx = margin + boxW + 6 + boxW - cbSize - 1.5
    const cby = y + i * lineH + (lineH - cbSize) / 2
    doc.rect(cbx, cby, cbSize, cbSize, 'S')
    if (i === cocheDroite) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.8)
      doc.line(cbx + 0.6, cby + cbSize * 0.5, cbx + cbSize * 0.4, cby + cbSize * 0.85)
      doc.line(cbx + cbSize * 0.4, cby + cbSize * 0.85, cbx + cbSize - 0.5, cby + cbSize * 0.15)
      doc.setLineWidth(0.2)
      doc.setDrawColor(150, 150, 150)
    }
  })

  y += apprGauche.length * lineH + 5

  // ── OBSERVATIONS + SIGNATURE ─────────────────────────────────────────
  doc.setFontSize(fontSize - 0.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.text('Observations du conseil des professeurs', margin, y)
  doc.text("Le Chef d'Établissement", margin + boxW + 6, y)

  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.25)
  const obsH = contentW >= 180 ? 22 : 16
  doc.rect(margin, y + 3, boxW, obsH, 'S')
  doc.rect(margin + boxW + 6, y + 3, boxW, obsH, 'S')

  // ── PIED DE PAGE ─────────────────────────────────────────────────────
  doc.setFontSize(6)
  doc.setTextColor(...grisMoyen)
  doc.setFont('helvetica', 'normal')
  doc.text('Généré par EcolePro — ecolepro.site', pageW / 2, offsetY + halfH - 3, { align: 'center' })
}

// ══════════════════════════════════════════════════════════════════
// generateSinglePDF : A5 portrait pour 1 élève
// ══════════════════════════════════════════════════════════════════
export async function generateSinglePDF(params) {
  const { eleve, trimestre } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  dessinerBulletin(doc, params, 0, 148, 210)
  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}

// ══════════════════════════════════════════════════════════════════
// generateBulkPDF : A4 — 2 bulletins par page
// ══════════════════════════════════════════════════════════════════
export async function generateBulkPDF(bulletinsList) {
  if (!bulletinsList || bulletinsList.length === 0) return

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const halfH = 148.5  // demi-page A4 = A5

  bulletinsList.forEach((params, idx) => {
    const isEven = idx % 2 === 0

    if (idx > 0 && isEven) doc.addPage()

    const offsetY = isEven ? 0 : halfH

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
// genererBulletin : A4 pleine page (compatibilité existante)
// ══════════════════════════════════════════════════════════════════
export async function genererBulletin(params) {
  const { eleve, trimestre } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  dessinerBulletin(doc, params, 0, 210, 297)
  doc.save(`bulletin_${eleve.nom}_${eleve.prenom}_T${trimestre}.pdf`)
}
