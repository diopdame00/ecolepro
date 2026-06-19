import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Badge, EmptyState } from '../../components/ui'
import { CheckCircle, XCircle, Clock, Filter } from 'lucide-react'
import { formatNote } from '../../utils/calculs'
import toast from 'react-hot-toast'

const COLONNES = [
  { field: 'devoir_1',    statutField: 'devoir_1_statut',    label: 'Devoir 1' },
  { field: 'devoir_2',    statutField: 'devoir_2_statut',    label: 'Devoir 2' },
  { field: 'devoir_3',    statutField: 'devoir_3_statut',    label: 'Devoir 3' },
  { field: 'composition', statutField: 'composition_statut', label: 'Composition' },
]

export default function NotesValidation() {
  const { schoolId } = useAuth()
  const [allGrades, setAllGrades] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('soumis')

  useEffect(() => { if (schoolId) fetchGrades() }, [schoolId])

  async function fetchGrades() {
    setLoading(true)
    const { data, error } = await supabase
      .from('grades')
      .select('*, students(prenom, nom, classes(nom)), subjects(nom, coefficient)')
      .eq('school_id', schoolId)
      .order('updated_at', { ascending: false })
    if (error) {
      console.error('fetchGrades error:', error)
      toast.error('Erreur de chargement : ' + error.message)
    }
    setAllGrades(data || [])
    setLoading(false)
  }

  // Construit une ligne par (note × colonne soumise/validée/brouillon selon le filtre)
  const entries = []
  allGrades.forEach(g => {
    COLONNES.forEach(col => {
      const valeur = g[col.field]
      const statutCol = g[col.statutField] || 'brouillon'
      if (valeur === null || valeur === undefined) return // rien saisi, on ignore
      if (statutCol !== filter) return
      entries.push({
        gradeId:      g.id,
        colField:     col.field,
        statutField:  col.statutField,
        colLabel:     col.label,
        valeur,
        eleve:        g.students,
        matiere:      g.subjects,
        trimestre:    g.trimestre,
      })
    })
  })

  async function validerColonne(gradeId, statutField) {
    const { error } = await supabase.from('grades').update({ [statutField]: 'valide' }).eq('id', gradeId)
    if (error) { toast.error('Erreur'); return }
    toast.success('Note validée !')
    fetchGrades()
  }

  async function rejeterColonne(gradeId, statutField) {
    const { error } = await supabase.from('grades').update({ [statutField]: 'brouillon' }).eq('id', gradeId)
    if (error) { toast.error('Erreur'); return }
    toast.success('Renvoyé au professeur')
    fetchGrades()
  }

  async function validerTout() {
    // Grouper par gradeId pour faire un seul update par ligne avec tous les statuts concernés
    const updatesParGrade = {}
    entries.forEach(e => {
      if (!updatesParGrade[e.gradeId]) updatesParGrade[e.gradeId] = {}
      updatesParGrade[e.gradeId][e.statutField] = 'valide'
    })
    const promises = Object.entries(updatesParGrade).map(([id, fields]) =>
      supabase.from('grades').update(fields).eq('id', id)
    )
    const results = await Promise.all(promises)
    if (results.some(r => r.error)) { toast.error('Erreur lors de la validation'); return }
    toast.success(`${entries.length} note(s) validée(s) !`)
    fetchGrades()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Validation des notes</h1>
            <p className="text-gray-500 text-sm">{entries.length} entrée(s)</p>
          </div>
          {filter === 'soumis' && entries.length > 0 && (
            <Button onClick={validerTout}>
              <CheckCircle size={16} />
              Tout valider
            </Button>
          )}
        </div>

        {/* Filtres */}
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 shadow-sm w-fit gap-1">
          {[
            { key: 'soumis', label: 'En attente', color: 'text-yellow-600' },
            { key: 'valide', label: 'Validées', color: 'text-green-600' },
            { key: 'brouillon', label: 'Brouillons', color: 'text-gray-500' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
                ${filter === key ? 'bg-primary-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Aucune note dans cette catégorie"
              description="Les notes soumises par les professeurs apparaîtront ici"
            />
          ) : (
            <>
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-6 gap-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
                <span className="col-span-2">Élève</span>
                <span>Matière</span>
                <span>Devoir</span>
                <span>Note</span>
                <span>Actions</span>
              </div>
              <div className="divide-y divide-gray-50">
                {entries.map((e, i) => (
                  <div key={`${e.gradeId}-${e.colField}-${i}`} className="px-6 py-3 grid grid-cols-6 gap-3 items-center hover:bg-gray-50/50 text-sm">
                    <div className="col-span-2 font-medium text-gray-900">
                      {e.eleve?.prenom} {e.eleve?.nom}
                      <div className="text-xs text-gray-400 font-normal">{e.matiere?.nom}</div>
                    </div>
                    <span className="text-gray-600">{e.matiere?.nom}</span>
                    <span>
                      <Badge color="blue">{e.colLabel} · T{e.trimestre}</Badge>
                    </span>
                    <span className={`font-bold ${e.valeur >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatNote(e.valeur)}
                    </span>
                    <div className="flex gap-2">
                      {filter === 'soumis' && (
                        <>
                          <button onClick={() => validerColonne(e.gradeId, e.statutField)} className="p-1.5 hover:bg-green-50 rounded-lg text-green-500 transition-colors" title="Valider">
                            <CheckCircle size={16} />
                          </button>
                          <button onClick={() => rejeterColonne(e.gradeId, e.statutField)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors" title="Renvoyer">
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                      {filter !== 'soumis' && (
                        <Badge color={filter === 'valide' ? 'green' : 'gray'}>
                          {filter === 'valide' ? 'Validé' : 'Brouillon'}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
