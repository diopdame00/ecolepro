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

/**
 * Formate un rang en ordinal court : 1 → "1er", 2 → "2ème", etc.
 */
function formatRang(rang) {
  if (rang === null || rang === undefined) return '-'
  return rang === 1 ? '1er' : `${rang}ème`
}

export async function genererBulletin({ eleve, classe, ecole, notes, matieres, resultats, trimestre, annee }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW    = 210
  const margin   = 15
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

  let y = 14

  // ── EN-TÊTE ────────────────────────────────────────────────────────────
  const startY = y
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...grisFonce)
  doc.text('RÉPUBLIQUE DU SÉNÉGAL', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  if (ecole.ia)  { doc.text(`IA : ${ecole.ia}`,   margin, y); y += 5 }
  if (ecole.ief) { doc.text(`IEF : ${ecole.ief}`, margin, y); y += 5 }
  doc.setFont('helvetica', 'bold')
  doc.text((ecole.name || 'ÉCOLE').toUpperCase(), margin, y)

  doc.setFont('helvetica', 'normal')
  doc.text(`Année Scolaire : ${annee}`, pageW - margin, startY, { align: 'right' })
  doc.text(semestreLabel, pageW - margin, startY + 6, { align: 'right' })

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

  doc.setFont('helvetica', 'bold');   doc.text('Prénoms', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.prenom || '-', margin + 19, y)
  doc.setFont('helvetica', 'bold');   doc.text('Nom', 112, y)
  doc.setFont('helvetica', 'normal'); doc.text((eleve.nom || '-').toUpperCase(), 122, y)

  y += 6
  doc.setFont('helvetica', 'bold');   doc.text('Né(e) le', margin, y)
  // Formater la date en DD/MM/YYYY (format sénégalais)
  const dateNaissance = eleve.date_naissance
    ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'
  doc.setFont('helvetica', 'normal'); doc.text(dateNaissance, margin + 16, y)
  doc.setFont('helvetica', 'bold');   doc.text('Classe :', 112, y)
  doc.setFont('helvetica', 'normal'); doc.text(classe.nom || '-', 124, y)

  y += 6
  doc.setFont('helvetica', 'bold');   doc.text('Matricule :', margin, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.unique_code || '-', margin + 19, y)
  doc.setFont('helvetica', 'bold');   doc.text("Nbre d'élèves", 112, y)
  doc.setFont('helvetica', 'normal'); doc.text(String(classe.nb_eleves || '-'), 136, y)
  doc.setFont('helvetica', 'bold');   doc.text('Classe Redoublée', 152, y)
  doc.setFont('helvetica', 'normal'); doc.text(eleve.redoublant ? '1' : '0', 178, y)

  // ── TABLEAU DES NOTES ──────────────────────────────────────────────────
  y += 10
  const colWidths = [45, 18, 18, 18, 12, 18, 12, 39]
  const headers   = ['DISCIPLINES', 'DEVOIR\n(moy)', 'COMPO', 'MOY/20', 'COEF', 'MOY X', 'RANG', 'APPRÉCIATION']
  const rowH = 7

  // En-tête tableau
  doc.setFillColor(...noir)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setTextColor(...blanc)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  let x = margin
  headers.forEach((h, i) => {
    const cx    = x + colWidths[i] / 2
    const lines = h.split('\n')
    if (lines.length > 1) {
      doc.text(lines[0], cx, y + 3,   { align: 'center' })
      doc.text(lines[1], cx, y + 5.8, { align: 'center' })
    } else {
      doc.text(h, cx, y + 4.5, { align: 'center' })
    }
    x += colWidths[i]
  })

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

  let totalCoef    = 0
  let totalMoyPond = 0  // Σ(MOY/20 × Coef)

  matieres.forEach((matiere, idx) => {
    // Trouver la note correspondante (enrichie avec rang_matiere)
    // Chercher par matiere_id en priorité (id dans matieres = matiere_id)
    const note = notes.find(n => n.matiere_id === matiere.id) ||
                 notes.find(n => n.subjects?.id === matiere.id) || {}

    const coef = Number(matiere.coefficient ?? note.subjects?.coefficient ?? 1)
    const bg   = idx % 2 === 0 ? blanc : grisLight

    doc.setFillColor(...bg)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
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

    // ── RANG MATIÈRE : depuis rang_matiere injecté par BulletinsPage ──
    const rangMatiere = note.rang_matiere ?? null

    const row = [
      matiere.nom,
      formatNote(mDev),
      formatNote(note.composition),
      formatNote(moy20),
      String(coef),
      moyX !== null ? formatNote(moyX) : '-',
      formatRang(rangMatiere),           // ← rang calculé par matière
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
  // COEF  → totalCoef     = Σ(Coef)
  // MOY X → totalMoyPond  = Σ(MOY/20 × Coef)
  // Moyenne générale = totalMoyPond / totalCoef (affichée dans la ligne du bas)
  const moyenneGenerale = totalCoef > 0 ? totalMoyPond / totalCoef : null

  doc.setFillColor(...grisLight)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, contentW, rowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...noir)
  doc.text('TOTAL', margin + 3, y + 4.8)

  const xCoef = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]
  doc.text(String(totalCoef), xCoef + colWidths[4] / 2, y + 4.8, { align: 'center' })

  const xMoyX = xCoef + colWidths[4]
  doc.text(
    totalMoyPond > 0 ? formatNote(totalMoyPond) : '-',
    xMoyX + colWidths[5] / 2, y + 4.8, { align: 'center' }
  )

  y += rowH

  // ── Ligne Moyenne / Rang / Retards / Absences ──
  const moyAffichee = moyenneGenerale ?? resultats?.moyenne_generale ?? null

  y += 3
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...noir)
  doc.setDrawColor(...noir)
  doc.setLineWidth(0.5)
  doc.rect(margin, y, contentW, 10, 'S')

  const seg = [45, 30, 45, 60]
  let xb = margin
  seg.forEach((w, i) => { xb += w; if (i < seg.length - 1) doc.line(xb, y, xb, y + 10) })

  doc.text('Moyenne', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(`${moyAffichee !== null ? formatNote(moyAffichee) : '-'} /20`, margin + 22, y + 4)

  doc.setFont('helvetica', 'bold');   doc.text('Rang',     margin + 48,  y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(
    resultats?.rang ? formatRang(resultats.rang) : '-',
    margin + 60, y + 4
  )

  doc.setFont('helvetica', 'bold');   doc.text('Retards',  margin + 80,  y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.retards  ?? 0), margin + 98,  y + 4)

  doc.setFont('helvetica', 'bold');   doc.text('Absences', margin + 125, y + 4)
  doc.setFont('helvetica', 'normal'); doc.text(String(resultats?.absences ?? 0), margin + 148, y + 4)

  y += 14

  // ── APPRÉCIATIONS ──────────────────────────────────────────────────────
  const boxW       = (contentW / 2) - 3
  const apprGauche = ['Satisfaisant doit continuer', 'Peut Mieux Faire', 'Insuffisant', 'Risque de Redoubler', "Risque l'exclusion"]
  const apprDroite = ['Félicitations', 'Encouragement', "Tableau d'honneur", 'Avertissement', 'Blâme']

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...noir)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)

  // Déterminer la case à cocher selon la moyenne générale
  const moy = moyAffichee !== null ? moyAffichee : 0

  // Gauche : comportement/résultat
  // 0=Satisfaisant, 1=Peut Mieux Faire, 2=Insuffisant, 3=Risque Redoubler, 4=Risque exclusion
  const cocheGauche = moy >= 14 ? 0
                    : moy >= 10 ? 1
                    : moy >= 8  ? 2
                    : moy >= 5  ? 3
                    : 4

  // Droite : mention
  // 0=Félicitations, 1=Encouragement, 2=Tableau d'honneur, 3=Avertissement, 4=Blâme
  const cocheDroite = moy >= 16 ? 0
                    : moy >= 14 ? 1
                    : moy >= 12 ? 2
                    : moy >= 8  ? 3
                    : 4

  apprGauche.forEach((label, i) => {
    doc.rect(margin, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + 2, y + i * 7 + 4.5)
    doc.rect(margin + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
    // Cocher la case si c'est la bonne ligne (coche dessinée car unicode non supporté)
    if (i === cocheGauche) {
      const cx = margin + boxW - 5.5
      const cy = y + i * 7 + 3.5
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.7)
      doc.line(cx - 1.5, cy + 1, cx, cy + 2.5)
      doc.line(cx, cy + 2.5, cx + 2.5, cy - 0.5)
      doc.setLineWidth(0.2)
    }
  })
  apprDroite.forEach((label, i) => {
    doc.rect(margin + boxW + 6, y + i * 7, boxW, 7, 'S')
    doc.text(label, margin + boxW + 8, y + i * 7 + 4.5)
    doc.rect(margin + boxW + 6 + boxW - 8, y + i * 7 + 1.5, 5, 4, 'S')
    // Cocher la case si c'est la bonne ligne (coche dessinée)
    if (i === cocheDroite) {
      const cx = margin + boxW + 6 + boxW - 5.5
      const cy = y + i * 7 + 3.5
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.7)
      doc.line(cx - 1.5, cy + 1, cx, cy + 2.5)
      doc.line(cx, cy + 2.5, cx + 2.5, cy - 0.5)
      doc.setLineWidth(0.2)
    }
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
