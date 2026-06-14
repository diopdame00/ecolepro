import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Badge } from '../../components/ui'
import { BookOpen, FileText, CheckCircle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ProfDashboard() {
  const { profile, school } = useAuth()
  const [stats, setStats] = useState({ classes: 0, brouillons: 0, soumis: 0, valides: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) fetchStats() }, [profile])

  async function fetchStats() {
    const [classesRes, gradesRes] = await Promise.all([
      supabase.from('prof_classes').select('id', { count: 'exact' }).eq('prof_id', profile.id),
      supabase.from('grades').select('statut').eq('prof_id', profile.id),
    ])

    const grades = gradesRes.data || []
    setStats({
      classes: classesRes.count || 0,
      brouillons: grades.filter(g => g.statut === 'brouillon').length,
      soumis: grades.filter(g => g.statut === 'soumis').length,
      valides: grades.filter(g => g.statut === 'valide').length,
    })
    setLoading(false)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            Bonjour, {profile?.prenom} 👋
          </h1>
          <p className="text-gray-500 text-sm">{school?.name}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Mes classes', value: stats.classes, icon: BookOpen, color: 'bg-blue-100', text: 'text-blue-600' },
            { label: 'Brouillons', value: stats.brouillons, icon: FileText, color: 'bg-gray-100', text: 'text-gray-500' },
            { label: 'En attente', value: stats.soumis, icon: Clock, color: 'bg-yellow-100', text: 'text-yellow-600' },
            { label: 'Validées', value: stats.valides, icon: CheckCircle, color: 'bg-green-100', text: 'text-green-600' },
          ].map(({ label, value, icon: Icon, color, text }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{loading ? '—' : value}</p>
                </div>
                <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
                  <Icon size={20} className={text} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/prof/notes" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <FileText size={20} className="text-primary-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Saisir des notes</span>
            </Link>
            <Link to="/prof/classes" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <BookOpen size={20} className="text-primary-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Mes classes</span>
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
