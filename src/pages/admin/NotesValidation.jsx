import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Badge, EmptyState } from '../../components/ui'
import { CheckCircle, XCircle, Clock, Filter } from 'lucide-react'
import { formatNote } from '../../utils/calculs'
import toast from 'react-hot-toast'

export default function NotesValidation() {
  const { schoolId } = useAuth()
  const { yearId, annee } = useAnneeActive()
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]  = useState('soumis')

  useEffect(() => {
    if (schoolId && yearId) fetchGrades()
  }, [schoolId, yearId, filter])

  async function fetchGrades() {
    setLoading(true)
    const { data, error } = await supabase
      .from('grades')
      .select(`
        id, statut, trimestre,
        devoir_1, devoir_2, devoir_3, composition, moyenne_matiere,
        enrollments(
          students(prenom, nom),
          classes(nom)
        ),
        subjects(nom, coefficient)
      `)
      .eq('school_id', schoolId)
      .eq('year_id', yearId)
      .eq('statut', filter)
      .order('updated_at', { ascending: false })

    if (error) toast.error('Erreur chargement : ' + error.message)
    setGrades(data || [])
    setLoading(false)
  }

  async function validerNote(gradeId) {
    const { error } = await supabase
      .from('grades')
      .update({ statut: 'valide' })
      .eq('id', gradeId)
    if (error) { toast.error('Erreur'); return }

    // Calculer rangs après validation
    const grade = grades.find(g => g.id === gradeId)
    if (grade) {
      await supabase.rpc('calculer_rangs_classe', {
        p_class_id:  grade.enrollments?.classes?.id || grade.class_id,
        p_trimestre: grade.trimestre,
      })
    }

    toast.success('Note validée !')
    fetchGrades()
  }

  async function rejeterNote(gradeId) {
    const { error } = await supabase
      .from('grades')
      .update({ statut: 'brouillon' })
      .eq('id', gradeId)
    if (error) { toast.error('Erreur'); return }
    toast.success('Renvoyé au professeur')
    fetchGrades()
  }

  async function validerTout() {
    if (!grades.length) return
    const ids = grades.map(g => g.id)
    const { error } = await supabase
      .from('grades')
      .update({ statut: 'valide' })
      .in('id', ids)
    if (error) { toast.error('Erreur'); return }
    toast.success(`${ids.length} note(s) validée(s) !`)
    fetchGrades()
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Validation des notes</h1>
            <p className="text-gray-500 text-sm">{annee}</p>
          </div>
          {filter === 'soumis' && grades.length > 0 && (
            <Button onClick={validerTout}>
              <CheckCircle size={16} /> Tout valider ({grades.length})
            </Button>
          )}
        </div>

        {/* Filtre */}
        <Card className="p-3">
          <div className="flex gap-2">
            {[
              { value: 'soumis',  label: 'En attente' },
              { value: 'valide',  label: 'Validées' },
              { value: 'brouillon', label: 'Brouillons' },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                  ${filter === value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : grades.length === 0 ? (
            <EmptyState icon={CheckCircle}
              title="Aucune note"
              description={`Aucune note en statut "${filter}" pour cette année`} />
          ) : (
            <div className="divide-y divide-gray-50">
              {grades.map(g => (
                <div key={g.id} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">
                        {g.enrollments?.students?.prenom} {g.enrollments?.students?.nom}
                      </p>
                      <Badge color="blue" className="text-xs">
                        {g.enrollments?.classes?.nom}
                      </Badge>
                      <Badge color="gray" className="text-xs">T{g.trimestre}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {g.subjects?.nom}
                      {g.moyenne_matiere !== null &&
                        ` · Moy : ${formatNote(g.moyenne_matiere)}/20`}
                    </p>
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                      {[g.devoir_1, g.devoir_2, g.devoir_3].map((v, i) =>
                        v != null && (
                          <span key={i} className="bg-gray-100 px-1.5 py-0.5 rounded">
                            D{i+1}: {formatNote(v)}
                          </span>
                        )
                      )}
                      {g.composition != null && (
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Comp: {formatNote(g.composition)}
                        </span>
                      )}
                    </div>
                  </div>
                  {filter === 'soumis' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => rejeterNote(g.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors">
                        <XCircle size={18} />
                      </button>
                      <button onClick={() => validerNote(g.id)}
                        className="p-2 hover:bg-green-50 rounded-lg text-gray-300 hover:text-green-500 transition-colors">
                        <CheckCircle size={18} />
                      </button>
                    </div>
                  )}
                  {filter === 'valide' && (
                    <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full">
                      Validée
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
