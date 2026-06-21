import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import {
  BookOpen, Plus, Trash2, Users, Settings,
  X, ChevronLeft, GraduationCap, Layers, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { SelecteurAnnee, BandeauArchive } from '../../components/shared/SelecteurAnnee'

// ── Niveaux par cycle ────────────────────────────────────────
const NIVEAUX_PAR_CYCLE = {
  prescolaire:  ['Petite Section', 'Moyenne Section', 'Grande Section'],
  primaire:     ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
  college:      ['6ème', '5ème', '4ème', '3ème'],
  lycee:        ['2nde L', '2nde S', '1ère L1', '1ère L2', '1ère S1', '1ère S2', 'Tle L1', 'Tle L2', 'Tle S1', 'Tle S2'],
  franco_arabe: ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème'],
}

// ── Structure lycée par série ─────────────────────────────────
// Série → niveaux disponibles avec leurs labels de groupement
const LYCEE_SERIES = {
  S: {
    label: 'Série Scientifique',
    color: 'blue',
    emoji: '🔬',
    niveaux: [
      { groupe: 'Seconde', options: ['2nde S'] },
      { groupe: 'Première', options: ['1ère S1', '1ère S2'] },
      { groupe: 'Terminale', options: ['Tle S1', 'Tle S2'] },
    ],
  },
  L: {
    label: 'Série Littéraire',
    color: 'purple',
    emoji: '📚',
    niveaux: [
      { groupe: 'Seconde', options: ['2nde L'] },
      { groupe: 'Première', options: ['1ère L1', '1ère L2'] },
      { groupe: 'Terminale', options: ['Tle L1', 'Tle L2'] },
    ],
  },
}

const VARIANTES    = ['A', 'B', 'C', 'D', 'E']
const CYCLE_LABELS = {
  prescolaire: 'Préscolaire', primaire: 'Primaire',
  college: 'Collège', lycee: 'Lycée', franco_arabe: 'Franco-Arabe',
}

function anneeEnCours() {
  const y = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1
  return `${y}/${y + 1}`
}

// ══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function ClassesPage() {
  const { schoolId, school } = useAuth()
  const cycle = school?.type_etablissement || 'college'
  const { anneeActive, anneesDispos, anneeSelectionnee, setAnneeSelectionnee, enModeArchive } = useAnneeActive()

  const [classes, setClasses]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [configClasse, setConfigClasse] = useState(null) // classe en cours de config

  // Formulaire création
  const [selectedNiveau, setSelectedNiveau]     = useState('')
  const [selectedVariante, setSelectedVariante] = useState('A')
  const [annee, setAnnee]                       = useState(anneeEnCours())
  // Lycée uniquement : série ('S' | 'L' | '')
  const [selectedSerie, setSelectedSerie]       = useState('')

  const niveaux = NIVEAUX_PAR_CYCLE[cycle] || NIVEAUX_PAR_CYCLE.college
  const isLycee = cycle === 'lycee'
  const nomClasse = selectedNiveau ? `${selectedNiveau} ${selectedVariante}` : ''

  useEffect(() => { if (schoolId && anneeActive) fetchClasses() }, [schoolId, anneeActive, anneeSelectionnee])

  async function fetchClasses() {
    // Année à afficher : active par défaut, archive si sélectionnée
    const annee = anneeSelectionnee ?? anneeActive
    if (!annee) return
    const { data } = await supabase
      .from('classes')
      .select('*, students(count)')
      .eq('school_id', schoolId)
      .eq('annee_scolaire', annee)
      .order('nom')
    setClasses(data || [])
    setLoading(false)
  }

  function ouvrirModal(niveauPrefill = '') {
    setSelectedSerie('')
    setSelectedNiveau(niveauPrefill || (isLycee ? '' : (niveaux[0] || '')))
    setSelectedVariante('A')
    setAnnee(anneeEnCours())
    setModalOpen(true)
  }

  async function creerClasse() {
    if (!selectedNiveau || !nomClasse.trim()) { toast.error('Choisissez un niveau'); return }
    if (classes.find(c => c.nom === nomClasse && c.annee_scolaire === annee)) {
      toast.error(`La classe ${nomClasse} existe déjà`); return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('classes').insert({
        nom: nomClasse, annee_scolaire: annee, niveau: selectedNiveau, school_id: schoolId,
      })
      if (error) throw error
      toast.success(`Classe ${nomClasse} créée !`)
      setModalOpen(false)
      fetchClasses()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function supprimerClasse(id, nom) {
    if (!confirm(`Supprimer la classe ${nom} ?`)) return
    const { error } = await supabase.from('classes').delete().eq('id', id)
    if (error) { toast.error('Erreur suppression'); return }
    toast.success('Classe supprimée')
    fetchClasses()
  }

  // Grouper par niveau
  const classesByNiveau = {}
  classes.forEach(c => {
    const key = c.niveau || c.nom
    if (!classesByNiveau[key]) classesByNiveau[key] = []
    classesByNiveau[key].push(c)
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Classes</h1>
            <SelecteurAnnee anneeActive={anneeActive} anneesDispos={anneesDispos} anneeSelectionnee={anneeSelectionnee} setAnneeSelectionnee={setAnneeSelectionnee} className="mt-1" />
            <p className="text-gray-500 text-sm">
              {classes.length} classe(s) · Cycle {CYCLE_LABELS[cycle] || cycle}
            </p>
          </div>
          {!enModeArchive && (
            <Button onClick={() => ouvrirModal()}>
              <Plus size={16} /> Nouvelle classe
            </Button>
          )}
        </div>

        {/* Contenu */}
        {enModeArchive && <BandeauArchive annee={anneeSelectionnee} onRetour={() => setAnneeSelectionnee(null)} />}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <Card>
            <EmptyState icon={BookOpen} title="Aucune classe créée"
              description={`Créez vos classes ${CYCLE_LABELS[cycle] || ''} pour commencer`}
              action={<Button onClick={() => ouvrirModal()}><Plus size={16} /> Créer une classe</Button>} />
          </Card>
        ) : (
          <div className="space-y-5">
            {niveaux.filter(n => classesByNiveau[n]).map(niveau => (
              <div key={niveau}>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  {niveau}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {classesByNiveau[niveau]
                    ?.sort((a, b) => a.nom.localeCompare(b.nom))
                    .map(classe => (
                      <Card key={classe.id} className="p-4 hover:shadow-md transition-shadow relative">
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center font-black text-primary-700 text-base">
                            {classe.nom?.replace(/[^A-Za-z]/g, '').slice(-1) || '?'}
                          </div>
                          <div className="flex items-center gap-1">
                            {/* ⚙️ Bouton configuration */}
                            <button
                              onClick={() => setConfigClasse(classe)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-300 hover:text-primary-500 transition-colors"
                              title="Configurer la classe"
                            >
                              <Settings size={14} />
                            </button>
                            <button
                              onClick={() => supprimerClasse(classe.id, classe.nom)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-200 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-gray-900">{classe.nom}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge color="blue" className="text-xs">{classe.annee_scolaire}</Badge>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <Users size={11} />
                          {classe.students?.[0]?.count || 0} élève(s)
                        </div>
                      </Card>
                    ))}
                  {!enModeArchive && <button
                    onClick={() => ouvrirModal(niveau)}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50 transition-all"
                  >
                    <Plus size={20} />
                    <span className="text-xs font-medium">Ajouter {niveau}</span>
                  </button>}
                </div>
              </div>
            ))}

            {/* Classes sans niveau reconnu */}
            {classes.filter(c => !niveaux.includes(c.niveau || '')).length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">Autres</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {classes.filter(c => !niveaux.includes(c.niveau || '')).map(classe => (
                    <Card key={classe.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-500 text-base">
                          {classe.nom?.slice(0, 2)}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setConfigClasse(classe)}
                            className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-300 hover:text-primary-500 transition-colors">
                            <Settings size={14} />
                          </button>
                          <button onClick={() => supprimerClasse(classe.id, classe.nom)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-200 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-gray-900">{classe.nom}</h3>
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                        <Users size={11} />{classe.students?.[0]?.count || 0} élève(s)
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modale création ── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Créer une classe">
        <div className="space-y-5">

          {/* Aperçu nom classe */}
          {nomClasse && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
              <p className="text-xs text-primary-600 font-medium uppercase tracking-wide mb-1">Classe qui sera créée</p>
              <p className="text-3xl font-black text-primary-700">{nomClasse}</p>
            </div>
          )}

          {/* ══ LYCÉE : sélection en 2 étapes ══ */}
          {isLycee ? (
            <>
              {/* Étape 1 : Série */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Série *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(LYCEE_SERIES).map(([key, serie]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedSerie(key)
                        setSelectedNiveau('') // reset niveau quand on change de série
                        setSelectedVariante('A')
                      }}
                      className={`py-4 px-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5
                        ${selectedSerie === key
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      <span className="text-2xl">{serie.emoji}</span>
                      <span className="text-sm font-bold">{serie.label}</span>
                      <div className="flex flex-wrap justify-center gap-1 mt-1">
                        {serie.niveaux.flatMap(n => n.options).map(opt => (
                          <span key={opt}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium
                              ${selectedSerie === key
                                ? 'bg-primary-100 text-primary-700'
                                : 'bg-gray-100 text-gray-500'}`}>
                            {opt}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Étape 2 : Niveau (affiché seulement si série choisie) */}
              {selectedSerie && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Niveau *
                  </label>
                  <div className="space-y-3">
                    {LYCEE_SERIES[selectedSerie].niveaux.map(({ groupe, options }) => (
                      <div key={groupe}>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                          {groupe}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {options.map(opt => (
                            <button
                              key={opt}
                              onClick={() => setSelectedNiveau(opt)}
                              className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all
                                ${selectedNiveau === opt
                                  ? 'border-primary-500 bg-primary-500 text-white'
                                  : 'border-gray-200 text-gray-600 hover:border-primary-300 hover:bg-primary-50'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section (variante : A, B, C…) — affiché si niveau choisi */}
              {selectedNiveau && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Section (optionnel — pour distinguer plusieurs classes du même niveau)
                  </label>
                  <div className="flex gap-2">
                    {VARIANTES.map(v => (
                      <button key={v} onClick={() => setSelectedVariante(v)}
                        className={`w-12 h-12 rounded-xl text-sm font-black border-2 transition-all
                          ${selectedVariante === v
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Ex : deux classes de Tle S1 → "Tle S1 A" et "Tle S1 B"
                  </p>
                </div>
              )}
            </>
          ) : (
            /* ══ COLLÈGE / PRIMAIRE / etc. : logique originale ══ */
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Niveau *</label>
                <div className="grid grid-cols-2 gap-2">
                  {niveaux.map(n => (
                    <button key={n} onClick={() => setSelectedNiveau(n)}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left
                        ${selectedNiveau === n
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Section *</label>
                <div className="flex gap-2">
                  {VARIANTES.map(v => (
                    <button key={v} onClick={() => setSelectedVariante(v)}
                      className={`w-12 h-12 rounded-xl text-sm font-black border-2 transition-all
                        ${selectedVariante === v
                          ? 'border-primary-500 bg-primary-500 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Année scolaire — commun à tous */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Année scolaire *</label>
            <select value={annee} onChange={e => setAnnee(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {[-1, 0, 1].map(offset => {
                const y = new Date().getFullYear() + offset
                const val = `${y}/${y + 1}`
                return <option key={val} value={val}>{val}</option>
              })}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              onClick={creerClasse}
              disabled={!selectedNiveau || (isLycee && !selectedSerie)}
            >
              <Plus size={15} /> Créer {nomClasse}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Drawer configuration classe ── */}
      {configClasse && (
        <ClasseConfigDrawer
          classe={configClasse}
          schoolId={schoolId}
          onClose={() => setConfigClasse(null)}
        />
      )}
    </DashboardLayout>
  )
}

// ══════════════════════════════════════════════════════════════
// DRAWER : Configuration d'une classe
// ══════════════════════════════════════════════════════════════
function ClasseConfigDrawer({ classe, schoolId, onClose }) {
  const [onglet, setOnglet] = useState('matieres') // 'matieres' | 'options'

  return (
    <>
      {/* Fond sombre */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      {/* Panneau */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <button onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="font-black text-gray-900 text-lg">{classe.nom}</h2>
            <p className="text-xs text-gray-400">{classe.annee_scolaire}</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 shrink-0">
          {[
            { id: 'matieres', label: 'Matières', icon: GraduationCap },
            { id: 'options',  label: 'Groupes d\'options', icon: Layers },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setOnglet(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-all
                ${onglet === id
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">
          {onglet === 'matieres'
            ? <OngletMatieres classe={classe} schoolId={schoolId} />
            : <OngletOptions  classe={classe} schoolId={schoolId} />
          }
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ONGLET 1 : Matières de la classe
// ══════════════════════════════════════════════════════════════
function OngletMatieres({ classe, schoolId }) {
  const [subjects, setSubjects]           = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [loading, setLoading]             = useState(true)
  const [assignOpen, setAssignOpen]       = useState(false)
  const [assignId, setAssignId]           = useState('')
  const [assignCoef, setAssignCoef]       = useState(1)

  useEffect(() => {
    fetchAll()
  }, [classe.id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: subs }, { data: cs }] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('nom'),
      supabase.from('class_subjects').select('*, subjects(nom)')
        .eq('class_id', classe.id).order('subjects(nom)'),
    ])
    setSubjects(subs || [])
    setClassSubjects(cs || [])
    setLoading(false)
  }

  const dispo = subjects.filter(s => !classSubjects.find(cs => cs.subject_id === s.id))
  const total = classSubjects.reduce((acc, cs) => acc + Number(cs.coefficient), 0)

  async function assigner() {
    if (!assignId) return
    const { error } = await supabase.from('class_subjects').insert({
      class_id: classe.id, subject_id: assignId, coefficient: Number(assignCoef),
    })
    if (error) { toast.error(error.message); return }
    toast.success('Matière assignée !')
    setAssignOpen(false); setAssignId(''); setAssignCoef(1)
    fetchAll()
  }

  async function retirer(id) {
    if (!confirm('Retirer cette matière de la classe ?')) return
    await supabase.from('class_subjects').delete().eq('id', id)
    fetchAll()
  }

  async function updateCoef(id, val) {
    const coef = Math.max(0.5, Math.min(10, Number(val)))
    await supabase.from('class_subjects').update({ coefficient: coef }).eq('id', id)
    fetchAll()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      {/* Bouton assigner */}
      {subjects.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-center">
          Aucune matière dans le catalogue. Allez dans <strong>Configuration → Matières</strong> pour en créer.
        </div>
      ) : (
        <Button size="sm" onClick={() => { setAssignOpen(true); setAssignId(''); setAssignCoef(1) }}
          disabled={dispo.length === 0} className="w-full">
          <Plus size={14} />
          {dispo.length === 0 ? 'Toutes les matières sont assignées' : 'Assigner une matière'}
        </Button>
      )}

      {/* Liste */}
      {classSubjects.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          <GraduationCap size={28} className="mx-auto mb-2 opacity-30" />
          Aucune matière assignée à cette classe
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {classSubjects.map((cs, i) => (
            <div key={cs.id}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="w-6 h-6 bg-primary-100 rounded-md flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                {i + 1}
              </div>
              <span className="flex-1 text-sm font-medium text-gray-900">{cs.subjects?.nom}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">Coef.</span>
                <input type="number" min="0.5" max="10" step="0.5"
                  value={cs.coefficient}
                  onChange={e => updateCoef(cs.id, e.target.value)}
                  className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <button onClick={() => retirer(cs.id)}
                className="p-1 hover:bg-red-50 hover:text-red-400 rounded-lg text-gray-300 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500">Total coefficients</span>
            <span className="text-sm font-black text-primary-700">{total.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Modal assignation */}
      <Modal isOpen={assignOpen} onClose={() => setAssignOpen(false)}
        title={`Assigner une matière à ${classe.nom}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
            <select value={assignId} onChange={e => setAssignId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sélectionner…</option>
              {dispo.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coefficient</label>
            <input type="number" min="0.5" max="10" step="0.5" value={assignCoef}
              onChange={e => setAssignCoef(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button onClick={assigner} disabled={!assignId}><Plus size={15} /> Assigner</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ONGLET 2 : Groupes d'options
// ══════════════════════════════════════════════════════════════
function OngletOptions({ classe, schoolId }) {
  const { school } = useAuth()
  const isLycee = (school?.type_etablissement || '') === 'lycee'

  const [groupes, setGroupes]   = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [choices, setChoices]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [newGroupeNom, setNewGroupeNom]     = useState('')
  const [creatingGroupe, setCreatingGroupe] = useState(false)
  const [activeGroupe, setActiveGroupe]     = useState(null)
  const [addingSubject, setAddingSubject]   = useState(false)
  const [subjectToAdd, setSubjectToAdd]     = useState('')
  // Lycée : coefficients par rang pour la matière en cours d'ajout
  const [coefP1, setCoefP1] = useState(1)
  const [coefP2, setCoefP2] = useState(1)

  useEffect(() => { fetchAll() }, [classe.id])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: g },
      { data: cs },
      { data: st },
      { data: cho },
    ] = await Promise.all([
      supabase.from('subject_option_groups')
        .select('*, group_subjects(*, subjects(nom))')
        .eq('class_id', classe.id).order('nom'),
      supabase.from('class_subjects').select('*, subjects(nom)')
        .eq('class_id', classe.id).order('subjects(nom)'),
      supabase.from('students').select('id, prenom, nom')
        .eq('classe_id', classe.id).order('nom'),
      supabase.from('student_options').select('*')
        .eq('class_id', classe.id),
    ])
    setGroupes(g || [])
    setSubjects(cs || [])
    setStudents(st || [])
    setChoices(cho || [])
    if (!activeGroupe && g?.length > 0) setActiveGroupe(g[0].id)
    setLoading(false)
  }

  async function creerGroupe() {
    if (!newGroupeNom.trim()) return
    setCreatingGroupe(true)
    try {
      const { data, error } = await supabase.from('subject_option_groups').insert({
        nom: newGroupeNom.trim(), class_id: classe.id, school_id: schoolId,
      }).select().single()
      if (error) throw error
      setNewGroupeNom('')
      toast.success('Groupe créé !')
      await fetchAll()
      setActiveGroupe(data.id)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreatingGroupe(false)
    }
  }

  async function supprimerGroupe(id) {
    if (!confirm('Supprimer ce groupe et tous les choix associés ?')) return
    await supabase.from('subject_option_groups').delete().eq('id', id)
    toast.success('Groupe supprimé')
    if (activeGroupe === id) setActiveGroupe(null)
    fetchAll()
  }

  async function ajouterMatiereGroupe() {
    if (!subjectToAdd || !activeGroupe) return
    setAddingSubject(true)
    try {
      const payload = {
        group_id: activeGroupe, subject_id: subjectToAdd, school_id: schoolId,
      }
      if (isLycee) {
        payload.coef_premier_choix  = Number(coefP1) || 1
        payload.coef_deuxieme_choix = Number(coefP2) || 1
      }
      const { error } = await supabase.from('group_subjects').insert(payload)
      if (error) throw error
      setSubjectToAdd(''); setCoefP1(1); setCoefP2(1)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAddingSubject(false)
    }
  }

  async function updateCoefsGroupe(gsId, field, val) {
    const v = Math.max(0.5, Math.min(10, Number(val)))
    await supabase.from('group_subjects').update({ [field]: v }).eq('id', gsId)
    fetchAll()
  }

  async function retirerMatiereGroupe(gsId) {
    await supabase.from('group_subjects').delete().eq('id', gsId)
    fetchAll()
  }

  // Pour le lycée : rang_choix stocké dans student_options
  // Pour le collège : simple présence/absence (rang_choix = 1 toujours)
  async function choisirOption(studentId, groupId, subjectId, rangChoix = 1) {
    await supabase.from('student_options')
      .delete()
      .eq('student_id', studentId)
      .eq('group_id', groupId)
      .eq('subject_id', subjectId)

    if (subjectId) {
      await supabase.from('student_options').insert({
        student_id: studentId,
        group_id:   groupId,
        subject_id: subjectId,
        class_id:   classe.id,
        school_id:  schoolId,
        rang_choix: rangChoix,
      })
    }
    setChoices(prev => {
      const filtered = prev.filter(c => !(
        c.student_id === studentId && c.group_id === groupId && c.subject_id === subjectId
      ))
      if (subjectId) return [...filtered, { student_id: studentId, group_id: groupId, subject_id: subjectId, rang_choix: rangChoix }]
      return filtered
    })
  }

  async function retirerChoix(studentId, groupId, subjectId) {
    await supabase.from('student_options')
      .delete()
      .eq('student_id', studentId)
      .eq('group_id', groupId)
      .eq('subject_id', subjectId)
    setChoices(prev => prev.filter(c => !(
      c.student_id === studentId && c.group_id === groupId && c.subject_id === subjectId
    )))
  }

  // Collège : un seul choix par groupe
  function getChoiceCollege(studentId, groupId) {
    return choices.find(c => c.student_id === studentId && c.group_id === groupId)?.subject_id || null
  }

  // Lycée : liste de tous les choix d'un élève dans un groupe, avec rang
  function getChoicesLycee(studentId, groupId) {
    return choices.filter(c => c.student_id === studentId && c.group_id === groupId)
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const groupeActif    = groupes.find(g => g.id === activeGroupe)
  const matieresGroupe = groupeActif?.group_subjects || []
  const matieresDispo  = subjects.filter(s =>
    !matieresGroupe.find(gs => gs.subject_id === s.subject_id)
  )

  return (
    <div className="p-4 space-y-4">

      {/* ── Créer un groupe ── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Nouveau groupe d'options
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ex: 2ème Langue, Option Scientifique…"
            value={newGroupeNom}
            onChange={e => setNewGroupeNom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && creerGroupe()}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button size="sm" onClick={creerGroupe} loading={creatingGroupe} disabled={!newGroupeNom.trim()}>
            <Plus size={14} /> Créer
          </Button>
        </div>
      </div>

      {groupes.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          <Layers size={28} className="mx-auto mb-2 opacity-30" />
          Aucun groupe d'options. Créez-en un ci-dessus.
        </div>
      ) : (
        <>
          {/* ── Sélecteur de groupe ── */}
          <div className="flex gap-2 flex-wrap">
            {groupes.map(g => (
              <div key={g.id} className="flex items-center">
                <button
                  onClick={() => setActiveGroupe(g.id)}
                  className={`px-3 py-1.5 rounded-l-lg text-sm font-semibold border-2 border-r-0 transition-all
                    ${activeGroupe === g.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {g.nom}
                </button>
                <button
                  onClick={() => supprimerGroupe(g.id)}
                  className={`px-2 py-1.5 rounded-r-lg border-2 transition-all
                    ${activeGroupe === g.id
                      ? 'border-primary-500 bg-primary-50 text-primary-400 hover:text-red-500 hover:bg-red-50 hover:border-red-300'
                      : 'border-gray-200 text-gray-300 hover:border-red-300 hover:bg-red-50 hover:text-red-400'}`}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {groupeActif && (
            <div className="space-y-3">

              {/* ── Matières du groupe ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Matières du groupe « {groupeActif.nom} »
                </label>

                {/* Liste des matières avec coefs lycée */}
                <div className="space-y-2 mb-3">
                  {matieresGroupe.length === 0 ? (
                    <span className="text-xs text-gray-400">Aucune matière dans ce groupe</span>
                  ) : matieresGroupe.map(gs => (
                    <div key={gs.id}
                      className="flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-xl px-3 py-2">
                      <span className="flex-1 text-sm font-semibold text-primary-700">{gs.subjects?.nom}</span>
                      {isLycee ? (
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 whitespace-nowrap">1er choix</span>
                            <input type="number" min="0.5" max="10" step="0.5"
                              value={gs.coef_premier_choix ?? 1}
                              onChange={e => updateCoefsGroupe(gs.id, 'coef_premier_choix', e.target.value)}
                              className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-primary-500" />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 whitespace-nowrap">2ème choix</span>
                            <input type="number" min="0.5" max="10" step="0.5"
                              value={gs.coef_deuxieme_choix ?? 1}
                              onChange={e => updateCoefsGroupe(gs.id, 'coef_deuxieme_choix', e.target.value)}
                              className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-primary-500" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-primary-400 font-medium">Option</span>
                      )}
                      <button onClick={() => retirerMatiereGroupe(gs.id)}
                        className="hover:text-red-500 text-gray-300 transition-colors ml-1">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Ajouter matière */}
                <div className="space-y-2">
                  <select value={subjectToAdd} onChange={e => setSubjectToAdd(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">+ Ajouter une matière au groupe</option>
                    {matieresDispo.map(s => (
                      <option key={s.subject_id} value={s.subject_id}>{s.subjects?.nom}</option>
                    ))}
                  </select>
                  {/* Lycée : saisir les coefs au moment de l'ajout */}
                  {isLycee && subjectToAdd && (
                    <div className="flex items-center gap-3 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <span className="text-blue-600 font-semibold flex-1">Coefficients pour le lycée</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">1er choix</span>
                        <input type="number" min="0.5" max="10" step="0.5" value={coefP1}
                          onChange={e => setCoefP1(e.target.value)}
                          className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-primary-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">2ème choix</span>
                        <input type="number" min="0.5" max="10" step="0.5" value={coefP2}
                          onChange={e => setCoefP2(e.target.value)}
                          className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-primary-500" />
                      </div>
                    </div>
                  )}
                  <Button size="sm" onClick={ajouterMatiereGroupe}
                    loading={addingSubject} disabled={!subjectToAdd} className="w-full">
                    <Plus size={13} /> Ajouter au groupe
                  </Button>
                </div>
              </div>

              {/* ── TABLEAU DE RÉPARTITION ── */}
              {matieresGroupe.length >= 2 && students.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Répartition des élèves
                    {isLycee && (
                      <span className="ml-2 text-blue-500 normal-case font-normal">
                        — Cliquez pour sélectionner : 1er clic = 1er choix · 2ème clic = 2ème choix · 3ème = retirer
                      </span>
                    )}
                  </label>

                  <div className="border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
                    {/* En-têtes */}
                    <div className="grid bg-gray-50 border-b border-gray-100"
                      style={{ gridTemplateColumns: `1fr repeat(${matieresGroupe.length}, auto)` }}>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500">Élève</div>
                      {matieresGroupe.map(gs => (
                        <div key={gs.id}
                          className="px-3 py-2 text-xs font-semibold text-gray-500 text-center whitespace-nowrap">
                          {gs.subjects?.nom}
                          {isLycee && (
                            <div className="flex gap-1 justify-center mt-0.5">
                              <span className="bg-blue-100 text-blue-600 rounded px-1 py-0.5 text-[10px]">
                                C{gs.coef_premier_choix ?? 1}
                              </span>
                              <span className="bg-purple-100 text-purple-600 rounded px-1 py-0.5 text-[10px]">
                                C{gs.coef_deuxieme_choix ?? 1}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Lignes élèves */}
                    {students.map((st, i) => {
                      const choixCollege = !isLycee ? getChoiceCollege(st.id, groupeActif.id) : null
                      const choixLycee   = isLycee  ? getChoicesLycee(st.id, groupeActif.id)  : []

                      return (
                        <div key={st.id}
                          className={`grid items-center ${i > 0 ? 'border-t border-gray-50' : ''}`}
                          style={{ gridTemplateColumns: `1fr repeat(${matieresGroupe.length}, auto)` }}>
                          <div className="px-3 py-2.5 text-sm text-gray-800 font-medium truncate">
                            {st.prenom} {st.nom}
                          </div>

                          {matieresGroupe.map(gs => {
                            if (!isLycee) {
                              /* ── COLLÈGE : coche simple ── */
                              const selected = choixCollege === gs.subject_id
                              return (
                                <div key={gs.id} className="flex justify-center px-3 py-2.5">
                                  <button
                                    onClick={() => {
                                      if (selected) {
                                        retirerChoix(st.id, groupeActif.id, gs.subject_id)
                                      } else {
                                        // Retirer l'ancien choix du groupe puis choisir celui-ci
                                        const ancien = choices.find(c =>
                                          c.student_id === st.id && c.group_id === groupeActif.id
                                        )
                                        if (ancien) retirerChoix(st.id, groupeActif.id, ancien.subject_id)
                                        choisirOption(st.id, groupeActif.id, gs.subject_id, 1)
                                      }
                                    }}
                                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all
                                      ${selected
                                        ? 'bg-primary-500 border-primary-500 text-white'
                                        : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50'}`}>
                                    {selected && <Check size={13} />}
                                  </button>
                                </div>
                              )
                            } else {
                              /* ── LYCÉE : badge rang (1 / 2 / vide) ── */
                              const existant = choixLycee.find(c => c.subject_id === gs.subject_id)
                              const rang = existant?.rang_choix || null

                              // Cycle : vide → 1er choix → 2ème choix → retirer
                              function cyclerRang() {
                                if (!rang) {
                                  choisirOption(st.id, groupeActif.id, gs.subject_id, 1)
                                } else if (rang === 1) {
                                  // Passer à 2ème choix : supprimer et réinsérer
                                  retirerChoix(st.id, groupeActif.id, gs.subject_id)
                                  setTimeout(() => choisirOption(st.id, groupeActif.id, gs.subject_id, 2), 50)
                                } else {
                                  retirerChoix(st.id, groupeActif.id, gs.subject_id)
                                }
                              }

                              return (
                                <div key={gs.id} className="flex justify-center px-3 py-2.5">
                                  <button
                                    onClick={cyclerRang}
                                    className={`w-9 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-black transition-all
                                      ${rang === 1
                                        ? 'bg-blue-500 border-blue-500 text-white'
                                        : rang === 2
                                          ? 'bg-purple-500 border-purple-500 text-white'
                                          : 'border-gray-200 text-gray-300 hover:border-primary-300 hover:bg-primary-50'}`}>
                                    {rang === 1 ? 'C1' : rang === 2 ? 'C2' : '—'}
                                  </button>
                                </div>
                              )
                            }
                          })}
                        </div>
                      )
                    })}

                    {/* Résumé */}
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                      {isLycee ? (
                        <span>
                          {choixLyceeCount(students, choices, groupeActif.id)} choix enregistrés
                          {' · '}
                          <span className="text-blue-500 font-semibold">C1 = 1er choix</span>
                          {' · '}
                          <span className="text-purple-500 font-semibold">C2 = 2ème choix</span>
                        </span>
                      ) : (
                        <>
                          <span>{students.filter(st => getChoiceCollege(st.id, groupeActif.id)).length}/{students.length} élèves assignés</span>
                          {students.filter(st => !getChoiceCollege(st.id, groupeActif.id)).length > 0 && (
                            <span className="text-amber-500 font-semibold">
                              {students.filter(st => !getChoiceCollege(st.id, groupeActif.id)).length} sans choix
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {matieresGroupe.length < 2 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                  Ajoutez au moins 2 matières au groupe pour afficher le tableau de répartition.
                </div>
              )}

              {matieresGroupe.length >= 2 && students.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400">
                  Aucun élève dans cette classe.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function choixLyceeCount(students, choices, groupId) {
  return choices.filter(c => c.group_id === groupId).length
}
