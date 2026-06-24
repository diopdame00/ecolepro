import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import { Wallet, Plus, Search, X, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const MOIS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function PaiementsPage() {
  const { schoolId } = useAuth()
  const { yearId, anneeActive } = useAnneeActive()

  const [paiements, setPaiements]     = useState([])
  const [classes, setClasses]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterClasse, setFilterClasse] = useState('')
  const [onglet, setOnglet]           = useState('tous')  // 'tous' | 'impayes'
  const [modalOpen, setModalOpen]     = useState(false)
  const [saving, setSaving]           = useState(false)

  // Formulaire paiement
  const [enrollmentId, setEnrollmentId] = useState('')
  const [eleveSearch, setEleveSearch]   = useState('')
  const [elevesFound, setElevesFound]   = useState([])
  const [selectedEleve, setSelectedEleve] = useState(null)
  const [typePaiement, setTypePaiement] = useState('scolarite')
  const [moisPaiement, setMoisPaiement] = useState('')
  const [montantDu, setMontantDu]       = useState('')
  const [montantPaye, setMontantPaye]   = useState('')
  const [modePaiement, setModePaiement] = useState('especes')
  const [note, setNote]                 = useState('')

  useEffect(() => {
    if (schoolId && yearId) { fetchPaiements(); fetchClasses() }
  }, [schoolId, yearId])

  // ── Charger les paiements de l'année active ──────────────────
  async function fetchPaiements() {
    setLoading(true)
    const { data, error } = await supabase
      .from('student_payments')
      .select(`
        id, type_paiement, mois, libelle,
        montant_du, montant_paye, solde, statut,
        mode_paiement, numero_recu, created_at,
        enrollments(
          id,
          students(id, prenom, nom, unique_code),
          classes(id, nom)
        )
      `)
      .eq('school_id', schoolId)
      .eq('year_id', yearId)
      .order('created_at', { ascending: false })

    if (error) console.error('fetchPaiements:', error)
    setPaiements(data || [])
    setLoading(false)
  }

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, nom, frais_inscription, frais_scolarite')
      .eq('school_id', schoolId)
      .eq('year_id', yearId)
      .order('nom')
    setClasses(data || [])
  }

  // ── Rechercher un élève pour le modal ───────────────────────
  async function rechercherEleve(q) {
    setEleveSearch(q)
    if (q.length < 2) { setElevesFound([]); return }

    const { data } = await supabase
      .from('enrollments')
      .select('id, students(id, prenom, nom), classes(id, nom, frais_inscription, frais_scolarite)')
      .eq('school_id', schoolId)
      .eq('year_id', yearId)
      .or(`students.prenom.ilike.%${q}%,students.nom.ilike.%${q}%`)
      .limit(8)

    setElevesFound(data || [])
  }

  function choisirEleve(enrollment) {
    setSelectedEleve(enrollment)
    setEnrollmentId(enrollment.id)
    setEleveSearch(`${enrollment.students?.prenom} ${enrollment.students?.nom}`)
    setElevesFound([])
    // Pré-remplir le montant selon le type et la classe
    const classe = enrollment.classes
    if (typePaiement === 'inscription')
      setMontantDu(classe?.frais_inscription?.toString() || '')
    else if (typePaiement === 'scolarite')
      setMontantDu(classe?.frais_scolarite?.toString() || '')
  }

  // ── Enregistrer un paiement ──────────────────────────────────
  async function enregistrerPaiement() {
    if (!enrollmentId) { toast.error('Sélectionnez un élève'); return }
    if (!montantDu || !montantPaye) { toast.error('Renseignez les montants'); return }
    if (typePaiement === 'scolarite' && !moisPaiement) {
      toast.error('Sélectionnez le mois'); return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('enregistrer_paiement', {
        p_enrollment_id: enrollmentId,
        p_type:          typePaiement,
        p_montant_du:    Number(montantDu),
        p_montant_paye:  Number(montantPaye),
        p_mois:          moisPaiement || null,
        p_mode:          modePaiement,
        p_note:          note || null,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast.success(`Paiement enregistré · Reçu ${data.numero_recu}`)
      resetModal()
      fetchPaiements()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  function resetModal() {
    setModalOpen(false)
    setSelectedEleve(null)
    setEnrollmentId('')
    setEleveSearch('')
    setElevesFound([])
    setTypePaiement('scolarite')
    setMoisPaiement('')
    setMontantDu('')
    setMontantPaye('')
    setModePaiement('especes')
    setNote('')
  }

  // ── Filtres ──────────────────────────────────────────────────
  const paiementsFiltres = paiements.filter(p => {
    const nom = `${p.enrollments?.students?.prenom} ${p.enrollments?.students?.nom}`.toLowerCase()
    const matchSearch  = !search || nom.includes(search.toLowerCase())
    const matchClasse  = !filterClasse || p.enrollments?.classes?.id === filterClasse
    const matchOnglet  = onglet === 'tous' || (onglet === 'impayes' && p.statut !== 'complet')
    return matchSearch && matchClasse && matchOnglet
  })

  const totalEncaisse = paiements.reduce((acc, p) => acc + (p.montant_paye || 0), 0)
  const totalSolde    = paiements.reduce((acc, p) => acc + (p.solde || 0), 0)
  const nbImpayes     = paiements.filter(p => p.statut !== 'complet').length

  function statutColor(statut) {
    if (statut === 'complet') return 'bg-green-100 text-green-700'
    if (statut === 'partiel') return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-600'
  }

  function statutLabel(statut) {
    if (statut === 'complet') return 'Payé'
    if (statut === 'partiel') return 'Partiel'
    return 'Impayé'
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Paiements</h1>
            <p className="text-gray-500 text-sm">{paiements.length} paiement(s) · {anneeActive}</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Nouveau paiement
          </Button>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Encaissé</p>
            <p className="text-lg font-black text-green-600">
              {totalEncaisse.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-400">F CFA</span>
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Restant dû</p>
            <p className="text-lg font-black text-red-500">
              {totalSolde.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-400">F CFA</span>
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Impayés</p>
            <p className="text-lg font-black text-amber-600">{nbImpayes}</p>
          </Card>
        </div>

        {/* Onglets + Filtres */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setOnglet('tous')}
            className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all
              ${onglet === 'tous' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
            Tous les paiements
          </button>
          <button onClick={() => setOnglet('impayes')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all
              ${onglet === 'impayes' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}>
            <AlertCircle size={13} /> Impayés du mois
          </button>
        </div>

        <Card className="p-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-xl px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input placeholder="Rechercher un élève…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent flex-1 text-sm outline-none" />
              {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
            </div>
            <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </Card>

        {/* Liste paiements */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">{paiementsFiltres.length} résultat(s)</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : paiementsFiltres.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucun paiement" description="Aucun résultat pour ces filtres" />
          ) : (
            <div className="divide-y divide-gray-50">
              {paiementsFiltres.map(p => (
                <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">
                        {p.enrollments?.students?.prenom} {p.enrollments?.students?.nom}
                      </p>
                      <Badge color="blue" className="text-xs">{p.enrollments?.classes?.nom}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.libelle}
                      {p.numero_recu && ` · ${p.numero_recu}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-sm text-gray-900">
                        {(p.montant_paye || 0).toLocaleString('fr-FR')} F
                      </p>
                      {p.solde > 0 && (
                        <p className="text-xs text-red-500">
                          Reste : {p.solde.toLocaleString('fr-FR')} F
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statutColor(p.statut)}`}>
                      {statutLabel(p.statut)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modal nouveau paiement */}
      <Modal isOpen={modalOpen} onClose={resetModal} title="Nouveau paiement">
        <div className="space-y-4">

          {/* Recherche élève */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Élève *</label>
            <input
              value={eleveSearch}
              onChange={e => rechercherEleve(e.target.value)}
              placeholder="Nom ou prénom de l'élève…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {elevesFound.length > 0 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {elevesFound.map(e => (
                  <button key={e.id} onClick={() => choisirEleve(e)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {e.students?.prenom} {e.students?.nom}
                    </span>
                    <span className="text-xs text-gray-400">{e.classes?.nom}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type paiement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <div className="flex gap-2">
              {[
                { value: 'inscription', label: 'Inscription' },
                { value: 'scolarite',  label: 'Mensualité' },
                { value: 'autre',      label: 'Autre' },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => {
                  setTypePaiement(value)
                  if (selectedEleve) {
                    const c = selectedEleve.classes
                    if (value === 'inscription') setMontantDu(c?.frais_inscription?.toString() || '')
                    else if (value === 'scolarite') setMontantDu(c?.frais_scolarite?.toString() || '')
                    else setMontantDu('')
                  }
                }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                    ${typePaiement === value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mois (si mensualité) */}
          {typePaiement === 'scolarite' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mois *</label>
              <select value={moisPaiement} onChange={e => setMoisPaiement(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Sélectionner le mois</option>
                {MOIS.map((m, i) => <option key={m} value={m}>{MOIS_LABELS[i]}</option>)}
              </select>
            </div>
          )}

          {/* Montants */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant dû (F CFA) *</label>
              <input type="number" value={montantDu} onChange={e => setMontantDu(e.target.value)}
                placeholder="Ex: 15000"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant payé (F CFA) *</label>
              <input type="number" value={montantPaye} onChange={e => setMontantPaye(e.target.value)}
                placeholder="Ex: 15000"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          {/* Mode paiement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
            <select value={modePaiement} onChange={e => setModePaiement(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="especes">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement</option>
              <option value="cheque">Chèque</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Remarque sur ce paiement…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={resetModal}>Annuler</Button>
            <Button className="flex-1" loading={saving} onClick={enregistrerPaiement}>
              <CheckCircle size={15} /> Enregistrer
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
