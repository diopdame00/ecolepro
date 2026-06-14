import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import { BookOpen, Plus, Trash2, Users, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Niveaux par cycle ────────────────────────────────────────
const NIVEAUX_PAR_CYCLE = {
  prescolaire: ['Petite Section', 'Moyenne Section', 'Grande Section'],
  primaire:    ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
  college:     ['6ème', '5ème', '4ème', '3ème'],
  lycee:       ['2nde', '1ère L', '1ère S', 'Tale L', 'Tale S', 'Tale STEG'],
  franco_arabe: ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème'],
}

const VARIANTES = ['A', 'B', 'C', 'D', 'E']

const CYCLE_LABELS = {
  prescolaire:  'Préscolaire',
  primaire:     'Primaire',
  college:      'Collège',
  lycee:        'Lycée',
  franco_arabe: 'Franco-Arabe',
}

// Année scolaire courante
function anneeEnCours() {
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}/${y + 1}`
}

export default function ClassesPage() {
  const { schoolId, school } = useAuth()
  const cycle = school?.type_etablissement || 'college'

  const [classes, setClasses]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving]       = useState(false)

  // Formulaire
  const [selectedNiveau, setSelectedNiveau]   = useState('')
  const [selectedVariante, setSelectedVariante] = useState('A')
  const [annee, setAnnee]                     = useState(anneeEnCours())

  const niveaux  = NIVEAUX_PAR_CYCLE[cycle] || NIVEAUX_PAR_CYCLE.college
  const nomClasse = selectedNiveau
    ? `${selectedNiveau} ${selectedVariante}`
    : ''

  useEffect(() => { if (schoolId) fetchClasses() }, [schoolId])

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes')
      .select('*, students(count)')
      .eq('school_id', schoolId)
      .order('nom')
    setClasses(data || [])
    setLoading(false)
  }

  function ouvrirModal() {
    setSelectedNiveau(niveaux[0] || '')
    setSelectedVariante('A')
    setAnnee(anneeEnCours())
    setModalOpen(true)
  }

  async function creerClasse() {
    if (!selectedNiveau) { toast.error('Choisissez un niveau'); return }
    if (!nomClasse.trim()) { toast.error('Nom de classe invalide'); return }

    // Vérifier doublon
    const doublon = classes.find(c => c.nom === nomClasse && c.annee_scolaire === annee)
    if (doublon) { toast.error(`La classe ${nomClasse} existe déjà pour ${annee}`); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('classes').insert({
        nom:           nomClasse,
        annee_scolaire: annee,
        niveau:        selectedNiveau,
        school_id:     schoolId,
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
    if (!confirm(`Supprimer la classe ${nom} ? Les élèves rattachés seront désassociés.`)) return
    const { error } = await supabase.from('classes').delete().eq('id', id)
    if (error) { toast.error('Erreur suppression'); return }
    toast.success('Classe supprimée')
    fetchClasses()
  }

  // Grouper les classes par niveau
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
            <p className="text-gray-500 text-sm">
              {classes.length} classe(s) · Cycle {CYCLE_LABELS[cycle] || cycle}
            </p>
          </div>
          <Button onClick={ouvrirModal}>
            <Plus size={16} />
            Nouvelle classe
          </Button>
        </div>

        {/* Contenu */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="Aucune classe créée"
              description={`Créez vos classes ${CYCLE_LABELS[cycle] || ''} pour commencer`}
              action={
                <Button onClick={ouvrirModal}>
                  <Plus size={16} /> Créer une classe
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Trier par ordre du cycle */}
            {niveaux
              .filter(n => classesByNiveau[n])
              .map(niveau => (
                <div key={niveau}>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">
                    {niveau}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {classesByNiveau[niveau]
                      ?.sort((a, b) => a.nom.localeCompare(b.nom))
                      .map(classe => (
                        <Card key={classe.id} className="p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center font-black text-primary-700 text-base">
                              {classe.nom?.replace(/[^A-Za-z]/g, '').slice(-1) || '?'}
                            </div>
                            <button
                              onClick={() => supprimerClasse(classe.id, classe.nom)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-200 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
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
                    {/* Bouton ajout rapide dans ce niveau */}
                    <button
                      onClick={() => { setSelectedNiveau(niveau); setSelectedVariante('A'); setAnnee(anneeEnCours()); setModalOpen(true) }}
                      className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50 transition-all"
                    >
                      <Plus size={20} />
                      <span className="text-xs font-medium">Ajouter {niveau}</span>
                    </button>
                  </div>
                </div>
              ))}

            {/* Classes sans niveau reconnu */}
            {classes
              .filter(c => !niveaux.includes(c.niveau || ''))
              .length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">Autres</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {classes
                    .filter(c => !niveaux.includes(c.niveau || ''))
                    .map(classe => (
                      <Card key={classe.id} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-500 text-base">
                            {classe.nom?.slice(0, 2)}
                          </div>
                          <button
                            onClick={() => supprimerClasse(classe.id, classe.nom)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-200 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <h3 className="font-bold text-gray-900">{classe.nom}</h3>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <Users size={11} />
                          {classe.students?.[0]?.count || 0} élève(s)
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

          {/* Aperçu nom */}
          {nomClasse && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
              <p className="text-xs text-primary-600 font-medium uppercase tracking-wide mb-1">Classe qui sera créée</p>
              <p className="text-3xl font-black text-primary-700">{nomClasse}</p>
            </div>
          )}

          {/* Niveau */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Niveau *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {niveaux.map(n => (
                <button
                  key={n}
                  onClick={() => setSelectedNiveau(n)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left
                    ${selectedNiveau === n
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Variante */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Section *
            </label>
            <div className="flex gap-2">
              {VARIANTES.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedVariante(v)}
                  className={`w-12 h-12 rounded-xl text-sm font-black border-2 transition-all
                    ${selectedVariante === v
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Année scolaire */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Année scolaire *
            </label>
            <select
              value={annee}
              onChange={e => setAnnee(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
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
            <Button className="flex-1" loading={saving} onClick={creerClasse}>
              <Plus size={15} />
              Créer {nomClasse}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
