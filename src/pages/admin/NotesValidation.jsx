import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Badge, EmptyState } from '../../components/ui'
import { CheckCircle, XCircle, Clock, Filter } from 'lucide-react'
import { formatNote } from '../../utils/calculs'
import toast from 'react-hot-toast'

export default function NotesValidation() {
  const { schoolId } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('soumis')

  useEffect(() => { if (schoolId) fetchSubmissions() }, [schoolId, filter])

  async function fetchSubmissions() {
    setLoading(true)
    const { data } = await supabase
      .from('grades')
      .select('*, students(prenom, nom), subjects(nom, coefficient), classes:students(classes(nom))')
      .eq('school_id', schoolId)
      .eq('statut', filter)
      .order('updated_at', { ascending: false })
    setSubmissions(data || [])
    setLoading(false)
  }

  async function validerNote(id) {
    const { error } = await supabase.from('grades').update({ statut: 'valide' }).eq('id', id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Note validée !')
    fetchSubmissions()
  }

  async function rejeterNote(id) {
    const { error } = await supabase.from('grades').update({ statut: 'brouillon' }).eq('id', id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Note renvoyée au professeur')
    fetchSubmissions()
  }

  async function validerTout() {
    const ids = submissions.map(s => s.id)
    const { error } = await supabase.from('grades').update({ statut: 'valide' }).in('id', ids)
    if (error) { toast.error('Erreur'); return }
    toast.success(`${ids.length} notes validées !`)
    fetchSubmissions()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Validation des notes</h1>
            <p className="text-gray-500 text-sm">{submissions.length} entrée(s)</p>
          </div>
          {filter === 'soumis' && submissions.length > 0 && (
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
          ) : submissions.length === 0 ? (
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
                <span>Trimestre</span>
                <span>Moyenne</span>
                <span>Actions</span>
              </div>
              <div className="divide-y divide-gray-50">
                {submissions.map(s => (
                  <div key={s.id} className="px-6 py-3 grid grid-cols-6 gap-3 items-center hover:bg-gray-50/50 text-sm">
                    <div className="col-span-2 font-medium text-gray-900">
                      {s.students?.prenom} {s.students?.nom}
                    </div>
                    <span className="text-gray-600">{s.subjects?.nom}</span>
                    <span><Badge color="blue">T{s.trimestre}</Badge></span>
                    <span className={`font-bold ${s.moyenne_matiere >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatNote(s.moyenne_matiere)}
                    </span>
                    <div className="flex gap-2">
                      {filter === 'soumis' && (
                        <>
                          <button onClick={() => validerNote(s.id)} className="p-1.5 hover:bg-green-50 rounded-lg text-green-500 transition-colors" title="Valider">
                            <CheckCircle size={16} />
                          </button>
                          <button onClick={() => rejeterNote(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors" title="Renvoyer">
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
