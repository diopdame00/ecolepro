import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui'
import { Users, BookOpen, FileText, GraduationCap, CheckCircle, Clock, AlertCircle, XCircle, Bell } from 'lucide-react'

export default function AdminDashboard() {
  const { schoolId, school } = useAuth()
  const [stats, setStats] = useState({ eleves: 0, classes: 0, profs: 0, notesEnAttente: 0 })
  const [absenceNotifs, setAbsenceNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (schoolId) {
      fetchStats()
      fetchAbsenceNotifs()
    }
  }, [schoolId])

  async function fetchStats() {
    const [elevesRes, classesRes, profsRes, notesRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact' }).eq('school_id', schoolId),
      supabase.from('classes').select('id', { count: 'exact' }).eq('school_id', schoolId),
      supabase.from('users').select('id', { count: 'exact' }).eq('school_id', schoolId).eq('role', 'prof'),
      supabase.from('grades').select('id', { count: 'exact' }).eq('school_id', schoolId).eq('statut', 'soumis'),
    ])

    setStats({
      eleves: elevesRes.count || 0,
      classes: classesRes.count || 0,
      profs: profsRes.count || 0,
      notesEnAttente: notesRes.count || 0,
    })
    setLoading(false)
  }

  async function fetchAbsenceNotifs() {
    const { data } = await supabase
      .from('absence_notifications')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10)
    setAbsenceNotifs(data || [])
  }

  async function markAbsenceRead(id) {
    await supabase
      .from('absence_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    setAbsenceNotifs(prev => prev.filter(n => n.id !== id))
  }

  async function markAllAbsencesRead() {
    const ids = absenceNotifs.map(n => n.id)
    await supabase
      .from('absence_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids)
    setAbsenceNotifs([])
  }

  const cards = [
    { label: 'Élèves inscrits', value: stats.eleves, icon: Users, color: 'blue', bg: 'bg-blue-100', text: 'text-blue-600' },
    { label: 'Classes', value: stats.classes, icon: BookOpen, color: 'purple', bg: 'bg-purple-100', text: 'text-purple-600' },
    { label: 'Professeurs', value: stats.profs, icon: GraduationCap, color: 'green', bg: 'bg-green-100', text: 'text-green-600' },
    { label: 'Notes à valider', value: stats.notesEnAttente, icon: Clock, color: stats.notesEnAttente > 0 ? 'yellow' : 'gray', bg: stats.notesEnAttente > 0 ? 'bg-yellow-100' : 'bg-gray-100', text: stats.notesEnAttente > 0 ? 'text-yellow-600' : 'text-gray-400' },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            Bonjour 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{school?.name} — Vue d'ensemble</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ label, value, icon: Icon, bg, text }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{loading ? '—' : value}</p>
                </div>
                <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                  <Icon size={20} className={text} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Bandeau absences professeurs ── */}
        {absenceNotifs.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-red-100 border-b border-red-200">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-red-600 shrink-0" />
                <p className="text-sm font-bold text-red-800">
                  {absenceNotifs.length} absence(s) déclarée(s) non lue(s)
                </p>
              </div>
              <button
                onClick={markAllAbsencesRead}
                className="text-xs text-red-600 font-semibold hover:text-red-800 transition-colors"
              >
                Tout marquer lu
              </button>
            </div>
            <div className="divide-y divide-red-100">
              {absenceNotifs.map(n => {
                const isToday = n.date_cours === new Date().toISOString().slice(0, 10)
                const isFuture = n.date_cours > new Date().toISOString().slice(0, 10)
                const dateLabel = isToday ? "Aujourd'hui"
                  : isFuture ? new Date(n.date_cours + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' })
                  : new Date(n.date_cours + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-red-900">
                          {n.subject_name}
                          <span className="font-normal text-red-600 ml-1">
                            · {n.heure_debut?.slice(0, 5)}–{n.heure_fin?.slice(0, 5)}
                          </span>
                        </p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                          ${isToday ? 'bg-red-200 text-red-800'
                          : isFuture ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'}`}>
                          {dateLabel}
                        </span>
                      </div>
                      <p className="text-xs text-red-600 mt-0.5">
                        {n.class_name} · Prof. {n.prof_name}
                        {n.motif && <span className="text-red-400"> · {n.motif}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => markAbsenceRead(n.id)}
                      className="p-1 hover:bg-red-200 rounded-lg transition-colors shrink-0"
                      title="Marquer comme lu"
                    >
                      <CheckCircle size={14} className="text-red-400" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Alertes notes */}
        {stats.notesEnAttente > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800">Notes en attente de validation</p>
              <p className="text-sm text-yellow-600 mt-0.5">
                {stats.notesEnAttente} soumission(s) de professeurs attendent votre validation.
              </p>
            </div>
          </div>
        )}

        {/* Actions rapides */}
        <div>
          <h2 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Actions rapides</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ajouter des élèves', icon: Users, to: '/admin/eleves' },
              { label: 'Gérer les classes', icon: BookOpen, to: '/admin/classes' },
              { label: 'Valider les notes', icon: CheckCircle, to: '/admin/notes' },
              { label: 'Générer bulletins', icon: FileText, to: '/admin/bulletins' },
            ].map(({ label, icon: Icon, to }) => (
              <a key={to} href={to} className="card flex flex-col items-center gap-2 py-5 hover:shadow-md transition-shadow cursor-pointer text-center">
                <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                  <Icon size={20} className="text-primary-600" />
                </div>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
