import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../components/ui'
import {
  School, Plus, Search, X, Settings, Key, Copy,
  CheckCircle, AlertTriangle, GraduationCap, BookOpen, Users, Pencil,
  RefreshCw, Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types établissement ───────────────────────────────────────
const TYPES_ETABLISSEMENT = [
  {
    value: 'primaire',
    label: 'École Primaire',
    icon: '🏫',
    niveaux: ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
    color: 'green',
  },
  {
    value: 'college',
    label: 'Collège',
    icon: '🏛️',
    niveaux: ['6ème', '5ème', '4ème', '3ème'],
    color: 'blue',
  },
  {
    value: 'lycee',
    label: 'Lycée',
    icon: '🎓',
    niveaux: ['2nde', '1ère', 'Tle'],
    color: 'purple',
  },
]

const TYPE_COLORS = {
  primaire: 'green',
  college:  'blue',
  lycee:    'purple',
}

const PLAN_STARTER = { value: 'starter', label: 'Starter', price: 22500, max: 999999 }

const EMPTY_FORM = {
  name:               '',
  ia:                 '',
  ief:                '',
  director_name:      '',
  director_email:     '',
  phone:              '',
  type_etablissement: 'college',
}

// ── Validation ────────────────────────────────────────────────
function validateSchoolForm(form) {
  const errors = {}
  if (!form.name.trim())           errors.name           = 'Nom obligatoire'
  if (!form.director_name.trim())  errors.director_name  = 'Nom du directeur obligatoire'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.director_email))
                                   errors.director_email = 'Email invalide'
  return errors
}


// ══════════════════════════════════════════════════════════════
export default function EcolesPage() {
  const [ecoles, setEcoles]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editModal, setEditModal]   = useState(null)   // école à éditer
  const [editForm, setEditForm]     = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [codeModal, setCodeModal]   = useState(null)
  const [creating, setCreating]         = useState(false)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [formErrors, setFormErrors]     = useState({})
  const [regenModal, setRegenModal]     = useState(null)   // école dont on régénère le code
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenResult, setRegenResult]   = useState(null)   // résultat après régénération
  const [deleteModal, setDeleteModal]   = useState(null)   // école à supprimer
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')   // saisie de confirmation

  useEffect(() => { fetchEcoles() }, [])

  async function fetchEcoles() {
    const { data } = await supabase
      .from('schools')
      .select('*, users(id, role)')
      .order('created_at', { ascending: false })
    setEcoles(data || [])
    setLoading(false)
  }

  // ── Créer une école via Edge Function ────────────────────
  async function creerEcole() {
    const errors = validateSchoolForm(form)
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({})
    setCreating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-school`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name:               form.name.trim(),
            ia:                 form.ia.trim(),
            ief:                form.ief.trim(),
            director_name:      form.director_name.trim(),
            director_email:     form.director_email.trim().toLowerCase(),
            phone:              form.phone.trim(),
            type_etablissement: form.type_etablissement,
          }),
        }
      )

      const result = await response.json()
      if (!response.ok) {
        console.error('create-school error:', result)
        throw new Error(result.error || 'Erreur Edge Function')
      }

      // Capturer les valeurs du formulaire AVANT le reset
      const schoolName        = form.name
      const directorName      = form.director_name
      const directorEmail     = form.director_email
      const typeEtablissement = form.type_etablissement

      // Fermer le formulaire et réinitialiser
      setModalOpen(false)
      setForm(EMPTY_FORM)

      // Petit délai pour laisser la modale de création se fermer avant d'ouvrir celle des codes
      setTimeout(() => {
        setCodeModal({
          school_name:        schoolName,
          director_name:      directorName,
          director_email:     directorEmail,
          temp_password:      result.admin_temp_code,
          expires_at:         result.expires_at,
          type_etablissement: typeEtablissement,
        })
      }, 150)

      await fetchEcoles()

    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  function openEditModal(ecole) {
    setEditForm({
      name:  ecole.name  || '',
      ia:    ecole.ia    || '',
      ief:   ecole.ief   || '',
      phone: ecole.phone || '',
    })
    setEditModal(ecole)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) { toast.error('Le nom est obligatoire'); return }
    setEditSaving(true)
    const { error } = await supabase
      .from('schools')
      .update({
        name:  editForm.name.trim(),
        ia:    editForm.ia.trim()  || null,
        ief:   editForm.ief.trim() || null,
        phone: editForm.phone.trim() || null,
      })
      .eq('id', editModal.id)
    if (error) {
      toast.error('Erreur : ' + error.message)
    } else {
      toast.success('École mise à jour !')
      setEditModal(null)
      fetchEcoles()
    }
    setEditSaving(false)
  }

  async function toggleEcole(id, isActive) {
    const { error } = await supabase
      .from('schools').update({ is_active: !isActive }).eq('id', id)
    if (error) { toast.error('Erreur'); return }
    toast.success(isActive ? 'École suspendue' : 'École réactivée')
    fetchEcoles()
  }

  // ── Régénérer le code temporaire d'une école ─────────────
  async function regenererCode(ecole) {
    setRegenLoading(true)
    setRegenResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ school_id: ecole.id }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur')
      setRegenResult({
        temp_password: result.admin_temp_code,
        expires_at:    result.expires_at,
      })
      toast.success('Nouveau code généré !')
      fetchEcoles()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setRegenLoading(false)
    }
  }

  // ── Supprimer une école et toutes ses données ─────────────
  async function supprimerEcole(ecole) {
    if (deleteConfirm !== ecole.name) {
      toast.error('Le nom saisi ne correspond pas')
      return
    }
    setDeleteLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-school`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ school_id: ecole.id }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur')
      toast.success('École et toutes ses données supprimées')
      setDeleteModal(null)
      setDeleteConfirm('')
      fetchEcoles()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  function copyAll(modal) {
    const text = [
      `École : ${modal.school_name}`,
      `Directeur : ${modal.director_name}`,
      `Email : ${modal.director_email}`,
      `Mot de passe provisoire : ${modal.temp_password}`,
      `Expire le : ${new Date(modal.expires_at).toLocaleString('fr-FR')}`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Informations copiées !')
  }

  // ── Filtrage ──────────────────────────────────────────────
  const ecolesFiltrees = ecoles.filter(e => {
    const match = `${e.name} ${e.director_name} ${e.director_email}`.toLowerCase()
    if (search && !match.includes(search.toLowerCase())) return false
    if (filterType && e.type_etablissement !== filterType) return false
    return true
  })

  function getTypeInfo(type) {
    return TYPES_ETABLISSEMENT.find(t => t.value === type) || TYPES_ETABLISSEMENT[1]
  }

  // ══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Gestion des Écoles</h1>
            <p className="text-gray-500 text-sm">{ecoles.length} établissement(s) enregistré(s)</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Créer une école
          </Button>
        </div>

        {/* ── Filtres ── */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une école…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {['', ...TYPES_ETABLISSEMENT.map(t => t.value)].map(t => (
              <button key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border
                  ${filterType === t
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                {t === '' ? 'Tous' : getTypeInfo(t).icon + ' ' + getTypeInfo(t).label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Liste ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ecolesFiltrees.length === 0 ? (
          <Card>
            <EmptyState icon={School} title="Aucune école"
              description="Créez le premier établissement"
              action={<Button onClick={() => setModalOpen(true)}><Plus size={16} />Créer</Button>} />
          </Card>
        ) : (
          <div className="space-y-3">
            {ecolesFiltrees.map(ecole => {
              const typeInfo = getTypeInfo(ecole.type_etablissement)
              const nbProfs  = ecole.users?.filter(u => u.role === 'prof').length || 0
              return (
                <Card key={ecole.id} className="p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Icône type */}
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                      {typeInfo.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 truncate">{ecole.name}</h3>
                        <Badge color={TYPE_COLORS[ecole.type_etablissement] || 'gray'}>
                          {typeInfo.label}
                        </Badge>
                        <Badge color={ecole.is_active ? 'green' : 'red'}>
                          {ecole.is_active ? 'Active' : 'Suspendue'}
                        </Badge>
                        {!ecole.onboarding_completed && (
                          <Badge color="yellow">
                            <Key size={10} className="inline mr-1" />
                            Onboarding en attente
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                        <span>{ecole.director_name}</span>
                        <span>{ecole.director_email}</span>
                        {ecole.phone && <span>{ecole.phone}</span>}
                      </div>
                      {(ecole.ia || ecole.ief) && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {ecole.ia  && <span>📍 IA : {ecole.ia}</span>}
                          {ecole.ief && <span>IEF : {ecole.ief}</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users size={11} /> {nbProfs} prof(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <GraduationCap size={11} /> Starter · 22 500 F/mois
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen size={11} /> Niveaux : {typeInfo.niveaux.join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Button variant="secondary" size="sm"
                        onClick={() => openEditModal(ecole)}>
                        <Pencil size={13} /> Modifier
                      </Button>
                      <Button variant="secondary" size="sm"
                        onClick={() => toggleEcole(ecole.id, ecole.is_active)}>
                        {ecole.is_active ? 'Suspendre' : 'Réactiver'}
                      </Button>
                      <Button variant="secondary" size="sm"
                        onClick={() => { setRegenModal(ecole); setRegenResult(null) }}>
                        <RefreshCw size={13} /> Code
                      </Button>
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        onClick={() => { setDeleteModal(ecole); setDeleteConfirm('') }}>
                        <Trash2 size={13} /> Supprimer
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modale création école ── */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setFormErrors({}) }}
        title="Créer un établissement" size="lg">
        <div className="space-y-5">

          {/* ── Sélecteur type établissement ── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Type d'établissement *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {TYPES_ETABLISSEMENT.map(type => (
                <button key={type.value}
                  type="button"
                  onClick={() => setForm({ ...form, type_etablissement: type.value })}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${form.type_etablissement === type.value
                      ? 'border-primary-500 bg-primary-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                  <span className="text-2xl">{type.icon}</span>
                  <span className={`text-xs font-bold ${
                    form.type_etablissement === type.value ? 'text-primary-700' : 'text-gray-600'}`}>
                    {type.label}
                  </span>
                  <div className="flex flex-wrap justify-center gap-1">
                    {type.niveaux.map(n => (
                      <span key={n} className={`text-[10px] px-1 rounded font-medium
                        ${form.type_etablissement === type.value ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                        {n}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Les classes seront pré-configurées automatiquement selon le type choisi.
            </p>
          </div>

          <div className="h-px bg-gray-100" />

          {/* ── Informations école ── */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Informations de l'établissement</h4>
            <Input label="Nom de l'école *" placeholder="Groupe Scolaire de l'Excellence"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              error={formErrors.name} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Inspection Académique (IA)" placeholder="IA Dakar"
                value={form.ia} onChange={e => setForm({ ...form, ia: e.target.value })} />
              <Input label="IEF" placeholder="IEF Dakar Plateau"
                value={form.ief} onChange={e => setForm({ ...form, ief: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nom du directeur *" placeholder="Mamadou Diallo"
                value={form.director_name} onChange={e => setForm({ ...form, director_name: e.target.value })}
                error={formErrors.director_name} />
              <Input label="Téléphone" placeholder="+221 77 000 00 00"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <Input label="Email du directeur *" type="email" placeholder="directeur@ecole.sn"
              value={form.director_email} onChange={e => setForm({ ...form, director_email: e.target.value })}
              error={formErrors.director_email} />
          </div>

          {/* ── Plan unique ── */}
          <div className="flex items-center justify-between p-4 bg-primary-50 border-2 border-primary-400 rounded-xl">
            <div>
              <div className="font-bold text-primary-800">Plan Starter</div>
              <div className="text-xs text-primary-600 mt-0.5">Élèves illimités · Toutes les fonctionnalités</div>
            </div>
            <div className="text-right">
              <div className="font-black text-primary-800 text-lg">22 500 F</div>
              <div className="text-xs text-primary-500">/mois</div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
            Un mot de passe provisoire (valable 24h) sera généré. L'admin se connecte avec son email et ce mot de passe, puis crée le sien.
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={creerEcole} loading={creating}>
              <Plus size={16} /> Créer l'établissement
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modale édition école ── */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Modifier l'établissement">
        {editModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <span className="text-2xl">{getTypeInfo(editModal.type_etablissement)?.icon}</span>
              <div>
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  {getTypeInfo(editModal.type_etablissement)?.label}
                </div>
                <div className="text-xs text-blue-500">{editModal.director_email}</div>
              </div>
            </div>

            <Input label="Nom de l'école *" placeholder="Groupe Scolaire de l'Excellence"
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })} />

            <div className="grid grid-cols-2 gap-3">
              <Input label="Inspection Académique (IA)" placeholder="IA Dakar"
                value={editForm.ia}
                onChange={e => setEditForm({ ...editForm, ia: e.target.value })} />
              <Input label="IEF" placeholder="IEF Dakar Plateau"
                value={editForm.ief}
                onChange={e => setEditForm({ ...editForm, ief: e.target.value })} />
            </div>

            <Input label="Téléphone" placeholder="+221 77 000 00 00"
              value={editForm.phone}
              onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setEditModal(null)}>Annuler</Button>
              <Button onClick={saveEdit} loading={editSaving}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modale codes d'accès ── */}
      <Modal isOpen={!!codeModal} onClose={() => setCodeModal(null)} title="Codes d'accès générés">
        {codeModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle size={20} className="text-green-600 shrink-0" />
              <div>
                <div className="font-bold text-green-900">{codeModal.school_name}</div>
                <div className="text-xs text-green-700">
                  {getTypeInfo(codeModal.type_etablissement)?.icon} {getTypeInfo(codeModal.type_etablissement)?.label}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Mot de passe de première connexion
                </label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <Key size={15} className="text-primary-600 shrink-0" />
                  <span className="font-mono font-bold tracking-widest text-gray-900 flex-1 break-all text-lg">
                    {codeModal.temp_password}
                  </span>
                  <button onClick={() => { navigator.clipboard.writeText(codeModal.temp_password); toast.success('Copié !') }}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors shrink-0">
                    <Copy size={14} className="text-gray-500" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  L'admin se connecte avec <strong>{codeModal.director_email}</strong> et ce mot de passe.
                  Il sera invité à créer le sien dès la première connexion.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                Ces codes expirent le <strong>{new Date(codeModal.expires_at).toLocaleString('fr-FR')}</strong>.
                Transmettez-les de façon sécurisée au directeur de l'établissement.
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => copyAll(codeModal)}>
                <Copy size={15} /> Tout copier
              </Button>
              <Button className="flex-1" onClick={() => setCodeModal(null)}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* ── Modale régénération de code ── */}
      <Modal isOpen={!!regenModal} onClose={() => { setRegenModal(null); setRegenResult(null) }}
        title="Régénérer le code d'accès">
        {regenModal && (
          <div className="space-y-4">
            {!regenResult ? (
              <>
                <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                  <AlertTriangle size={18} className="text-orange-500 shrink-0" />
                  <div>
                    <div className="font-semibold text-orange-900 text-sm">{regenModal.name}</div>
                    <div className="text-xs text-orange-700 mt-0.5">
                      L'ancien code sera immédiatement invalidé. Le directeur devra utiliser le nouveau code pour se connecter.
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="secondary" onClick={() => setRegenModal(null)}>Annuler</Button>
                  <Button loading={regenLoading} onClick={() => regenererCode(regenModal)}>
                    <RefreshCw size={14} /> Générer un nouveau code
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle size={18} className="text-green-600 shrink-0" />
                  <div className="font-semibold text-green-900 text-sm">Nouveau code généré avec succès</div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Nouveau mot de passe provisoire
                    </label>
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <Key size={15} className="text-primary-600 shrink-0" />
                      <span className="font-mono font-bold tracking-widest text-gray-900 flex-1 break-all text-lg">
                        {regenResult.temp_password}
                      </span>
                      <button onClick={() => { navigator.clipboard.writeText(regenResult.temp_password); toast.success('Copié !') }}
                        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                        <Copy size={14} className="text-gray-500" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      L'admin se connecte avec son email et ce nouveau mot de passe.
                      Il sera invité à créer le sien dès la connexion.
                    </p>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    Expire le {new Date(regenResult.expires_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <Button className="w-full" onClick={() => { setRegenModal(null); setRegenResult(null) }}>
                  Fermer
                </Button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modale suppression école ── */}
      <Modal isOpen={!!deleteModal} onClose={() => { setDeleteModal(null); setDeleteConfirm('') }}
        title="Supprimer l'établissement">
        {deleteModal && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <Trash2 size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-900">Action irréversible</div>
                <div className="text-sm text-red-700 mt-1">
                  Cette action supprimera définitivement <strong>{deleteModal.name}</strong> et <strong>toutes ses données</strong> :
                  élèves, professeurs, notes, bulletins, paiements, classes…
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Tapez le nom exact de l'école pour confirmer :
              </label>
              <div className="text-xs text-gray-500 mb-2 font-mono bg-gray-100 px-2 py-1 rounded inline-block">
                {deleteModal.name}
              </div>
              <input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="Nom de l'école…"
                className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setDeleteModal(null); setDeleteConfirm('') }}>
                Annuler
              </Button>
              <Button
                loading={deleteLoading}
                disabled={deleteConfirm !== deleteModal.name}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => supprimerEcole(deleteModal)}>
                <Trash2 size={14} /> Supprimer définitivement
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
