import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui'
import { Users, BookOpen, FileText, GraduationCap, CheckCircle, Clock, AlertCircle } from 'lucide-react'

export default function AdminDashboard() {
  const { schoolId, school } = useAuth()
  const [stats, setStats] = useState({ eleves: 0, classes: 0, profs: 0, notesEnAttente: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (schoolId) fetchStats()
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

        {/* Alertes */}
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
