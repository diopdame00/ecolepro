import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui'
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'

const MOIS_NOMS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
]

export default function CaissePage() {
  const { schoolId } = useAuth()
  const [historique, setHistorique] = useState([])
  const [loading, setLoading] = useState(true)
  const [recentTransactions, setRecentTransactions] = useState([])

  useEffect(() => {
    if (schoolId) fetchData()
  }, [schoolId])

  async function fetchData() {
    setLoading(true)
    await Promise.all([fetchCaisseMensuelle(), fetchRecentTransactions()])
    setLoading(false)
  }

  async function fetchCaisseMensuelle() {
    const { data, error } = await supabase
      .from('caisse_mensuelle')
      .select('*')
      .eq('school_id', schoolId)
      .order('mois', { ascending: false })
      .limit(6)

    if (!error) setHistorique((data || []).reverse())
  }

  async function fetchRecentTransactions() {
    const [paiements, depenses] = await Promise.all([
      supabase.from('student_payments')
        .select('id, libelle, montant_paye, date_paiement, students:student_id(prenom, nom)')
        .eq('school_id', schoolId)
        .gt('montant_paye', 0)
        .order('date_paiement', { ascending: false })
        .limit(10),
      supabase.from('expenses')
        .select('id, libelle, montant, date_depense, categorie')
        .eq('school_id', schoolId)
        .eq('statut', 'valide')
        .order('date_depense', { ascending: false })
        .limit(10),
    ])

    const recettes = (paiements.data || []).map(p => ({
      type: 'recette',
      libelle: `${p.libelle} — ${p.students?.prenom} ${p.students?.nom}`,
      montant: p.montant_paye,
      date: p.date_paiement,
    }))

    const sorties = (depenses.data || []).map(d => ({
      type: 'depense',
      libelle: d.libelle,
      montant: d.montant,
      date: d.date_depense,
    }))

    const all = [...recettes, ...sorties]
      .filter(t => t.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15)

    setRecentTransactions(all)
  }

  const moisActuel = historique[historique.length - 1] || { recettes: 0, depenses: 0, solde: 0 }
  const soldeTotal = historique.reduce((a, m) => a + (m.solde || 0), 0)
  const maxValue = Math.max(...historique.map(m => Math.max(m.recettes || 0, m.depenses || 0)), 1)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Caisse</h1>
          <p className="text-gray-500 text-sm mt-0.5">Tableau de bord financier</p>
        </div>

        {/* Stats du mois */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recettes (ce mois)</p>
                <p className="text-2xl font-black text-green-600 mt-1">
                  {(moisActuel.recettes || 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-gray-400">F CFA</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <ArrowDownRight size={20} className="text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dépenses (ce mois)</p>
                <p className="text-2xl font-black text-red-500 mt-1">
                  {(moisActuel.depenses || 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-gray-400">F CFA</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <ArrowUpRight size={20} className="text-red-500" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Solde (ce mois)</p>
                <p className={`text-2xl font-black mt-1 ${(moisActuel.solde || 0) >= 0 ? 'text-primary-700' : 'text-red-500'}`}>
                  {(moisActuel.solde || 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-gray-400">F CFA</p>
              </div>
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <Wallet size={20} className="text-primary-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Graphique simplifié recettes vs dépenses */}
        <Card className="p-5">
          <h2 className="font-bold text-gray-900 mb-4">Évolution sur 6 mois</h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : historique.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Pas encore de données</p>
          ) : (
            <div className="flex items-end justify-between gap-3 h-48">
              {historique.map((m, i) => {
                const date = new Date(m.mois)
                const recettesH = ((m.recettes || 0) / maxValue) * 100
                const depensesH = ((m.depenses || 0) / maxValue) * 100
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="flex gap-1 items-end h-36 w-full justify-center">
                      <div
                        className="w-3 bg-green-400 rounded-t"
                        style={{ height: `${Math.max(recettesH, 2)}%` }}
                        title={`Recettes: ${(m.recettes || 0).toLocaleString('fr-FR')} F`}
                      />
                      <div
                        className="w-3 bg-red-400 rounded-t"
                        style={{ height: `${Math.max(depensesH, 2)}%` }}
                        title={`Dépenses: ${(m.depenses || 0).toLocaleString('fr-FR')} F`}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{MOIS_NOMS[date.getMonth()]}</p>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-green-400 rounded" />
              Recettes
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-400 rounded" />
              Dépenses
            </div>
          </div>
        </Card>

        {/* Transactions récentes */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Transactions récentes</h2>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucune transaction</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentTransactions.map((t, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                      ${t.type === 'recette' ? 'bg-green-100' : 'bg-red-100'}`}>
                      {t.type === 'recette'
                        ? <TrendingUp size={14} className="text-green-600" />
                        : <TrendingDown size={14} className="text-red-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.libelle}</p>
                      <p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <p className={`font-bold text-sm ${t.type === 'recette' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.type === 'recette' ? '+' : '-'}{t.montant?.toLocaleString('fr-FR')} F
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
