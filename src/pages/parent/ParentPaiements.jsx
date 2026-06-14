import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../../components/ui'
import { ChevronLeft, Wallet, CheckCircle, AlertCircle } from 'lucide-react'

function getToken() {
  try { return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null }
  catch { return null }
}

export default function ParentPaiements() {
  const { studentId }     = useParams()
  const { parentSession } = useAuth()
  const student           = parentSession?.student

  const [paiements, setPaiements] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { fetchPaiements() }, [])

  async function fetchPaiements() {
    const token = getToken()
    if (!token) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_student_payments_by_token', { p_token: token })
    if (error) console.error(error)
    setPaiements(data || [])
    setLoading(false)
  }

  const soldeTotal = paiements.reduce((acc, p) => acc + (p.solde || 0), 0)
  const impayes    = paiements.filter(p => p.statut === 'en_attente' || p.statut === 'partiel')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white px-5 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <Link to={`/parent/${studentId}`}
            className="flex items-center gap-1 text-primary-200 text-sm mb-4 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retour
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Wallet size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black">Paiements</h1>
              <p className="text-primary-200 text-sm">{student?.classes?.nom}</p>
            </div>
          </div>

          {/* Résumé financier */}
          {!loading && (
            <div className={`mt-4 rounded-xl px-4 py-3 flex items-center justify-between
              ${soldeTotal > 0 ? 'bg-red-500/30' : 'bg-white/15'}`}>
              {soldeTotal > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-200" />
                    <span className="text-sm text-white/80">{impayes.length} paiement(s) en attente</span>
                  </div>
                  <span className="font-black text-lg">{soldeTotal.toLocaleString('fr-FR')} F</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-300" />
                    <span className="text-sm text-white/80">Tous les paiements sont à jour</span>
                  </div>
                  <span className="font-black text-lg">✓</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paiements.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <Wallet size={36} className="mx-auto mb-3 text-gray-200" />
            <p className="font-semibold text-gray-400">Aucun paiement enregistré</p>
          </div>
        ) : (
          paiements.map((p, i) => (
            <div key={i} className={`bg-white rounded-2xl shadow-sm border p-4
              ${p.statut !== 'complet' ? 'border-orange-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{p.libelle}</p>
                  {p.type_paiement && (
                    <p className="text-xs text-gray-400 capitalize">{p.type_paiement}</p>
                  )}
                </div>
                <Badge color={
                  p.statut === 'complet'   ? 'green'  :
                  p.statut === 'partiel'   ? 'yellow' : 'red'
                }>
                  {p.statut === 'complet' ? 'Payé' :
                   p.statut === 'partiel' ? 'Partiel' : 'À payer'}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">
                  Montant : <span className="font-medium text-gray-800">
                    {p.montant_du?.toLocaleString('fr-FR')} F CFA
                  </span>
                </span>
                {p.montant_paye > 0 && p.montant_paye < p.montant_du && (
                  <span className="text-green-600 text-xs">
                    Payé : {p.montant_paye?.toLocaleString('fr-FR')} F
                  </span>
                )}
              </div>
              {(p.solde || 0) > 0 && (
                <div className="mt-2 bg-orange-50 rounded-lg px-3 py-1.5 flex justify-between items-center">
                  <span className="text-xs text-orange-600">Reste à payer</span>
                  <span className="text-sm font-black text-orange-700">
                    {p.solde?.toLocaleString('fr-FR')} F CFA
                  </span>
                </div>
              )}
              {p.date_paiement && (
                <p className="text-xs text-gray-400 mt-2">
                  Dernier paiement : {new Date(p.date_paiement).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
