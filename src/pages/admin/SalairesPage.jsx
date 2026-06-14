import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../components/ui'
import { DollarSign, Settings, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const MOIS_NOMS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export default function SalairesPage() {
  const { schoolId, profile } = useAuth()
  const [profs, setProfs] = useState([])
  const [configs, setConfigs] = useState({})
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedProf, setSelectedProf] = useState(null)
  const [configForm, setConfigForm] = useState({ type_salaire: 'fixe', salaire_fixe: '', taux_horaire: '' })

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payCalc, setPayCalc] = useState(null)
  const [saving, setSaving] = useState(false)

  const now = new Date()
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())

  useEffect(() => {
    if (schoolId) fetchAll()
  }, [schoolId, mois, annee])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchProfs(), fetchConfigs(), fetchPayments()])
    setLoading(false)
  }

  async function fetchProfs() {
    const { data } = await supabase
      .from('users')
      .select('id, prenom, nom')
      .eq('school_id', schoolId)
      .eq('role', 'prof')
      .order('nom')
    setProfs(data || [])
  }

  async function fetchConfigs() {
    const { data } = await supabase
      .from('salary_configs')
      .select('*')
      .eq('school_id', schoolId)

    const map = {}
    data?.forEach(c => { map[c.prof_id] = c })
    setConfigs(map)
  }

  async function fetchPayments() {
    const { data } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('school_id', schoolId)
      .eq('mois', mois)
      .eq('annee', annee)

    const map = {}
    data?.forEach(p => { map[p.prof_id] = p })
    setPayments(map)
  }

  function ouvrirConfig(prof) {
    const existing = configs[prof.id]
    setSelectedProf(prof)
    setConfigForm({
      type_salaire:  existing?.type_salaire || 'fixe',
      salaire_fixe:  existing?.salaire_fixe?.toString() || '',
      taux_horaire:  existing?.taux_horaire?.toString() || '',
    })
    setConfigModalOpen(true)
  }

  async function sauvegarderConfig() {
    if (configForm.type_salaire === 'fixe' && !configForm.salaire_fixe) {
      toast.error('Veuillez indiquer le salaire fixe')
      return
    }
    if (configForm.type_salaire === 'horaire' && !configForm.taux_horaire) {
      toast.error('Veuillez indiquer le taux horaire')
      return
    }

    setSaving(true)
    try {
      const payload = {
        school_id:    schoolId,
        prof_id:      selectedProf.id,
        type_salaire: configForm.type_salaire,
        salaire_fixe: configForm.type_salaire === 'fixe' ? parseFloat(configForm.salaire_fixe) : null,
        taux_horaire: configForm.type_salaire === 'horaire' ? parseFloat(configForm.taux_horaire) : null,
      }

      const { error } = await supabase
        .from('salary_configs')
        .upsert(payload, { onConflict: 'school_id,prof_id' })

      if (error) throw error
      toast.success('Configuration enregistrée')
      setConfigModalOpen(false)
      fetchConfigs()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function ouvrirPaiement(prof) {
    const config = configs[prof.id]
    if (!config) {
      toast.error('Veuillez configurer le salaire de ce professeur')
      return
    }

    try {
      const { data, error } = await supabase.rpc('calculate_prof_salary', {
        p_school_id: schoolId,
        p_prof_id:   prof.id,
        p_mois:      mois,
        p_annee:     annee,
      })

      if (error) throw error

      setSelectedProf(prof)
      setPayCalc(data?.[0])
      setPayModalOpen(true)
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    }
  }

  async function confirmerPaiement() {
    setSaving(true)
    try {
      const { error } = await supabase.from('salary_payments').upsert({
        school_id:       schoolId,
        prof_id:         selectedProf.id,
        mois,
        annee,
        type_salaire:    payCalc.type_salaire,
        heures_validees: payCalc.heures_validees,
        taux_horaire:    payCalc.taux_horaire,
        montant_brut:    payCalc.montant_brut,
        statut:          'paye',
        date_paiement:   new Date().toISOString().slice(0, 10),
        mode_paiement:   'especes',
        paye_par:        profile.id,
      }, { onConflict: 'school_id,prof_id,mois,annee' })

      if (error) throw error
      toast.success('Salaire payé')
      setPayModalOpen(false)
      fetchPayments()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalPaye = Object.values(payments).reduce((a, p) => a + (p.montant_net || 0), 0)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Salaires des professeurs</h1>
            <p className="text-gray-500 text-sm mt-0.5">Configuration et paiement</p>
          </div>
          <div className="flex gap-2">
            <select value={mois} onChange={e => setMois(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
              {MOIS_NOMS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select value={annee} onChange={e => setAnnee(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            Total versé — {MOIS_NOMS[mois]} {annee}
          </p>
          <p className="text-3xl font-black text-primary-700 mt-1">
            {totalPaye.toLocaleString('fr-FR')} <span className="text-sm font-normal text-gray-400">F CFA</span>
          </p>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profs.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={DollarSign} title="Aucun professeur enregistré" />
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {profs.map(p => {
                const config = configs[p.id]
                const payment = payments[p.id]
                return (
                  <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{p.prenom} {p.nom}</p>
                      {config ? (
                        <p className="text-xs text-gray-400">
                          {config.type_salaire === 'fixe'
                            ? `Salaire fixe : ${config.salaire_fixe?.toLocaleString('fr-FR')} F CFA/mois`
                            : `Taux horaire : ${config.taux_horaire?.toLocaleString('fr-FR')} F CFA/h`}
                        </p>
                      ) : (
                        <p className="text-xs text-yellow-600">Configuration manquante</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {payment ? (
                        <Badge color="green">
                          <CheckCircle size={12} className="inline mr-1" />
                          Payé — {payment.montant_net?.toLocaleString('fr-FR')} F
                        </Badge>
                      ) : (
                        <Badge color="gray">
                          <Clock size={12} className="inline mr-1" />
                          Non payé
                        </Badge>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => ouvrirConfig(p)}>
                        <Settings size={14} />
                      </Button>
                      {!payment && (
                        <Button size="sm" onClick={() => ouvrirPaiement(p)} disabled={!config}>
                          Payer
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Modal configuration salaire */}
      <Modal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)}
        title={`Configurer le salaire — ${selectedProf?.prenom} ${selectedProf?.nom}`}>
        <div className="space-y-4">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {['fixe', 'horaire'].map(type => (
              <button
                key={type}
                onClick={() => setConfigForm({ ...configForm, type_salaire: type })}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
                  ${configForm.type_salaire === type ? 'bg-white shadow text-primary-700' : 'text-gray-500'}`}
              >
                {type === 'fixe' ? 'Salaire fixe' : 'Salaire horaire'}
              </button>
            ))}
          </div>

          {configForm.type_salaire === 'fixe' ? (
            <Input
              label="Salaire mensuel (F CFA) *"
              type="number"
              min="0"
              placeholder="150000"
              value={configForm.salaire_fixe}
              onChange={e => setConfigForm({ ...configForm, salaire_fixe: e.target.value })}
            />
          ) : (
            <Input
              label="Taux horaire (F CFA/h) *"
              type="number"
              min="0"
              placeholder="2500"
              value={configForm.taux_horaire}
              onChange={e => setConfigForm({ ...configForm, taux_horaire: e.target.value })}
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfigModalOpen(false)}>
              Annuler
            </Button>
            <Button className="flex-1" loading={saving} onClick={sauvegarderConfig}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal confirmation paiement */}
      <Modal isOpen={payModalOpen} onClose={() => setPayModalOpen(false)}
        title={`Payer le salaire — ${selectedProf?.prenom} ${selectedProf?.nom}`}>
        {payCalc && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{payCalc.type_salaire === 'fixe' ? 'Salaire fixe' : 'Salaire horaire'}</span>
              </div>
              {payCalc.type_salaire === 'horaire' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Heures validées</span>
                    <span className="font-medium">{payCalc.heures_validees} h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Taux horaire</span>
                    <span className="font-medium">{payCalc.taux_horaire?.toLocaleString('fr-FR')} F CFA</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="font-semibold text-gray-900">Montant à payer</span>
                <span className="font-black text-primary-700 text-lg">
                  {payCalc.montant_brut?.toLocaleString('fr-FR')} F CFA
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPayModalOpen(false)}>
                Annuler
              </Button>
              <Button className="flex-1" loading={saving} onClick={confirmerPaiement}>
                Confirmer le paiement
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
