import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Select, EmptyState } from '../../components/ui'
import { genererBulletin } from '../../utils/bulletin'
import { calculerMoyenneGenerale, calculerRangs } from '../../utils/calculs'
import { Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

// Vrais noms de colonnes en base : devoir_1, devoir_2, devoir_3, composition
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

export default function BulletinsPage() {
  const { schoolId, school } = useAuth()
  const [classes, setClasses]                     = useState([])
  const [eleves, setEleves]                       = useState([])
  const [selectedClasse, setSelectedClasse]       = useState('')
  const [selectedTrimestre, setSelectedTrimestre] = useState('1')
  const [loading, setLoading]                     = useState(false)
  const [generating, setGenerating]               = useState(null)

  useEffect(() => { if (schoolId) fetchClasses() }, [schoolId])
  useEffect(() => { if (selectedClasse) fetchEleves() }, [selectedClasse, selectedTrimestre])

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
          subjects:matiere_id(nom, coefficient)
        )
      `)
      .eq('classe_id', selectedClasse)
      .eq('grades.trimestre', selectedTrimestre)
      .eq('grades.statut', 'valide')

    if (error) console.error('fetchEleves:', error)
    setEleves(data || [])
    setLoading(false)
  }

  async function genererUnBulletin(eleve) {
    setGenerating(eleve.id)
    try {
      const notes = eleve.grades || []

      // Récupérer les coefficients réels depuis class_subjects
      const subjectIds = notes.map(n => n.matiere_id).filter(Boolean)
      let coefMap = {}
      if (subjectIds.length > 0) {
        const { data: csData } = await supabase
          .from('class_subjects')
          .select('subject_id, coefficient')
          .eq('class_id', selectedClasse)
          .in('subject_id', subjectIds)
        csData?.forEach(cs => { coefMap[cs.subject_id] = cs.coefficient })
      }

      // Enrichir matieres avec le vrai coefficient par classe
      const matieres = notes.map(n => ({
        ...n.subjects,
        id:          n.matiere_id,
        coefficient: coefMap[n.matiere_id] ?? n.subjects?.coefficient ?? 1,
      }))

      // Calculer le rang par matière pour chaque élève
      // Pour chaque matière, classer tous les élèves par moy20 décroissant
      const rangsParMatiere = {}
      notes.forEach(note => {
        const mid = note.matiere_id
        // Collecter toutes les moy20 de cette matière dans la classe
        const tousLesMoys = eleves
          .flatMap(e => (e.grades || []).filter(g => g.matiere_id === mid))
          .map(g => {
            const devs = [g.devoir_1, g.devoir_2, g.devoir_3]
              .filter(v => v !== null && v !== undefined && v !== '').map(Number)
            const mDev = devs.length > 0 ? devs.reduce((a,b) => a+b,0)/devs.length : null
            const comp = (g.composition !== null && g.composition !== undefined && g.composition !== '')
                         ? Number(g.composition) : null
            if (mDev === null && comp === null) return { student_id: g.student_id, moy: null }
            if (mDev === null) return { student_id: g.student_id, moy: comp }
            if (comp === null) return { student_id: g.student_id, moy: mDev }
            return { student_id: g.student_id, moy: (mDev + comp) / 2 }
          })
          .filter(x => x.moy !== null)
          .sort((a, b) => b.moy - a.moy)

        // Rang de cet élève pour cette matière
        const idx = tousLesMoys.findIndex(x => x.student_id === eleve.id)
        rangsParMatiere[mid] = idx >= 0 ? idx + 1 : null
      })

      // Injecter rang_matiere dans chaque note
      const notesAvecRang = notes.map(n => ({
        ...n,
        rang_matiere: rangsParMatiere[n.matiere_id] ?? null,
      }))

      const moyGenData = notes.map(n => ({
        moyenne:     calculerMoy20(n),
        coefficient: n.subjects?.coefficient || 1,
      }))
      const moyGen = calculerMoyenneGenerale(moyGenData)

      const rangsData = eleves.map(e => ({
        id:      e.id,
        moyenne: calculerMoyenneGenerale(
          (e.grades || []).map(n => ({
            moyenne:     calculerMoy20(n),
            coefficient: n.subjects?.coefficient || 1,
          }))
        ),
      }))
      const rangs = calculerRangs(rangsData)

      const { data: classe } = await supabase
        .from('classes').select('*').eq('id', selectedClasse).single()

      await genererBulletin({
        eleve,
        classe:    { ...classe, nb_eleves: eleves.length },
        ecole:     school,
        notes:     notesAvecRang,
        matieres,
        resultats: {
          moyenne_generale: moyGen,
          rang:             rangs[eleve.id],
          retards:          0,
          absences:         0,
        },
        trimestre: Number(selectedTrimestre),
        annee:     '2024/2025',
      })

      toast.success('Bulletin généré !')
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setGenerating(null)
    }
  }

  async function genererTousLesBulletins() {
    for (const eleve of eleves) {
      await genererUnBulletin(eleve)
    }
  }

  function moyenneEleve(eleve) {
    return calculerMoyenneGenerale(
      (eleve.grades || []).map(n => ({
        moyenne:     calculerMoy20(n),
        coefficient: n.subjects?.coefficient || 1,
      }))
    )
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
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </Select>
            <Select label="Trimestre" value={selectedTrimestre}
              onChange={e => setSelectedTrimestre(e.target.value)}>
              <option value="1">1er Trimestre</option>
              <option value="2">2ème Trimestre</option>
              <option value="3">3ème Trimestre</option>
            </Select>
          </div>
        </Card>

        {selectedClasse && (
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">
                {eleves.length} élève(s) avec notes validées
              </h2>
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
                {eleves.map(eleve => {
                  const moy = moyenneEleve(eleve)
                  return (
                    <div key={eleve.id}
                      className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50/50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center
                                        text-sm font-bold text-primary-700">
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
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={generating === eleve.id}
                          onClick={() => genererUnBulletin(eleve)}
                        >
                          <Download size={14} />
                          PDF
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