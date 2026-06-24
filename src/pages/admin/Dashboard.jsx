import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui'
import { Users, BookOpen, GraduationCap, CheckCircle, Clock, Bell } from 'lucide-react'

export default function AdminDashboard() {
  const { schoolId, school } = useAuth()
  const { yearId, annee } = useAnneeActive()
  const [stats, setStats]           = useState({ eleves: 0, classes: 0, profs: 0, notesEnAttente: 0 })
  const [gradeNotifs, setGradeNotifs] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (schoolId && yearId) fetchStats()
  }, [schoolId, yearId])

  async function fetchStats() {
    const [elevesRes, classesRes, profsRes, gradesRes] = await Promise.all([
      // Élèves = enrollments de l'année active
      supabase.from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('year_id', yearId),
      // Classes de l'année active
      supabase.from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('year_id', yearId),
      // Profs
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('role', 'prof'),
      // Notes soumises en attente
      supabase.from('grades')
        .select('id, statut, enrollment_id, subject_id, trimestre, enrollments(students(prenom, nom)), subjects(nom)')
        .eq('school_id', schoolId)
        .eq('year_id', yearId)
        .eq('statut', 'soumis'),
    ])

    const notifs = (gradesRes.data || []).map(g => ({
      gradeId: g.id,
      eleve:   g.enrollments?.students,
      matiere: g.subjects?.nom,
      trimestre: g.trimestre,
    }))

    setGradeNotifs(notifs)
    setStats({
      eleves:          elevesRes.count  || 0,
      classes:         classesRes.count || 0,
      profs:           profsRes.count   || 0,
      notesEnAttente:  notifs.length,
    })
    setLoading(false)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm">{school?.name} · {annee}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Élèves',           value: stats.eleves,         icon: Users,         color: 'blue'   },
                { label: 'Classes',          value: stats.classes,        icon: BookOpen,      color: 'purple' },
                { label: 'Professeurs',      value: stats.profs,          icon: GraduationCap, color: 'green'  },
                { label: 'Notes en attente', value: stats.notesEnAttente, icon: Clock,         color: 'amber'  },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                    ${color === 'blue'   ? 'bg-blue-100'   : ''}
                    ${color === 'purple' ? 'bg-purple-100' : ''}
                    ${color === 'green'  ? 'bg-green-100'  : ''}
                    ${color === 'amber'  ? 'bg-amber-100'  : ''}`}>
                    <Icon size={18} className={`
                      ${color === 'blue'   ? 'text-blue-600'   : ''}
                      ${color === 'purple' ? 'text-purple-600' : ''}
                      ${color === 'green'  ? 'text-green-600'  : ''}
                      ${color === 'amber'  ? 'text-amber-600'  : ''}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900">{value}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Notifications notes soumises */}
            {gradeNotifs.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Bell size={16} className="text-amber-500" />
                  <h2 className="font-bold text-gray-900">{gradeNotifs.length} note(s) en attente de validation</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {gradeNotifs.slice(0, 8).map((n, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                        <Clock size={14} className="text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {n.eleve?.prenom} {n.eleve?.nom}
                        </p>
                        <p className="text-xs text-gray-400">
                          {n.matiere} · T{n.trimestre}
                        </p>
                      </div>
                      <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full">
                        À valider
                      </span>
                    </div>
                  ))}
                  {gradeNotifs.length > 8 && (
                    <div className="px-5 py-3 text-xs text-gray-400 text-center">
                      + {gradeNotifs.length - 8} autres…
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
