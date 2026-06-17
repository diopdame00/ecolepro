import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Select, EmptyState } from '../../components/ui'
import { genererBulletin } from '../../utils/bulletin'
import { calculerMoyenneGenerale, calculerRangs } from '../../utils/calculs'
import { Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

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

function anneeEnCours() {
  const now = new Date()
  const y   = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}/${y + 1}`
}

/**
 * Calcule les rangs par matière pour tous les élèves de la classe.
 * Retourne : { [subject_id]: { [student_id]: rang } }
 */
function calculerRangsParMatiere(eleves) {
  // Collecter tous les subject_ids présents dans la classe
  const subjectIds = new Set()
  eleves.forEach(e => {
    (e.grades || []).forEach(g => {
      if (g.subjects?.id) subjectIds.add(g.subjects.id)
    })
  })

  const rangsParMatiere = {}

  subjectIds.forEach(subjectId => {
    // Pour chaque matière, collecter les moyennes de chaque élève
    const moyennesEleves = eleves
      .map(e => {
        const note = (e.grades || []).find(g => g.subjects?.id === subjectId)
        if (!note) return null
        const moy = calculerMoy20(note)
        return { studentId: e.id, moyenne: moy }
      })
      .filter(x => x !== null && x.moyenne !== null)

    // Trier par moyenne décroissante
    moyennesEleves.sort((a, b) => b.moyenne - a.moyenne)

    // Attribuer les rangs (gestion des ex-aequo)
    const rangs = {}
    let rang = 1
    moyennesEleves.forEach((item, idx) => {
      if (idx > 0 && item.moyenne === moyennesEleves[idx - 1].moyenne) {
        // Ex-aequo : même rang que le précédent
        rangs[item.studentId] = rangs[moyennesEleves[idx - 1].studentId]
      } else {
        rangs[item.studentId] = rang
      }
      rang++
    })

    rangsParMatiere[subjectId] = rangs
  })

  return rangsParMatiere
}

export default function BulletinsPage() {
  const { schoolId, school } = useAuth()

  const [classes, setClasses]                     = useState([])
  const [eleves, setEleves]                       = useState([])
  const [selectedClasse, setSelectedClasse]       = useState('')
  const [selectedTrimestre, setSelectedTrimestre] = useState('1')
  const [loading, setLoading]                     = useState(false)
  const [generating, setGenerating]               = useState(null)
  const [anneeScolaire, setAnneeScolaire]         = useState(anneeEnCours())

  // Rangs par matière calculés sur toute la classe
  const [rangsMatiere, setRangsMatiere] = useState({})

  useEffect(() => { if (schoolId) fetchClasses() }, [schoolId])

  useEffect(() => {
    if (selectedClasse) {
      const classe = classes.find(c => c.id === selectedClasse)
      setAnneeScolaire(classe?.annee_scolaire || anneeEnCours())
      fetchEleves()
    }
  }, [selectedClasse, selectedTrimestre])

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes').select('*').eq('school_id', schoolId).order('nom')
    setClasses(data || [])
  }

  async function fetchEleves() {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select(`
        *,
        grades!inner(
          id,
          matiere_id,
          devoir_1,
          devoir_2,
          devoir_3,
          composition,
          moyenne_matiere,
          trimestre,
          statut,
          subjects(id, nom, coefficient)
        )
      `)
      .eq('classe_id', selectedClasse)
      .eq('grades.trimestre', selectedTrimestre)
      .eq('grades.statut', 'valide')

    if (error) console.error('fetchEleves:', error)

    const liste = data || []
    setEleves(liste)

    // ── Calculer les rangs par matière dès le chargement ──
    const rangs = calculerRangsParMatiere(liste)
    setRangsMatiere(rangs)

    setLoading(false)
  }

  function moyenneEleve(eleve) {
    return calculerMoyenneGenerale(
      (eleve.grades || []).map(n => ({
        moyenne:     calculerMoy20(n),
        coefficient: n.subjects?.coefficient ?? 1,
      }))
    )
  }

  async function genererUnBulletin(eleve) {
    setGenerating(eleve.id)
    try {
      const notes = eleve.grades || []

      // Matières dédupliquées par subject_id
      const matiereMap = {}
      notes.forEach(n => {
        if (n.subjects) {
          matiereMap[n.subjects.id] = {
            id:          n.subjects.id,
            nom:         n.subjects.nom,
            coefficient: n.subjects.coefficient ?? 1,
          }
        }
      })
      const matieres = Object.values(matiereMap)

      // Moyenne générale
      const moyGenData = notes.map(n => ({
        moyenne:     calculerMoy20(n),
        coefficient: n.subjects?.coefficient ?? 1,
      }))
      const moyGen = calculerMoyenneGenerale(moyGenData)

      // Rang général dans la classe
      const rangsData = eleves.map(e => ({
        id:      e.id,
        moyenne: calculerMoyenneGenerale(
          (e.grades || []).map(n => ({
            moyenne:     calculerMoy20(n),
            coefficient: n.subjects?.coefficient ?? 1,
          }))
        ),
      }))
      const rangsGeneraux = calculerRangs(rangsData)

      // ── Injecter le rang par matière dans chaque note ──
      // On enrichit les notes avec le rang calculé localement
      const notesAvecRang = notes.map(n => ({
        ...n,
        rang_matiere: n.subjects?.id
          ? (rangsMatiere[n.subjects.id]?.[eleve.id] ?? null)
          : null,
      }))

      const classe = classes.find(c => c.id === selectedClasse)
        || (await supabase.from('classes').select('*').eq('id', selectedClasse).single()).data

      await genererBulletin({
        eleve,
        classe:    { ...classe, nb_eleves: eleves.length },
        ecole:     school,
        notes:     notesAvecRang,   // notes enrichies avec rang_matiere
        matieres,
        resultats: {
          moyenne_generale: moyGen,
          rang:             rangsGeneraux[eleve.id],
          retards:          0,
          absences:         0,
        },
        trimestre: Number(selectedTrimestre),
        annee:     anneeScolaire,
      })

      toast.success(`Bulletin de ${eleve.prenom} ${eleve.nom} généré !`)
    } catch (err) {
      console.error(err)
      toast.error('Erreur : ' + err.message)
    } finally {
      setGenerating(null)
    }
  }

  async function genererTousLesBulletins() {
    if (eleves.length === 0) return
    toast('Génération en cours…', { icon: '⏳' })
    for (const eleve of eleves) {
      await genererUnBulletin(eleve)
    }
    toast.success('Tous les bulletins ont été générés !')
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Bulletins PDF</h1>
            <p className="text-gray-500 text-sm">Générez et téléchargez les bulletins</p>
          </div>
          {eleves.length > 0 && (
            <Button onClick={genererTousLesBulletins}>
              <Download size={16} />
              Tout télécharger ({eleves.length})
            </Button>
          )}
        </div>

        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Classe" value={selectedClasse}
              onChange={e => setSelectedClasse(e.target.value)}>
              <option value="">Choisir une classe</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nom} {c.annee_scolaire ? `— ${c.annee_scolaire}` : ''}
                </option>
              ))}
            </Select>
            <Select label="Trimestre / Semestre" value={selectedTrimestre}
              onChange={e => setSelectedTrimestre(e.target.value)}>
              <option value="1">1er Semestre</option>
              <option value="2">2ème Semestre</option>
              <option value="3">3ème Semestre</option>
            </Select>
          </div>
          {selectedClasse && (
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              Année scolaire détectée : <strong className="text-gray-600 ml-1">{anneeScolaire}</strong>
            </p>
          )}
        </Card>

        {selectedClasse && (
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                {loading ? '…' : `${eleves.length} élève(s) avec notes validées`}
              </h2>
              {!loading && eleves.length > 0 && (
                <span className="text-xs text-gray-400">
                  {selectedTrimestre === '1' ? '1er' : selectedTrimestre === '2' ? '2ème' : '3ème'} Semestre · {anneeScolaire}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : eleves.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucun bulletin disponible"
                description="Les notes de cette classe doivent être validées avant de générer les bulletins"
              />
            ) : (
              <div className="divide-y divide-gray-50">
                {eleves
                  .slice()
                  .sort((a, b) => (moyenneEleve(b) ?? -1) - (moyenneEleve(a) ?? -1))
                  .map((eleve, idx) => {
                    const moy = moyenneEleve(eleve)
                    return (
                      <div key={eleve.id}
                        className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50/50">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                            {idx + 1}
                          </div>
                          <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center
                                          text-sm font-bold text-primary-700 shrink-0">
                            {eleve.prenom?.[0]}{eleve.nom?.[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">
                              {eleve.prenom} {eleve.nom}
                            </p>
                            <p className="text-xs text-gray-400">
                              {eleve.grades?.length || 0} matière(s)
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {moy !== null && (
                            <span className={`font-bold text-sm ${moy >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                              {moy.toFixed(2)}/20
                            </span>
                          )}
                          <Button size="sm" variant="secondary"
                            loading={generating === eleve.id}
                            onClick={() => genererUnBulletin(eleve)}>
                            <Download size={14} /> PDF
                          </Button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
