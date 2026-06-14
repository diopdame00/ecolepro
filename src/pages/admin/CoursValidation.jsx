import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Badge, Modal, EmptyState } from '../../components/ui'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CoursValidation() {
  const { schoolId, profile } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [motifRejet, setMotifRejet] = useState('')

  useEffect(() => {
    if (schoolId) fetchSessions()
  }, [schoolId])

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('course_sessions')
      .select(`
        *,
        classes:classe_id(nom),
        subjects:subject_id(nom),
        users:prof_id(prenom, nom)
      `)
      .eq('school_id', schoolId)
      .eq('statut', 'effectue')
      .order('date_cours', { ascending: false })

    if (!error) setSessions(data || [])
    setLoading(false)
  }

  async function valider(session) {
    const { error } = await supabase
      .from('course_sessions')
      .update({ statut: 'valide', valide_par: profile.id })
      .eq('id', session.id)

    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Cours validé')
    setSessions(prev => prev.filter(s => s.id !== session.id))
  }

  function ouvrirRejet(session) {
    setSelectedSession(session)
    setMotifRejet('')
    setRejectModalOpen(true)
  }

  async function confirmerRejet() {
    if (!motifRejet.trim()) {
      toast.error('Veuillez indiquer un motif de rejet')
      return
    }

    const { error } = await supabase
      .from('course_sessions')
      .update({ statut: 'rejete', valide_par: profile.id, motif_rejet: motifRejet.trim() })
      .eq('id', selectedSession.id)

    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Cours rejeté')
    setSessions(prev => prev.filter(s => s.id !== selectedSession.id))
    setRejectModalOpen(false)
  }

  function formatDuree(minutes) {
    if (!minutes) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Validation des cours</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {sessions.length} cours en attente de validation
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={CheckCircle}
              title="Aucun cours en attente"
              description="Tous les cours déclarés ont été traités."
            />
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {sessions.map(s => (
                <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="text-center w-16 shrink-0">
                      <p className="text-xs text-gray-400">
                        {new Date(s.date_cours).toLocaleDateString('fr-FR', { weekday: 'short' })}
                      </p>
                      <p className="font-black text-gray-900">
                        {new Date(s.date_cours).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">
                        {s.subjects?.nom} — {s.classes?.nom}
                      </p>
                      <p className="text-sm text-gray-500">
                        {s.users?.prenom} {s.users?.nom}
                        {' · '}
                        {s.heure_debut?.slice(0, 5)}-{s.heure_fin?.slice(0, 5)}
                        {' · '}
                        <span className="font-medium text-primary-700">{formatDuree(s.duree_minutes)}</span>
                      </p>
                      {s.sujet_traite && (
                        <p className="text-xs text-gray-400 mt-1 italic truncate">"{s.sujet_traite}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="success" onClick={() => valider(s)}>
                      <CheckCircle size={14} />
                      Valider
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => ouvrirRejet(s)}>
                      <XCircle size={14} />
                      Rejeter
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Modal motif de rejet */}
      <Modal isOpen={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title="Rejeter ce cours">
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-700">
              Le professeur sera informé du rejet et du motif indiqué.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif du rejet *</label>
            <textarea
              rows={3}
              placeholder="ex: Horaire incohérent avec l'emploi du temps"
              value={motifRejet}
              onChange={e => setMotifRejet(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRejectModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirmerRejet}>
              Confirmer le rejet
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
