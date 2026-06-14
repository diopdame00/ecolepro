import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui'
import { Wallet, TrendingDown, AlertCircle, Users, Receipt } from 'lucide-react'

export default function SecretaireDashboard() {
  const { schoolId, school } = useAuth()
  const [stats, setStats] = useState({
    encaisseAujourdhui: 0,
    encaisseMois: 0,
    depensesMois: 0,
    elevesImpayes: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (schoolId) fetchStats()
  }, [schoolId])

  async function fetchStats() {
    const today = new Date().toISOString().slice(0, 10)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    const startMonthStr = startOfMonth.toISOString().slice(0, 10)

    const [todayRes, monthRes, depensesRes, impayesRes] = await Promise.all([
      supabase.from('student_payments').select('montant_paye')
        .eq('school_id', schoolId)
        .eq('date_paiement', today)
        .neq('statut', 'annule'),
      supabase.from('student_payments').select('montant_paye')
        .eq('school_id', schoolId)
        .gte('date_paiement', startMonthStr)
        .neq('statut', 'annule'),
      supabase.from('expenses').select('montant')
        .eq('school_id', schoolId)
        .gte('date_depense', startMonthStr)
        .eq('statut', 'valide'),
      supabase.from('student_payments').select('student_id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .in('statut', ['en_attente', 'partiel']),
    ])

    setStats({
      encaisseAujourdhui: todayRes.data?.reduce((a, p) => a + (p.montant_paye || 0), 0) || 0,
      encaisseMois:       monthRes.data?.reduce((a, p) => a + (p.montant_paye || 0), 0) || 0,
      depensesMois:       depensesRes.data?.reduce((a, e) => a + (e.montant || 0), 0) || 0,
      elevesImpayes:      impayesRes.count || 0,
    })
    setLoading(false)
  }

  const cards = [
    { label: 'Encaissé aujourd\'hui', value: stats.encaisseAujourdhui, suffix: 'F CFA', icon: Wallet, color: 'green' },
    { label: 'Encaissé ce mois', value: stats.encaisseMois, suffix: 'F CFA', icon: Receipt, color: 'blue' },
    { label: 'Dépenses ce mois', value: stats.depensesMois, suffix: 'F CFA', icon: TrendingDown, color: 'red' },
    { label: 'Élèves en attente de paiement', value: stats.elevesImpayes, suffix: '', icon: AlertCircle, color: 'yellow' },
  ]

  const colorClasses = {
    green:  { bg: 'bg-green-100',  text: 'text-green-600' },
    blue:   { bg: 'bg-blue-100',   text: 'text-blue-600' },
    red:    { bg: 'bg-red-100',    text: 'text-red-500' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord financier</h1>
          <p className="text-gray-500 text-sm mt-0.5">{school?.name} — Vue d'ensemble</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ label, value, suffix, icon: Icon, color }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">
                    {loading ? '—' : value.toLocaleString('fr-FR')}
                  </p>
                  {suffix && <p className="text-xs text-gray-400">{suffix}</p>}
                </div>
                <div className={`w-10 h-10 ${colorClasses[color].bg} rounded-xl flex items-center justify-center`}>
                  <Icon size={20} className={colorClasses[color].text} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Actions rapides */}
        <div>
          <h2 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Actions rapides</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Enregistrer un paiement', icon: Wallet, to: '/secretaire/paiements' },
              { label: 'Enregistrer une dépense', icon: TrendingDown, to: '/secretaire/depenses' },
              { label: 'Voir la caisse', icon: Receipt, to: '/secretaire/caisse' },
            ].map(({ label, icon: Icon, to }) => (
              <a key={to} href={to} className="card flex flex-col items-center gap-2 py-5 hover:shadow-md transition-shadow cursor-pointer text-center bg-white rounded-xl border border-gray-100">
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
