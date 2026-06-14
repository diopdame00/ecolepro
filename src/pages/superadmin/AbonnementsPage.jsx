import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Badge, Button, Modal, Select } from '../../components/ui'
import { CreditCard, TrendingUp, CheckCircle, Plus } from 'lucide-react'
import { PLAN_PRICES, PLAN_LABELS } from './Dashboard'
import toast from 'react-hot-toast'

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

export default function AbonnementsPage() {
  const [ecoles, setEcoles] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    school_id: '',
    plan: 'standard',
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    mode_paiement: 'especes',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [ecolesRes, paiementsRes] = await Promise.all([
      supabase.from('schools').select('id, name, is_active, subscription_plan, subscription_expires_at').order('name'),
      supabase.from('subscription_payments').select('*, schools(name)').order('created_at', { ascending: false }).limit(50),
    ])
    setEcoles(ecolesRes.data || [])
    setPaiements(paiementsRes.data || [])
    setLoading(false)
  }

  async function enregistrerPaiement() {
    if (!form.school_id) {
      toast.error('Veuillez sélectionner une école')
      return
    }

    setSaving(true)
    try {
      const montant = PLAN_PRICES[form.plan] || PLAN_PRICES.standard

      // Calculer la nouvelle date d'expiration : +1 mois depuis aujourd'hui
      // (ou depuis la date d'expiration actuelle si elle est dans le futur)
      const ecole = ecoles.find(e => e.id === form.school_id)
      const currentExpiry = ecole?.subscription_expires_at ? new Date(ecole.subscription_expires_at) : new Date()
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date()
      const newExpiry = new Date(baseDate)
      newExpiry.setMonth(newExpiry.getMonth() + 1)

      const { error: payError } = await supabase.from('subscription_payments').insert({
        school_id: form.school_id,
        mois: form.mois,
        annee: form.annee,
        plan: form.plan,
        montant,
        statut: 'paye',
        mode_paiement: form.mode_paiement,
        date_debut: new Date().toISOString().slice(0, 10),
        date_fin: newExpiry.toISOString().slice(0, 10),
      })
      if (payError) throw payError

      // Mettre à jour l'école : plan, date d'expiration, réactivation si suspendue
      const { error: schoolError } = await supabase
        .from('schools')
        .update({
          is_active: true,
          subscription_plan: form.plan,
          subscription_expires_at: newExpiry.toISOString().slice(0, 10),
        })
        .eq('id', form.school_id)
      if (schoolError) throw schoolError

      toast.success('Paiement enregistré !')
      setModalOpen(false)
      fetchData()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const ecolesActives = ecoles.filter(e => e.is_active)
  const revenuMensuel = ecolesActives.reduce((acc, e) => acc + (PLAN_PRICES[e.subscription_plan] || PLAN_PRICES.standard), 0)

  // Revenus par mois (6 derniers mois)
  const revenuParMois = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const m = d.getMonth() + 1
    const a = d.getFullYear()
    const total = paiements.filter(p => p.mois === m && p.annee === a).reduce((acc, p) => acc + p.montant, 0)
    return { label: MOIS[m - 1], total }
  })
  const maxRevenu = Math.max(...revenuParMois.map(r => r.total), 1)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Abonnements</h1>
            <p className="text-gray-500 text-sm">Suivi des paiements</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Enregistrer un paiement
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Revenu mensuel récurrent</p>
            <p className="text-3xl font-black text-primary-700 mt-1">{revenuMensuel.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-gray-400">F CFA</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Écoles actives</p>
            <p className="text-3xl font-black text-green-600 mt-1">{ecolesActives.length}</p>
            <p className="text-xs text-gray-400">sur {ecoles.length} total</p>
          </Card>
          <Card className="p-5 col-span-2 lg:col-span-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Projection annuelle</p>
            <p className="text-3xl font-black text-primary-700 mt-1">{(revenuMensuel * 12).toLocaleString('fr-FR')}</p>
            <p className="text-xs text-gray-400">F CFA</p>
          </Card>
        </div>

        {/* Graphique simple */}
        <Card>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-600" />
            Revenus — 6 derniers mois
          </h2>
          <div className="flex items-end gap-3 h-32">
            {revenuParMois.map(({ label, total }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-primary-700">
                  {total > 0 ? `${(total / 1000).toFixed(0)}k` : '—'}
                </span>
                <div className="w-full bg-primary-100 rounded-t-lg transition-all" style={{ height: `${(total / maxRevenu) * 80}px`, minHeight: total > 0 ? '8px' : '2px' }} />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Historique paiements */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-primary-600" />
              Historique des paiements
            </h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : paiements.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">Aucun paiement enregistré</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {paiements.map(p => (
                <div key={p.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50/50">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.schools?.name}</p>
                    <p className="text-xs text-gray-400">
                      {MOIS[p.mois - 1]} {p.annee} · {PLAN_LABELS[p.plan] || 'Standard'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary-700">{p.montant.toLocaleString('fr-FR')} F CFA</span>
                    <Badge color="green">
                      <CheckCircle size={11} className="mr-1" />
                      Payé
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modal enregistrer paiement */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Enregistrer un paiement">
        <div className="space-y-4">
          <Select label="École" value={form.school_id} onChange={e => setForm({ ...form, school_id: e.target.value })}>
            <option value="">Choisir une école</option>
            {ecoles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Select label="Formule" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
            {Object.entries(PLAN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label} — {PLAN_PRICES[value].toLocaleString('fr-FR')} F CFA/mois
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mois" value={form.mois} onChange={e => setForm({ ...form, mois: Number(e.target.value) })}>
              {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </Select>
            <Select label="Année" value={form.annee} onChange={e => setForm({ ...form, annee: Number(e.target.value) })}>
              {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <Select label="Mode de paiement" value={form.mode_paiement} onChange={e => setForm({ ...form, mode_paiement: e.target.value })}>
            <option value="especes">Espèces</option>
            <option value="virement">Virement bancaire</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="cheque">Chèque</option>
          </Select>
          <div className="bg-primary-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Montant</p>
            <p className="text-2xl font-black text-primary-700">
              {(PLAN_PRICES[form.plan] || PLAN_PRICES.standard).toLocaleString('fr-FR')} F CFA
            </p>
            <p className="text-xs text-gray-400 mt-1">L'abonnement sera prolongé d'un mois</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" loading={saving} onClick={enregistrerPaiement}>
              <CheckCircle size={16} />
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
