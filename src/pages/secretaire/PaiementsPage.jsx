import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import {
  Wallet, Plus, Search, CheckCircle, AlertCircle,
  ChevronRight, X, Users, BookOpen, Calendar, Zap,
  AlertTriangle, Filter
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Constantes ────────────────────────────────────────────────
const STATUT_COLORS = { complet: 'green', partiel: 'yellow', en_attente: 'red', annule: 'gray' }
const STATUT_LABELS = { complet: 'Payé', partiel: 'Partiel', en_attente: 'À payer', annule: 'Annulé' }
const MODES_PAIEMENT = [
  { value: 'especes',      label: 'Espèces' },
  { value: 'virement',     label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cheque',       label: 'Chèque' },
  { value: 'autre',        label: 'Autre' },
]
const MOIS_LABELS = {
  '01': 'Janvier',   '02': 'Février',  '03': 'Mars',      '04': 'Avril',
  '05': 'Mai',       '06': 'Juin',     '07': 'Juillet',   '08': 'Août',
  '09': 'Septembre', '10': 'Octobre',  '11': 'Novembre',  '12': 'Décembre',
}
const MOIS_OPTIONS = Object.entries(MOIS_LABELS).map(([v, l]) => ({ value: v, label: l }))

function formatFCFA(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('fr-FR') + ' F'
}

// ── Étapes du circuit rapide ──────────────────────────────────
// Étape 1 : Choisir la classe
// Étape 2 : Rechercher et sélectionner l'élève
// Étape 3 : Choisir le type (inscription ou mensualité) + mode + mois
// Étape 4 : Confirmation et validation

// ════════════════════════════════════════════════════════════════
export default function PaiementsPage() {
  const { schoolId } = useAuth()

  const [paiements, setPaiements] = useState([])
  const [classes, setClasses]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [activeVue, setActiveVue] = useState('liste') // 'liste' | 'impayes'

  // Filtres liste
  const [filterClasse, setFilterClasse] = useState('')
  const [filterStatut, setFilterStatut] = useState('')
  const [search, setSearch]             = useState('')

  // Impayés
  const [impayesClasse, setImpayesClasse]   = useState('')
  const [impayesMois, setImpayesMois]       = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [impayesAnnee, setImpayesAnnee]     = useState(String(new Date().getFullYear()))
  const [elevesImpayes, setElevesImpayes]   = useState([])
  const [loadingImpayes, setLoadingImpayes] = useState(false)

  // ── Circuit rapide (état étape par étape) ─────────────────
  const [step, setStep]                 = useState(1) // 1,2,3,4
  const [selectedClasse, setSelectedClasse] = useState(null)
  const [eleveSearch, setEleveSearch]   = useState('')
  const [elevesClasse, setElevesClasse] = useState([])
  const [loadingEleves, setLoadingEleves] = useState(false)
  const [selectedEleve, setSelectedEleve] = useState(null)
  const [typePaiement, setTypePaiement] = useState('scolarite') // 'scolarite' | 'inscription'
  const [modePaiement, setModePaiement] = useState('especes')
  const [moisPaiement, setMoisPaiement] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [anneePaiement, setAnneePaiement] = useState(String(new Date().getFullYear()))
  const [montantManuel, setMontantManuel] = useState('')    // override si besoin
  const [montantPayeManuel, setMontantPayeManuel] = useState('') // paiement partiel
  const [note, setNote]                 = useState('')

  const searchInputRef = useRef(null)

  useEffect(() => {
    if (schoolId) { fetchPaiements(); fetchClasses() }
  }, [schoolId])

  // Focus sur le champ de recherche quand on passe à l'étape 2
  useEffect(() => {
    if (step === 2 && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [step])

  // Recherche live des élèves quand on tape
  useEffect(() => {
    if (!selectedClasse) return
    const timer = setTimeout(() => fetchElevesClasse(selectedClasse.id, eleveSearch), 200)
    return () => clearTimeout(timer)
  }, [eleveSearch, selectedClasse])

  // Montant auto selon type
  const montantAuto = selectedClasse
    ? (typePaiement === 'inscription'
        ? selectedClasse.frais_inscription
        : selectedClasse.frais_scolarite)
    : null

  const montantDu   = montantManuel   ? Number(montantManuel)   : (montantAuto || 0)
  const montantPaye = montantPayeManuel ? Number(montantPayeManuel) : montantDu

  async function fetchPaiements() {
    const { data } = await supabase
      .from('student_payments')
      .select('*, students(prenom, nom, classes(nom))')
      .eq('students.school_id', schoolId)
      .order('created_at', { ascending: false })
    setPaiements(data || [])
    setLoading(false)
  }

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, nom, annee_scolaire, frais_scolarite, frais_inscription')
      .eq('school_id', schoolId)
      .order('nom')
    setClasses(data || [])
  }

  async function fetchElevesClasse(classeId, q) {
    setLoadingEleves(true)
    try {
      let query = supabase
        .from('students')
        .select('id, prenom, nom, classe_id')
        .eq('school_id', schoolId)
        .eq('classe_id', classeId)
        .order('nom')
      if (q && q.trim().length > 0) {
        query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`)
      }
      const { data, error } = await query.limit(50)
      if (error) { console.error('fetchElevesClasse:', error); setElevesClasse([]); return }
      setElevesClasse(data || [])
    } finally {
      setLoadingEleves(false)
    }
  }

  async function fetchElevesImpayes() {
    if (!impayesClasse) return
    setLoadingImpayes(true)
    try {
      // Récupérer tous les élèves de la classe
      const { data: tousEleves } = await supabase
        .from('students')
        .select('id, prenom, nom')
        .eq('school_id', schoolId)
        .eq('classe_id', impayesClasse)
        .order('nom')

      if (!tousEleves) { setElevesImpayes([]); return }

      // Récupérer ceux qui ont payé ce mois (statut complet)
      const { data: payants } = await supabase
        .from('student_payments')
        .select('student_id')
        .eq('school_id', schoolId)
        .eq('type_paiement', 'scolarite')
        .eq('mois', Number(impayesMois))
        .eq('annee', Number(impayesAnnee))
        .eq('statut', 'complet')

      const idPayants = new Set((payants || []).map(p => p.student_id))
      setElevesImpayes(tousEleves.filter(e => !idPayants.has(e.id)))
    } finally {
      setLoadingImpayes(false)
    }
  }

  function ouvrirModal() {
    setStep(1)
    setSelectedClasse(null)
    setEleveSearch('')
    setElevesClasse([])
    setSelectedEleve(null)
    setTypePaiement('scolarite')
    setModePaiement('especes')
    setMoisPaiement(String(new Date().getMonth() + 1).padStart(2, '0'))
    setAnneePaiement(String(new Date().getFullYear()))
    setMontantManuel('')
    setMontantPayeManuel('')
    setNote('')
    setModalOpen(true)
  }

  function choisirClasse(classe) {
    setSelectedClasse(classe)
    setEleveSearch('')
    setElevesClasse([])
    setStep(2)
    // Charger tous les élèves de la classe
    fetchElevesClasse(classe.id, '')
  }

  function choisirEleve(eleve) {
    setSelectedEleve(eleve)
    setStep(3)
  }

  function retourEtape(n) {
    setStep(n)
    if (n === 2) {
      setSelectedEleve(null)
    }
    if (n === 1) {
      setSelectedClasse(null)
      setSelectedEleve(null)
    }
  }

  async function enregistrerPaiement() {
    if (!selectedEleve || !montantDu) {
      toast.error('Données incomplètes')
      return
    }
    const due   = montantDu
    const payed = montantPaye
    const statut = payed >= due ? 'complet' : payed > 0 ? 'partiel' : 'en_attente'

    const moisLabel = MOIS_LABELS[moisPaiement] || moisPaiement
    const libelle = typePaiement === 'inscription'
      ? `Frais d'inscription ${anneePaiement}`
      : `Scolarité — ${moisLabel} ${anneePaiement}`

    setSaving(true)
    try {
      // ── Vérification doublon ─────────────────────────────
      let doublon = null
      if (typePaiement === 'inscription') {
        // Un seul frais d'inscription par élève et par année
        const { data } = await supabase
          .from('student_payments')
          .select('id')
          .eq('student_id', selectedEleve.id)
          .eq('type_paiement', 'inscription')
          .eq('annee', Number(anneePaiement))
          .limit(1)
        doublon = data?.length > 0
          ? `${selectedEleve.prenom} ${selectedEleve.nom} a déjà des frais d'inscription enregistrés pour ${anneePaiement}`
          : null
      } else {
        // Une seule mensualité par élève, par mois et par année
        const { data } = await supabase
          .from('student_payments')
          .select('id')
          .eq('student_id', selectedEleve.id)
          .eq('type_paiement', 'scolarite')
          .eq('mois', Number(moisPaiement))
          .eq('annee', Number(anneePaiement))
          .limit(1)
        doublon = data?.length > 0
          ? `${selectedEleve.prenom} ${selectedEleve.nom} a déjà un paiement enregistré pour ${moisLabel} ${anneePaiement}`
          : null
      }

      if (doublon) {
        toast.error(doublon)
        setSaving(false)
        return
      }
      // ────────────────────────────────────────────────────
      const { error } = await supabase.from('student_payments').insert({
        student_id:    selectedEleve.id,
        libelle,
        montant_du:    due,
        montant_paye:  payed,
        statut,
        mode_paiement: modePaiement,
        mois:          Number(moisPaiement),
        annee:         Number(anneePaiement),
        type_paiement: typePaiement,
        school_id:     schoolId,
        note:          note || null,
      })
      if (error) throw error
      toast.success(`Paiement enregistré — ${selectedEleve.prenom} ${selectedEleve.nom}`)
      setModalOpen(false)
      fetchPaiements()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Filtres liste ─────────────────────────────────────────
  const paiementsFiltres = paiements.filter(p => {
    const nom = `${p.students?.prenom} ${p.students?.nom}`.toLowerCase()
    const classe = p.students?.classes?.nom || ''
    if (filterStatut && p.statut !== filterStatut) return false
    if (filterClasse && classe !== filterClasse) return false
    if (search && !nom.includes(search.toLowerCase())) return false
    return true
  })

  const totalFiltre = paiementsFiltres.reduce((acc, p) => acc + (p.montant_paye || 0), 0)

  // ── Breadcrumb étape ──────────────────────────────────────
  function BreadcrumbEtapes() {
    const etapes = [
      { n: 1, label: selectedClasse ? selectedClasse.nom : 'Classe' },
      { n: 2, label: selectedEleve ? `${selectedEleve.prenom} ${selectedEleve.nom}` : 'Élève' },
      { n: 3, label: 'Paiement' },
    ]
    return (
      <div className="flex items-center gap-1 text-xs mb-5 flex-wrap">
        {etapes.map((e, i) => (
          <span key={e.n} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
            <button
              onClick={() => step > e.n ? retourEtape(e.n) : undefined}
              disabled={step <= e.n}
              className={`px-2 py-1 rounded-md font-semibold transition-colors
                ${step === e.n
                  ? 'bg-primary-100 text-primary-700'
                  : step > e.n
                    ? 'text-primary-600 hover:bg-primary-50 cursor-pointer'
                    : 'text-gray-300 cursor-default'}`}>
              {e.label}
            </button>
          </span>
        ))}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Paiements</h1>
            <p className="text-gray-500 text-sm">{paiements.length} paiement(s) enregistré(s)</p>
          </div>
          <Button onClick={ouvrirModal}>
            <Plus size={16} /> Nouveau paiement
          </Button>
        </div>

        {/* Onglets Vue */}
        <div className="flex bg-white rounded-xl shadow-sm p-1 gap-1 w-fit">
          <button
            onClick={() => setActiveVue('liste')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeVue === 'liste' ? 'bg-primary-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Wallet size={14} /> Tous les paiements
          </button>
          <button
            onClick={() => setActiveVue('impayes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeVue === 'impayes' ? 'bg-red-500 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <AlertTriangle size={14} /> Impayés du mois
          </button>
        </div>

        {/* ── VUE : LISTE DES PAIEMENTS ── */}
        {activeVue === 'liste' && (<>
        {/* Filtres */}
        <Card className="p-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Rechercher un élève…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Tous les statuts</option>
              {Object.entries(STATUT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {(search || filterClasse || filterStatut) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <span>{paiementsFiltres.length} résultat(s) · Total encaissé : <strong>{formatFCFA(totalFiltre)}</strong></span>
              <button onClick={() => { setSearch(''); setFilterClasse(''); setFilterStatut('') }}
                className="ml-auto text-primary-600 hover:underline">Réinitialiser</button>
            </div>
          )}
        </Card>

        {/* Liste des paiements */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paiementsFiltres.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="Aucun paiement"
              description="Enregistrez le premier paiement"
              action={<Button onClick={ouvrirModal}><Plus size={16} /> Enregistrer</Button>} />
          </Card>
        ) : (
          <div className="space-y-2">
            {paiementsFiltres.map(p => (
              <Card key={p.id} className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">
                        {p.students?.prenom} {p.students?.nom}
                      </span>
                      <Badge color="gray" className="text-xs">{p.students?.classes?.nom}</Badge>
                      <Badge color={STATUT_COLORS[p.statut]}>{STATUT_LABELS[p.statut]}</Badge>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5 truncate">{p.libelle}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-gray-900">{formatFCFA(p.montant_paye)}</div>
                    {p.montant_du !== p.montant_paye && (
                      <div className="text-xs text-gray-400">sur {formatFCFA(p.montant_du)}</div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        </>)}

        {/* ── VUE : IMPAYÉS DU MOIS ── */}
        {activeVue === 'impayes' && (
          <div className="space-y-4">

            {/* Filtres impayés */}
            <Card className="p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Filter size={14} /> Sélectionner la classe et le mois
              </p>
              <div className="flex gap-3 flex-wrap">
                <select
                  value={impayesClasse}
                  onChange={e => setImpayesClasse(e.target.value)}
                  className="flex-1 min-w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  <option value="">Choisir une classe…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
                <select
                  value={impayesMois}
                  onChange={e => setImpayesMois(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  {MOIS_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select
                  value={impayesAnnee}
                  onChange={e => setImpayesAnnee(e.target.value)}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <Button
                  onClick={fetchElevesImpayes}
                  disabled={!impayesClasse}
                  loading={loadingImpayes}
                  className="bg-red-500 hover:bg-red-600 text-white border-0"
                >
                  <Search size={14} /> Voir les impayés
                </Button>
              </div>
            </Card>

            {/* Résultats */}
            {loadingImpayes ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-red-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : elevesImpayes.length === 0 && impayesClasse ? (
              <Card className="p-8 text-center">
                <CheckCircle size={36} className="mx-auto mb-3 text-green-400" />
                <p className="font-bold text-green-600">Tous les élèves ont payé !</p>
                <p className="text-sm text-gray-400 mt-1">
                  {MOIS_LABELS[impayesMois]} {impayesAnnee} — aucun impayé dans cette classe
                </p>
              </Card>
            ) : elevesImpayes.length > 0 ? (
              <>
                <div className="flex items-center gap-2 px-1">
                  <AlertTriangle size={15} className="text-red-500" />
                  <span className="text-sm font-bold text-red-600">
                    {elevesImpayes.length} élève(s) n'ont pas payé — {MOIS_LABELS[impayesMois]} {impayesAnnee}
                  </span>
                </div>
                <div className="space-y-2">
                  {elevesImpayes.map(e => (
                    <Card key={e.id} className="p-4 border-l-4 border-l-red-400">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center font-bold text-red-600 text-sm shrink-0">
                            {e.prenom?.[0]}{e.nom?.[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{e.prenom} {e.nom}</p>
                            <p className="text-xs text-red-400">Mensualité non réglée</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            const classe = classes.find(c => c.id === impayesClasse)
                            setSelectedClasse(classe)
                            setSelectedEleve(e)
                            setTypePaiement('scolarite')
                            setMoisPaiement(impayesMois)
                            setAnneePaiement(impayesAnnee)
                            setStep(3)
                            setModalOpen(true)
                          }}
                        >
                          Encaisser
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Card className="p-8 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sélectionnez une classe et cliquez sur "Voir les impayés"</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          MODALE CIRCUIT RAPIDE
      ════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouveau paiement"
        size="lg"
      >
        <BreadcrumbEtapes />

        {/* ── ÉTAPE 1 : Choisir la classe ── */}
        {step === 1 && (
          <div>
            <p className="text-sm text-gray-500 mb-4">Sélectionnez la classe de l'élève</p>
            {classes.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                Aucune classe configurée
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {classes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => choisirClasse(c)}
                    className="group flex flex-col items-start gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
                  >
                    <div className="w-10 h-10 bg-primary-100 group-hover:bg-primary-200 rounded-xl flex items-center justify-center font-black text-primary-700 text-base transition-colors">
                      {c.nom?.replace(/[^A-Za-z]/g, '').slice(-1) || c.nom?.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{c.nom}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{c.annee_scolaire}</div>
                      {(c.frais_scolarite || c.frais_inscription) && (
                        <div className="text-xs text-primary-600 mt-1 font-medium">
                          {c.frais_scolarite ? formatFCFA(c.frais_scolarite) + '/mois' : ''}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-primary-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ÉTAPE 2 : Rechercher l'élève ── */}
        {step === 2 && (
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen size={14} className="text-primary-600" />
                <span className="text-sm font-semibold text-primary-700">{selectedClasse?.nom}</span>
                {(selectedClasse?.frais_scolarite || selectedClasse?.frais_inscription) && (
                  <span className="ml-auto text-xs text-gray-400">
                    Scolarité : <strong>{formatFCFA(selectedClasse.frais_scolarite)}</strong>
                    {selectedClasse.frais_inscription && <> · Inscription : <strong>{formatFCFA(selectedClasse.frais_inscription)}</strong></>}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Rechercher par nom, prénom ou matricule…"
                  value={eleveSearch}
                  onChange={e => setEleveSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-0 bg-white"
                />
                {eleveSearch && (
                  <button onClick={() => setEleveSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {loadingEleves ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : elevesClasse.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {eleveSearch ? 'Aucun élève trouvé' : 'Aucun élève dans cette classe'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {elevesClasse.map(eleve => (
                  <button
                    key={eleve.id}
                    onClick={() => choisirEleve(eleve)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary-300 hover:bg-primary-50 transition-all text-left group"
                  >
                    <div className="w-9 h-9 bg-gray-100 group-hover:bg-primary-100 rounded-full flex items-center justify-center font-bold text-gray-600 group-hover:text-primary-700 text-sm transition-colors shrink-0">
                      {eleve.prenom?.[0]}{eleve.nom?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">
                        {eleve.prenom} {eleve.nom}
                      </div>
                      {eleve.matricule && (
                        <div className="text-xs text-gray-400">{eleve.matricule}</div>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-primary-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ÉTAPE 3 : Type de paiement + détails ── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Résumé élève */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center font-bold text-primary-700 text-sm shrink-0">
                {selectedEleve?.prenom?.[0]}{selectedEleve?.nom?.[0]}
              </div>
              <div>
                <div className="font-bold text-gray-900">{selectedEleve?.prenom} {selectedEleve?.nom}</div>
                <div className="text-xs text-gray-500">{selectedClasse?.nom} · {selectedClasse?.annee_scolaire}</div>
              </div>
            </div>

            {/* Type : Inscription ou Mensualité */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Type de paiement *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    value: 'scolarite',
                    label: 'Mensualité',
                    sublabel: selectedClasse?.frais_scolarite
                      ? formatFCFA(selectedClasse.frais_scolarite)
                      : 'Montant non configuré',
                    icon: Calendar,
                    hasAmount: !!selectedClasse?.frais_scolarite,
                  },
                  {
                    value: 'inscription',
                    label: 'Inscription',
                    sublabel: selectedClasse?.frais_inscription
                      ? formatFCFA(selectedClasse.frais_inscription)
                      : 'Montant non configuré',
                    icon: BookOpen,
                    hasAmount: !!selectedClasse?.frais_inscription,
                  },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setTypePaiement(t.value); setMontantManuel(''); setMontantPayeManuel('') }}
                    className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left
                      ${typePaiement === t.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center
                      ${typePaiement === t.value ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <t.icon size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{t.label}</div>
                      <div className={`text-xs mt-0.5 font-semibold
                        ${t.hasAmount
                          ? typePaiement === t.value ? 'text-primary-600' : 'text-green-600'
                          : 'text-gray-400'}`}>
                        {t.sublabel}
                        {t.hasAmount && <Zap size={11} className="inline ml-1" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Période (mois/année) - seulement pour mensualité */}
            {typePaiement === 'scolarite' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar size={13} className="inline mr-1" />
                  Mois concerné
                </label>
                <div className="flex gap-2">
                  <select value={moisPaiement} onChange={e => setMoisPaiement(e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                    {MOIS_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={anneePaiement} onChange={e => setAnneePaiement(e.target.value)}
                    className="w-28 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Montant */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">Montant (F CFA)</label>
                {montantAuto > 0 && !montantManuel && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Zap size={11} /> Auto-rempli depuis la classe
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Montant dû</label>
                  <input
                    type="number" min="0" step="500"
                    placeholder={montantAuto ? String(montantAuto) : 'Saisir…'}
                    value={montantManuel}
                    onChange={e => { setMontantManuel(e.target.value); setMontantPayeManuel('') }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {!montantManuel && montantAuto > 0 && (
                    <div className="mt-1 text-xs text-primary-700 font-semibold">{formatFCFA(montantAuto)}</div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Montant encaissé</label>
                  <input
                    type="number" min="0" step="500"
                    placeholder={String(montantDu || '')}
                    value={montantPayeManuel}
                    onChange={e => setMontantPayeManuel(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {!montantPayeManuel && montantDu > 0 && (
                    <div className="mt-1 text-xs text-gray-400">= {formatFCFA(montantDu)} par défaut</div>
                  )}
                </div>
              </div>

              {/* Statut calculé */}
              {montantDu > 0 && (
                <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
                  ${montantPaye >= montantDu
                    ? 'bg-green-50 text-green-700'
                    : montantPaye > 0
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-700'}`}>
                  {montantPaye >= montantDu
                    ? <><CheckCircle size={14} /> Paiement complet — {formatFCFA(montantPaye)}</>
                    : montantPaye > 0
                      ? <><AlertCircle size={14} /> Partiel — {formatFCFA(montantPaye)} sur {formatFCFA(montantDu)} ({(montantPaye/montantDu*100).toFixed(0)}%)</>
                      : <><AlertCircle size={14} /> À payer — {formatFCFA(montantDu)}</>
                  }
                </div>
              )}
            </div>

            {/* Mode de paiement */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode de paiement</label>
              <div className="flex flex-wrap gap-2">
                {MODES_PAIEMENT.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setModePaiement(m.value)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                      ${modePaiement === m.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Note optionnelle */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Note (optionnel)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="Observations…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => retourEtape(2)}>
                ← Retour
              </Button>
              <Button
                className="flex-2"
                loading={saving}
                disabled={!montantDu}
                onClick={enregistrerPaiement}
              >
                <CheckCircle size={16} />
                Valider le paiement
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}