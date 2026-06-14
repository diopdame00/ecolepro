import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../components/ui'
import { TrendingDown, Plus, Zap, Droplet, Wifi, Wrench, Package, MoreHorizontal, Users2 } from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { value: 'salaire',       label: 'Salaires',     icon: Users2 },
  { value: 'fournitures',   label: 'Fournitures',  icon: Package },
  { value: 'materiel',      label: 'Matériel',     icon: Wrench },
  { value: 'electricite',   label: 'Électricité',  icon: Zap },
  { value: 'eau',           label: 'Eau',          icon: Droplet },
  { value: 'internet',      label: 'Internet',     icon: Wifi },
  { value: 'loyer',         label: 'Loyer',        icon: Package },
  { value: 'entretien',     label: 'Entretien',    icon: Wrench },
  { value: 'communication', label: 'Communication', icon: Wifi },
  { value: 'autre',         label: 'Autre',        icon: MoreHorizontal },
]

const MODES_PAIEMENT = [
  { value: 'especes',      label: 'Espèces' },
  { value: 'virement',     label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cheque',       label: 'Chèque' },
  { value: 'autre',        label: 'Autre' },
]

export default function DepensesPage() {
  const { schoolId, profile } = useAuth()
  const [depenses, setDepenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterCategorie, setFilterCategorie] = useState('')

  const [form, setForm] = useState({
    categorie: 'fournitures',
    libelle: '',
    montant: '',
    date_depense: new Date().toISOString().slice(0, 10),
    mode_paiement: 'especes',
    note: '',
  })

  useEffect(() => {
    if (schoolId) fetchDepenses()
  }, [schoolId])

  async function fetchDepenses() {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('school_id', schoolId)
      .order('date_depense', { ascending: false })
      .limit(100)

    if (!error) setDepenses(data || [])
    setLoading(false)
  }

  async function ajouterDepense() {
    if (!form.libelle || !form.montant) {
      toast.error('Veuillez remplir les champs obligatoires')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('expenses').insert({
        school_id:      schoolId,
        categorie:      form.categorie,
        libelle:        form.libelle,
        montant:        parseFloat(form.montant),
        date_depense:   form.date_depense,
        mode_paiement:  form.mode_paiement,
        note:           form.note || null,
        enregistre_par: profile.id,
        statut:         'valide',
      })

      if (error) throw error
      toast.success('Dépense enregistrée')
      setModalOpen(false)
      resetForm()
      fetchDepenses()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setForm({
      categorie: 'fournitures', libelle: '', montant: '',
      date_depense: new Date().toISOString().slice(0, 10),
      mode_paiement: 'especes', note: '',
    })
  }

  const depensesFiltrees = filterCategorie
    ? depenses.filter(d => d.categorie === filterCategorie)
    : depenses

  const total = depensesFiltrees.reduce((a, d) => a + (d.montant || 0), 0)

  function getCategorieInfo(cat) {
    return CATEGORIES.find(c => c.value === cat) || CATEGORIES[CATEGORIES.length - 1]
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Dépenses</h1>
            <p className="text-gray-500 text-sm mt-0.5">Suivi des dépenses de l'école</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Nouvelle dépense
          </Button>
        </div>

        {/* Total */}
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            Total {filterCategorie ? `(${getCategorieInfo(filterCategorie).label})` : ''}
          </p>
          <p className="text-3xl font-black text-red-500 mt-1">
            {total.toLocaleString('fr-FR')} <span className="text-sm font-normal text-gray-400">F CFA</span>
          </p>
        </Card>

        {/* Filtres catégories */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategorie('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${!filterCategorie ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Toutes
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setFilterCategorie(c.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${filterCategorie === c.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Liste */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : depensesFiltrees.length === 0 ? (
            <EmptyState icon={TrendingDown} title="Aucune dépense enregistrée" />
          ) : (
            <div className="divide-y divide-gray-50">
              {depensesFiltrees.map(d => {
                const cat = getCategorieInfo(d.categorie)
                const Icon = cat.icon
                return (
                  <div key={d.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                        <Icon size={18} className="text-red-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{d.libelle}</p>
                        <p className="text-xs text-gray-400">
                          {cat.label} · {new Date(d.date_depense).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <p className="font-black text-red-500">
                      -{d.montant?.toLocaleString('fr-FR')} F
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Modal nouvelle dépense */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title="Nouvelle dépense">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
            <select
              value={form.categorie}
              onChange={e => setForm({ ...form, categorie: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <Input
            label="Libellé *"
            placeholder="ex: Facture SENELEC janvier"
            value={form.libelle}
            onChange={e => setForm({ ...form, libelle: e.target.value })}
          />

          <Input
            label="Montant (F CFA) *"
            type="number"
            min="0"
            placeholder="25000"
            value={form.montant}
            onChange={e => setForm({ ...form, montant: e.target.value })}
          />

          <Input
            label="Date *"
            type="date"
            value={form.date_depense}
            onChange={e => setForm({ ...form, date_depense: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
            <select
              value={form.mode_paiement}
              onChange={e => setForm({ ...form, mode_paiement: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MODES_PAIEMENT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <Input
            label="Note (optionnel)"
            placeholder="Détails complémentaires..."
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setModalOpen(false); resetForm() }}>
              Annuler
            </Button>
            <Button className="flex-1" loading={saving} onClick={ajouterDepense}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
